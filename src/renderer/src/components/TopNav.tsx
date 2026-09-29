import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, ArrowRight, RotateCw, X, Shield, ShieldAlert, ShieldCheck, 
  Globe, Play, Square, Settings, Eye, EyeOff, Radio, Lock, Unlock, Sparkles, ExternalLink 
} from 'lucide-react';
import { BrowserTab, ProxyStatus, SeleniumStatus } from '../types';

interface TopNavProps {
  activeTab: BrowserTab | null;
  proxyStatus: ProxyStatus;
  seleniumStatus: SeleniumStatus;
  onNavigate: (url: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
  onStop: () => void;
  onToggleProxy: () => void;
  onToggleBrowserView: () => void;
  isBrowserVisible: boolean;
  onOpenSettings: () => void;
  onSelectPanel: (panel: string) => void;
  onLaunchChrome: () => void;
  onQuitChrome: () => void;
  onToggleAllIntercept?: (enabled: boolean) => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  proxyStatus,
  seleniumStatus,
  onNavigate,
  onGoBack,
  onGoForward,
  onReload,
  onStop,
  onToggleProxy,
  onToggleBrowserView,
  isBrowserVisible,
  onOpenSettings,
  onSelectPanel,
  onLaunchChrome,
  onQuitChrome,
  onToggleAllIntercept
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // Sync address bar with Chrome if active or embedded tab
  useEffect(() => {
    if (!isFocused) {
      if (seleniumStatus.running && seleniumStatus.url) {
        setUrlInput(seleniumStatus.url);
      } else if (activeTab?.url) {
        setUrlInput(activeTab.url);
      }
    }
  }, [seleniumStatus.running, seleniumStatus.url, activeTab?.url, isFocused]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const target = urlInput.trim();
    if (target) {
      setIsFocused(false);
      onNavigate(target);
    }
  };

  const currentDisplayUrl = urlInput || (seleniumStatus.running ? seleniumStatus.url : activeTab?.url) || '';
  const isHttps = currentDisplayUrl.toLowerCase().startsWith('https://');

  return (
    <div className="h-11 bg-[#16171d] border-b border-[#262832] flex items-center px-3 gap-2.5 z-30 select-none">
      {/* Brand */}
      <div className="flex items-center gap-2 mr-1">
        <div className="w-6 h-6 rounded bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-sm">
          <Shield className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="font-semibold text-xs tracking-wider text-slate-200">
          NET<span className="text-blue-400">SCOPE</span>
        </span>
      </div>

      {/* Navigation Controls */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={onGoBack}
          disabled={!activeTab?.canGoBack && !seleniumStatus.running}
          title="Back (Alt+Left)"
          className="p-1.5 rounded hover:bg-[#232530] text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onGoForward}
          disabled={!activeTab?.canGoForward && !seleniumStatus.running}
          title="Forward (Alt+Right)"
          className="p-1.5 rounded hover:bg-[#232530] text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={activeTab?.isLoading ? onStop : onReload}
          title={activeTab?.isLoading ? "Stop loading" : "Reload (Ctrl+R / F5)"}
          className="p-1.5 rounded hover:bg-[#232530] text-slate-300 transition-colors"
        >
          {activeTab?.isLoading ? (
            <X className="w-3.5 h-3.5 text-red-400" />
          ) : (
            <RotateCw className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Prominent Launch Chrome Button / Session Status */}
      <div className="flex items-center">
        {!seleniumStatus.running && !seleniumStatus.launching && (
          <button
            type="button"
            onClick={onLaunchChrome}
            title="Launch separate Google Chrome browser window via Selenium with proxy interception"
            className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-400 text-white rounded text-xs font-bold shadow-md shadow-blue-900/40 border border-blue-400/40 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 text-yellow-300 animate-pulse" />
            <span>Launch Chrome</span>
          </button>
        )}

        {seleniumStatus.launching && (
          <button
            type="button"
            disabled
            className="flex items-center gap-1.5 px-3 py-1 bg-blue-950/70 border border-blue-600/50 text-blue-300 rounded text-xs font-semibold whitespace-nowrap cursor-wait"
          >
            <RotateCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
            <span>Launching Chrome...</span>
          </button>
        )}

        {seleniumStatus.running && (
          <div className="flex items-center gap-1.5 bg-[#14231b] border border-emerald-600/60 text-emerald-300 px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span title={seleniumStatus.title || seleniumStatus.url || 'Chrome Browser'}>
              Chrome: {seleniumStatus.title ? (seleniumStatus.title.length > 16 ? seleniumStatus.title.substring(0, 16) + '...' : seleniumStatus.title) : 'Active'}
            </span>
            <button
              type="button"
              onClick={onLaunchChrome}
              title="Relaunch / focus Chrome"
              className="ml-1 p-0.5 rounded hover:bg-emerald-900/60 text-emerald-400"
            >
              <RotateCw className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={onQuitChrome}
              title="Close Chrome session"
              className="p-0.5 rounded hover:bg-red-950/80 hover:text-red-400 text-slate-400 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Address Bar */}
      <form onSubmit={handleSubmit} className="flex-1 flex items-center relative max-w-3xl">
        <div className="w-full flex items-center bg-[#1e2029] border border-[#2b2e3b] focus-within:border-blue-500/80 rounded-md px-2.5 py-1 text-xs transition-all shadow-inner">
          <div className="flex items-center gap-1.5 mr-2">
            {isHttps ? (
              <span className="flex items-center gap-1 text-emerald-400 font-mono text-[11px]" title="Encrypted Connection (HTTPS)">
                <Lock className="w-3 h-3" />
                https
              </span>
            ) : (
              <span className="flex items-center gap-1 text-slate-400 font-mono text-[11px]" title="Plain HTTP / Local">
                <Globe className="w-3 h-3 text-slate-500" />
                http
              </span>
            )}
            <span className="text-slate-600">|</span>
          </div>

          <input
            type="text"
            value={urlInput}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSubmit(e);
              }
            }}
            placeholder="Enter URL to test (e.g. https://www.embeds2.com/admin/login/)..."
            className="flex-1 bg-transparent text-slate-200 outline-none font-mono text-xs placeholder:text-slate-500"
          />

          <button
            type="button"
            onClick={() => handleSubmit()}
            className="ml-2 px-2.5 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
          >
            Go
          </button>
        </div>
      </form>

      {/* Proxy & Intercept Indicators */}
      <div className="flex items-center gap-2">
        {/* Proxy State */}
        <button
          onClick={onToggleProxy}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border font-medium transition-colors ${
            proxyStatus.running
              ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/50'
              : 'bg-red-950/30 border-red-800/40 text-red-400 hover:bg-red-900/40'
          }`}
          title={proxyStatus.running ? `Proxy Active on port ${proxyStatus.port}` : "Proxy Stopped"}
        >
          <Radio className={`w-3 h-3 ${proxyStatus.running ? 'text-emerald-400 animate-pulse' : 'text-red-400'}`} />
          <span>{proxyStatus.running ? `Proxy :${proxyStatus.port}` : 'Proxy OFF'}</span>
        </button>

        {/* Master Intercept Status Button - Single click sets ALL interception ON/OFF automatically */}
        {(() => {
          const isAllOn = proxyStatus.interceptRequests && proxyStatus.interceptResponses;
          const isAnyOn = proxyStatus.interceptRequests || proxyStatus.interceptResponses;
          const totalWaiting = (proxyStatus.waitingRequestsCount || 0) + (proxyStatus.waitingResponsesCount || 0);

          return (
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => {
                  if (onToggleAllIntercept) {
                    onToggleAllIntercept(!isAnyOn);
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs border font-bold transition-all cursor-pointer shadow-sm ${
                  isAllOn
                    ? 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black border-amber-300 shadow-amber-900/40 hover:scale-[1.02] active:scale-[0.98]'
                    : isAnyOn
                    ? 'bg-amber-950/80 hover:bg-amber-900 border-amber-500/80 text-amber-300'
                    : 'bg-[#1f212a] hover:bg-[#282a36] border-[#2d303d] text-slate-300'
                }`}
                title={
                  isAllOn
                    ? 'ALL Interception is ON (Requests + Responses). Click to turn ALL OFF.'
                    : isAnyOn
                    ? 'Partial Interception is active. Click to turn ALL ON.'
                    : 'All Interception is OFF. Click to turn ALL Interception ON automatically (Requests + Responses).'
                }
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isAllOn
                      ? 'bg-black animate-pulse'
                      : isAnyOn
                      ? 'bg-amber-400 animate-ping'
                      : 'bg-slate-500'
                  }`}
                />
                <span>
                  {isAllOn
                    ? 'Intercept: ALL ON'
                    : isAnyOn
                    ? `Intercept: ON (${proxyStatus.interceptRequests ? 'Req' : ''}${proxyStatus.interceptRequests && proxyStatus.interceptResponses ? '+' : ''}${proxyStatus.interceptResponses ? 'Res' : ''})`
                    : 'Intercept: ALL OFF'}
                </span>
                {totalWaiting > 0 && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      if ((proxyStatus.waitingRequestsCount || 0) > 0) {
                        onSelectPanel('intercept');
                      } else {
                        onSelectPanel('responses');
                      }
                    }}
                    className="bg-red-500 hover:bg-red-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ml-1 cursor-pointer transition-colors shadow-sm"
                    title={`${proxyStatus.waitingRequestsCount || 0} reqs, ${proxyStatus.waitingResponsesCount || 0} resps waiting. Click to open waiting panel.`}
                  >
                    {totalWaiting}
                  </span>
                )}
              </button>
            </div>
          );
        })()}

        {/* SQL Injection Scanner Button (sectionsqlinjustion) */}
        <button
          id="sectionsqlinjustion"
          onClick={() => onSelectPanel('sqli')}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border font-semibold bg-[#221720] hover:bg-[#2e1d2b] border-rose-800/60 hover:border-rose-500/80 text-rose-300 hover:text-rose-100 transition-all cursor-pointer shadow-sm active:scale-95"
          title="SQL Injection Scanner (sectionsqlinjustion) - Automated Security Audit"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
          <span className="hidden sm:inline">SQLi Scanner</span>
        </button>

        {/* Embedded Browser Toggle */}
        <button
          onClick={onToggleBrowserView}
          className={`p-1.5 rounded border text-xs transition-colors ${
            isBrowserVisible
              ? 'bg-blue-900/30 border-blue-700/50 text-blue-300'
              : 'bg-[#1e2029] border-[#2c2f3b] text-slate-400 hover:text-slate-200'
          }`}
          title={isBrowserVisible ? "Hide Embedded Browser Window" : "Show Embedded Browser Window"}
        >
          {isBrowserVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded hover:bg-[#232530] text-slate-400 hover:text-slate-200 transition-colors"
          title="NetScope Settings & Scope"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
