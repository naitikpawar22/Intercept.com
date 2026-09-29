import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import net from 'net';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { DatabaseManager } from '../database/db';

export interface ProxyStatus {
  running: boolean;
  port: number;
  controlPort: number;
  connectedToAddon: boolean;
  error?: string;
  interceptRequests: boolean;
  interceptResponses: boolean;
  strictScope: boolean;
  waitingRequestsCount: number;
  waitingResponsesCount: number;
}

export class ProxyManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private port: number = 8080;
  private controlPort: number = 54321;
  private authToken: string = '';
  private wss: WebSocketServer | null = null;
  private addonWs: WebSocket | null = null;
  private isRunning: boolean = false;
  private logs: string[] = [];
  private maxLogs: number = 1000;

  // Intercept state
  private interceptRequests: boolean = false;
  private interceptResponses: boolean = false;
  private strictScope: boolean = false;
  private scopeDomains: string[] = ['*'];
  private interceptRules = {
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    ignore_extensions: ['css', 'js', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'woff', 'woff2', 'ico', 'ttf'],
    url_pattern: ''
  };

  private pendingRequests: Map<string, any> = new Map();
  private pendingResponses: Map<string, any> = new Map();

  constructor(private db: DatabaseManager) {
    super();
    this.authToken = crypto.randomBytes(24).toString('hex');
  }

  public getStatus(): ProxyStatus {
    return {
      running: this.isRunning,
      port: this.port,
      controlPort: this.controlPort,
      connectedToAddon: this.addonWs !== null && this.addonWs.readyState === WebSocket.OPEN,
      interceptRequests: this.interceptRequests,
      interceptResponses: this.interceptResponses,
      strictScope: this.strictScope,
      waitingRequestsCount: this.pendingRequests.size,
      waitingResponsesCount: this.pendingResponses.size
    };
  }

  private autoResponseRules: any[] = [];
  private autoMode: any = { enabled: false, targetHost: '', matchStatus: 401, replaceStatus: 200 };

  public getLogs(): string[] {
    return this.logs;
  }

  public async setConfig(config: {
    interceptRequests?: boolean;
    interceptResponses?: boolean;
    strictScope?: boolean;
    scopeDomains?: string[];
    interceptRules?: any;
    autoResponseRules?: any[];
    autoMode?: {
      enabled: boolean;
      targetHost?: string;
      matchStatus?: number;
      replaceStatus?: number;
    };
  }): Promise<void> {
    if (config.interceptRequests !== undefined) this.interceptRequests = config.interceptRequests;
    if (config.interceptResponses !== undefined) this.interceptResponses = config.interceptResponses;
    if (config.strictScope !== undefined) this.strictScope = config.strictScope;
    if (config.scopeDomains !== undefined) this.scopeDomains = config.scopeDomains;
    if (config.interceptRules !== undefined) this.interceptRules = { ...this.interceptRules, ...config.interceptRules };
    if (config.autoResponseRules !== undefined) this.autoResponseRules = config.autoResponseRules;
    if (config.autoMode !== undefined) this.autoMode = { ...this.autoMode, ...config.autoMode };

    this.sendToAddon({
      type: 'set_config',
      config: {
        intercept_requests: this.interceptRequests,
        intercept_responses: this.interceptResponses,
        strict_scope: this.strictScope,
        scope_domains: this.scopeDomains,
        intercept_rules: this.interceptRules,
        auto_response_rules: this.autoResponseRules,
        auto_mode: this.autoMode
      }
    });

    this.emit('status-changed', this.getStatus());
  }

  public async start(desiredPort: number = 8080): Promise<boolean> {
    if (this.isRunning) return true;

    // Check if port is in use and auto-recover or reassign
    let finalPort = desiredPort;
    const portAvailable = await this.isPortAvailable(desiredPort);
    if (!portAvailable) {
      this.log(`[Proxy] Port ${desiredPort} is in use. Attempting to free orphaned process...`);
      await this.freePort(desiredPort);
      const isNowFree = await this.isPortAvailable(desiredPort);
      if (isNowFree) {
        finalPort = desiredPort;
        this.log(`[Proxy] Successfully freed port ${desiredPort}.`);
      } else {
        finalPort = await this.findAvailablePort(desiredPort + 1);
        this.log(`[Proxy] Using available alternate proxy port: ${finalPort}`);
      }
    }
    this.port = finalPort;

    // Allocate control port for IPC WebSocket
    this.controlPort = await this.findAvailablePort(54320);

    // Start WebSocket Server for python addon IPC
    await this.startIpcServer();

    // Find Python and mitmdump executables
    const mitmExecutable = this.findMitmExecutable();
    const addonScript = path.resolve(__dirname, '../../../proxy/addon.py');
    const fallbackAddon = path.resolve(process.cwd(), 'proxy/addon.py');
    const finalAddon = fs.existsSync(addonScript) ? addonScript : fallbackAddon;

    this.log(`[Proxy] Starting mitmproxy on 127.0.0.1:${this.port}...`);
    this.log(`[Proxy] Using addon script: ${finalAddon}`);

    const args = [
      '--listen-host', '127.0.0.1',
      '--listen-port', String(this.port),
      '-s', finalAddon,
      '--set', `auth_token=${this.authToken}`,
      '--set', `control_port=${this.controlPort}`,
      '--ssl-insecure'
    ];

    try {
      if (mitmExecutable.isPythonScript) {
        this.process = spawn(mitmExecutable.command, [...mitmExecutable.args, ...args], {
          windowsHide: true,
          env: process.env
        });
      } else {
        this.process = spawn(mitmExecutable.command, args, {
          windowsHide: true,
          env: process.env
        });
      }

      this.process.stdout?.on('data', (data) => {
        const text = data.toString().trim();
        if (text) this.log(`[mitmdump] ${text}`);
      });

      this.process.stderr?.on('data', (data) => {
        const text = data.toString().trim();
        if (text) this.log(`[mitmdump:err] ${text}`);
      });

      this.process.on('close', (code) => {
        this.log(`[mitmdump] Process exited with code ${code}`);
        this.isRunning = false;
        this.addonWs = null;
        this.emit('status-changed', this.getStatus());
      });

      this.process.on('error', (err) => {
        this.log(`[mitmdump:error] ${err.message}`);
        this.isRunning = false;
        this.emit('status-changed', this.getStatus());
      });

      this.isRunning = true;
      this.emit('status-changed', this.getStatus());
      return true;
    } catch (e: any) {
      this.log(`[Proxy] Failed to spawn mitmdump: ${e.message}`);
      this.isRunning = false;
      throw e;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.log('[Proxy] Stopping mitmproxy...');
    if (this.process) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(this.process.pid), '/f', '/t'], { windowsHide: true });
        } else {
          this.process.kill('SIGTERM');
        }
      } catch (err) {
        console.error('Error killing proxy process:', err);
      }
      this.process = null;
    }

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.addonWs = null;
    this.isRunning = false;
    this.pendingRequests.clear();
    this.pendingResponses.clear();
    this.emit('status-changed', this.getStatus());
    this.log('[Proxy] Stopped successfully.');
  }

  private startIpcServer(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port: this.controlPort, host: '127.0.0.1' }, () => {
        this.log(`[IPC] Control WebSocket server listening on 127.0.0.1:${this.controlPort}`);
        resolve();
      });

      this.wss.on('connection', (ws, req) => {
        const urlObj = new URL(req.url || '', `http://${req.headers.host || '127.0.0.1'}`);
        const token = urlObj.searchParams.get('token');

        if (token !== this.authToken) {
          this.log('[IPC] Unauthorized connection attempt rejected.');
          ws.close(4001, 'Unauthorized');
          return;
        }

        this.log('[IPC] Mitmproxy addon connected successfully.');
        this.addonWs = ws;
        this.emit('status-changed', this.getStatus());

        // Send current configurations immediately
        this.setConfig({
          interceptRequests: this.interceptRequests,
          interceptResponses: this.interceptResponses,
          strictScope: this.strictScope,
          scopeDomains: this.scopeDomains,
          interceptRules: this.interceptRules
        });

        ws.on('message', async (messageData) => {
          try {
            const msg = JSON.parse(messageData.toString());
            await this.handleAddonMessage(msg);
          } catch (err) {
            console.error('[IPC] Error parsing addon message:', err);
          }
        });

        ws.on('close', () => {
          this.log('[IPC] Mitmproxy addon disconnected.');
          this.addonWs = null;
          this.emit('status-changed', this.getStatus());
        });
      });
    });
  }

  private async handleAddonMessage(msg: any): Promise<void> {
    const type = msg.type;

    if (type === 'handshake') {
      this.log(`[IPC] Addon handshake confirmed on proxy port ${msg.proxy_port}`);
      this.emit('status-changed', this.getStatus());
    } else if (type === 'intercepted_request') {
      this.pendingRequests.set(msg.flow_id, msg);
      this.emit('intercepted-request', msg);
      this.emit('status-changed', this.getStatus());
    } else if (type === 'intercepted_response') {
      this.pendingResponses.set(msg.flow_id, msg);
      this.emit('intercepted-response', msg);
      this.emit('status-changed', this.getStatus());
    } else if (type === 'response_auto_modified') {
      try {
        await this.db.recordResponseModificationLog({
          flow_id: msg.flow_id,
          url: msg.url,
          method: msg.method,
          original_status: msg.original_status,
          modified_status: msg.modified_status,
          rule_name: msg.rule_name,
          timestamp: msg.timestamp
        });
      } catch (e) {
        console.error('[Proxy] Failed to record response modification log:', e);
      }
      this.emit('response-auto-modified', msg);
    } else if (type === 'flow_completed') {
      const data = msg.data;
      // Record transaction to SQLite
      try {
        const result = await this.db.recordTransaction(
          {
            flow_id: data.flow_id,
            method: data.method,
            url: data.url,
            domain: data.domain,
            path: data.path,
            scheme: data.scheme,
            port: data.port,
            headers: data.request_headers,
            body_text: data.request_body,
            content_type: data.content_type,
            content_length: data.content_length,
            timestamp: data.timestamp,
            in_scope: data.in_scope ? 1 : 0
          },
          {
            status_code: data.status_code,
            status_message: data.status_message,
            headers: data.response_headers,
            body_text: data.response_body,
            content_type: data.content_type,
            content_length: data.content_length,
            duration_ms: data.duration_ms,
            mime_type: data.mime_type,
            resource_type: data.resource_type,
            timestamp: data.timestamp
          }
        );

        const fullEvent = {
          ...data,
          request_id: result.requestId,
          response_id: result.responseId
        };

        this.emit('flow-completed', fullEvent);
      } catch (e) {
        console.error('[Proxy] Failed to record transaction to DB:', e);
      }
    } else if (type === 'flow_error') {
      this.emit('flow-error', msg);
    }
  }

  public getPendingRequests(): any[] {
    return Array.from(this.pendingRequests.values());
  }

  public getPendingResponses(): any[] {
    return Array.from(this.pendingResponses.values());
  }

  public actionRequest(flowId: string, action: 'forward' | 'drop' | 'forward_original', modifications?: any): void {
    this.pendingRequests.delete(flowId);
    this.sendToAddon({
      type: 'action_request',
      flow_id: flowId,
      action,
      modifications: modifications || {}
    });
    this.emit('status-changed', this.getStatus());
  }

  public actionResponse(flowId: string, action: 'forward' | 'drop' | 'forward_original', modifications?: any): void {
    this.pendingResponses.delete(flowId);
    this.sendToAddon({
      type: 'action_response',
      flow_id: flowId,
      action,
      modifications: modifications || {}
    });
    this.emit('status-changed', this.getStatus());
  }

  public clearQueues(): void {
    for (const flowId of this.pendingRequests.keys()) {
      this.actionRequest(flowId, 'forward_original');
    }
    for (const flowId of this.pendingResponses.keys()) {
      this.actionResponse(flowId, 'forward_original');
    }
    this.pendingRequests.clear();
    this.pendingResponses.clear();
    this.emit('status-changed', this.getStatus());
  }

  private sendToAddon(data: any): void {
    if (this.addonWs && this.addonWs.readyState === WebSocket.OPEN) {
      try {
        this.addonWs.send(JSON.stringify(data));
      } catch (err) {
        console.error('[IPC] Error sending to addon:', err);
      }
    }
  }

  private log(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] ${message}`;
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    this.emit('log', entry);
  }

  private findMitmExecutable(): { command: string; args: string[]; isPythonScript: boolean } {
    const homeDir = os.homedir();
    const possibleMitm = [
      path.join(homeDir, 'AppData\\Local\\Programs\\Python\\Python313\\Scripts\\mitmdump.exe'),
      'mitmdump.exe',
      'mitmdump'
    ];

    for (const p of possibleMitm) {
      if (fs.existsSync(p)) {
        return { command: p, args: [], isPythonScript: false };
      }
    }

    // Fallback: run via python launcher
    return {
      command: 'py',
      args: ['-m', 'mitmproxy.tools.main', 'mitmdump'],
      isPythonScript: true
    };
  }

  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port, '127.0.0.1');
    });
  }

  private async findAvailablePort(startPort: number): Promise<number> {
    let p = startPort;
    while (!(await this.isPortAvailable(p))) {
      p++;
    }
    return p;
  }

  private async freePort(port: number): Promise<boolean> {
    try {
      if (process.platform === 'win32') {
        const { execSync } = require('child_process');
        try {
          const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8' });
          const lines = output.trim().split('\n');
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && !isNaN(Number(pid)) && Number(pid) > 0 && Number(pid) !== process.pid) {
              try {
                execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
              } catch {}
            }
          }
        } catch {}
      }
      await new Promise(r => setTimeout(r, 400));
      return await this.isPortAvailable(port);
    } catch {
      return false;
    }
  }

  public getCertificateInfo(): {
    installed: boolean;
    certPath: string;
    trustCommand: string;
    instructions: string[];
  } {
    const homeDir = os.homedir();
    const certPath = path.join(homeDir, '.mitmproxy', 'mitmproxy-ca-cert.cer');
    const exists = fs.existsSync(certPath);

    return {
      installed: exists,
      certPath: exists ? certPath : 'Not generated yet. Start proxy once to generate.',
      trustCommand: `certutil -addstore -user Root "${certPath}"`,
      instructions: [
        '1. Ensure proxy has been started at least once to generate the local CA.',
        '2. Run the provided certutil command in PowerShell or Command Prompt, OR',
        '3. Double click the mitmproxy-ca-cert.cer file, click "Install Certificate", choose "Current User", and place in "Trusted Root Certification Authorities".',
        '4. Restart the embedded browser tab to inspect HTTPS seamlessly.'
      ]
    };
  }
}
