import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowRight, Square, FastForward, ShieldAlert, Check, X, Search, Sparkles, Trash2,
  Zap, Settings, Sliders, History, AlertTriangle, Play, RefreshCw, Edit3, Save,
  RotateCcw, FileText, CheckCircle2, ShieldCheck, Globe, Clock, Layers, Copy,
  CheckCheck
} from 'lucide-react';
import { InterceptedResponse, ProxyStatus, AutoResponseRule, AutoModeConfig, ResponseModificationLog } from '../types';

export interface ResponseItem extends InterceptedResponse {
  status: 'waiting' | 'forwarded' | 'forwarded_original' | 'dropped' | 'auto_modified';
  processedAt?: number;
  original_status_code?: number;
  original_body_text?: string;
  original_headers?: Record<string, string>;
  applied_rule?: string;
}

interface ResponseInterceptPanelProps {
  proxyStatus: ProxyStatus;
  currentUrl?: string;
  onToggleResponseIntercept: (enabled: boolean) => void;
  onForwardResponse: (flowId: string, modifications?: any) => void;
  onDropResponse: (flowId: string) => void;
  onForwardOriginalResponse: (flowId: string) => void;
  onToggleAllIntercept?: (enabled: boolean) => void;
}

export const ResponseInterceptPanel: React.FC<ResponseInterceptPanelProps> = ({
  proxyStatus,
  currentUrl = 'http://127.0.0.1:4000',
  onToggleResponseIntercept,
  onForwardResponse,
  onDropResponse,
  onForwardOriginalResponse,
  onToggleAllIntercept
}) => {
  const [pendingResponses, setPendingResponses] = useState<InterceptedResponse[]>([]);
  const [historyList, setHistoryList] = useState<ResponseItem[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'waiting' | 'history'>('all');

  // Edit states for currently selected response
  const [isEditing, setIsEditing] = useState(false);
  const [editStatus, setEditStatus] = useState<number>(200);
  const [editHeadersText, setEditHeadersText] = useState('');
  const [editBodyText, setEditBodyText] = useState('');
  const [activeTab, setActiveTab] = useState<'editor' | 'original' | 'diff'>('editor');
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Auto Mode & Automatic Response Rules State
  const [autoMode, setAutoMode] = useState<AutoModeConfig>(() => {
    try {
      const saved = localStorage.getItem('netscope_auto_mode');
      return saved ? JSON.parse(saved) : { enabled: false, targetHost: '', matchStatus: 401, replaceStatus: 200 };
    } catch {
      return { enabled: false, targetHost: '', matchStatus: 401, replaceStatus: 200 };
    }
  });

  const [rules, setRules] = useState<AutoResponseRule[]>(() => {
    try {
      const saved = localStorage.getItem('netscope_auto_response_rules');
      return saved ? JSON.parse(saved) : [
        {
          id: 'rule-default-401-200',
          name: 'Authorized Test Environment: Mock 401 to 200',
          target_host: '127.0.0.1',
          method: 'ALL',
          match_status: 401,
          replace_status: 200,
          replace_body: '',
          enabled: false,
          created_at: Date.now()
        }
      ];
    } catch {
      return [];
    }
  });

  // Modals state
  const [showAutoModeModal, setShowAutoModeModal] = useState(false);
  const [autoModeInputHost, setAutoModeInputHost] = useState('');
  const [autoModeInputMatch, setAutoModeInputMatch] = useState(401);
  const [autoModeInputReplace, setAutoModeInputReplace] = useState(200);

  const [showRulesModal, setShowRulesModal] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleHost, setNewRuleHost] = useState('');
  const [newRuleMethod, setNewRuleMethod] = useState('ALL');
  const [newRuleMatchStatus, setNewRuleMatchStatus] = useState(401);
  const [newRuleReplaceStatus, setNewRuleReplaceStatus] = useState(200);
  const [newRuleBody, setNewRuleBody] = useState('');

  const [showLogsModal, setShowLogsModal] = useState(false);
  const [modLogs, setModLogs] = useState<ResponseModificationLog[]>([]);

  // Real-time Notification Banner
  const [notification, setNotification] = useState<{ message: string; timestamp: number; type: 'info' | 'success' | 'warn' } | null>(null);

  // Derive current hostname from currentUrl
  const derivedHost = useMemo(() => {
    try {
      const parsed = new URL(currentUrl);
      return parsed.hostname;
    } catch {
      return '127.0.0.1';
    }
  }, [currentUrl]);

  // Sync Auto Mode & Rules with proxy backend
  const syncRulesToBackend = (updatedRules: AutoResponseRule[], updatedAutoMode: AutoModeConfig) => {
    if (window.netscope?.proxy) {
      window.netscope.proxy.setConfig({
        autoResponseRules: updatedRules,
        autoMode: {
          enabled: updatedAutoMode.enabled,
          target_host: updatedAutoMode.targetHost,
          match_status: updatedAutoMode.matchStatus,
          replace_status: updatedAutoMode.replaceStatus
        }
      });
    }
  };

  useEffect(() => {
    localStorage.setItem('netscope_auto_mode', JSON.stringify(autoMode));
    localStorage.setItem('netscope_auto_response_rules', JSON.stringify(rules));
    syncRulesToBackend(rules, autoMode);
  }, [autoMode, rules]);

  // Load modification logs from SQLite
  const loadLogs = async () => {
    if (window.netscope?.history?.getModificationLogs) {
      try {
        const list = await window.netscope.history.getModificationLogs(100);
        setModLogs(list || []);
      } catch (e) {
        console.error('Failed to load modification logs:', e);
      }
    }
  };

  const handleClearLogs = async () => {
    if (window.netscope?.history?.clearModificationLogs) {
      try {
        await window.netscope.history.clearModificationLogs();
        setModLogs([]);
      } catch (e) {
        console.error('Failed to clear modification logs:', e);
      }
    }
  };

  const refreshPending = async () => {
    if (window.netscope?.proxy) {
      const list = await window.netscope.proxy.getPendingResponses();
      setPendingResponses(list || []);
    }
  };

  useEffect(() => {
    refreshPending();
    loadLogs();
    const interval = setInterval(refreshPending, 1000);

    const unsubIntercept = window.netscope?.proxy?.onInterceptedResponse?.((res: any) => {
      setPendingResponses(prev => {
        if (prev.some(r => r.flow_id === res.flow_id)) return prev;
        return [...prev, res];
      });
      setSelectedFlowId(curr => curr || res.flow_id);
    });

    const unsubAuto = window.netscope?.proxy?.onResponseAutoModified?.((data: any) => {
      setNotification({
        message: `⚡ Automatic Rule Applied: ${data.original_status} → ${data.modified_status} on ${data.path || data.url} (${data.rule_name || 'Auto Mode'})`,
        timestamp: Date.now(),
        type: 'success'
      });

      // Add to local history list as auto_modified
      setHistoryList(prev => [
        {
          flow_id: data.flow_id,
          url: data.url,
          method: data.method,
          domain: data.domain,
          path: data.path,
          status_code: data.modified_status,
          original_status_code: data.original_status,
          headers: {},
          body_text: `[Auto modified by rule: ${data.rule_name}]`,
          timestamp: data.timestamp,
          duration_ms: data.duration_ms,
          status: 'auto_modified',
          applied_rule: data.rule_name,
          processedAt: Date.now()
        },
        ...prev.filter(h => h.flow_id !== data.flow_id)
      ]);

      loadLogs();
    });

    return () => {
      clearInterval(interval);
      unsubIntercept?.();
      unsubAuto?.();
    };
  }, []);

  // Auto-dismiss notification after 5s
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Merge pending + history
  const allItems: ResponseItem[] = useMemo(() => {
    const pendingItems: ResponseItem[] = pendingResponses.map(r => ({
      ...r,
      original_status_code: r.status_code,
      original_headers: r.headers,
      original_body_text: r.body_text,
      status: 'waiting'
    }));

    const historyIds = new Set(historyList.map(h => h.flow_id));
    const combined = [...pendingItems.filter(p => !historyIds.has(p.flow_id)), ...historyList];

    return combined.sort((a, b) => (b.processedAt || b.timestamp) - (a.processedAt || a.timestamp));
  }, [pendingResponses, historyList]);

  // Filtered items
  const displayedItems = useMemo(() => {
    return allItems.filter(item => {
      if (filterTab === 'waiting' && item.status !== 'waiting') return false;
      if (filterTab === 'history' && item.status === 'waiting') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchBody = (item.body_text || '').toLowerCase().includes(q);
        const matchStatus = String(item.status_code).includes(q);
        const matchUrl = (item.url || '').toLowerCase().includes(q) || (item.path || '').toLowerCase().includes(q);
        if (!matchBody && !matchStatus && !matchUrl) return false;
      }
      return true;
    });
  }, [allItems, filterTab, searchQuery]);

  const selectedItem = useMemo(() => {
    return allItems.find(i => i.flow_id === selectedFlowId) || null;
  }, [allItems, selectedFlowId]);

  // Auto-select first waiting
  useEffect(() => {
    if (!selectedFlowId && pendingResponses.length > 0) {
      setSelectedFlowId(pendingResponses[0].flow_id);
    }
  }, [pendingResponses, selectedFlowId]);

  // Populate editor on item select
  useEffect(() => {
    if (selectedItem) {
      setEditStatus(selectedItem.status_code || 200);
      setEditBodyText(selectedItem.body_text || '');
      const headerLines = Object.entries(selectedItem.headers || {})
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
      setEditHeadersText(headerLines);
      setIsEditing(false);
    }
  }, [selectedItem?.flow_id]);

  const parseHeadersFromText = (text: string): Record<string, string> => {
    const headers: Record<string, string> = {};
    const lines = text.split('\n');
    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx > 0) {
        headers[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
      }
    }
    return headers;
  };

  const handleForward = () => {
    if (!selectedItem) return;
    const headers = parseHeadersFromText(editHeadersText);

    // Strip compression, chunking, and etags to ensure clean client reception
    Object.keys(headers).forEach(k => {
      const lk = k.toLowerCase();
      if (['content-encoding', 'transfer-encoding', 'etag', 'content-md5', 'content-length'].includes(lk)) {
        delete headers[k];
      }
    });

    if (editBodyText !== undefined) {
      const len = new TextEncoder().encode(editBodyText).length;
      headers['Content-Length'] = String(len);
    }

    onForwardResponse(selectedItem.flow_id, {
      status_code: editStatus,
      headers,
      body_text: editBodyText
    });

    // Auto-focus and activate browser session immediately
    try {
      window.netscope?.selenium?.focus?.();
      window.netscope?.browser?.focus?.();
    } catch (e) {}

    // Record manual modification log if changed
    if (selectedItem.status_code !== editStatus) {
      window.netscope?.history?.addModificationLog?.({
        flow_id: selectedItem.flow_id,
        url: selectedItem.url || selectedItem.path || 'unknown',
        method: selectedItem.method || 'GET',
        original_status: selectedItem.status_code,
        modified_status: editStatus,
        rule_name: 'Manual Admin Modification',
        timestamp: Date.now()
      });
      loadLogs();
    }

    setHistoryList(prev => [
      {
        ...selectedItem,
        status_code: editStatus,
        original_status_code: selectedItem.original_status_code || selectedItem.status_code,
        headers,
        body_text: editBodyText,
        status: 'forwarded',
        processedAt: Date.now()
      },
      ...prev.filter(h => h.flow_id !== selectedItem.flow_id)
    ]);

    setPendingResponses(prev => prev.filter(r => r.flow_id !== selectedItem.flow_id));

    const nextWaiting = pendingResponses.find(r => r.flow_id !== selectedItem.flow_id);
    if (nextWaiting) {
      setSelectedFlowId(nextWaiting.flow_id);
    }
    setTimeout(refreshPending, 100);
  };

  const handleDrop = () => {
    if (!selectedItem) return;
    onDropResponse(selectedItem.flow_id);

    setHistoryList(prev => [
      {
        ...selectedItem,
        status: 'dropped',
        processedAt: Date.now()
      },
      ...prev.filter(h => h.flow_id !== selectedItem.flow_id)
    ]);

    setPendingResponses(prev => prev.filter(r => r.flow_id !== selectedItem.flow_id));

    const nextWaiting = pendingResponses.find(r => r.flow_id !== selectedItem.flow_id);
    if (nextWaiting) {
      setSelectedFlowId(nextWaiting.flow_id);
    }
    setTimeout(refreshPending, 100);
  };

  const handleForwardOriginal = () => {
    if (!selectedItem) return;
    onForwardOriginalResponse(selectedItem.flow_id);

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

    setPendingResponses(prev => prev.filter(r => r.flow_id !== selectedItem.flow_id));

    const nextWaiting = pendingResponses.find(r => r.flow_id !== selectedItem.flow_id);
    if (nextWaiting) {
      setSelectedFlowId(nextWaiting.flow_id);
    }
    setTimeout(refreshPending, 100);
  };

  const handleDiscardChanges = () => {
    if (!selectedItem) return;
    setEditStatus(selectedItem.original_status_code || selectedItem.status_code || 200);
    setEditBodyText(selectedItem.original_body_text || selectedItem.body_text || '');
    const headerLines = Object.entries(selectedItem.original_headers || selectedItem.headers || {})
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    setEditHeadersText(headerLines);
    setIsEditing(false);
  };

  const handleSaveChanges = () => {
    setIsEditing(false);
    setNotification({
      message: `Saved modified response draft (${editStatus} OK). Click "Forward Modified Response" to deliver to browser.`,
      timestamp: Date.now(),
      type: 'info'
    });
  };

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(editBodyText);
      setEditBodyText(JSON.stringify(parsed, null, 2));
    } catch {
      // not json
    }
  };

  const handleMinifyJson = () => {
    try {
      const parsed = JSON.parse(editBodyText);
      setEditBodyText(JSON.stringify(parsed));
    } catch {
      // not json
    }
  };

  const handleSetStatusAndSyncBody = (newCode: number) => {
    setEditStatus(newCode);
    if (editBodyText) {
      let updated = editBodyText;
      // Auto-update "statusCode": 401 or any status code in body
      updated = updated.replace(/("statusCode"\s*:\s*)\d+/g, `$1${newCode}`);
      updated = updated.replace(/("status"\s*:\s*)\d+/g, `$1${newCode}`);
      updated = updated.replace(/("code"\s*:\s*)\d+/g, `$1${newCode}`);
      if (newCode === 200) {
        updated = updated.replace(/("statusCode"\s*:\s*)"401"/g, '$1200');
      }
      if (updated !== editBodyText) {
        setEditBodyText(updated);
        setNotification({
          message: `Updated status code to ${newCode} & auto-synced "statusCode": ${newCode} in JSON body.`,
          timestamp: Date.now(),
          type: 'success'
        });
      }
    }
  };

  const handleAutoConvertBody401to200 = () => {
    setEditStatus(200);
    if (!editBodyText) return;
    let updated = editBodyText;
    // Replace "statusCode": 401 or "statusCode":401 with "statusCode": 200
    updated = updated.replace(/("statusCode"\s*:\s*)401/g, '$1200');
    updated = updated.replace(/("statusCode"\s*:\s*)"401"/g, '$1200');
    updated = updated.replace(/("status"\s*:\s*)401/g, '$1200');
    updated = updated.replace(/("code"\s*:\s*)401/g, '$1200');
    updated = updated.replace(/("status"\s*:\s*)"unauthorized"/gi, '$1"authenticated"');
    updated = updated.replace(/("message"\s*:\s*)"Invalid credentials"/gi, '$1"Authorized successfully"');
    updated = updated.replace(/("message"\s*:\s*)"Unauthorized"/gi, '$1"Authorized successfully"');
    setEditBodyText(updated);
    setNotification({
      message: 'Replaced "statusCode": 401 with "statusCode": 200 in response body.',
      timestamp: Date.now(),
      type: 'success'
    });
  };

  const handleSetAuthSuccessBody = () => {
    setEditStatus(200);
    try {
      const parsed = JSON.parse(editBodyText);
      parsed.statusCode = 200;
      parsed.status = 'authenticated';
      parsed.message = 'Authorized successfully';
      parsed.authenticated = true;
      if (!parsed.token && !parsed.access_token) {
        parsed.access_token = 'authorized_admin_token_' + Date.now();
      }
      setEditBodyText(JSON.stringify(parsed, null, 2));
    } catch {
      setEditBodyText(JSON.stringify({
        statusCode: 200,
        message: 'Authorized successfully',
        authenticated: true,
        access_token: 'authorized_admin_token_' + Date.now()
      }, null, 2));
    }
    setNotification({
      message: 'Populated body with complete 200 OK authenticated response payload.',
      timestamp: Date.now(),
      type: 'success'
    });
  };

  // Auto Mode toggle handler
  const handleToggleAutoModeClick = () => {
    if (autoMode.enabled) {
      // Turn OFF immediately
      setAutoMode(prev => ({ ...prev, enabled: false }));
      setNotification({
        message: 'Auto Mode deactivated. Responses will not be modified automatically.',
        timestamp: Date.now(),
        type: 'info'
      });
    } else {
      // Open confirmation dialog with suggested target host
      setAutoModeInputHost(autoMode.targetHost || derivedHost || '127.0.0.1');
      setAutoModeInputMatch(autoMode.matchStatus || 401);
      setAutoModeInputReplace(autoMode.replaceStatus || 200);
      setShowAutoModeModal(true);
    }
  };

  const handleConfirmAutoMode = () => {
    const updated = {
      enabled: true,
      targetHost: autoModeInputHost.trim() || '*',
      matchStatus: Number(autoModeInputMatch) || 401,
      replaceStatus: Number(autoModeInputReplace) || 200
    };
    setAutoMode(updated);
    setShowAutoModeModal(false);
    setNotification({
      message: `⚡ Auto Mode Enabled: All ${updated.matchStatus} responses for ${updated.targetHost} will be automatically transformed to ${updated.replaceStatus}.`,
      timestamp: Date.now(),
      type: 'success'
    });
  };

  // Rule management handlers
  const handleToggleRule = (ruleId: string) => {
    setRules(prev => prev.map(r => r.id === ruleId ? { ...r, enabled: !r.enabled } : r));
  };

  const handleDeleteRule = (ruleId: string) => {
    setRules(prev => prev.filter(r => r.id !== ruleId));
  };

  const handleAddRule = () => {
    if (!newRuleName.trim()) return;
    const rule: AutoResponseRule = {
      id: `rule-${Date.now()}`,
      name: newRuleName.trim(),
      target_host: newRuleHost.trim() || '*',
      method: newRuleMethod,
      match_status: Number(newRuleMatchStatus) || 401,
      replace_status: Number(newRuleReplaceStatus) || 200,
      replace_body: newRuleBody.trim(),
      enabled: true,
      created_at: Date.now()
    };
    setRules(prev => [rule, ...prev]);
    setNewRuleName('');
    setNewRuleHost('');
    setNewRuleBody('');
  };

  const handleQuickAdd401Rule = () => {
    const host = derivedHost || '127.0.0.1';
    const rule: AutoResponseRule = {
      id: `rule-${Date.now()}`,
      name: `Mock 401 to 200 for ${host}`,
      target_host: host,
      method: 'ALL',
      match_status: 401,
      replace_status: 200,
      replace_body: '{"statusCode": 200, "message": "Success", "authenticated": true}',
      enabled: true,
      created_at: Date.now()
    };
    setRules(prev => [rule, ...prev]);
    setNotification({
      message: `Added rule: Mock 401 to 200 for ${host}`,
      timestamp: Date.now(),
      type: 'success'
    });
  };

  const isInterceptOn = proxyStatus.interceptResponses;
  const waitingCount = pendingResponses.length;
  const activeRulesCount = rules.filter(r => r.enabled).length;

  const getStatusColor = (code: number) => {
    if (code >= 200 && code < 300) return 'text-emerald-400 bg-emerald-950/60 border-emerald-800/50';
    if (code >= 300 && code < 400) return 'text-blue-400 bg-blue-950/60 border-blue-800/50';
    if (code >= 400 && code < 500) return 'text-amber-400 bg-amber-950/60 border-amber-800/50';
    return 'text-red-400 bg-red-950/60 border-red-800/50';
  };

  return (
    <div className="h-full flex flex-col bg-[#121319] text-slate-200 select-none relative">
      {/* Top Notification Toast Banner */}
      {notification && (
        <div className={`h-8 px-4 flex items-center justify-between text-xs font-semibold shrink-0 transition-all ${
          notification.type === 'success'
            ? 'bg-emerald-900/90 text-emerald-200 border-b border-emerald-600/60'
            : notification.type === 'warn'
            ? 'bg-amber-900/90 text-amber-200 border-b border-amber-600/60'
            : 'bg-blue-900/90 text-blue-200 border-b border-blue-600/60'
        }`}>
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 animate-pulse" />
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="p-0.5 hover:bg-black/30 rounded">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Toolbar */}
      <div className="h-10 bg-[#161720] border-b border-[#242634] flex items-center px-3 gap-2 text-xs shrink-0 overflow-x-auto">
        {/* Intercept Responses Toggle */}
        <button
          onClick={() => onToggleResponseIntercept(!isInterceptOn)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded font-bold transition-all shadow-sm cursor-pointer whitespace-nowrap ${
            isInterceptOn
              ? 'bg-amber-500 hover:bg-amber-400 text-black border border-amber-300'
              : 'bg-[#22242f] hover:bg-[#2b2e3c] text-slate-300 border border-[#34384a]'
          }`}
        >
          <span className={`w-2.5 h-2.5 rounded-full ${isInterceptOn ? 'bg-black animate-pulse' : 'bg-slate-500'}`} />
          <span>{isInterceptOn ? 'Intercept Responses: ON' : 'Intercept Responses: OFF'}</span>
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

        {/* Global Auto Mode Button */}
        <button
          onClick={handleToggleAutoModeClick}
          className={`flex items-center gap-1.5 px-3 py-1 rounded font-bold transition-all border cursor-pointer whitespace-nowrap shadow-sm ${
            autoMode.enabled
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-400 shadow-emerald-950/40 hover:scale-[1.02]'
              : 'bg-[#1e202b] hover:bg-[#272a39] text-slate-300 border-[#2f3346]'
          }`}
          title="Toggle Global Auto Mode (automatically transform 401 to 200 in authorized environment)"
        >
          <Zap className={`w-3.5 h-3.5 ${autoMode.enabled ? 'text-yellow-300 animate-pulse' : 'text-slate-400'}`} />
          <span>
            {autoMode.enabled
              ? `Auto Mode: ON (${autoMode.matchStatus}→${autoMode.replaceStatus})`
              : 'Auto Mode: OFF'}
          </span>
          {autoMode.enabled && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          )}
        </button>

        {/* Automatic Response Rules Modal Button */}
        <button
          onClick={() => setShowRulesModal(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1e202b] hover:bg-[#262837] text-slate-300 border border-[#2d3040] rounded font-medium transition-colors cursor-pointer whitespace-nowrap"
          title="Configure Automatic Response Modification Rules"
        >
          <Sliders className="w-3.5 h-3.5 text-blue-400" />
          <span>Auto Rules</span>
          {activeRulesCount > 0 && (
            <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
              {activeRulesCount}
            </span>
          )}
        </button>

        {/* Modification Logs Modal Button */}
        <button
          onClick={() => {
            loadLogs();
            setShowLogsModal(true);
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1e202b] hover:bg-[#262837] text-slate-300 border border-[#2d3040] rounded font-medium transition-colors cursor-pointer whitespace-nowrap"
          title="View Response Modification History"
        >
          <History className="w-3.5 h-3.5 text-purple-400" />
          <span>Logs</span>
          {modLogs.length > 0 && (
            <span className="bg-purple-900 text-purple-300 border border-purple-700 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
              {modLogs.length}
            </span>
          )}
        </button>

        <div className="h-4 w-px bg-[#2b2e3d] mx-1" />

        {/* Filter Tabs */}
        <div className="flex items-center bg-[#1c1d27] p-0.5 rounded border border-[#2b2d3d] shrink-0">
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

        {/* Search */}
        <div className="relative flex items-center min-w-[160px] max-w-xs flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search URL, status, body..."
            className="w-full bg-[#1b1c26] border border-[#2b2d3d] rounded pl-8 pr-2.5 py-1 text-xs text-slate-200 outline-none focus:border-blue-500/70"
          />
        </div>

        {historyList.length > 0 && (
          <button
            onClick={() => setHistoryList([])}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-[#252735] rounded cursor-pointer shrink-0"
            title="Clear processed history list"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Main Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left List of Responses */}
        <div className={`flex flex-col border-r border-[#222432] bg-[#14151e] overflow-hidden transition-all duration-150 ${
          selectedItem ? 'w-5/12 min-w-[360px]' : 'w-full'
        }`}>
          {/* Table Header */}
          <div className="h-7 bg-[#181924] border-b border-[#242635] flex items-center px-3 text-[11px] text-slate-400 font-semibold gap-2 shrink-0">
            <span className="w-16">Status</span>
            <span className="w-20">State</span>
            <span className="flex-1 truncate">Request / Content Type</span>
            <span className="w-16 text-right">Time</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#1e202c]">
            {displayedItems.length > 0 ? (
              displayedItems.map((item) => {
                const isSelected = item.flow_id === selectedFlowId;
                const isWaiting = item.status === 'waiting';
                const isAuto = item.status === 'auto_modified';
                const timeStr = new Date(item.processedAt || item.timestamp).toLocaleTimeString();

                return (
                  <div
                    key={item.flow_id}
                    onClick={() => setSelectedFlowId(item.flow_id)}
                    className={`flex items-center px-3 py-2 text-xs gap-2 cursor-pointer transition-colors border-l-2 ${
                      isSelected
                        ? 'bg-[#1e2233] border-blue-500 text-white'
                        : isWaiting
                        ? 'bg-[#181a24] hover:bg-[#1f212f] border-amber-500/70 text-slate-200'
                        : isAuto
                        ? 'bg-[#14231b] hover:bg-[#192f23] border-teal-500/70 text-teal-200'
                        : 'hover:bg-[#1a1b24] border-transparent text-slate-400'
                    }`}
                  >
                    <span className={`w-16 text-center font-mono font-bold text-[10px] px-1.5 py-0.5 rounded border ${getStatusColor(item.status_code)}`}>
                      {item.status_code}
                    </span>

                    <div className="w-20 flex items-center">
                      {isWaiting ? (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-[10px] flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                          <span>Waiting</span>
                        </span>
                      ) : isAuto ? (
                        <span className="px-1.5 py-0.5 rounded bg-teal-500/20 border border-teal-500/40 text-teal-300 font-bold text-[10px] flex items-center gap-1">
                          <Zap className="w-2.5 h-2.5 text-yellow-300" />
                          <span>Auto 200</span>
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-medium text-[10px] flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" />
                          <span>Sent</span>
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex items-center gap-1 truncate font-mono text-xs">
                        {item.method && (
                          <span className="text-[10px] font-bold px-1 rounded bg-[#252837] text-slate-300">
                            {item.method}
                          </span>
                        )}
                        <span className="truncate text-slate-200" title={item.url || item.path}>
                          {item.path || item.url || item.domain || 'HTTP Response'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500">
                        <span>{item.content_type || 'application/json'}</span>
                        {item.duration_ms !== undefined && (
                          <span>• {item.duration_ms}ms</span>
                        )}
                        {item.original_status_code && item.original_status_code !== item.status_code && (
                          <span className="text-amber-400 font-semibold">• Orig: {item.original_status_code}</span>
                        )}
                      </div>
                    </div>

                    <span className="w-16 text-right font-mono text-[10px] text-slate-500 shrink-0">
                      {timeStr}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-slate-500 space-y-1.5 p-6 text-center">
                <ShieldAlert className="w-8 h-8 opacity-30 text-amber-500 mb-1" />
                <span className="text-xs font-semibold text-slate-400">
                  {isInterceptOn ? "No responses waiting" : "Response Interception is OFF"}
                </span>
                <span className="text-[11px] text-slate-500 max-w-xs">
                  {isInterceptOn
                    ? "Server responses will pause here for inspection and modification before reaching the browser."
                    : "Toggle 'Intercept Responses: ON' or use 'Auto Mode' to process responses."}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Half: Response Inspection & Editor */}
        {selectedItem && (
          <div className="flex-1 flex flex-col bg-[#161720] overflow-hidden">
            {/* Header with Details & Close Button */}
            <div className="h-11 bg-[#1a1b26] border-b border-[#262837] flex items-center px-3 justify-between shrink-0">
              <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
                <span className={`font-mono font-bold text-xs px-2 py-0.5 rounded border shrink-0 ${getStatusColor(selectedItem.status_code)}`}>
                  {selectedItem.status_code} {selectedItem.status_message || ''}
                </span>

                {selectedItem.original_status_code && selectedItem.original_status_code !== selectedItem.status_code && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-amber-950/80 border border-amber-600/70 text-amber-300 font-bold shrink-0">
                    Orig: {selectedItem.original_status_code} → Mod: {selectedItem.status_code}
                  </span>
                )}

                <span className="font-mono text-xs text-slate-300 truncate" title={selectedItem.url || selectedItem.path}>
                  <span className="font-bold text-blue-400 mr-1">{selectedItem.method || 'GET'}</span>
                  {selectedItem.url || selectedItem.path || 'HTTP Response'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {selectedItem.duration_ms !== undefined && (
                  <span className="text-[11px] text-slate-400 flex items-center gap-1 bg-[#232535] px-2 py-0.5 rounded font-mono">
                    <Clock className="w-3 h-3 text-slate-500" />
                    {selectedItem.duration_ms}ms
                  </span>
                )}

                {(selectedItem.content_type || selectedItem.headers?.['content-type'] || selectedItem.headers?.['Content-Type']) && (
                  <span className="text-[11px] text-teal-400 bg-teal-950/70 border border-teal-800/60 px-2 py-0.5 rounded font-mono truncate max-w-[200px]" title={`Content-Type: ${selectedItem.content_type || selectedItem.headers?.['content-type'] || selectedItem.headers?.['Content-Type']}`}>
                    {selectedItem.content_type || selectedItem.headers?.['content-type'] || selectedItem.headers?.['Content-Type']}
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedFlowId(null)}
                  title="Close Inspector Pane"
                  className="p-1.5 rounded hover:bg-[#2b2d3d] text-slate-400 hover:text-white transition-colors cursor-pointer ml-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Action Bar */}
            <div className="h-10 bg-[#181923] border-b border-[#252737] flex items-center px-3 gap-2 shrink-0">
              {selectedItem.status === 'waiting' ? (
                <>
                  <button
                    onClick={handleForward}
                    className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs transition-colors shadow-sm cursor-pointer"
                    title="Forward the modified response to the browser session"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>Forward Modified Response</span>
                  </button>

                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors border cursor-pointer ${
                      isEditing
                        ? 'bg-blue-600 text-white border-blue-400'
                        : 'bg-[#232534] hover:bg-[#2d3043] text-slate-300 border-[#323649]'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5 text-blue-400" />
                    <span>{isEditing ? 'Editing Active' : 'Edit Response'}</span>
                  </button>

                  <button
                    onClick={handleSaveChanges}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-[#232534] hover:bg-[#2d3043] text-slate-300 border border-[#323649] rounded text-xs font-semibold transition-colors cursor-pointer"
                    title="Save current modified draft"
                  >
                    <Save className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Save Changes</span>
                  </button>

                  <button
                    onClick={handleDiscardChanges}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-[#232534] hover:bg-[#2d3043] text-slate-400 hover:text-slate-200 border border-[#323649] rounded text-xs transition-colors cursor-pointer"
                    title="Discard edits and restore original server response"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Discard Changes</span>
                  </button>

                  <button
                    onClick={handleForwardOriginal}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-[#232534] hover:bg-[#2d3043] text-slate-400 hover:text-slate-200 border border-[#323649] rounded text-xs transition-colors cursor-pointer"
                    title="Forward original unmodified response"
                  >
                    <FastForward className="w-3.5 h-3.5 text-slate-400" />
                    <span>Forward Original</span>
                  </button>

                  <button
                    onClick={handleDrop}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-red-950/70 hover:bg-red-900 border border-red-800/60 text-red-300 rounded text-xs transition-colors cursor-pointer ml-auto"
                    title="Drop response and kill flow"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    <span>Drop</span>
                  </button>
                </>
              ) : (
                <div className="text-xs text-slate-400 flex items-center justify-between w-full">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Response delivered to browser session ({selectedItem.status}).</span>
                  </div>
                  {selectedItem.applied_rule && (
                    <span className="text-[11px] text-teal-300 bg-teal-950/60 px-2 py-0.5 rounded border border-teal-800">
                      Rule: {selectedItem.applied_rule}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Status Code Editor Bar */}
            <div className="p-2.5 bg-[#171822] border-b border-[#252737] flex items-center gap-3 shrink-0 flex-wrap">
              <span className="text-xs text-slate-300 font-semibold flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5 text-blue-400" />
                <span>Status Code:</span>
              </span>

              <input
                type="number"
                value={editStatus}
                onChange={(e) => handleSetStatusAndSyncBody(parseInt(e.target.value) || 200)}
                disabled={selectedItem.status !== 'waiting'}
                className="w-24 bg-[#1d1f2b] border border-[#2c2f40] rounded px-2.5 py-1 font-mono font-bold text-xs text-blue-400 outline-none focus:border-blue-500"
              />

              {/* Quick Status Presets */}
              {selectedItem.status === 'waiting' && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleSetStatusAndSyncBody(200)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-colors cursor-pointer ${
                      editStatus === 200
                        ? 'bg-emerald-600 text-white border-emerald-400'
                        : 'bg-[#222533] hover:bg-[#2b2e40] text-emerald-300 border-emerald-800/60'
                    }`}
                  >
                    200 OK
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetStatusAndSyncBody(401)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-colors cursor-pointer ${
                      editStatus === 401
                        ? 'bg-amber-600 text-white border-amber-400'
                        : 'bg-[#222533] hover:bg-[#2b2e40] text-amber-300 border-amber-800/60'
                    }`}
                  >
                    401 Unauthorized
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetStatusAndSyncBody(403)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-colors cursor-pointer ${
                      editStatus === 403
                        ? 'bg-purple-600 text-white border-purple-400'
                        : 'bg-[#222533] hover:bg-[#2b2e40] text-purple-300 border-purple-800/60'
                    }`}
                  >
                    403 Forbidden
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetStatusAndSyncBody(500)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-colors cursor-pointer ${
                      editStatus === 500
                        ? 'bg-red-600 text-white border-red-400'
                        : 'bg-[#222533] hover:bg-[#2b2e40] text-red-300 border-red-800/60'
                    }`}
                  >
                    500 Error
                  </button>

                  <button
                    type="button"
                    onClick={handleAutoConvertBody401to200}
                    className="px-2.5 py-0.5 bg-emerald-950/90 hover:bg-emerald-900 border border-emerald-500/70 text-emerald-300 rounded text-[11px] font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1 ml-2"
                    title="Change 'statusCode': 401 to 'statusCode': 200 in the response body"
                  >
                    <Zap className="w-3 h-3 text-yellow-300" />
                    <span>Sync Body statusCode: 200</span>
                  </button>
                </div>
              )}
            </div>

            {/* Sub-Tabs: Modified / Original / Diff */}
            <div className="h-8 bg-[#161721] border-b border-[#242636] flex items-center px-3 gap-3 text-xs shrink-0">
              <button
                onClick={() => setActiveTab('editor')}
                className={`h-full border-b-2 font-medium px-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'editor' ? 'border-blue-500 text-blue-400 font-bold' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Edit3 className="w-3 h-3" />
                <span>Modified Response</span>
              </button>
              <button
                onClick={() => setActiveTab('original')}
                className={`h-full border-b-2 font-medium px-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'original' ? 'border-blue-500 text-blue-400 font-bold' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-3 h-3" />
                <span>Original Response ({selectedItem.original_status_code || selectedItem.status_code})</span>
              </button>
              <button
                onClick={() => setActiveTab('diff')}
                className={`h-full border-b-2 font-medium px-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'diff' ? 'border-blue-500 text-blue-400 font-bold' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>Side-by-Side Comparison</span>
              </button>

              <div className="flex-1" />

              {activeTab === 'editor' && editBodyText && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleAutoConvertBody401to200}
                    title="Change 'statusCode': 401 to 'statusCode': 200 in JSON body"
                    className="flex items-center gap-1 text-[11px] text-emerald-300 hover:text-emerald-200 bg-emerald-950/80 border border-emerald-600/70 px-2 py-0.5 rounded font-bold cursor-pointer"
                  >
                    <Zap className="w-3 h-3 text-yellow-300" />
                    <span>statusCode":401 → 200</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSetAuthSuccessBody}
                    title="Populate authorized 200 OK session JSON"
                    className="flex items-center gap-1 text-[11px] text-teal-300 hover:text-teal-200 bg-teal-950/80 border border-teal-600/70 px-2 py-0.5 rounded font-bold cursor-pointer"
                  >
                    <ShieldCheck className="w-3 h-3 text-teal-400" />
                    <span>Auth 200 Payload</span>
                  </button>

                  <div className="h-3 w-px bg-[#2b2d3d] mx-1" />

                  <button
                    type="button"
                    onClick={handleFormatJson}
                    title="Beautify / Format JSON nicely"
                    className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded hover:bg-[#202230] cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Beautify JSON</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleMinifyJson}
                    title="Minify JSON payload"
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-300 px-2 py-0.5 rounded hover:bg-[#202230] cursor-pointer"
                  >
                    <span>Minify</span>
                  </button>
                </div>
              )}
            </div>

            {/* Tab 1: Modified Response Editor */}
            {activeTab === 'editor' && (
              <div className="flex-1 p-3 overflow-y-auto font-mono text-xs space-y-3 bg-[#13141c]">
                {/* Headers */}
                <div className="flex flex-col">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-400 text-[11px] font-sans font-semibold">
                      Response Headers (One per line):
                    </span>
                    <span className="text-[10px] text-slate-500 font-sans">
                      Content-Length will be automatically updated on forward
                    </span>
                  </div>
                  <textarea
                    rows={5}
                    value={editHeadersText}
                    onChange={(e) => setEditHeadersText(e.target.value)}
                    disabled={selectedItem.status !== 'waiting'}
                    className="w-full bg-[#181924] border border-[#27293b] rounded p-2 text-slate-200 outline-none focus:border-blue-500 font-mono text-xs resize-y"
                    placeholder="Content-Type: application/json&#10;Access-Control-Allow-Origin: *"
                  />
                </div>

                {/* Body */}
                <div className="flex flex-col flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-400 text-[11px] font-sans font-semibold">
                      Response Body ({new TextEncoder().encode(editBodyText).length} bytes):
                    </span>
                  </div>
                  <textarea
                    rows={12}
                    value={editBodyText}
                    onChange={(e) => setEditBodyText(e.target.value)}
                    disabled={selectedItem.status !== 'waiting'}
                    className="w-full bg-[#181924] border border-[#27293b] rounded p-2 text-emerald-300 outline-none focus:border-blue-500 font-mono text-xs resize-y"
                    placeholder="Enter JSON, HTML, or plain text response body..."
                  />
                </div>
              </div>
            )}

            {/* Tab 2: Original Server Response */}
            {activeTab === 'original' && (
              <div className="flex-1 p-3 overflow-y-auto font-mono text-xs space-y-3 bg-[#13141c]">
                <div className="p-2.5 rounded bg-[#181a26] border border-[#26283b] flex items-center justify-between">
                  <div>
                    <span className="text-slate-400 text-xs font-sans font-semibold mr-2">Original Server Status:</span>
                    <span className={`px-2 py-0.5 rounded font-bold text-xs ${getStatusColor(selectedItem.original_status_code || selectedItem.status_code)}`}>
                      {selectedItem.original_status_code || selectedItem.status_code}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-sans">
                    Pristine response received from origin server
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-slate-400 text-[11px] mb-1 font-sans font-semibold">
                    Original Server Headers:
                  </span>
                  <div className="w-full bg-[#181924] border border-[#27293b] rounded p-2 text-slate-300 font-mono text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {Object.entries(selectedItem.original_headers || selectedItem.headers || {})
                      .map(([k, v]) => `${k}: ${v}`)
                      .join('\n') || '[No headers]'}
                  </div>
                </div>

                <div className="flex flex-col">
                  <span className="text-slate-400 text-[11px] mb-1 font-sans font-semibold">
                    Original Server Body:
                  </span>
                  <div className="w-full bg-[#181924] border border-[#27293b] rounded p-2 text-slate-300 font-mono text-xs whitespace-pre-wrap max-h-96 overflow-y-auto">
                    {selectedItem.original_body_text || selectedItem.body_text || '[Empty Body]'}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Side-by-Side Comparison */}
            {activeTab === 'diff' && (
              <div className="flex-1 flex overflow-hidden divide-x divide-[#242636] bg-[#12131b]">
                {/* Left: Original */}
                <div className="flex-1 flex flex-col p-3 overflow-y-auto space-y-2">
                  <div className="flex items-center justify-between pb-1 border-b border-[#242636]">
                    <span className="font-sans font-bold text-xs text-red-400 flex items-center gap-1">
                      <span>Original Server Response</span>
                    </span>
                    <span className={`px-1.5 py-0.2 rounded font-bold text-[10px] ${getStatusColor(selectedItem.original_status_code || selectedItem.status_code)}`}>
                      {selectedItem.original_status_code || selectedItem.status_code}
                    </span>
                  </div>
                  <div className="font-mono text-xs text-slate-400 whitespace-pre-wrap bg-[#171822] p-2 rounded border border-[#222432] max-h-40 overflow-y-auto">
                    {Object.entries(selectedItem.original_headers || selectedItem.headers || {})
                      .map(([k, v]) => `${k}: ${v}`)
                      .join('\n')}
                  </div>
                  <div className="font-mono text-xs text-slate-300 whitespace-pre-wrap bg-[#171822] p-2 rounded border border-[#222432] flex-1 overflow-y-auto">
                    {selectedItem.original_body_text || selectedItem.body_text || '[Empty Body]'}
                  </div>
                </div>

                {/* Right: Modified */}
                <div className="flex-1 flex flex-col p-3 overflow-y-auto space-y-2">
                  <div className="flex items-center justify-between pb-1 border-b border-[#242636]">
                    <span className="font-sans font-bold text-xs text-emerald-400 flex items-center gap-1">
                      <span>Modified Response to Browser</span>
                    </span>
                    <span className={`px-1.5 py-0.2 rounded font-bold text-[10px] ${getStatusColor(editStatus)}`}>
                      {editStatus}
                    </span>
                  </div>
                  <div className="font-mono text-xs text-emerald-400 whitespace-pre-wrap bg-[#171822] p-2 rounded border border-[#222432] max-h-40 overflow-y-auto">
                    {editHeadersText}
                  </div>
                  <div className="font-mono text-xs text-emerald-300 whitespace-pre-wrap bg-[#171822] p-2 rounded border border-[#222432] flex-1 overflow-y-auto">
                    {editBodyText || '[Empty Body]'}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL 1: Global Auto Mode Confirmation Dialog */}
      {showAutoModeModal && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#181924] border border-[#2c2f42] rounded-xl max-w-lg w-full shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#292b3d]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-500/50 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Enable Global Automatic Response Mode</h3>
                  <p className="text-[11px] text-slate-400">Authorized Test Environment Response Rewriting</p>
                </div>
              </div>
              <button onClick={() => setShowAutoModeModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#1e202f] border border-[#2d3148] rounded-lg p-3 text-xs text-slate-300 space-y-2">
              <p className="leading-relaxed">
                When enabled, incoming server responses matching your target test environment will be automatically rewritten from <strong>HTTP {autoModeInputMatch}</strong> to <strong>HTTP {autoModeInputReplace}</strong> and forwarded immediately to your active browser session without pausing.
              </p>
              <div className="flex items-center gap-2 text-[11px] text-amber-300 bg-amber-950/40 p-2 rounded border border-amber-800/50">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  <strong>Strict Scope Protection:</strong> Responses outside the target host will NOT be modified.
                </span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Target Host / Test Environment:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={autoModeInputHost}
                    onChange={(e) => setAutoModeInputHost(e.target.value)}
                    placeholder="e.g. embeds2.com, 127.0.0.1, or localhost"
                    className="flex-1 bg-[#13141d] border border-[#2c2f42] rounded px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setAutoModeInputHost(derivedHost)}
                    className="px-2 py-1.5 bg-[#232637] hover:bg-[#2b2f45] text-[11px] text-blue-300 rounded border border-[#343852]"
                  >
                    Current Host
                  </button>
                </div>
                <span className="text-[10px] text-slate-500">
                  Target host to monitor (use * for all hosts in your test proxy)
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Original Status Code:
                  </label>
                  <input
                    type="number"
                    value={autoModeInputMatch}
                    onChange={(e) => setAutoModeInputMatch(Number(e.target.value))}
                    className="w-full bg-[#13141d] border border-[#2c2f42] rounded px-3 py-1.5 text-xs text-amber-300 outline-none focus:border-amber-500 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Replacement Status Code:
                  </label>
                  <input
                    type="number"
                    value={autoModeInputReplace}
                    onChange={(e) => setAutoModeInputReplace(Number(e.target.value))}
                    className="w-full bg-[#13141d] border border-[#2c2f42] rounded px-3 py-1.5 text-xs text-emerald-300 outline-none focus:border-emerald-500 font-mono font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#292b3d]">
              <button
                type="button"
                onClick={() => setShowAutoModeModal(false)}
                className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-white hover:bg-[#232536] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAutoMode}
                className="px-4 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded text-xs transition-all shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5 text-yellow-300" />
                <span>Confirm & Enable Auto Mode</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Automatic Response Rules Configuration Panel */}
      {showRulesModal && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#181924] border border-[#2c2f42] rounded-xl max-w-2xl w-full shadow-2xl p-5 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-[#292b3d] shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-950/80 border border-blue-500/50 flex items-center justify-center">
                  <Sliders className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Automatic Response Rules</h3>
                  <p className="text-[11px] text-slate-400">Define rule-based response status and payload rewrites</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleQuickAdd401Rule}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded flex items-center gap-1 transition-colors cursor-pointer"
                  title="Add a 401 to 200 rule for current host"
                >
                  <Sparkles className="w-3 h-3 text-yellow-300" />
                  <span>+ Quick 401→200 Rule</span>
                </button>

                <button onClick={() => setShowRulesModal(false)} className="text-slate-400 hover:text-white p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Rules List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              <span className="text-xs font-semibold text-slate-300 block mb-1">
                Active Rules ({rules.length}):
              </span>

              {rules.length > 0 ? (
                rules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`p-3 rounded-lg border flex items-center justify-between text-xs transition-colors ${
                      rule.enabled
                        ? 'bg-[#1e202e] border-blue-600/40 text-slate-200'
                        : 'bg-[#151620] border-[#252837] text-slate-500'
                    }`}
                  >
                    <div className="space-y-1 flex-1 min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white truncate">{rule.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#2b2e40] text-slate-300">
                          {rule.method}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                          Host: {rule.target_host}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-amber-400 font-mono font-bold">Match: HTTP {rule.match_status}</span>
                        <span>→</span>
                        <span className="text-emerald-400 font-mono font-bold">Replace: HTTP {rule.replace_status}</span>
                        {rule.replace_body && (
                          <span className="text-slate-400 truncate max-w-xs">({rule.replace_body.substring(0, 30)}...)</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleRule(rule.id)}
                        className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                          rule.enabled
                            ? 'bg-emerald-600 text-white'
                            : 'bg-[#292c3d] text-slate-400 hover:text-white'
                        }`}
                      >
                        {rule.enabled ? 'Enabled' : 'Disabled'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-950/40"
                        title="Delete Rule"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-slate-500 text-xs bg-[#161722] rounded border border-[#232535]">
                  No automatic rules configured. Click "+ Quick 401→200 Rule" or add one below.
                </div>
              )}
            </div>

            {/* Add New Rule Form */}
            <div className="pt-3 border-t border-[#292b3d] space-y-2 shrink-0">
              <span className="text-xs font-bold text-slate-300 block">Create New Rule:</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <input
                  type="text"
                  placeholder="Rule Name (e.g. Mock Auth 401 to 200)"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  className="bg-[#13141d] border border-[#2c2f42] rounded px-2.5 py-1 text-xs text-white outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  placeholder="Target Host (e.g. embeds2.com or 127.0.0.1)"
                  value={newRuleHost}
                  onChange={(e) => setNewRuleHost(e.target.value)}
                  className="bg-[#13141d] border border-[#2c2f42] rounded px-2.5 py-1 text-xs text-white outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">Method:</label>
                  <select
                    value={newRuleMethod}
                    onChange={(e) => setNewRuleMethod(e.target.value)}
                    className="w-full bg-[#13141d] border border-[#2c2f42] rounded px-2 py-1 text-xs text-slate-200 outline-none"
                  >
                    <option value="ALL">ALL Methods</option>
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">Original Status:</label>
                  <input
                    type="number"
                    value={newRuleMatchStatus}
                    onChange={(e) => setNewRuleMatchStatus(Number(e.target.value))}
                    className="w-full bg-[#13141d] border border-[#2c2f42] rounded px-2 py-1 text-xs text-amber-300 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">Replace Status:</label>
                  <input
                    type="number"
                    value={newRuleReplaceStatus}
                    onChange={(e) => setNewRuleReplaceStatus(Number(e.target.value))}
                    className="w-full bg-[#13141d] border border-[#2c2f42] rounded px-2 py-1 text-xs text-emerald-300 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Optional replacement JSON body (leave empty to keep server body)"
                  value={newRuleBody}
                  onChange={(e) => setNewRuleBody(e.target.value)}
                  className="w-full bg-[#13141d] border border-[#2c2f42] rounded px-2.5 py-1 text-xs text-white outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleAddRule}
                  disabled={!newRuleName.trim()}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold rounded text-xs transition-colors cursor-pointer"
                >
                  Save & Enable Rule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Response Modification Logs Modal */}
      {showLogsModal && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#181924] border border-[#2c2f42] rounded-xl max-w-2xl w-full shadow-2xl p-5 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-[#292b3d] shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-950/80 border border-purple-500/50 flex items-center justify-center">
                  <History className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Response Modification Audit Logs</h3>
                  <p className="text-[11px] text-slate-400">History of automated and manual response rewrites</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {modLogs.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearLogs}
                    className="px-2.5 py-1 bg-red-950/80 hover:bg-red-900 border border-red-700/60 text-red-300 text-xs font-semibold rounded transition-colors cursor-pointer"
                  >
                    Clear History
                  </button>
                )}
                <button onClick={() => setShowLogsModal(false)} className="text-slate-400 hover:text-white p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 bg-[#1e202f] p-2.5 rounded border border-[#2c3046]">
              🛡️ <strong>Security Notice:</strong> All sensitive parameters, tokens, credentials, and passwords are automatically redacted and never stored in audit logs.
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#242738] pr-1">
              {modLogs.length > 0 ? (
                modLogs.map((log) => (
                  <div key={log.id} className="py-2.5 flex items-center justify-between text-xs gap-3">
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-purple-300">{log.rule_name}</span>
                        <span className="text-[10px] font-mono px-1 rounded bg-[#272a3a] text-slate-300">{log.method}</span>
                        <span className="text-[10px] text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-300 truncate" title={log.url}>
                        {log.url}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 font-mono text-xs font-bold">
                      <span className="text-amber-400">{log.original_status}</span>
                      <span>→</span>
                      <span className="text-emerald-400">{log.modified_status}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-40 flex flex-col items-center justify-center text-slate-500 text-xs">
                  <History className="w-8 h-8 opacity-20 mb-2" />
                  <span>No response modification logs recorded yet.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
