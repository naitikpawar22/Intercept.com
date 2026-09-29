import { BrowserWindow, WebContentsView, session, dialog, app } from 'electron';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { CDPManager } from '../cdp/cdpManager';

export interface TabInfo {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  securityState?: string;
}

export interface TabView {
  id: string;
  view: WebContentsView;
  cdp: CDPManager;
  title: string;
  url: string;
  favicon?: string;
  isLoading: boolean;
}

export class BrowserManager extends EventEmitter {
  private tabs: Map<string, TabView> = new Map();
  private activeTabId: string | null = null;
  private currentBounds = { x: 0, y: 76, width: 800, height: 400 };
  private proxyPort: number = 8080;
  private isProxyActive: boolean = false;
  private isBrowserVisible: boolean = true;

  constructor(private mainWindow: BrowserWindow) {
    super();
    this.setupGlobalSession();
  }

  private setupGlobalSession(): void {
    const ses = session.defaultSession;

    // Unconditionally trust certificates in security testing browser session
    ses.setCertificateVerifyProc((request, callback) => {
      // 0 represents verification succeeded (ERR_OK)
      callback(0);
    });

    // Download handling
    ses.on('will-download', (event, item, webContents) => {
      item.once('done', (e, state) => {
        if (state === 'completed') {
          this.emit('download-completed', item.getFilename());
        }
      });
    });

    // Fallback certificate-error listener
    app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
      event.preventDefault();
      callback(true);
    });
  }

  public async setProxy(enabled: boolean, port: number = 8080): Promise<void> {
    this.isProxyActive = enabled;
    this.proxyPort = port;
    const ses = session.defaultSession;

    if (enabled) {
      console.log(`[BrowserManager] Configuring Chromium proxy to 127.0.0.1:${port}`);
      await ses.setProxy({
        proxyRules: `http=127.0.0.1:${port};https=127.0.0.1:${port}`,
        proxyBypassRules: '<-loopback>'
      });
    } else {
      console.log('[BrowserManager] Direct connection (proxy disabled)');
      await ses.setProxy({ mode: 'direct' });
    }
  }

  public async createTab(initialUrl: string = 'http://127.0.0.1:4000'): Promise<string> {
    const tabId = uuidv4();
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false
      }
    });

    const cdp = new CDPManager(view.webContents);

    const tabView: TabView = {
      id: tabId,
      view,
      cdp,
      title: 'New Tab',
      url: initialUrl,
      isLoading: false
    };

    this.tabs.set(tabId, tabView);

    // Setup webContents events
    const wc = view.webContents;

    wc.on('did-start-loading', () => {
      tabView.isLoading = true;
      this.emitTabUpdate(tabId);
    });

    wc.on('did-stop-loading', () => {
      tabView.isLoading = false;
      tabView.url = wc.getURL();
      tabView.title = wc.getTitle() || 'Untitled';
      this.emitTabUpdate(tabId);
    });

    wc.on('page-title-updated', (e, title) => {
      tabView.title = title;
      this.emitTabUpdate(tabId);
    });

    wc.on('page-favicon-updated', (e, favicons) => {
      if (favicons.length > 0) {
        tabView.favicon = favicons[0];
        this.emitTabUpdate(tabId);
      }
    });

    wc.on('did-navigate', (e, url) => {
      tabView.url = url;
      this.emitTabUpdate(tabId);
    });

    wc.on('did-navigate-in-page', (e, url) => {
      tabView.url = url;
      this.emitTabUpdate(tabId);
    });

    wc.on('certificate-error', (event, url, error, certificate, callback) => {
      event.preventDefault();
      callback(true);
    });

    wc.on('did-fail-load', (e, errorCode, errorDescription, validatedURL) => {
      if (errorCode === -3) return; // ignore ABORTED/redirects
      tabView.isLoading = false;
      this.emitTabUpdate(tabId);
      this.emit('tab-error', { tabId, errorCode, errorDescription, url: validatedURL });

      // Render a friendly error page so user sees what happened
      wc.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Page Load Error</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #121316; color: #f1f5f9; padding: 40px; margin: 0; }
            .box { max-width: 600px; margin: 40px auto; background: #181920; border: 1px solid #2b2e3c; border-radius: 8px; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
            h2 { color: #f87171; margin-top: 0; font-size: 18px; }
            p { color: #94a3b8; font-size: 13px; line-height: 1.5; }
            code { background: #0f172a; padding: 2px 6px; border-radius: 4px; color: #38bdf8; font-family: monospace; font-size: 12px; }
            button { background: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-top: 16px; font-size: 13px; }
            button:hover { background: #1d4ed8; }
          </style>
        </head>
        <body>
          <div class="box">
            <h2>Unable to load page</h2>
            <p>NetScope could not reach <code>${validatedURL}</code>.</p>
            <p><strong>Error details:</strong> <code>${errorDescription} (${errorCode})</code></p>
            <p>If testing an HTTPS website through the proxy, ensure the destination server is reachable.</p>
            <button onclick="location.reload()">Reload Page</button>
          </div>
        </body>
        </html>
      `)}`).catch(() => {});
    });

    // Forward CDP console messages to UI
    cdp.on('console-entry', (entry) => {
      this.emit('console-entry', { tabId, entry });
    });

    cdp.on('security-changed', (secInfo) => {
      this.emit('security-changed', { tabId, secInfo });
    });

    // Attach CDP
    await cdp.attach();

    // Load initial URL
    if (initialUrl) {
      wc.loadURL(initialUrl).catch((err) => {
        console.warn(`[BrowserManager] Initial loadURL failed for ${initialUrl}:`, err.message);
      });
    }

    // Switch to this new tab
    await this.switchTab(tabId);

    return tabId;
  }

  public async switchTab(tabId: string): Promise<void> {
    if (!this.tabs.has(tabId)) return;

    // Remove previous view from contentView
    if (this.activeTabId && this.tabs.has(this.activeTabId)) {
      const prev = this.tabs.get(this.activeTabId)!;
      try {
        this.mainWindow.contentView.removeChildView(prev.view);
      } catch (err) {
        // ignore if not attached
      }
    }

    this.activeTabId = tabId;
    const active = this.tabs.get(tabId)!;

    if (this.isBrowserVisible) {
      try {
        if (!this.mainWindow.contentView.children.includes(active.view)) {
          this.mainWindow.contentView.addChildView(active.view);
        }
        active.view.setBounds(this.currentBounds);
      } catch (err) {
        console.warn('[BrowserManager] switchTab addChildView error:', err);
      }
    }

    this.emit('active-tab-changed', tabId);
    this.emitTabUpdate(tabId);
  }

  public async closeTab(tabId: string): Promise<void> {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    tab.cdp.detach();

    if (this.activeTabId === tabId) {
      try {
        this.mainWindow.contentView.removeChildView(tab.view);
      } catch (e) {}

      this.tabs.delete(tabId);

      // Select another tab
      const remaining = Array.from(this.tabs.keys());
      if (remaining.length > 0) {
        await this.switchTab(remaining[remaining.length - 1]);
      } else {
        // Create a new blank tab if all closed
        await this.createTab('about:blank');
      }
    } else {
      this.tabs.delete(tabId);
    }

    this.emit('tab-closed', tabId);
    this.emitTabsList();
  }

  public setBrowserVisible(visible: boolean): void {
    this.isBrowserVisible = visible;
    if (!this.activeTabId || !this.tabs.has(this.activeTabId)) return;
    const active = this.tabs.get(this.activeTabId)!;

    if (visible) {
      try {
        if (!this.mainWindow.contentView.children.includes(active.view)) {
          this.mainWindow.contentView.addChildView(active.view);
        }
        active.view.setBounds(this.currentBounds);
      } catch (e) {}
    } else {
      try {
        this.mainWindow.contentView.removeChildView(active.view);
      } catch (e) {}
    }
  }

  public updateBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
    this.currentBounds = bounds;
    if (this.activeTabId && this.tabs.has(this.activeTabId) && this.isBrowserVisible) {
      const active = this.tabs.get(this.activeTabId)!;
      try {
        if (!this.mainWindow.contentView.children.includes(active.view)) {
          this.mainWindow.contentView.addChildView(active.view);
        }
        active.view.setBounds(bounds);
      } catch (e) {
        console.warn('[BrowserManager] setBounds error:', e);
      }
    }
  }

  public navigate(url: string): void {
    if (!this.activeTabId) return;
    const active = this.tabs.get(this.activeTabId);
    if (!active) return;

    let targetUrl = url.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://') && !targetUrl.startsWith('about:')) {
      targetUrl = 'https://' + targetUrl;
    }

    console.log(`[BrowserManager] Navigating tab ${this.activeTabId} to: ${targetUrl}`);
    active.isLoading = true;
    active.url = targetUrl;
    this.emitTabUpdate(this.activeTabId);

    active.view.webContents.loadURL(targetUrl).catch((err) => {
      console.warn(`[BrowserManager] Navigation error: ${err.message}`);
    });
  }

  public goBack(): void {
    const active = this.getActiveView();
    if (active && active.webContents.navigationHistory.canGoBack()) {
      active.webContents.navigationHistory.goBack();
    }
  }

  public goForward(): void {
    const active = this.getActiveView();
    if (active && active.webContents.navigationHistory.canGoForward()) {
      active.webContents.navigationHistory.goForward();
    }
  }

  public reload(): void {
    const active = this.getActiveView();
    if (active) {
      active.webContents.reload();
    }
  }

  public stop(): void {
    const active = this.getActiveView();
    if (active) {
      active.webContents.stop();
    }
  }

  public focus(): void {
    const active = this.getActiveView();
    if (active) {
      try {
        active.webContents.focus();
        active.webContents.executeJavaScript(`
          try {
            window.focus();
            if (document.hidden) {
              try {
                Object.defineProperty(document, 'hidden', { value: false, configurable: true });
                Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
              } catch(e) {}
              document.dispatchEvent(new Event('visibilitychange'));
            }
            window.dispatchEvent(new Event('focus'));
          } catch(e) {}
        `).catch(() => {});
      } catch (e) {}
    }
  }

  public setZoom(factor: number): void {
    const active = this.getActiveView();
    if (active) {
      active.webContents.setZoomFactor(factor);
    }
  }

  public async clearBrowsingData(): Promise<void> {
    await session.defaultSession.clearStorageData();
    this.reload();
  }

  public getActiveTabId(): string | null {
    return this.activeTabId;
  }

  public getActiveView(): WebContentsView | null {
    if (!this.activeTabId) return null;
    return this.tabs.get(this.activeTabId)?.view || null;
  }

  public getActiveCdp(): CDPManager | null {
    if (!this.activeTabId) return null;
    return this.tabs.get(this.activeTabId)?.cdp || null;
  }

  public getTabs(): TabInfo[] {
    return Array.from(this.tabs.values()).map((t) => {
      const wc = t.view.webContents;
      return {
        id: t.id,
        title: t.title,
        url: t.url,
        favicon: t.favicon,
        isLoading: t.isLoading,
        canGoBack: wc.navigationHistory ? wc.navigationHistory.canGoBack() : false,
        canGoForward: wc.navigationHistory ? wc.navigationHistory.canGoForward() : false
      };
    });
  }

  private emitTabUpdate(tabId: string): void {
    const t = this.tabs.get(tabId);
    if (!t) return;
    const wc = t.view.webContents;
    const tabInfo: TabInfo = {
      id: t.id,
      title: t.title,
      url: t.url,
      favicon: t.favicon,
      isLoading: t.isLoading,
      canGoBack: wc.navigationHistory ? wc.navigationHistory.canGoBack() : false,
      canGoForward: wc.navigationHistory ? wc.navigationHistory.canGoForward() : false
    };
    this.emit('tab-updated', tabInfo);
    this.emitTabsList();
  }

  private emitTabsList(): void {
    this.emit('tabs-changed', this.getTabs());
  }
}
