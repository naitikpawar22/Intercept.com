import { WebContents } from 'electron';
import { EventEmitter } from 'events';

export interface ConsoleEntry {
  id: string;
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  text: string;
  source?: string;
  url?: string;
  line?: number;
  column?: number;
  timestamp: number;
}

export class CDPManager extends EventEmitter {
  private attached: boolean = false;
  private consoleLogs: ConsoleEntry[] = [];
  private scripts: Map<string, any> = new Map();
  private securityState: any = null;

  constructor(private webContents: WebContents) {
    super();
  }

  public async attach(): Promise<void> {
    if (this.attached) return;

    try {
      if (!this.webContents.debugger.isAttached()) {
        this.webContents.debugger.attach('1.3');
      }
      this.attached = true;

      this.webContents.debugger.on('detach', (event, reason) => {
        this.attached = false;
        this.emit('detached', reason);
      });

      this.webContents.debugger.on('message', (event, method, params) => {
        this.handleCdpMessage(method, params);
      });

      // Enable CDP domains
      await this.sendCommand('Console.enable');
      await this.sendCommand('Runtime.enable');
      await this.sendCommand('DOM.enable');
      await this.sendCommand('CSS.enable');
      await this.sendCommand('Debugger.enable');
      await this.sendCommand('Security.enable');
      await this.sendCommand('Network.enable');

      console.log(`[CDP] Attached to webContents ${this.webContents.id}`);
    } catch (err) {
      console.error('[CDP] Failed to attach debugger:', err);
      this.attached = false;
    }
  }

  public detach(): void {
    if (!this.attached) return;
    try {
      if (this.webContents.debugger.isAttached()) {
        this.webContents.debugger.detach();
      }
    } catch (e) {
      console.error('[CDP] Error detaching:', e);
    }
    this.attached = false;
  }

  public async sendCommand(method: string, params: any = {}): Promise<any> {
    if (!this.attached || !this.webContents.debugger.isAttached()) {
      return null;
    }
    return this.webContents.debugger.sendCommand(method, params);
  }

  private handleCdpMessage(method: string, params: any): void {
    if (method === 'Console.messageAdded') {
      const msg = params.message;
      const entry: ConsoleEntry = {
        id: Math.random().toString(36).substring(2, 9),
        level: this.normalizeLevel(msg.level),
        text: msg.text || '',
        source: msg.source,
        url: msg.url,
        line: msg.line,
        column: msg.column,
        timestamp: Date.now()
      };
      this.consoleLogs.push(entry);
      this.emit('console-entry', entry);
    } else if (method === 'Runtime.consoleAPICalled') {
      const argsText = (params.args || [])
        .map((a: any) => (a.value !== undefined ? String(a.value) : (a.description || '')))
        .join(' ');
      const callFrame = params.stackTrace?.callFrames?.[0];
      const entry: ConsoleEntry = {
        id: Math.random().toString(36).substring(2, 9),
        level: this.normalizeLevel(params.type),
        text: argsText,
        url: callFrame?.url,
        line: callFrame?.lineNumber,
        column: callFrame?.columnNumber,
        timestamp: Date.now()
      };
      this.consoleLogs.push(entry);
      this.emit('console-entry', entry);
    } else if (method === 'Runtime.exceptionThrown') {
      const details = params.exceptionDetails;
      const entry: ConsoleEntry = {
        id: Math.random().toString(36).substring(2, 9),
        level: 'error',
        text: details?.text || details?.exception?.description || 'Uncaught Exception',
        url: details?.url,
        line: details?.lineNumber,
        column: details?.columnNumber,
        timestamp: Date.now()
      };
      this.consoleLogs.push(entry);
      this.emit('console-entry', entry);
    } else if (method === 'Debugger.scriptParsed') {
      this.scripts.set(params.scriptId, params);
      this.emit('script-parsed', params);
    } else if (method === 'Security.securityStateChanged') {
      this.securityState = params;
      this.emit('security-changed', params);
    } else if (method === 'DOM.documentUpdated') {
      this.emit('dom-updated');
    }
  }

  private normalizeLevel(level: string): 'log' | 'info' | 'warn' | 'error' | 'debug' {
    switch (level?.toLowerCase()) {
      case 'warning':
      case 'warn':
        return 'warn';
      case 'error':
        return 'error';
      case 'info':
        return 'info';
      case 'debug':
        return 'debug';
      default:
        return 'log';
    }
  }

  public getConsoleLogs(): ConsoleEntry[] {
    return this.consoleLogs;
  }

  public clearConsoleLogs(): void {
    this.consoleLogs = [];
    this.emit('console-cleared');
  }

  public async getDomTree(): Promise<any> {
    try {
      const res = await this.sendCommand('DOM.getDocument', { depth: 4, pierce: true });
      return res?.root || null;
    } catch (err) {
      console.error('[CDP] getDomTree error:', err);
      return null;
    }
  }

  public async requestChildNodes(nodeId: number): Promise<void> {
    try {
      await this.sendCommand('DOM.requestChildNodes', { nodeId, depth: 3 });
    } catch (err) {
      console.error('[CDP] requestChildNodes error:', err);
    }
  }

  public async getComputedStyle(nodeId: number): Promise<any[]> {
    try {
      const res = await this.sendCommand('CSS.getComputedStyleForNode', { nodeId });
      return res?.computedStyle || [];
    } catch (err) {
      return [];
    }
  }

  public async getMatchedStyles(nodeId: number): Promise<any> {
    try {
      return await this.sendCommand('CSS.getMatchedStylesForNode', { nodeId });
    } catch (err) {
      return null;
    }
  }

  public async getCookies(url?: string): Promise<any[]> {
    try {
      const params = url ? { urls: [url] } : {};
      const res = await this.sendCommand('Network.getCookies', params);
      return res?.cookies || [];
    } catch (err) {
      return [];
    }
  }

  public async clearCookies(): Promise<void> {
    try {
      await this.sendCommand('Network.clearBrowserCookies');
    } catch (err) {
      console.error('[CDP] clearCookies error:', err);
    }
  }

  public async getStorage(url: string): Promise<{ localStorage: any[]; sessionStorage: any[] }> {
    try {
      const origin = new URL(url).origin;
      const resLocal = await this.sendCommand('DOMStorage.getDOMStorageItems', {
        storageId: { securityOrigin: origin, isLocalStorage: true }
      });
      const resSession = await this.sendCommand('DOMStorage.getDOMStorageItems', {
        storageId: { securityOrigin: origin, isLocalStorage: false }
      });
      return {
        localStorage: resLocal?.entries || [],
        sessionStorage: resSession?.entries || []
      };
    } catch (err) {
      return { localStorage: [], sessionStorage: [] };
    }
  }

  public async getLoadedScripts(): Promise<any[]> {
    return Array.from(this.scripts.values());
  }

  public async getScriptSource(scriptId: string): Promise<string> {
    try {
      const res = await this.sendCommand('Debugger.getScriptSource', { scriptId });
      return res?.scriptSource || '';
    } catch (err) {
      return '';
    }
  }

  public getSecurityInfo(): any {
    return this.securityState;
  }
}
