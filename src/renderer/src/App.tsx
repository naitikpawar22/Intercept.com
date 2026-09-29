import React, { useState, useEffect, useRef } from 'react';
import { 
  Network, ShieldAlert, FastForward, Repeat, History, Terminal, Layers, 
  FileCode, Database, Shield, Binary, Settings, Radio, KeyRound 
} from 'lucide-react';
import { BrowserTab, NetworkFlow, ProxyStatus, ConsoleEntry, SeleniumStatus } from './types';
import { TopNav } from './components/TopNav';
import { TabBar } from './components/TabBar';
import { Splitter } from './components/Splitter';
import { NetworkPanel } from './panels/NetworkPanel';
import { InterceptPanel } from './panels/InterceptPanel';
import { ResponseInterceptPanel } from './panels/ResponseInterceptPanel';
import { RepeaterPanel } from './panels/RepeaterPanel';
import { HistoryPanel } from './panels/HistoryPanel';
import { ConsolePanel } from './panels/ConsolePanel';
import { ElementsPanel } from './panels/ElementsPanel';
import { SourcesPanel } from './panels/SourcesPanel';
import { ApplicationPanel } from './panels/ApplicationPanel';
import { SecurityPanel } from './panels/SecurityPanel';
import { DecoderPanel } from './panels/DecoderPanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { AuthSessionPanel } from './panels/AuthSessionPanel';
import { SqliScannerPanel } from './panels/SqliScannerPanel';

