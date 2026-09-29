import { ipcMain, BrowserWindow, dialog } from 'electron';
import fs from 'fs';
import { BrowserManager } from '../browser/browserManager';
import { SeleniumManager } from '../browser/seleniumManager';
import { ProxyManager } from '../proxy/proxyManager';
import { DatabaseManager } from '../database/db';
import { RepeaterService, RepeaterRequest } from '../repeater/repeaterService';
import { ScopeValidator } from '../security/scopeValidator';
import { AuthTestManager } from '../security/authTestManager';
import { SqliScanner } from '../security/sqliScanner';

export function setupIpcHandlers(
  mainWindow: BrowserWindow,
  browserManager: BrowserManager,
  proxyManager: ProxyManager,
  db: DatabaseManager,
  seleniumManager: SeleniumManager
) {
  const authTestManager = new AuthTestManager(db);
  const sqliScanner = new SqliScanner(db);

  // Browser events forward to renderer
  browserManager.on('tabs-changed', (tabs) => {
    mainWindow.webContents.send('browser:tabs-changed', tabs);
  });

  browserManager.on('tab-updated', (tab) => {
    mainWindow.webContents.send('browser:tab-updated', tab);
  });

  browserManager.on('active-tab-changed', (tabId) => {
    mainWindow.webContents.send('browser:active-tab-changed', tabId);
  });

  browserManager.on('console-entry', (data) => {
    mainWindow.webContents.send('cdp:console-entry', data);
  });

  browserManager.on('security-changed', (data) => {
    mainWindow.webContents.send('cdp:security-changed', data);
  });

  // Selenium events forward to renderer
  seleniumManager.on('status-changed', (status) => {
    mainWindow.webContents.send('selenium:status-changed', status);
  });

  seleniumManager.on('navigated', (data) => {
    mainWindow.webContents.send('selenium:navigated', data);
  });

  // Proxy events forward to renderer
  proxyManager.on('status-changed', (status) => {
    mainWindow.webContents.send('proxy:status-changed', status);
  });

  proxyManager.on('intercepted-request', (req) => {
    mainWindow.webContents.send('proxy:intercepted-request', req);
    try {
      const detect = authTestManager.detectLoginRequest(req);
      if (detect.isLogin) {
        mainWindow.webContents.send('auth:login-detected', {
          ...detect,
          url: req.url,
          method: req.method,
          flowId: req.flow_id
        });
      }
    } catch {}
  });

  proxyManager.on('intercepted-response', (res) => {
    mainWindow.webContents.send('proxy:intercepted-response', res);
  });

  proxyManager.on('response-auto-modified', (data) => {
    mainWindow.webContents.send('proxy:response-auto-modified', data);
    try {
      seleniumManager.focus();
      browserManager.focus();
    } catch {}
  });

  proxyManager.on('flow-completed', (flow) => {
    mainWindow.webContents.send('proxy:flow-completed', flow);
  });

  proxyManager.on('flow-error', (err) => {
    mainWindow.webContents.send('proxy:flow-error', err);
  });

  proxyManager.on('log', (logEntry) => {
    mainWindow.webContents.send('proxy:log-entry', logEntry);
  });

  // Browser navigation IPC
  ipcMain.handle('browser:navigate', async (e, url: string) => {
    browserManager.navigate(url);
    if (seleniumManager.getStatus().running) {
      seleniumManager.navigate(url).catch(() => {});
    }
    return true;
  });

  // Selenium WebDriver Chrome IPC Handlers
  ipcMain.handle('selenium:launch', async (e, url?: string) => {
    // 1. Ensure proxy is started so all Chrome traffic is intercepted
    const proxyStatus = proxyManager.getStatus();
    if (!proxyStatus.running) {
      await proxyManager.start(proxyStatus.port || 8080);
    }
    // 2. Launch Chrome via Selenium
    return await seleniumManager.launch({
      proxyPort: proxyManager.getStatus().port,
      initialUrl: url || 'http://127.0.0.1:4000',
      cdpPort: 9222
    });
  });

  ipcMain.handle('selenium:quit', async () => {
    await seleniumManager.quit();
    return true;
  });

  ipcMain.handle('selenium:navigate', async (e, url: string) => {
    await seleniumManager.navigate(url);
    return true;
  });

  ipcMain.handle('selenium:status', () => {
    return seleniumManager.getStatus();
  });

  ipcMain.handle('selenium:back', () => {
    seleniumManager.goBack();
    return true;
  });

  ipcMain.handle('selenium:forward', () => {
    seleniumManager.goForward();
    return true;
  });

  ipcMain.handle('selenium:reload', () => {
    seleniumManager.reload();
    return true;
  });

  ipcMain.handle('selenium:focus', () => {
    seleniumManager.focus();
    return true;
  });

  ipcMain.handle('browser:go-back', () => {
    browserManager.goBack();
  });

  ipcMain.handle('browser:go-forward', () => {
    browserManager.goForward();
  });

  ipcMain.handle('browser:reload', () => {
    browserManager.reload();
  });

  ipcMain.handle('browser:stop', () => {
    browserManager.stop();
  });

  ipcMain.handle('browser:focus', () => {
    browserManager.focus();
    return true;
  });

  ipcMain.handle('browser:set-zoom', (e, factor: number) => {
    browserManager.setZoom(factor);
  });

  ipcMain.handle('browser:clear-browsing-data', async () => {
    await browserManager.clearBrowsingData();
    return true;
  });

  ipcMain.handle('browser:create-tab', async (e, url?: string) => {
    return await browserManager.createTab(url);
  });

  ipcMain.handle('browser:close-tab', async (e, tabId: string) => {
    await browserManager.closeTab(tabId);
    return true;
  });

  ipcMain.handle('browser:switch-tab', async (e, tabId: string) => {
    await browserManager.switchTab(tabId);
    return true;
  });

  ipcMain.handle('browser:get-tabs', () => {
    return browserManager.getTabs();
  });

  ipcMain.handle('browser:update-bounds', (e, bounds) => {
    browserManager.updateBounds(bounds);
  });

  ipcMain.handle('browser:set-visible', (e, visible: boolean) => {
    browserManager.setBrowserVisible(visible);
  });

  // Proxy IPC
  ipcMain.handle('proxy:start', async (e, port: number) => {
    const success = await proxyManager.start(port || 8080);
    if (success) {
      await browserManager.setProxy(true, port || 8080);
    }
    return success;
  });

  ipcMain.handle('proxy:stop', async () => {
    await proxyManager.stop();
    await browserManager.setProxy(false);
    return true;
  });

  ipcMain.handle('proxy:get-status', () => {
    return proxyManager.getStatus();
  });

  ipcMain.handle('proxy:set-config', async (e, config) => {
    await proxyManager.setConfig(config);
    return true;
  });

  ipcMain.handle('proxy:action-request', (e, { flowId, action, modifications }) => {
    proxyManager.actionRequest(flowId, action, modifications);
    return true;
  });

  ipcMain.handle('proxy:action-response', (e, { flowId, action, modifications }) => {
    proxyManager.actionResponse(flowId, action, modifications);
    return true;
  });

  ipcMain.handle('proxy:clear-queues', () => {
    proxyManager.clearQueues();
    return true;
  });

  ipcMain.handle('proxy:get-pending-requests', () => {
    return proxyManager.getPendingRequests();
  });

  ipcMain.handle('proxy:get-pending-responses', () => {
    return proxyManager.getPendingResponses();
  });

  ipcMain.handle('proxy:get-logs', () => {
    return proxyManager.getLogs();
  });

  ipcMain.handle('proxy:get-certificate-info', () => {
    return proxyManager.getCertificateInfo();
  });

  // Database / History IPC
  ipcMain.handle('history:get', async (e, filters) => {
    return await db.getHistory(filters || {});
  });

  ipcMain.handle('history:get-by-id', async (e, requestId: string) => {
    return await db.getRequestById(requestId);
  });

  ipcMain.handle('history:clear', async () => {
    await db.clearHistory();
    return true;
  });

  ipcMain.handle('history:delete', async (e, requestId: string) => {
    await db.deleteRequest(requestId);
    return true;
  });

  // Scope IPC
  ipcMain.handle('scope:get-all', async () => {
    return await db.getScopes();
  });

  ipcMain.handle('scope:add', async (e, { pattern, isRegex }) => {
    const scope = await db.addScope(pattern, isRegex ? 1 : 0);
    // sync with proxy addon
    const allScopes = await db.getScopes();
    await proxyManager.setConfig({
      scopeDomains: allScopes.filter(s => s.enabled).map(s => s.pattern)
    });
    return scope;
  });

  ipcMain.handle('scope:remove', async (e, id: string) => {
    await db.removeScope(id);
    const allScopes = await db.getScopes();
    await proxyManager.setConfig({
      scopeDomains: allScopes.filter(s => s.enabled).map(s => s.pattern)
    });
    return true;
  });

  ipcMain.handle('scope:toggle', async (e, { id, enabled }) => {
    await db.toggleScope(id, enabled);
    const allScopes = await db.getScopes();
    await proxyManager.setConfig({
      scopeDomains: allScopes.filter(s => s.enabled).map(s => s.pattern)
    });
    return true;
  });

  // Repeater IPC
  ipcMain.handle('repeater:get-tabs', async () => {
    return await db.getRepeaterTabs();
  });

  ipcMain.handle('repeater:save-tab', async (e, tab) => {
    await db.saveRepeaterTab(tab);
    return true;
  });

  ipcMain.handle('repeater:delete-tab', async (e, id: string) => {
    await db.deleteRepeaterTab(id);
    return true;
  });

  // Response Modification Logs IPC
  ipcMain.handle('db:get-response-modification-logs', async (e, limit?: number) => {
    return await db.getResponseModificationLogs(limit || 100);
  });

  ipcMain.handle('db:clear-response-modification-logs', async () => {
    await db.clearResponseModificationLogs();
    return true;
  });

  ipcMain.handle('db:add-response-modification-log', async (e, log: any) => {
    return await db.recordResponseModificationLog(log);
  });

  ipcMain.handle('db:get-stats', async () => {
    return await db.getDatabaseStats();
  });

  // Authentication & Saved Profiles IPC
  ipcMain.handle('auth:get-profiles', async () => {
    return await db.getLoginProfiles();
  });

  ipcMain.handle('auth:get-profile', async (e, id: string) => {
    return await db.getLoginProfileById(id);
  });

  ipcMain.handle('auth:save-profile', async (e, profile: any) => {
    return await db.saveLoginProfile(profile);
  });

  ipcMain.handle('auth:delete-profile', async (e, id: string) => {
    await db.deleteLoginProfile(id);
    return true;
  });

  ipcMain.handle('auth:test-login', async (e, { profileId, overridePassword }: { profileId: string; overridePassword?: string }) => {
    return await authTestManager.testLogin(profileId, overridePassword);
  });

  ipcMain.handle('auth:get-sessions', async () => {
    return await db.getAuthSessions();
  });

  ipcMain.handle('auth:get-session', async (e, id: string) => {
    return await db.getAuthSessionById(id);
  });

  ipcMain.handle('auth:refresh-session', async (e, sessionId: string) => {
    return await authTestManager.refreshSession(sessionId);
  });

  ipcMain.handle('auth:revoke-session', async (e, sessionId: string) => {
    await authTestManager.revokeSession(sessionId);
    return true;
  });

  ipcMain.handle('auth:delete-session', async (e, sessionId: string) => {
    await db.deleteAuthSession(sessionId);
    return true;
  });

  ipcMain.handle('auth:clear-sessions', async () => {
    await db.clearAuthSessions();
    return true;
  });

  ipcMain.handle('auth:detect-login', async (e, req: any) => {
    return authTestManager.detectLoginRequest(req);
  });

  // SQL Injection Scanner IPC
  ipcMain.handle('sqli:extract-params', (e, req: any) => {
    return sqliScanner.extractParameters(req);
  });

  ipcMain.handle('sqli:passive-analyze', (e, flow: any) => {
    return sqliScanner.passiveAnalyze(flow);
  });

  ipcMain.handle('sqli:start-scan', async (e, { req, params, settings }: { req: any; params: any[]; settings: any }) => {
    return await sqliScanner.startActiveScan(req, params, settings, (progress) => {
      mainWindow.webContents.send('sqli:progress', progress);
    });
  });

  ipcMain.handle('sqli:stop-scan', (e, scanId: string) => {
    return sqliScanner.stopScan(scanId);
  });

  ipcMain.handle('sqli:get-reports', async (e, limit?: number) => {
    return await db.getSqliReports(limit || 100);
  });

  ipcMain.handle('sqli:get-report', async (e, id: string) => {
    return await db.getSqliReportById(id);
  });

  ipcMain.handle('sqli:delete-report', async (e, id: string) => {
    await db.deleteSqliReport(id);
    return true;
  });

  ipcMain.handle('sqli:clear-reports', async () => {
    await db.clearSqliReports();
    return true;
  });

  ipcMain.handle('sqli:fingerprint-db', (e, { body, headers, status }: { body: string; headers?: Record<string, string>; status?: number }) => {
    return sqliScanner.fingerprintTarget(body, headers, status);
  });

  ipcMain.handle('sqli:verify-data-exposure', async (e, req: any) => {
    return await sqliScanner.verifyDataExposure(req);
  });

  ipcMain.handle('sqli:scan-source-code', (e, pathOrSnippet?: string) => {
    return sqliScanner.scanSourceCode(pathOrSnippet || 'tests/mock-server.js');
  });

  ipcMain.handle('sqli:second-order-test', async (e, data: { storeReq: any; triggerReq: any; paramName: string; probe?: string }) => {
    return await sqliScanner.runSecondOrderTest(data);
  });

  ipcMain.handle('repeater:send', async (e, req: RepeaterRequest) => {
    // Check scope enforcement
    const scopes = await db.getScopes();
    const proxyStatus = proxyManager.getStatus();

    if (proxyStatus.strictScope && !ScopeValidator.isUrlInScope(req.url, scopes)) {
      return {
        statusCode: 0,
        statusMessage: 'Blocked by Target Scope',
        headers: {},
        body: 'Error: Request destination is outside your authorized target scope. Disable strict scope or add domain to scope settings.',
        durationMs: 0,
        sizeBytes: 0,
        error: 'Scope violation'
      };
    }

    const useProxy = req.useProxy !== undefined ? req.useProxy : proxyStatus.running;
    return await RepeaterService.execute({
      ...req,
      useProxy,
      proxyPort: proxyStatus.port
    });
  });

  // CDP DevTools IPC
  ipcMain.handle('cdp:get-dom-tree', async () => {
    const cdp = browserManager.getActiveCdp();
    if (!cdp) return null;
    return await cdp.getDomTree();
  });

  ipcMain.handle('cdp:request-child-nodes', async (e, nodeId: number) => {
    const cdp = browserManager.getActiveCdp();
    if (cdp) await cdp.requestChildNodes(nodeId);
    return true;
  });

  ipcMain.handle('cdp:get-computed-style', async (e, nodeId: number) => {
    const cdp = browserManager.getActiveCdp();
    if (!cdp) return [];
    return await cdp.getComputedStyle(nodeId);
  });

  ipcMain.handle('cdp:get-matched-styles', async (e, nodeId: number) => {
    const cdp = browserManager.getActiveCdp();
    if (!cdp) return null;
    return await cdp.getMatchedStyles(nodeId);
  });

  ipcMain.handle('cdp:get-cookies', async (e, url?: string) => {
    const cdp = browserManager.getActiveCdp();
    if (!cdp) return [];
    return await cdp.getCookies(url);
  });

  ipcMain.handle('cdp:clear-cookies', async () => {
    const cdp = browserManager.getActiveCdp();
    if (cdp) await cdp.clearCookies();
    return true;
  });

  ipcMain.handle('cdp:get-storage', async (e, url: string) => {
    const cdp = browserManager.getActiveCdp();
    if (!cdp) return { localStorage: [], sessionStorage: [] };
    return await cdp.getStorage(url);
  });

  ipcMain.handle('cdp:get-scripts', async () => {
    const cdp = browserManager.getActiveCdp();
    if (!cdp) return [];
    return await cdp.getLoadedScripts();
  });

  ipcMain.handle('cdp:get-script-source', async (e, scriptId: string) => {
    const cdp = browserManager.getActiveCdp();
    if (!cdp) return '';
    return await cdp.getScriptSource(scriptId);
  });

  ipcMain.handle('cdp:get-console-logs', () => {
    const cdp = browserManager.getActiveCdp();
    return cdp ? cdp.getConsoleLogs() : [];
  });

  ipcMain.handle('cdp:clear-console', () => {
    const cdp = browserManager.getActiveCdp();
    if (cdp) cdp.clearConsoleLogs();
    return true;
  });

  // Export / Reporting IPC
  ipcMain.handle('export:save-file', async (e, { defaultPath, content, fileType }) => {
    const res = await dialog.showSaveDialog(mainWindow, {
      defaultPath,
      filters: [{ name: fileType, extensions: [fileType] }]
    });

    if (!res.canceled && res.filePath) {
      fs.writeFileSync(res.filePath, content, 'utf-8');
      return { success: true, path: res.filePath };
    }
    return { success: false };
  });
}
