import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import readline from 'readline';
import { EventEmitter } from 'events';

export interface SeleniumStatus {
  running: boolean;
  launching: boolean;
  url: string;
  title: string;
  proxyPort: number;
  cdpPort: number;
  pid: number | null;
  error?: string;
}

export class SeleniumManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private isRunning: boolean = false;
  private isLaunching: boolean = false;
  private currentUrl: string = '';
  private currentTitle: string = '';
  private proxyPort: number = 8080;
  private cdpPort: number = 9222;
  private lastError: string | undefined = undefined;
  private rl: readline.Interface | null = null;

  constructor() {
    super();
  }

  public getStatus(): SeleniumStatus {
    return {
      running: this.isRunning,
      launching: this.isLaunching,
      url: this.currentUrl,
      title: this.currentTitle,
      proxyPort: this.proxyPort,
      cdpPort: this.cdpPort,
      pid: this.process ? this.process.pid || null : null,
      error: this.lastError
    };
  }

  public async launch(options: {
    proxyPort?: number;
    initialUrl?: string;
    cdpPort?: number;
  } = {}): Promise<SeleniumStatus> {
    if (this.isRunning) {
      if (options.initialUrl) {
        await this.navigate(options.initialUrl);
      }
      return this.getStatus();
    }

    this.proxyPort = options.proxyPort || 8080;
    this.cdpPort = options.cdpPort || 9222;
    const initialUrl = options.initialUrl || 'http://127.0.0.1:4000';

    this.isLaunching = true;
    this.lastError = undefined;
    this.emitStatus();

    try {
      await this.ensureProcessStarted();

      // Send launch command to python launcher
      this.sendCommand({
        command: 'launch',
        proxy_port: this.proxyPort,
        cdp_port: this.cdpPort,
        url: initialUrl
      });

      // Wait for launched event or error (with 30s timeout)
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          this.isLaunching = false;
          this.emitStatus();
          reject(new Error('Timed out waiting for Chrome to launch via Selenium.'));
        }, 30000);

        const onLaunched = () => {
          cleanup();
          resolve();
        };

        const onError = (errData: any) => {
          cleanup();
          reject(new Error(errData?.error || 'Failed to launch Chrome.'));
        };

        const cleanup = () => {
          clearTimeout(timeout);
          this.removeListener('internal:launched', onLaunched);
          this.removeListener('internal:error', onError);
        };

        this.once('internal:launched', onLaunched);
        this.once('internal:error', onError);
      });

      this.isLaunching = false;
      this.isRunning = true;
      this.emitStatus();
      return this.getStatus();
    } catch (err: any) {
      this.isLaunching = false;
      this.isRunning = false;
      this.lastError = err.message;
      this.emitStatus();
      throw err;
    }
  }

  public async navigate(url: string): Promise<boolean> {
    if (!this.isRunning) {
      // Auto launch if not running
      await this.launch({ proxyPort: this.proxyPort, initialUrl: url, cdpPort: this.cdpPort });
      return true;
    }

    let target = url.trim();
    if (!target.startsWith('http://') && !target.startsWith('https://') && !target.startsWith('about:')) {
      target = 'https://' + target;
    }

    this.sendCommand({ command: 'navigate', url: target });
    return true;
  }

  public goBack(): void {
    if (this.isRunning) {
      this.sendCommand({ command: 'back' });
    }
  }

  public goForward(): void {
    if (this.isRunning) {
      this.sendCommand({ command: 'forward' });
    }
  }

  public reload(): void {
    if (this.isRunning) {
      this.sendCommand({ command: 'reload' });
    }
  }

  public focus(): void {
    if (this.isRunning) {
      this.sendCommand({ command: 'focus' });
    }
  }

  public async quit(): Promise<void> {
    if (!this.process && !this.isRunning) return;

    try {
      this.sendCommand({ command: 'quit' });
    } catch {
      // ignore
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (this.process) {
          try {
            if (process.platform === 'win32') {
              spawn('taskkill', ['/pid', String(this.process.pid), '/f', '/t'], { windowsHide: true });
            } else {
              this.process.kill('SIGKILL');
            }
          } catch {}
          this.process = null;
        }
        resolve();
      }, 1500);

      this.once('internal:closed', () => {
        clearTimeout(timer);
        resolve();
      });
    });

    this.isRunning = false;
    this.isLaunching = false;
    this.currentUrl = '';
    this.currentTitle = '';
    this.emitStatus();
  }

  private ensureProcessStarted(): Promise<void> {
    if (this.process && !this.process.killed) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const pythonBin = this.findPythonBinary();
      const scriptPath = this.findScriptPath();

      if (!fs.existsSync(scriptPath)) {
        reject(new Error(`Selenium launcher script not found at: ${scriptPath}`));
        return;
      }

      console.log(`[SeleniumManager] Spawning: ${pythonBin} ${scriptPath}`);

      try {
        this.process = spawn(pythonBin, [scriptPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });

        if (!this.process.stdout || !this.process.stdin) {
          reject(new Error('Failed to create stdio streams for Python process.'));
          return;
        }

        this.rl = readline.createInterface({
          input: this.process.stdout,
          terminal: false
        });

        this.rl.on('line', (line) => {
          this.handleStdoutLine(line);
        });

        this.process.stderr?.on('data', (data) => {
          const errText = data.toString().trim();
          if (errText) {
            console.warn(`[SeleniumManager:stderr] ${errText}`);
          }
        });

        this.process.on('close', (code) => {
          console.log(`[SeleniumManager] Python process exited with code ${code}`);
          this.isRunning = false;
          this.isLaunching = false;
          this.process = null;
          this.emit('internal:closed');
          this.emitStatus();
        });

        this.process.on('error', (err) => {
          console.error('[SeleniumManager] Process error:', err);
          this.lastError = err.message;
          this.isRunning = false;
          this.isLaunching = false;
          this.emit('internal:error', { error: err.message });
          this.emitStatus();
        });

        // Wait for ready handshake from chrome_launcher.py
        const onReady = () => {
          clearTimeout(readyTimeout);
          resolve();
        };

        const readyTimeout = setTimeout(() => {
          this.removeListener('internal:ready', onReady);
          // If already running or no handshake within 5s, assume ready
          resolve();
        }, 5000);

        this.once('internal:ready', onReady);
      } catch (err: any) {
        reject(err);
      }
    });
  }

  private handleStdoutLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const data = JSON.parse(trimmed);
      const event = data.event;

      if (event === 'ready') {
        this.emit('internal:ready');
      } else if (event === 'launched' || event === 'already_running') {
        this.isRunning = true;
        this.isLaunching = false;
        if (data.url) this.currentUrl = data.url;
        if (data.title) this.currentTitle = data.title;
        this.lastError = undefined;
        this.emit('internal:launched', data);
        this.emitStatus();
      } else if (event === 'state_changed' || event === 'navigated') {
        if (data.url) this.currentUrl = data.url;
        if (data.title) this.currentTitle = data.title;
        this.emit('navigated', { url: this.currentUrl, title: this.currentTitle });
        this.emitStatus();
      } else if (event === 'browser_closed' || event === 'closed') {
        this.isRunning = false;
        this.isLaunching = false;
        this.currentUrl = '';
        this.currentTitle = '';
        this.emit('internal:closed');
        this.emitStatus();
      } else if (event === 'error') {
        this.lastError = data.error;
        this.emit('internal:error', data);
        this.emitStatus();
      }
    } catch {
      // Non-JSON debug output
      console.log(`[SeleniumManager:out] ${trimmed}`);
    }
  }

  private sendCommand(cmd: any): void {
    if (this.process && this.process.stdin && !this.process.stdin.destroyed) {
      try {
        this.process.stdin.write(JSON.stringify(cmd) + '\n');
      } catch (err) {
        console.error('[SeleniumManager] sendCommand error:', err);
      }
    }
  }

  private emitStatus(): void {
    this.emit('status-changed', this.getStatus());
  }

  private findPythonBinary(): string {
    const homeDir = os.homedir();
    const candidatePaths = [
      path.join(homeDir, 'AppData\\Local\\Programs\\Python\\Python313\\python.exe'),
      path.join(homeDir, 'AppData\\Local\\Programs\\Python\\Python312\\python.exe'),
      path.join(homeDir, 'AppData\\Local\\Programs\\Python\\Python311\\python.exe'),
      'py',
      'python.exe',
      'python3.exe',
      'python'
    ];

    for (const p of candidatePaths) {
      if (p.includes('\\') && fs.existsSync(p)) {
        return p;
      }
    }
    return 'py';
  }

  private findScriptPath(): string {
    const candidates = [
      path.resolve(process.cwd(), 'proxy/chrome_launcher.py'),
      path.resolve(__dirname, '../../../proxy/chrome_launcher.py'),
      path.resolve(__dirname, '../../proxy/chrome_launcher.py')
    ];

    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return c;
      }
    }
    return candidates[0];
  }
}
