import { contextBridge, ipcRenderer } from 'electron';

const netscopeApi = {
  // Browser controls
  browser: {
    navigate: (url: string) => ipcRenderer.invoke('browser:navigate', url),
    goBack: () => ipcRenderer.invoke('browser:go-back'),
    goForward: () => ipcRenderer.invoke('browser:go-forward'),
    reload: () => ipcRenderer.invoke('browser:reload'),
    stop: () => ipcRenderer.invoke('browser:stop'),
    setZoom: (factor: number) => ipcRenderer.invoke('browser:set-zoom', factor),
    clearBrowsingData: () => ipcRenderer.invoke('browser:clear-browsing-data'),
    createTab: (url?: string) => ipcRenderer.invoke('browser:create-tab', url),
    closeTab: (tabId: string) => ipcRenderer.invoke('browser:close-tab', tabId),
    switchTab: (tabId: string) => ipcRenderer.invoke('browser:switch-tab', tabId),
    getTabs: () => ipcRenderer.invoke('browser:get-tabs'),
    updateBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke('browser:update-bounds', bounds),
    setVisible: (visible: boolean) => ipcRenderer.invoke('browser:set-visible', visible),
    focus: () => ipcRenderer.invoke('browser:focus'),

    onTabsChanged: (cb: (tabs: any[]) => void) => {
      const sub = (_: any, data: any) => cb(data);
      ipcRenderer.on('browser:tabs-changed', sub);
      return () => ipcRenderer.removeListener('browser:tabs-changed', sub);
    },
    onTabUpdated: (cb: (tab: any) => void) => {
      const sub = (_: any, data: any) => cb(data);
      ipcRenderer.on('browser:tab-updated', sub);
      return () => ipcRenderer.removeListener('browser:tab-updated', sub);
    },
    onActiveTabChanged: (cb: (tabId: string) => void) => {
      const sub = (_: any, data: any) => cb(data);
      ipcRenderer.on('browser:active-tab-changed', sub);
      return () => ipcRenderer.removeListener('browser:active-tab-changed', sub);
    }
  },

  // Selenium WebDriver Chrome controls
  selenium: {
    launch: (url?: string) => ipcRenderer.invoke('selenium:launch', url),
    quit: () => ipcRenderer.invoke('selenium:quit'),
    navigate: (url: string) => ipcRenderer.invoke('selenium:navigate', url),
    getStatus: () => ipcRenderer.invoke('selenium:status'),
    goBack: () => ipcRenderer.invoke('selenium:back'),
    goForward: () => ipcRenderer.invoke('selenium:forward'),
    reload: () => ipcRenderer.invoke('selenium:reload'),
    focus: () => ipcRenderer.invoke('selenium:focus'),

    onStatusChanged: (cb: (status: any) => void) => {
      const sub = (_: any, data: any) => cb(data);
      ipcRenderer.on('selenium:status-changed', sub);
      return () => ipcRenderer.removeListener('selenium:status-changed', sub);
    },
    onNavigated: (cb: (data: { url: string; title: string }) => void) => {
      const sub = (_: any, data: any) => cb(data);
      ipcRenderer.on('selenium:navigated', sub);
      return () => ipcRenderer.removeListener('selenium:navigated', sub);
    }
  },

  // Proxy controls
  proxy: {
    start: (port?: number) => ipcRenderer.invoke('proxy:start', port),
    stop: () => ipcRenderer.invoke('proxy:stop'),
    getStatus: () => ipcRenderer.invoke('proxy:get-status'),
    setConfig: (config: any) => ipcRenderer.invoke('proxy:set-config', config),
    actionRequest: (flowId: string, action: string, modifications?: any) =>
      ipcRenderer.invoke('proxy:action-request', { flowId, action, modifications }),
    actionResponse: (flowId: string, action: string, modifications?: any) =>
      ipcRenderer.invoke('proxy:action-response', { flowId, action, modifications }),
    clearQueues: () => ipcRenderer.invoke('proxy:clear-queues'),
    getPendingRequests: () => ipcRenderer.invoke('proxy:get-pending-requests'),
    getPendingResponses: () => ipcRenderer.invoke('proxy:get-pending-responses'),
    getLogs: () => ipcRenderer.invoke('proxy:get-logs'),
    getCertificateInfo: () => ipcRenderer.invoke('proxy:get-certificate-info'),

    onStatusChanged: (cb: (status: any) => void) => {
      const sub = (_: any, data: any) => cb(data);
      ipcRenderer.on('proxy:status-changed', sub);
      return () => ipcRenderer.removeListener('proxy:status-changed', sub);
    },
    onInterceptedRequest: (cb: (req: any) => void) => {
      const sub = (_: any, data: any) => cb(data);
      ipcRenderer.on('proxy:intercepted-request', sub);
      return () => ipcRenderer.removeListener('proxy:intercepted-request', sub);
    },
    onInterceptedResponse: (cb: (res: any) => void) => {
      const sub = (_: any, data: any) => cb(data);
      ipcRenderer.on('proxy:intercepted-response', sub);
      return () => ipcRenderer.removeListener('proxy:intercepted-response', sub);
    },
    onFlowCompleted: (cb: (flow: any) => void) => {
      const sub = (_: any, data: any) => cb(data);
      ipcRenderer.on('proxy:flow-completed', sub);
      return () => ipcRenderer.removeListener('proxy:flow-completed', sub);
    },
    onFlowError: (cb: (err: any) => void) => {
      const sub = (_: any, data: any) => cb(data);
      ipcRenderer.on('proxy:flow-error', sub);
      return () => ipcRenderer.removeListener('proxy:flow-error', sub);
    },
    onLogEntry: (cb: (entry: string) => void) => {
      const sub = (_: any, data: any) => cb(data);
      ipcRenderer.on('proxy:log-entry', sub);
      return () => ipcRenderer.removeListener('proxy:log-entry', sub);
    },
    onResponseAutoModified: (cb: (data: any) => void) => {
      const sub = (_: any, data: any) => cb(data);
      ipcRenderer.on('proxy:response-auto-modified', sub);
      return () => ipcRenderer.removeListener('proxy:response-auto-modified', sub);
    }
  },

  // History & SQLite
  history: {
    get: (filters?: any) => ipcRenderer.invoke('history:get', filters),
    getById: (requestId: string) => ipcRenderer.invoke('history:get-by-id', requestId),
    clear: () => ipcRenderer.invoke('history:clear'),
    delete: (requestId: string) => ipcRenderer.invoke('history:delete', requestId),
    getModificationLogs: (limit?: number) => ipcRenderer.invoke('db:get-response-modification-logs', limit),
    clearModificationLogs: () => ipcRenderer.invoke('db:clear-response-modification-logs'),
    addModificationLog: (log: any) => ipcRenderer.invoke('db:add-response-modification-log', log)
  },

  // Auth & Session Management
  auth: {
    getProfiles: () => ipcRenderer.invoke('auth:get-profiles'),
    getProfile: (id: string) => ipcRenderer.invoke('auth:get-profile', id),
    saveProfile: (profile: any) => ipcRenderer.invoke('auth:save-profile', profile),
    deleteProfile: (id: string) => ipcRenderer.invoke('auth:delete-profile', id),
    testLogin: (profileId: string, overridePassword?: string) =>
      ipcRenderer.invoke('auth:test-login', { profileId, overridePassword }),
    getSessions: () => ipcRenderer.invoke('auth:get-sessions'),
    getSession: (id: string) => ipcRenderer.invoke('auth:get-session', id),
    refreshSession: (sessionId: string) => ipcRenderer.invoke('auth:refresh-session', sessionId),
    revokeSession: (sessionId: string) => ipcRenderer.invoke('auth:revoke-session', sessionId),
    deleteSession: (sessionId: string) => ipcRenderer.invoke('auth:delete-session', sessionId),
    clearSessions: () => ipcRenderer.invoke('auth:clear-sessions'),
    detectLogin: (req: any) => ipcRenderer.invoke('auth:detect-login', req),
    onLoginDetected: (cb: (data: any) => void) => {
      const sub = (_: any, data: any) => cb(data);
      ipcRenderer.on('auth:login-detected', sub);
      return () => ipcRenderer.removeListener('auth:login-detected', sub);
    }
  },

  // Local Database Stats
  db: {
    getStats: () => ipcRenderer.invoke('db:get-stats')
  },

  // SQL Injection Security Testing Module
  sqli: {
    extractParams: (req: any) => ipcRenderer.invoke('sqli:extract-params', req),
    passiveAnalyze: (flow: any) => ipcRenderer.invoke('sqli:passive-analyze', flow),
    startScan: (req: any, params: any[], settings: any) =>
      ipcRenderer.invoke('sqli:start-scan', { req, params, settings }),
    stopScan: (scanId: string) => ipcRenderer.invoke('sqli:stop-scan', scanId),
    getReports: (limit?: number) => ipcRenderer.invoke('sqli:get-reports', limit),
    getReport: (id: string) => ipcRenderer.invoke('sqli:get-report', id),
    deleteReport: (id: string) => ipcRenderer.invoke('sqli:delete-report', id),
    clearReports: () => ipcRenderer.invoke('sqli:clear-reports'),
    fingerprintDb: (data: { body: string; headers?: Record<string, string>; status?: number }) =>
      ipcRenderer.invoke('sqli:fingerprint-db', data),
    verifyDataExposure: (req: any) =>
      ipcRenderer.invoke('sqli:verify-data-exposure', req),
    scanSourceCode: (pathOrSnippet?: string) =>
      ipcRenderer.invoke('sqli:scan-source-code', pathOrSnippet),
    runSecondOrderTest: (data: { storeReq: any; triggerReq: any; paramName: string; probe?: string }) =>
      ipcRenderer.invoke('sqli:second-order-test', data),
    onProgress: (cb: (progress: any) => void) => {
      const sub = (_: any, data: any) => cb(data);
      ipcRenderer.on('sqli:progress', sub);
      return () => ipcRenderer.removeListener('sqli:progress', sub);
    }
  },

  // Target Scope
  scope: {
    getAll: () => ipcRenderer.invoke('scope:get-all'),
    add: (pattern: string, isRegex = false) => ipcRenderer.invoke('scope:add', { pattern, isRegex }),
    remove: (id: string) => ipcRenderer.invoke('scope:remove', id),
    toggle: (id: string, enabled: boolean) => ipcRenderer.invoke('scope:toggle', { id, enabled })
  },

  // Repeater
  repeater: {
    getTabs: () => ipcRenderer.invoke('repeater:get-tabs'),
    saveTab: (tab: any) => ipcRenderer.invoke('repeater:save-tab', tab),
    deleteTab: (id: string) => ipcRenderer.invoke('repeater:delete-tab', id),
    send: (request: any) => ipcRenderer.invoke('repeater:send', request)
  },

  // Chrome DevTools Protocol
  cdp: {
    getDomTree: () => ipcRenderer.invoke('cdp:get-dom-tree'),
    requestChildNodes: (nodeId: number) => ipcRenderer.invoke('cdp:request-child-nodes', nodeId),
    getComputedStyle: (nodeId: number) => ipcRenderer.invoke('cdp:get-computed-style', nodeId),
    getMatchedStyles: (nodeId: number) => ipcRenderer.invoke('cdp:get-matched-styles', nodeId),
    getCookies: (url?: string) => ipcRenderer.invoke('cdp:get-cookies', url),
    clearCookies: () => ipcRenderer.invoke('cdp:clear-cookies'),
    getStorage: (url: string) => ipcRenderer.invoke('cdp:get-storage', url),
    getScripts: () => ipcRenderer.invoke('cdp:get-scripts'),
    getScriptSource: (scriptId: string) => ipcRenderer.invoke('cdp:get-script-source', scriptId),
    getConsoleLogs: () => ipcRenderer.invoke('cdp:get-console-logs'),
    clearConsole: () => ipcRenderer.invoke('cdp:clear-console'),

    onConsoleEntry: (cb: (entry: any) => void) => {
      const sub = (_: any, data: any) => cb(data);
      ipcRenderer.on('cdp:console-entry', sub);
      return () => ipcRenderer.removeListener('cdp:console-entry', sub);
    },
    onSecurityChanged: (cb: (sec: any) => void) => {
      const sub = (_: any, data: any) => cb(data);
      ipcRenderer.on('cdp:security-changed', sub);
      return () => ipcRenderer.removeListener('cdp:security-changed', sub);
    }
  },

  // Export
  export: {
    saveFile: (opts: { defaultPath: string; content: string; fileType: string }) =>
      ipcRenderer.invoke('export:save-file', opts)
  },

  onWindowResize: (cb: () => void) => {
    const sub = () => cb();
    ipcRenderer.on('window:resized', sub);
    return () => ipcRenderer.removeListener('window:resized', sub);
  }
};

contextBridge.exposeInMainWorld('netscope', netscopeApi);

export type NetScopeApi = typeof netscopeApi;
