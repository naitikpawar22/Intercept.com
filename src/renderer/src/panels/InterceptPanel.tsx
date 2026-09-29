import React, { useState, useEffect, useMemo } from 'react';
import { 
  Play, Square, FastForward, Send, ShieldAlert, Check, X, Filter, Trash2, 
  ArrowRight, Search, Clock, ArrowUpRight, Code, Sparkles, RefreshCw 
} from 'lucide-react';
import { InterceptedRequest, ProxyStatus } from '../types';

export interface InterceptItem extends InterceptedRequest {
  status: 'waiting' | 'forwarded' | 'forwarded_original' | 'dropped';
  processedAt?: number;
}

interface InterceptPanelProps {
  proxyStatus: ProxyStatus;
  onToggleIntercept: (enabled: boolean) => void;
  onForwardRequest: (flowId: string, modifications?: any) => void;
  onDropRequest: (flowId: string) => void;
  onForwardOriginal: (flowId: string) => void;
  onSendToRepeater: (request: any) => void;
  onClearQueue: () => void;
  onToggleAllIntercept?: (enabled: boolean) => void;
}

export const InterceptPanel: React.FC<InterceptPanelProps> = ({
  proxyStatus,
  onToggleIntercept,
  onForwardRequest,
  onDropRequest,
  onForwardOriginal,
  onSendToRepeater,
  onClearQueue,
  onToggleAllIntercept
}) => {
  const [pendingRequests, setPendingRequests] = useState<InterceptedRequest[]>([]);
  const [historyList, setHistoryList] = useState<InterceptItem[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'waiting' | 'history'>('all');

  // Edit states for currently selected request
  const [editMethod, setEditMethod] = useState('GET');
  const [editUrl, setEditUrl] = useState('');
  const [editHeadersText, setEditHeadersText] = useState('');
  const [editBodyText, setEditBodyText] = useState('');
  const [activeTab, setActiveTab] = useState<'raw' | 'headers' | 'body'>('raw');

  // Rules modal
  const [showRules, setShowRules] = useState(false);
  const [ruleMethods, setRuleMethods] = useState<string[]>(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
  const [ignoreStatic, setIgnoreStatic] = useState(true);
  const [urlFilter, setUrlFilter] = useState('');

  // Fetch pending requests periodically
  const refreshPending = async () => {
    if (window.netscope?.proxy) {
      const list = await window.netscope.proxy.getPendingRequests();
      setPendingRequests(list || []);
    }
  };

  useEffect(() => {
    refreshPending();
    const interval = setInterval(refreshPending, 1000);

    const unsub = window.netscope?.proxy?.onInterceptedRequest?.((req: any) => {
      setPendingRequests(prev => {
        if (prev.some(r => r.flow_id === req.flow_id)) return prev;
        return [...prev, req];
      });
      // If nothing currently selected, select the incoming request
      setSelectedFlowId(curr => curr || req.flow_id);
    });

    return () => {
      clearInterval(interval);
      unsub?.();
    };
  }, []);

  // Merge pending + history into combined list
  const allItems: InterceptItem[] = useMemo(() => {
    const pendingItems: InterceptItem[] = pendingRequests.map(r => ({
      ...r,
      status: 'waiting'
    }));

    // Deduplicate against history
    const historyIds = new Set(historyList.map(h => h.flow_id));
    const combined = [...pendingItems.filter(p => !historyIds.has(p.flow_id)), ...historyList];

    return combined.sort((a, b) => (b.processedAt || b.timestamp) - (a.processedAt || a.timestamp));
  }, [pendingRequests, historyList]);

  // Filtered items for display
  const displayedItems = useMemo(() => {
    return allItems.filter(item => {
      if (filterTab === 'waiting' && item.status !== 'waiting') return false;
      if (filterTab === 'history' && item.status === 'waiting') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchUrl = item.url.toLowerCase().includes(q);
        const matchMethod = item.method.toLowerCase().includes(q);
        const matchBody = (item.body_text || '').toLowerCase().includes(q);
        if (!matchUrl && !matchMethod && !matchBody) return false;
      }
      return true;
    });
  }, [allItems, filterTab, searchQuery]);

  // Find currently selected item
  const selectedItem = useMemo(() => {
    return allItems.find(i => i.flow_id === selectedFlowId) || null;
  }, [allItems, selectedFlowId]);

  // Auto-select first waiting item if none selected
  useEffect(() => {
    if (!selectedFlowId && pendingRequests.length > 0) {
      setSelectedFlowId(pendingRequests[0].flow_id);
    }
  }, [pendingRequests, selectedFlowId]);

  // Populate editor fields when selectedItem changes
  useEffect(() => {
    if (selectedItem) {
      setEditMethod(selectedItem.method || 'GET');
      setEditUrl(selectedItem.url || '');
      setEditBodyText(selectedItem.body_text || '');
      const headerLines = Object.entries(selectedItem.headers || {})
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
      setEditHeadersText(headerLines);
    }
  }, [selectedItem?.flow_id]);

  const parseHeadersFromText = (text: string): Record<string, string> => {
    const headers: Record<string, string> = {};
    const lines = text.split('\n');
    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx > 0) {
        const key = line.substring(0, idx).trim();
        const val = line.substring(idx + 1).trim();
        headers[key] = val;
      }
    }
    return headers;
  };

  const handleForward = () => {
    if (!selectedItem) return;
    const headers = parseHeadersFromText(editHeadersText);

    if (editBodyText) {
      const len = new TextEncoder().encode(editBodyText).length;
      headers['Content-Length'] = String(len);
    }

    const mods = {
      method: editMethod,
      url: editUrl,
      headers,
      body_text: editBodyText
    };

    onForwardRequest(selectedItem.flow_id, mods);

    // Auto-focus and activate browser so the web application executes the forwarded request immediately
    try {
      window.netscope?.selenium?.focus?.();
      window.netscope?.browser?.focus?.();
    } catch (e) {}

    // Add to history list as forwarded
    setHistoryList(prev => [
      {
        ...selectedItem,
        method: editMethod,
        url: editUrl,
        headers,
        body_text: editBodyText,
        status: 'forwarded',
        processedAt: Date.now()
      },
      ...prev.filter(h => h.flow_id !== selectedItem.flow_id)
    ]);

    // Remove from pending
    setPendingRequests(prev => prev.filter(r => r.flow_id !== selectedItem.flow_id));

    // Select next waiting item if available
    const nextWaiting = pendingRequests.find(r => r.flow_id !== selectedItem.flow_id);
    if (nextWaiting) {
      setSelectedFlowId(nextWaiting.flow_id);
    }
    setTimeout(refreshPending, 100);
  };

  const handleDrop = () => {
    if (!selectedItem) return;
    onDropRequest(selectedItem.flow_id);

    setHistoryList(prev => [
      {
        ...selectedItem,
        status: 'dropped',
        processedAt: Date.now()
      },
      ...prev.filter(h => h.flow_id !== selectedItem.flow_id)
    ]);

    setPendingRequests(prev => prev.filter(r => r.flow_id !== selectedItem.flow_id));

    const nextWaiting = pendingRequests.find(r => r.flow_id !== selectedItem.flow_id);
    if (nextWaiting) {
      setSelectedFlowId(nextWaiting.flow_id);
    }
    setTimeout(refreshPending, 100);
  };

  const handleForwardOriginal = () => {
    if (!selectedItem) return;
    onForwardOriginal(selectedItem.flow_id);

    // Auto-focus and activate browser
    try {
      window.netscope?.selenium?.focus?.();
      window.netscope?.browser?.focus?.();
    } catch (e) {}

    setHistoryList(prev => [
      {
        ...selectedItem,
        status: 'forwarded_original',
        processedAt: Date.now()
      },
      ...prev.filter(h => h.flow_id !== selectedItem.flow_id)
    ]);

    setPendingRequests(prev => prev.filter(r => r.flow_id !== selectedItem.flow_id));

    const nextWaiting = pendingRequests.find(r => r.flow_id !== selectedItem.flow_id);
    if (nextWaiting) {
      setSelectedFlowId(nextWaiting.flow_id);
    }
    setTimeout(refreshPending, 100);
  };

  const handleSendToRepeater = () => {
    if (!selectedItem) return;
    onSendToRepeater({
      method: editMethod,
      url: editUrl,
      headers: parseHeadersFromText(editHeadersText),
      body: editBodyText
    });
  };

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(editBodyText);
      setEditBodyText(JSON.stringify(parsed, null, 2));
    } catch {
      // Not JSON or invalid
    }
  };

  const saveRules = async () => {
    if (window.netscope?.proxy) {
      await window.netscope.proxy.setConfig({
        interceptRules: {
          methods: ruleMethods,
          ignore_extensions: ignoreStatic
            ? ['css', 'js', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'woff', 'woff2', 'ico', 'ttf']
            : [],
          url_pattern: urlFilter
        }
      });
      setShowRules(false);
    }
  };

  const isInterceptOn = proxyStatus.interceptRequests;
  const waitingCount = pendingRequests.length;

  const getMethodColor = (m: string) => {
    switch (m.toUpperCase()) {
      case 'GET': return 'text-blue-400 bg-blue-950/60 border-blue-800/50';
      case 'POST': return 'text-emerald-400 bg-emerald-950/60 border-emerald-800/50';
      case 'PUT': return 'text-amber-400 bg-amber-950/60 border-amber-800/50';
      case 'DELETE': return 'text-red-400 bg-red-950/60 border-red-800/50';
      case 'PATCH': return 'text-purple-400 bg-purple-950/60 border-purple-800/50';
      default: return 'text-slate-400 bg-slate-800 border-slate-700';
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#121319] text-slate-200 select-none">
      {/* Top Toolbar */}
      <div className="h-10 bg-[#161720] border-b border-[#242634] flex items-center px-3 gap-2 text-xs shrink-0">
        {/* Master Intercept Toggle Button */}
        <button
          onClick={() => onToggleIntercept(!isInterceptOn)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded font-bold transition-all shadow-sm cursor-pointer whitespace-nowrap ${
            isInterceptOn
              ? 'bg-amber-500 hover:bg-amber-400 text-black border border-amber-300'
              : 'bg-[#22242f] hover:bg-[#2b2e3c] text-slate-300 border border-[#34384a]'
          }`}
        >
          <span className={`w-2.5 h-2.5 rounded-full ${isInterceptOn ? 'bg-black animate-pulse' : 'bg-slate-500'}`} />
          <span>{isInterceptOn ? 'Intercept Requests: ON' : 'Intercept Requests: OFF'}</span>
        </button>

        {onToggleAllIntercept && (
          <button
            onClick={() => onToggleAllIntercept(!(proxyStatus.interceptRequests && proxyStatus.interceptResponses))}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-all border cursor-pointer whitespace-nowrap ${
              proxyStatus.interceptRequests && proxyStatus.interceptResponses
                ? 'bg-amber-950/80 text-amber-200 border-amber-500/70 hover:bg-amber-900'
                : 'bg-[#1e2029] hover:bg-[#252834] text-slate-300 border-[#2f3242]'
            }`}
            title="Toggle ALL Interception ON/OFF (Requests + Responses together)"
          >
            <span>All Intercept: {proxyStatus.interceptRequests && proxyStatus.interceptResponses ? 'ALL ON' : 'OFF'}</span>
          </button>
        )}

        <div className="h-4 w-px bg-[#2b2e3d] mx-1" />

        {/* Filter Tabs */}
        <div className="flex items-center bg-[#1c1d27] p-0.5 rounded border border-[#2b2d3d]">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
              filterTab === 'all' ? 'bg-[#2b2e40] text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All ({allItems.length})
          </button>
          <button
            onClick={() => setFilterTab('waiting')}
            className={`px-2.5 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 transition-colors ${
              filterTab === 'waiting' ? 'bg-[#2b2e40] text-amber-300 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Waiting</span>
            {waitingCount > 0 && (
              <span className="bg-amber-500 text-black px-1 rounded-full text-[10px] font-bold">
                {waitingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setFilterTab('history')}
            className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
              filterTab === 'history' ? 'bg-[#2b2e40] text-emerald-300 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            History ({historyList.length})
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative flex items-center max-w-xs flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search intercepted requests..."
            className="w-full bg-[#1b1c26] border border-[#2b2d3d] rounded pl-8 pr-2.5 py-1 text-xs text-slate-200 outline-none focus:border-blue-500/70"
          />
        </div>

        <button
          onClick={() => setShowRules(true)}
          className="flex items-center gap-1 px-2.5 py-1 bg-[#1f202b] hover:bg-[#282a39] text-slate-300 border border-[#2e3142] rounded text-[11px] cursor-pointer"
        >
          <Filter className="w-3 h-3 text-slate-400" />
          <span>Rules</span>
        </button>

        <div className="flex-1" />

        {/* Clear Queue / Forward All */}
        {waitingCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="bg-amber-500/20 border border-amber-500/40 text-amber-300 px-2 py-0.5 rounded font-mono font-bold text-[11px] animate-pulse">
              {waitingCount} waiting
            </span>
            <button
              onClick={onClearQueue}
              className="flex items-center gap-1 px-2 py-1 bg-[#26211d] hover:bg-amber-950/80 border border-amber-700/50 text-amber-300 rounded text-[11px] cursor-pointer"
              title="Forward all waiting requests immediately"
            >
              <FastForward className="w-3 h-3" />
              <span>Forward All</span>
            </button>
          </div>
        )}

        {historyList.length > 0 && (
          <button
            onClick={() => setHistoryList([])}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-[#252735] rounded cursor-pointer"
            title="Clear processed history list"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Main Split Layout: Left List + Right Inspector Drawer */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Line-wise / List-wise Request Table */}
        <div className={`flex flex-col border-r border-[#222432] bg-[#14151e] overflow-hidden transition-all duration-150 ${
          selectedItem ? 'w-5/12 min-w-[340px]' : 'w-full'
        }`}>
          {/* Table Header */}
          <div className="h-7 bg-[#181924] border-b border-[#242635] flex items-center px-3 text-[11px] text-slate-400 font-semibold gap-2 shrink-0">
            <span className="w-16">Method</span>
            <span className="w-20">Status</span>
            <span className="flex-1 truncate">Request URL / Path</span>
            <span className="w-16 text-right">Time</span>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#1e202c]">
            {displayedItems.length > 0 ? (
              displayedItems.map((item) => {
                const isSelected = item.flow_id === selectedFlowId;
                const isWaiting = item.status === 'waiting';
                const timeStr = new Date(item.processedAt || item.timestamp).toLocaleTimeString();

                return (
                  <div
                    key={item.flow_id}
                    onClick={() => setSelectedFlowId(item.flow_id)}
                    className={`flex items-center px-3 py-2 text-xs gap-2 cursor-pointer transition-colors border-l-2 ${
                      isSelected
                        ? 'bg-[#1e2233] border-blue-500 text-white shadow-sm'
                        : isWaiting
                        ? 'bg-[#181a24] hover:bg-[#1f212f] border-amber-500/70 text-slate-200'
                        : 'hover:bg-[#1a1b24] border-transparent text-slate-400'
                    }`}
                  >
                    {/* Method Badge */}
                    <span className={`w-16 text-center font-mono font-bold text-[10px] px-1.5 py-0.5 rounded border ${getMethodColor(item.method)}`}>
                      {item.method}
                    </span>

                    {/* Status Badge */}
                    <div className="w-20 flex items-center">
                      {isWaiting ? (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-[10px] flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                          <span>Waiting</span>
                        </span>
                      ) : item.status === 'forwarded' ? (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-medium text-[10px] flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" />
                          <span>Sent</span>
                        </span>
                      ) : item.status === 'dropped' ? (
                        <span className="px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-300 font-medium text-[10px] flex items-center gap-1">
                          <X className="w-2.5 h-2.5" />
                          <span>Dropped</span>
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-blue-500/20 border border-blue-500/40 text-blue-300 font-medium text-[10px]">
                          Original
                        </span>
                      )}
                    </div>

                    {/* URL / Path */}
                    <div className="flex-1 min-w-0 flex flex-col">
                      <span className="font-mono text-xs truncate text-slate-200">
                        {item.path || item.url}
                      </span>
                      <span className="text-[10px] text-slate-500 truncate">
                        {item.domain}
                      </span>
                    </div>

                    {/* Time */}
                    <span className="w-16 text-right font-mono text-[10px] text-slate-500">
                      {timeStr}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-slate-500 space-y-1.5 p-6 text-center">
                <ShieldAlert className="w-8 h-8 opacity-30 text-amber-500 mb-1" />
                <span className="text-xs font-semibold text-slate-400">
                  {isInterceptOn ? "No requests in queue" : "Interception is OFF"}
                </span>
                <span className="text-[11px] text-slate-500 max-w-xs">
                  {isInterceptOn
                    ? "Generate traffic in the browser above or submit any form. Matching requests will appear here line by line."
                    : "Turn 'Intercept is ON' above to capture incoming requests."}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Half Section Request Inspection & Editor */}
        {selectedItem && (
          <div className="flex-1 flex flex-col bg-[#161720] overflow-hidden">
            {/* Detail Pane Header with Close Cross Button */}
            <div className="h-10 bg-[#1a1b26] border-b border-[#262837] flex items-center px-3 justify-between shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`font-mono font-bold text-xs px-2 py-0.5 rounded border ${getMethodColor(selectedItem.method)}`}>
                  {selectedItem.method}
                </span>
                <span className="font-mono text-xs font-semibold text-slate-200 truncate max-w-md" title={selectedItem.url}>
                  {selectedItem.url}
                </span>
                {selectedItem.status === 'waiting' ? (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-[10px]">
                    Waiting for Action
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded bg-[#252837] text-slate-400 text-[10px]">
                    Status: {selectedItem.status}
                  </span>
                )}
              </div>

              {/* Close Button (X) */}
              <button
                type="button"
                onClick={() => setSelectedFlowId(null)}
                title="Close Inspector Pane (view full list)"
                className="p-1.5 rounded hover:bg-[#2b2d3d] text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Actions Bar (Forward / Drop / Repeater) */}
            <div className="h-10 bg-[#181923] border-b border-[#252737] flex items-center px-3 gap-2 shrink-0">
              {selectedItem.status === 'waiting' ? (
                <>
                  <button
                    onClick={handleForward}
                    className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs transition-colors shadow-sm cursor-pointer"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>Forward</span>
                  </button>

                  <button
                    onClick={handleDrop}
                    className="flex items-center gap-1.5 px-3 py-1 bg-red-600/80 hover:bg-red-500 text-white font-medium rounded text-xs transition-colors cursor-pointer"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    <span>Drop</span>
                  </button>

                  <button
                    onClick={handleForwardOriginal}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-[#232534] hover:bg-[#2d3043] text-slate-300 border border-[#323649] rounded text-xs transition-colors cursor-pointer"
                  >
                    <FastForward className="w-3.5 h-3.5 text-blue-400" />
                    <span>Forward Original</span>
                  </button>
                </>
              ) : (
                <div className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Request has already been processed ({selectedItem.status}).</span>
                </div>
              )}

              <button
                onClick={handleSendToRepeater}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-[#232534] hover:bg-[#2d3043] text-slate-300 border border-[#323649] rounded text-xs transition-colors ml-auto cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 text-indigo-400" />
                <span>Send to Repeater</span>
              </button>
            </div>

            {/* Editable Method & URL Bar */}
            <div className="p-2.5 bg-[#171822] border-b border-[#252737] flex items-center gap-2 shrink-0">
              <select
                value={editMethod}
                onChange={(e) => setEditMethod(e.target.value)}
                disabled={selectedItem.status !== 'waiting'}
                className="bg-[#20222e] border border-[#2d3041] rounded px-2.5 py-1 font-mono font-bold text-xs text-blue-400 outline-none disabled:opacity-50"
              >
                {['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>

              <input
                type="text"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                disabled={selectedItem.status !== 'waiting'}
                className="flex-1 bg-[#1d1f2b] border border-[#2c2f40] rounded px-2.5 py-1 font-mono text-xs text-slate-200 outline-none focus:border-blue-500 disabled:opacity-50"
              />
            </div>

            {/* View Sub-Tabs */}
            <div className="h-8 bg-[#161721] border-b border-[#242636] flex items-center px-3 gap-3 text-xs shrink-0">
              <button
                onClick={() => setActiveTab('raw')}
                className={`h-full border-b-2 font-medium px-1 transition-colors cursor-pointer ${
                  activeTab === 'raw' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Headers & Body (Raw)
              </button>
              <button
                onClick={() => setActiveTab('headers')}
                className={`h-full border-b-2 font-medium px-1 transition-colors cursor-pointer ${
                  activeTab === 'headers' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Headers Only
              </button>
              <button
                onClick={() => setActiveTab('body')}
                className={`h-full border-b-2 font-medium px-1 transition-colors cursor-pointer ${
                  activeTab === 'body' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Body Payload
              </button>

              <div className="flex-1" />

              {/* Format JSON Helper */}
              {editBodyText && (
                <button
                  type="button"
                  onClick={handleFormatJson}
                  title="Format JSON payload nicely"
                  className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded hover:bg-[#202230] cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Beautify JSON</span>
                </button>
              )}
            </div>

            {/* Editable Content Areas */}
            <div className="flex-1 p-3 overflow-y-auto font-mono text-xs space-y-3 bg-[#13141c]">
              {(activeTab === 'raw' || activeTab === 'headers') && (
                <div className="flex flex-col">
                  <span className="text-slate-400 text-[11px] mb-1 font-sans font-semibold">
                    Request Headers (Key: Value):
                  </span>
                  <textarea
                    value={editHeadersText}
                    onChange={(e) => setEditHeadersText(e.target.value)}
                    disabled={selectedItem.status !== 'waiting'}
                    rows={activeTab === 'headers' ? 14 : 7}
                    className="w-full bg-[#171824] border border-[#27293b] rounded p-2.5 text-slate-200 font-mono text-xs outline-none focus:border-blue-500 resize-none disabled:opacity-70"
                  />
                </div>
              )}

              {(activeTab === 'raw' || activeTab === 'body') && (
                <div className="flex flex-col flex-1">
                  <span className="text-slate-400 text-[11px] mb-1 font-sans font-semibold">
                    Request Body Payload:
                  </span>
                  <textarea
                    value={editBodyText}
                    onChange={(e) => setEditBodyText(e.target.value)}
                    disabled={selectedItem.status !== 'waiting'}
                    placeholder="Enter or modify request payload..."
                    rows={activeTab === 'body' ? 14 : 8}
                    className="w-full bg-[#171824] border border-[#27293b] rounded p-2.5 text-slate-200 font-mono text-xs outline-none focus:border-blue-500 resize-none flex-1 disabled:opacity-70"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Rules Modal */}
      {showRules && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#181921] border border-[#2b2e3c] rounded-lg w-full max-w-md p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-100">Intercept Filter Rules</h3>
            
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">HTTP Methods to Intercept:</label>
                <div className="flex flex-wrap gap-2">
                  {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((m) => (
                    <label key={m} className="flex items-center gap-1.5 cursor-pointer bg-[#20222d] px-2 py-1 rounded border border-[#2c2f3d]">
                      <input
                        type="checkbox"
                        checked={ruleMethods.includes(m)}
                        onChange={(e) => {
                          if (e.target.checked) setRuleMethods([...ruleMethods, m]);
                          else setRuleMethods(ruleMethods.filter(x => x !== m));
                        }}
                      />
                      <span>{m}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer mt-2">
                  <input
                    type="checkbox"
                    checked={ignoreStatic}
                    onChange={(e) => setIgnoreStatic(e.target.checked)}
                  />
                  <span className="text-slate-300">Ignore static assets (images, css, fonts, js)</span>
                </label>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">URL Contains (optional filter):</label>
                <input
                  type="text"
                  value={urlFilter}
                  onChange={(e) => setUrlFilter(e.target.value)}
                  placeholder="e.g. /api or search"
                  className="w-full bg-[#1e202a] border border-[#2d303f] rounded px-2.5 py-1 text-xs text-slate-200 outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#252735]">
              <button
                onClick={() => setShowRules(false)}
                className="px-3 py-1 rounded bg-[#232532] text-slate-400 hover:text-slate-200 text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={saveRules}
                className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs cursor-pointer"
              >
                Save Rules
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