export const App: React.FC = () => {
  // Tabs State
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Selenium Chrome State
  const [seleniumStatus, setSeleniumStatus] = useState<SeleniumStatus>({
    running: false,
    launching: false,
    url: '',
    title: '',
    proxyPort: 8080,
    cdpPort: 9222,
    pid: null
  });
  const [chromeErrorModal, setChromeErrorModal] = useState<string | null>(null);

  // Layout State
  const [browserHeight, setBrowserHeight] = useState<number>(360);
  const [isBrowserVisible, setIsBrowserVisible] = useState<boolean>(true);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<string>('network');

  // Traffic & Proxy State
  const [flows, setFlows] = useState<NetworkFlow[]>([]);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [proxyStatus, setProxyStatus] = useState<ProxyStatus>({
    running: false,
    port: 8080,
    controlPort: 54321,
    connectedToAddon: false,
    interceptRequests: false,
    interceptResponses: false,
    strictScope: false,
    waitingRequestsCount: 0,
    waitingResponsesCount: 0
  });

  const browserContainerRef = useRef<HTMLDivElement>(null);

  // Sync WebContentsView Bounds with UI
  const syncBrowserBounds = () => {
    if (!window.netscope?.browser || !isBrowserVisible) return;
    if (browserContainerRef.current) {
      const rect = browserContainerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        window.netscope.browser.updateBounds({
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        });
      }
    }
  };

  useEffect(() => {
    syncBrowserBounds();
    const timer = setTimeout(syncBrowserBounds, 100);
    return () => clearTimeout(timer);
  }, [browserHeight, isBrowserVisible, activeTabId]);

  // Window resize & IPC event subscriptions
  useEffect(() => {
    if (!window.netscope) return;

    // Load initial tabs
    window.netscope.browser.getTabs().then((t: BrowserTab[]) => {
      setTabs(t || []);
      if (t && t.length > 0 && !activeTabId) {
        setActiveTabId(t[0].id);
      }
    });

    // Load initial proxy status
    window.netscope.proxy.getStatus().then((st: ProxyStatus) => {
      if (st) setProxyStatus(st);
    });

    // Load initial selenium status
    window.netscope?.selenium?.getStatus().then((st: SeleniumStatus) => {
      if (st) setSeleniumStatus(st);
    });

    const unsubSelenium = window.netscope?.selenium?.onStatusChanged((st: SeleniumStatus) => {
      setSeleniumStatus(st);
      if (st?.error) {
        setChromeErrorModal(st.error);
      }
    });

    const unsubSeleniumNav = window.netscope?.selenium?.onNavigated((data: { url: string; title: string }) => {
      setSeleniumStatus(prev => ({ ...prev, url: data.url, title: data.title }));
    });

    // Subscriptions
    const unsubTabs = window.netscope.browser.onTabsChanged((t: BrowserTab[]) => {
      setTabs(t || []);
    });

    const unsubTabUpdated = window.netscope.browser.onTabUpdated((updated: BrowserTab) => {
      setTabs(prev => prev.map(tab => tab.id === updated.id ? updated : tab));
    });

    const unsubActiveTab = window.netscope.browser.onActiveTabChanged((id: string) => {
      setActiveTabId(id);
    });

    const unsubProxyStatus = window.netscope.proxy.onStatusChanged((st: ProxyStatus) => {
      setProxyStatus(st);
    });

    const unsubFlowCompleted = window.netscope.proxy.onFlowCompleted((flow: NetworkFlow) => {
      setFlows(prev => [flow, ...prev].slice(0, 500));
    });

    const unsubConsole = window.netscope.cdp.onConsoleEntry((data: { tabId: string; entry: ConsoleEntry }) => {
      setConsoleEntries(prev => [...prev, data.entry].slice(-500));
    });

    const unsubResize = window.netscope.onWindowResize(() => {
      syncBrowserBounds();
    });

    window.addEventListener('resize', syncBrowserBounds);

    return () => {
      unsubTabs?.();
      unsubTabUpdated?.();
      unsubActiveTab?.();
      unsubProxyStatus?.();
      unsubSelenium?.();
      unsubSeleniumNav?.();
      unsubFlowCompleted?.();
      unsubConsole?.();
      unsubResize?.();
      window.removeEventListener('resize', syncBrowserBounds);
    };
  }, []);

  // Keyboard Shortcuts (Requirement 22)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        window.netscope?.browser.reload();
      } else if (e.key === 'F5') {
        e.preventDefault();
        window.netscope?.browser.reload();
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleCreateTab();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (activeTabId) handleCloseTab(activeTabId);
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        setIsBrowserVisible(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabId]);

  const activeTab = tabs.find(t => t.id === activeTabId) || null;

  // Browser & Selenium actions
  const handleNavigate = (url: string) => {
    window.netscope?.browser?.navigate(url);
    if (seleniumStatus.running) {
      window.netscope?.selenium?.navigate(url);
    }
  };
  const handleGoBack = () => {
    window.netscope?.browser?.goBack();
    if (seleniumStatus.running) {
      window.netscope?.selenium?.goBack();
    }
  };
  const handleGoForward = () => {
    window.netscope?.browser?.goForward();
    if (seleniumStatus.running) {
      window.netscope?.selenium?.goForward();
    }
  };
  const handleReload = () => {
    window.netscope?.browser?.reload();
    if (seleniumStatus.running) {
      window.netscope?.selenium?.reload();
    }
  };
  const handleStop = () => window.netscope?.browser?.stop();
  const handleCreateTab = () => window.netscope?.browser?.createTab('http://127.0.0.1:4000');
  const handleCloseTab = (id: string) => window.netscope?.browser?.closeTab(id);
  const handleSwitchTab = (id: string) => window.netscope?.browser?.switchTab(id);
  const handleClearSession = () => window.netscope?.browser?.clearBrowsingData();

  const handleLaunchChrome = async () => {
    setChromeErrorModal(null);
    try {
      if (!proxyStatus.running) {
        await handleToggleProxy();
      }
      await window.netscope?.selenium?.launch();
    } catch (err: any) {
      setChromeErrorModal(err?.message || 'Failed to launch Google Chrome via Selenium. Ensure Chrome is installed.');
    }
  };

  const handleQuitChrome = async () => {
    try {
      await window.netscope?.selenium?.quit();
    } catch (err) {
      console.error('Error quitting Chrome:', err);
    }
  };

  const handleToggleBrowserView = () => {
    const nextVal = !isBrowserVisible;
    setIsBrowserVisible(nextVal);
    window.netscope?.browser?.setVisible(nextVal);
  };

  const handleToggleProxy = async () => {
    if (proxyStatus.running) {
      await window.netscope?.proxy?.stop();
    } else {
      await window.netscope?.proxy?.start(proxyStatus.port || 8080);
    }
  };

  const handleToggleAllIntercept = (enabled: boolean) => {
    window.netscope?.proxy.setConfig({
      interceptRequests: enabled,
      interceptResponses: enabled
    });
  };

  const handleSendToRepeater = (item: any) => {
    if (window.netscope?.repeater) {
      window.netscope.repeater.saveTab({
        id: `rep-${Date.now()}`,
        title: `${item.method} ${item.path || item.url || ''}`.substring(0, 20),
        method: item.method || 'GET',
        url: item.url || '',
        headers: item.request_headers || item.headers || {},
        body: item.request_body || item.body || ''
      });
      setActiveWorkspaceTab('repeater');
    }
  };

  const workspaceTabs = [
    { id: 'network', label: 'Network', icon: Network, badge: flows.length > 0 ? flows.length : undefined },
    { id: 'intercept', label: 'Intercept', icon: ShieldAlert, badge: proxyStatus.waitingRequestsCount > 0 ? proxyStatus.waitingRequestsCount : undefined, badgeColor: 'bg-amber-500 text-black' },
    { id: 'responses', label: 'Responses', icon: FastForward, badge: proxyStatus.waitingResponsesCount > 0 ? proxyStatus.waitingResponsesCount : undefined },
    { id: 'repeater', label: 'Repeater', icon: Repeat },
    { id: 'history', label: 'HTTP History', icon: History },
    { id: 'sqli', label: 'SQLi Scanner', icon: ShieldAlert },
    { id: 'console', label: 'Console', icon: Terminal, badge: consoleEntries.filter(e => e.level === 'error').length || undefined, badgeColor: 'bg-red-500 text-white' },
    { id: 'elements', label: 'Elements', icon: Layers },
    { id: 'sources', label: 'Sources', icon: FileCode },
    { id: 'auth', label: 'Auth & Sessions', icon: KeyRound },
    { id: 'application', label: 'Application', icon: Database },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'decoder', label: 'Decoder', icon: Binary },
    { id: 'settings', label: 'Settings & Scope', icon: Settings }
  ];

  return (
    <div className="h-screen w-screen flex flex-col bg-[#121316] text-slate-100 overflow-hidden font-sans select-none">
      {/* 1. Top Navigation Bar */}
      <TopNav
        activeTab={activeTab}
        proxyStatus={proxyStatus}
        seleniumStatus={seleniumStatus}
        onNavigate={handleNavigate}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        onReload={handleReload}
        onStop={handleStop}
        onToggleProxy={handleToggleProxy}
        onToggleBrowserView={handleToggleBrowserView}
        isBrowserVisible={isBrowserVisible}
        onOpenSettings={() => setActiveWorkspaceTab('settings')}
        onSelectPanel={(panel) => setActiveWorkspaceTab(panel)}
        onLaunchChrome={handleLaunchChrome}
        onQuitChrome={handleQuitChrome}
        onToggleAllIntercept={handleToggleAllIntercept}
      />

      {/* 2. Browser Tabs Bar */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSwitchTab={handleSwitchTab}
        onCloseTab={handleCloseTab}
        onCreateTab={handleCreateTab}
        onClearSession={handleClearSession}
      />

      {/* Selenium Chrome Active Session Banner */}
      {seleniumStatus.running && (
        <div className="bg-[#121c17] border-b border-emerald-800/40 px-3 py-1.5 flex items-center justify-between text-xs select-none">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-semibold text-emerald-400">Selenium Chrome Session:</span>
            <span className="text-slate-300 font-mono text-[11px] max-w-md truncate">
              {seleniumStatus.title || 'Untitled'} – {seleniumStatus.url || 'about:blank'}
            </span>
            <span className="text-emerald-500/80 bg-emerald-950/60 px-1.5 py-0.5 rounded text-[10px] border border-emerald-800/50">
              Proxy 127.0.0.1:{proxyStatus.port}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleNavigate('https://www.embeds2.com/admin/login/')}
              className="text-[11px] text-blue-400 hover:text-blue-300 underline cursor-pointer"
            >
              Test embeds2.com
            </button>
            <button
              onClick={() => handleNavigate('http://127.0.0.1:4000')}
              className="text-[11px] text-blue-400 hover:text-blue-300 underline cursor-pointer"
            >
              Test Local Server
            </button>
            <button
              onClick={handleLaunchChrome}
              className="px-2 py-0.5 bg-[#1b2b22] hover:bg-[#23382c] border border-emerald-700/50 text-emerald-300 rounded text-[11px] cursor-pointer"
            >
              Restart Chrome
            </button>
            <button
              onClick={handleQuitChrome}
              className="px-2 py-0.5 bg-red-950/40 hover:bg-red-900/60 border border-red-800/40 text-red-300 rounded text-[11px] cursor-pointer"
            >
              Close Chrome
            </button>
          </div>
        </div>
      )}

      {/* 3. Embedded Browser View Region */}
      {isBrowserVisible && (
        <div
          ref={browserContainerRef}
          style={{ height: `${browserHeight}px` }}
          className="w-full bg-[#0d0e12] border-b border-[#232532] relative overflow-hidden flex items-center justify-center"
        >
          {/* Subtle background placeholder watermark behind WebContentsView */}
          <div className="text-slate-700 flex flex-col items-center gap-1 select-none pointer-events-none">
            <Radio className="w-8 h-8 opacity-20" />
            <span className="text-xs font-mono opacity-30">Chromium Embedded Browser Active</span>
          </div>
        </div>
      )}

      {/* 4. Resizable Splitter */}
      {isBrowserVisible && (
        <Splitter
          browserHeight={browserHeight}
          onResize={(newHeight) => {
            setBrowserHeight(newHeight);
            syncBrowserBounds();
          }}
        />
      )}

      {/* 5. Inspection Workspace Tabs Header */}
      <div className="h-9 bg-[#15161e] border-b border-[#252735] flex items-center px-2 gap-1 overflow-x-auto no-scrollbar select-none z-10 shrink-0">
        {workspaceTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeWorkspaceTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveWorkspaceTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-[#222430] text-blue-400 font-semibold border-b-2 border-blue-500'
                  : 'text-slate-400 hover:bg-[#1a1b24] hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${tab.badgeColor || 'bg-[#2b2d3c] text-slate-300'}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 6. Active Inspection Workspace Panel */}
      <div className="flex-1 overflow-hidden relative">
        {activeWorkspaceTab === 'network' && (
          <NetworkPanel
            flows={flows}
            onClear={() => setFlows([])}
            onSendToRepeater={handleSendToRepeater}
          />
        )}

        {activeWorkspaceTab === 'intercept' && (
          <InterceptPanel
            proxyStatus={proxyStatus}
            onToggleIntercept={(enabled) => window.netscope?.proxy.setConfig({ interceptRequests: enabled })}
            onToggleAllIntercept={handleToggleAllIntercept}
            onForwardRequest={(flowId, mods) => window.netscope?.proxy.actionRequest(flowId, 'forward', mods)}
            onDropRequest={(flowId) => window.netscope?.proxy.actionRequest(flowId, 'drop')}
            onForwardOriginal={(flowId) => window.netscope?.proxy.actionRequest(flowId, 'forward_original')}
            onSendToRepeater={handleSendToRepeater}
            onClearQueue={() => window.netscope?.proxy.clearQueues()}
          />
        )}

        {activeWorkspaceTab === 'responses' && (
          <ResponseInterceptPanel
            proxyStatus={proxyStatus}
            currentUrl={seleniumStatus.running ? seleniumStatus.url : (activeTab?.url || 'http://127.0.0.1:4000')}
            onToggleResponseIntercept={(enabled) => window.netscope?.proxy.setConfig({ interceptResponses: enabled })}
            onToggleAllIntercept={handleToggleAllIntercept}
            onForwardResponse={(flowId, mods) => window.netscope?.proxy.actionResponse(flowId, 'forward', mods)}
            onDropResponse={(flowId) => window.netscope?.proxy.actionResponse(flowId, 'drop')}
            onForwardOriginalResponse={(flowId) => window.netscope?.proxy.actionResponse(flowId, 'forward_original')}
          />
        )}

        {activeWorkspaceTab === 'repeater' && (
          <RepeaterPanel />
        )}

        {activeWorkspaceTab === 'history' && (
          <HistoryPanel onSendToRepeater={handleSendToRepeater} />
        )}

        {activeWorkspaceTab === 'sqli' && (
          <SqliScannerPanel
            flows={flows}
            currentUrl={seleniumStatus.running ? seleniumStatus.url : (activeTab?.url || 'http://127.0.0.1:4000')}
            isBrowserVisible={isBrowserVisible}
            onToggleBrowserView={() => setIsBrowserVisible(!isBrowserVisible)}
          />
        )}

        {activeWorkspaceTab === 'console' && (
          <ConsolePanel
            entries={consoleEntries}
            onClear={() => {
              setConsoleEntries([]);
              window.netscope?.cdp.clearConsole();
            }}
          />
        )}

        {activeWorkspaceTab === 'elements' && (
          <ElementsPanel />
        )}

        {activeWorkspaceTab === 'sources' && (
          <SourcesPanel />
        )}

        {activeWorkspaceTab === 'auth' && (
          <AuthSessionPanel />
        )}

        {activeWorkspaceTab === 'application' && (
          <ApplicationPanel currentUrl={activeTab?.url} />
        )}

        {activeWorkspaceTab === 'security' && (
          <SecurityPanel currentUrl={activeTab?.url} latestFlow={flows[0] || null} />
        )}

        {activeWorkspaceTab === 'decoder' && (
          <DecoderPanel />
        )}

        {activeWorkspaceTab === 'settings' && (
          <SettingsPanel
            proxyStatus={proxyStatus}
            onToggleProxy={handleToggleProxy}
          />
        )}
      </div>

      {/* Chrome Installation Error Modal */}
      {chromeErrorModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#181922] border border-red-800/50 rounded-lg max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#282a38] pb-3">
              <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                <ShieldAlert className="w-5 h-5 text-red-400" />
                <span>Google Chrome Launch Notice</span>
              </div>
              <button
                onClick={() => setChromeErrorModal(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="text-xs text-slate-300 space-y-2">
              <p>
                NetScope requires Google Chrome and Selenium to launch the real browser session for security testing.
              </p>
              <div className="bg-[#12131a] p-3 rounded border border-[#2b2d3c] font-mono text-[11px] text-red-300 break-all max-h-32 overflow-y-auto">
                {chromeErrorModal}
              </div>
              <div className="space-y-1.5 text-slate-400">
                <p className="font-semibold text-slate-200">How to resolve:</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Download and install Google Chrome from <a href="https://www.google.com/chrome/" target="_blank" rel="noreferrer" className="text-blue-400 underline">google.com/chrome</a>.</li>
                  <li>Ensure Chrome is installed at <code className="bg-[#0f1015] px-1 py-0.5 rounded text-slate-300">C:\Program Files\Google\Chrome\Application\chrome.exe</code>.</li>
                  <li>Click <strong>Launch Chrome</strong> again once installed.</li>
                </ol>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setChromeErrorModal(null)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
