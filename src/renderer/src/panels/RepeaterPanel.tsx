import React, { useState, useEffect } from 'react';
import { 
  Plus, X, Send, Copy, ArrowLeft, ArrowRight, Check, Loader2, Clock, Globe, Shield 
} from 'lucide-react';
import { RepeaterTab } from '../types';

interface RepeaterPanelProps {
  initialTabs?: RepeaterTab[];
}

export const RepeaterPanel: React.FC<RepeaterPanelProps> = ({ initialTabs }) => {
  const [tabs, setTabs] = useState<RepeaterTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedResponse, setCopiedResponse] = useState(false);

  // Active tab edit state
  const [activeMethod, setActiveMethod] = useState('GET');
  const [activeUrl, setActiveUrl] = useState('http://127.0.0.1:4000/api/get');
  const [activeHeaders, setActiveHeaders] = useState('User-Agent: NetScope/1.0\nAccept: application/json');
  const [activeBody, setActiveBody] = useState('');
  const [lastResponse, setLastResponse] = useState<any>(null);

  // Load tabs from SQLite or fallback default
  useEffect(() => {
    const loadTabs = async () => {
      if (window.netscope?.repeater) {
        const stored = await window.netscope.repeater.getTabs();
        if (stored && stored.length > 0) {
          setTabs(stored);
          setActiveTabId(stored[0].id);
          applyTab(stored[0]);
          return;
        }
      }

      // Default tab
      const defaultTab: RepeaterTab = {
        id: 'rep-1',
        title: 'Request 1',
        method: 'GET',
        url: 'http://127.0.0.1:4000/api/get',
        headers: { 'User-Agent': 'NetScope/1.0', 'Accept': 'application/json' },
        body: ''
      };
      setTabs([defaultTab]);
      setActiveTabId('rep-1');
      applyTab(defaultTab);
    };

    loadTabs();
  }, []);

  const applyTab = (tab: RepeaterTab) => {
    setActiveMethod(tab.method);
    setActiveUrl(tab.url);
    const headerStr = typeof tab.headers === 'object'
      ? Object.entries(tab.headers).map(([k, v]) => `${k}: ${v}`).join('\n')
      : String(tab.headers || '');
    setActiveHeaders(headerStr);
    setActiveBody(tab.body || '');
    setLastResponse(tab.last_response || null);
  };

  const handleSelectTab = (tabId: string) => {
    // Save current active tab first
    saveCurrentTab();
    const target = tabs.find(t => t.id === tabId);
    if (target) {
      setActiveTabId(tabId);
      applyTab(target);
    }
  };

  const handleCreateTab = () => {
    saveCurrentTab();
    const newId = `rep-${Date.now()}`;
    const newTab: RepeaterTab = {
      id: newId,
      title: `Request ${tabs.length + 1}`,
      method: 'GET',
      url: 'http://127.0.0.1:4000/api/get',
      headers: { 'User-Agent': 'NetScope/1.0', 'Accept': 'application/json' },
      body: ''
    };
    const updated = [...tabs, newTab];
    setTabs(updated);
    setActiveTabId(newId);
    applyTab(newTab);
    if (window.netscope?.repeater) {
      window.netscope.repeater.saveTab(newTab);
    }
  };

  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length <= 1) return;
    const remaining = tabs.filter(t => t.id !== tabId);
    setTabs(remaining);
    if (window.netscope?.repeater) {
      window.netscope.repeater.deleteTab(tabId);
    }
    if (activeTabId === tabId) {
      const next = remaining[remaining.length - 1];
      setActiveTabId(next.id);
      applyTab(next);
    }
  };

  const saveCurrentTab = () => {
    const headersObj = parseHeaders(activeHeaders);
    const updatedTab: RepeaterTab = {
      id: activeTabId,
      title: tabs.find(t => t.id === activeTabId)?.title || 'Request',
      method: activeMethod,
      url: activeUrl,
      headers: headersObj,
      body: activeBody,
      last_response: lastResponse
    };
    setTabs(tabs.map(t => t.id === activeTabId ? updatedTab : t));
    if (window.netscope?.repeater) {
      window.netscope.repeater.saveTab(updatedTab);
    }
  };

  const parseHeaders = (text: string): Record<string, string> => {
    const headers: Record<string, string> = {};
    for (const line of text.split('\n')) {
      const idx = line.indexOf(':');
      if (idx > 0) {
        headers[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
      }
    }
    return headers;
  };

  const handleSend = async () => {
    if (!activeUrl) return;
    setIsLoading(true);

    try {
      const headers = parseHeaders(activeHeaders);
      if (window.netscope?.repeater) {
        const res = await window.netscope.repeater.send({
          method: activeMethod,
          url: activeUrl,
          headers,
          body: activeBody
        });
        setLastResponse(res);

        // Update tab with last response
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) {
          tab.last_response = res;
          window.netscope.repeater.saveTab(tab);
        }
      }
    } catch (err: any) {
      setLastResponse({
        statusCode: 0,
        statusMessage: 'Error',
        headers: {},
        body: err.message,
        durationMs: 0,
        sizeBytes: 0,
        error: err.message
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatJson = (str: string) => {
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
      return str;
    }
  };

  const copyResponse = () => {
    if (lastResponse?.body) {
      navigator.clipboard.writeText(lastResponse.body);
      setCopiedResponse(true);
      setTimeout(() => setCopiedResponse(false), 1500);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#14151b] text-slate-200 select-none">
      {/* Repeater Tabs Bar */}
      <div className="h-8 bg-[#181922] border-b border-[#262835] flex items-center px-2 gap-1 text-xs">
        <div className="flex items-center gap-1 overflow-x-auto flex-1 no-scrollbar">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => handleSelectTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-1 rounded-t text-xs cursor-pointer border-t border-x transition-colors ${
                  isActive
                    ? 'bg-[#1c1d27] border-[#2c2f40] text-blue-300 font-semibold'
                    : 'bg-[#14151c] border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{tab.title}</span>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => handleCloseTab(tab.id, e)}
                    className="p-0.5 hover:bg-[#282a3a] rounded text-slate-500 hover:text-slate-200"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          <button
            onClick={handleCreateTab}
            title="Add new Repeater tab"
            className="p-1 hover:bg-[#232532] rounded text-slate-400 hover:text-slate-200 ml-1"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Target Address & Send Control Bar */}
      <div className="h-10 bg-[#161720] border-b border-[#242633] flex items-center px-3 gap-2 text-xs">
        <select
          value={activeMethod}
          onChange={(e) => setActiveMethod(e.target.value)}
          className="bg-[#20222d] border border-[#2d3040] rounded px-2.5 py-1 font-mono font-bold text-xs text-blue-400 outline-none"
        >
          {['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <input
          type="text"
          value={activeUrl}
          onChange={(e) => setActiveUrl(e.target.value)}
          placeholder="http://example.com/api"
          className="flex-1 bg-[#1c1d27] border border-[#2a2d3c] rounded px-2.5 py-1 font-mono text-xs text-slate-200 outline-none focus:border-blue-500"
        />

        <button
          onClick={handleSend}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-4 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded transition-colors shadow-sm"
        >
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          <span>Send</span>
        </button>
      </div>

      {/* Request and Response Split Panels */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Request Configuration */}
        <div className="w-1/2 border-r border-[#262835] flex flex-col p-3 space-y-3 overflow-auto bg-[#13141a]">
          <div className="flex items-center justify-between text-xs text-slate-400 font-sans font-medium">
            <span>Request Headers:</span>
            <span className="text-[11px] text-slate-500 font-mono">Key: Value per line</span>
          </div>
          <textarea
            value={activeHeaders}
            onChange={(e) => setActiveHeaders(e.target.value)}
            rows={6}
            className="w-full bg-[#181922] border border-[#292b3a] rounded p-2.5 text-slate-200 font-mono text-xs outline-none focus:border-blue-500 resize-none"
          />

          <div className="flex items-center justify-between text-xs text-slate-400 font-sans font-medium">
            <span>Request Body (JSON / Form / Raw):</span>
          </div>
          <textarea
            value={activeBody}
            onChange={(e) => setActiveBody(e.target.value)}
            placeholder="Optional request body payload..."
            className="flex-1 w-full bg-[#181922] border border-[#292b3a] rounded p-2.5 text-slate-200 font-mono text-xs outline-none focus:border-blue-500 resize-none min-h-[140px]"
          />
        </div>

        {/* Right: Response Output */}
        <div className="w-1/2 flex flex-col p-3 space-y-3 overflow-hidden bg-[#14151c]">
          <div className="flex items-center justify-between text-xs text-slate-400 font-sans font-medium">
            <div className="flex items-center gap-2">
              <span>Response:</span>
              {lastResponse && (
                <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                  lastResponse.statusCode >= 200 && lastResponse.statusCode < 300
                    ? 'badge-2xx'
                    : lastResponse.statusCode >= 300 && lastResponse.statusCode < 400
                    ? 'badge-3xx'
                    : 'badge-4xx'
                }`}>
                  {lastResponse.statusCode} {lastResponse.statusMessage}
                </span>
              )}
            </div>

            {lastResponse && (
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                  <Clock className="w-3 h-3 text-blue-400" />
                  {lastResponse.durationMs} ms
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {lastResponse.sizeBytes} B
                </span>
                <button
                  onClick={copyResponse}
                  className="flex items-center gap-1 text-[11px] text-blue-400 hover:underline"
                >
                  {copiedResponse ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedResponse ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            )}
          </div>

          {lastResponse ? (
            <div className="flex-1 flex flex-col space-y-2 overflow-hidden">
              {/* Response Headers Accordion/Snippet */}
              <div className="bg-[#181922] border border-[#272938] rounded p-2 max-h-32 overflow-auto text-xs font-mono">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-sans">Response Headers</div>
                {Object.entries(lastResponse.headers || {}).map(([k, v]) => (
                  <div key={k} className="flex">
                    <span className="text-emerald-400 w-44 shrink-0 truncate">{k}:</span>
                    <span className="text-slate-300 break-all">{String(v)}</span>
                  </div>
                ))}
              </div>

              {/* Response Body */}
              <textarea
                readOnly
                value={formatJson(lastResponse.body)}
                className="flex-1 w-full bg-[#181922] border border-[#272938] rounded p-2.5 text-slate-200 font-mono text-xs outline-none resize-none overflow-auto"
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs">
              <Globe className="w-8 h-8 opacity-25 mb-2" />
              <span>Click "Send" to execute and inspect the HTTP response.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
