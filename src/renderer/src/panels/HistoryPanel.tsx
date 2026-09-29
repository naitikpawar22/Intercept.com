import React, { useState, useEffect } from 'react';
import { 
  Search, Trash2, Download, Eye, EyeOff, Send, RefreshCw, Filter, Shield 
} from 'lucide-react';
import { NetworkFlow } from '../types';
import { RequestDetailModal } from './RequestDetailModal';

interface HistoryPanelProps {
  onSendToRepeater: (flow: any) => void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({ onSendToRepeater }) => {
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('ALL');
  const [maskSensitive, setMaskSensitive] = useState(true);
  const [selectedFlow, setSelectedFlow] = useState<NetworkFlow | null>(null);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      if (window.netscope?.history) {
        const rows = await window.netscope.history.get({
          query: searchQuery,
          method: selectedMethod !== 'ALL' ? selectedMethod : undefined
        });
        setHistoryItems(rows || []);
      }
    } catch (e) {
      console.error('Failed to load history:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [selectedMethod]);

  const handleClearHistory = async () => {
    if (confirm('Are you sure you want to delete all stored HTTP history in SQLite?')) {
      if (window.netscope?.history) {
        await window.netscope.history.clear();
        loadHistory();
      }
    }
  };

  const exportHistory = async (format: 'json' | 'csv') => {
    let content = '';
    if (format === 'json') {
      content = JSON.stringify(historyItems, null, 2);
    } else {
      const headers = ['Method', 'Status', 'Domain', 'URL', 'Type', 'Size', 'Duration', 'Timestamp'];
      const rows = historyItems.map(h => [
        h.method,
        h.status_code || '',
        `"${h.domain}"`,
        `"${(h.url || '').replace(/"/g, '""')}"`,
        h.resource_type || '',
        h.content_length || 0,
        h.duration_ms || 0,
        new Date(h.request_timestamp).toISOString()
      ]);
      content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }

    if (window.netscope?.export) {
      await window.netscope.export.saveFile({
        defaultPath: `netscope-sqlite-history-${Date.now()}.${format}`,
        content,
        fileType: format.toUpperCase()
      });
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#14151b] text-slate-200 select-none">
      {/* Search and Toolbar */}
      <div className="h-10 bg-[#181922] border-b border-[#262835] flex items-center px-3 gap-2.5 text-xs">
        <div className="flex-1 flex items-center max-w-md relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadHistory()}
            placeholder="Search SQLite history (URL, domain, request/response body)..."
            className="w-full bg-[#1b1c25] border border-[#2b2e3c] rounded pl-8 pr-2 py-1 text-xs text-slate-200 outline-none focus:border-blue-500"
          />
        </div>

        <button
          onClick={loadHistory}
          className="flex items-center gap-1 px-2.5 py-1 bg-[#22242f] hover:bg-[#2b2e3c] border border-[#313545] rounded text-slate-300 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Search</span>
        </button>

        <select
          value={selectedMethod}
          onChange={(e) => setSelectedMethod(e.target.value)}
          className="bg-[#20222c] border border-[#2d303e] rounded px-2.5 py-1 text-xs text-slate-300 outline-none"
        >
          {['ALL', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'].map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {/* Mask Sensitive Values Toggle */}
        <button
          onClick={() => setMaskSensitive(!maskSensitive)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs transition-colors ${
            maskSensitive
              ? 'bg-blue-950/40 border-blue-700/50 text-blue-300'
              : 'bg-[#20222c] border-[#2c2f3f] text-slate-400'
          }`}
          title="Mask authorization headers and sensitive cookies in history"
        >
          {maskSensitive ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          <span>{maskSensitive ? 'Masking Tokens' : 'Raw Values'}</span>
        </button>

        <div className="flex-1" />

        <button
          onClick={() => exportHistory('json')}
          className="flex items-center gap-1 px-2 py-1 bg-[#20222c] hover:bg-[#272a37] border border-[#2c2f3f] rounded text-[11px] text-slate-300 transition-colors"
        >
          <Download className="w-3 h-3" />
          <span>Export JSON</span>
        </button>

        <button
          onClick={() => exportHistory('csv')}
          className="flex items-center gap-1 px-2 py-1 bg-[#20222c] hover:bg-[#272a37] border border-[#2c2f3f] rounded text-[11px] text-slate-300 transition-colors"
        >
          <Download className="w-3 h-3" />
          <span>Export CSV</span>
        </button>

        <button
          onClick={handleClearHistory}
          className="p-1 hover:bg-[#282a38] text-slate-400 hover:text-red-400 rounded transition-colors"
          title="Clear SQLite History"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* History Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left font-mono text-[11px] border-collapse">
          <thead className="sticky top-0 bg-[#161720] border-b border-[#282a38] text-slate-400 select-none z-10">
            <tr>
              <th className="py-1.5 px-2.5 w-12">#</th>
              <th className="py-1.5 px-2.5 w-20">Method</th>
              <th className="py-1.5 px-2.5 w-20">Status</th>
              <th className="py-1.5 px-2.5 w-44">Domain</th>
              <th className="py-1.5 px-2.5">URL Path</th>
              <th className="py-1.5 px-2.5 w-24">Type</th>
              <th className="py-1.5 px-2.5 w-24">Size</th>
              <th className="py-1.5 px-2.5 w-24">Duration</th>
              <th className="py-1.5 px-2.5 w-36">Time</th>
              <th className="py-1.5 px-2.5 w-16 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e202b]">
            {historyItems.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-slate-500 font-sans text-xs">
                  {isLoading ? "Querying SQLite database..." : "No requests stored in persistent database history."}
                </td>
              </tr>
            ) : (
              historyItems.map((item, idx) => {
                const statusClass = item.status_code >= 200 && item.status_code < 300
                  ? 'badge-2xx'
                  : item.status_code >= 300 && item.status_code < 400
                  ? 'badge-3xx'
                  : 'badge-4xx';

                return (
                  <tr
                    key={item.request_id || idx}
                    onClick={() => {
                      const flowObj: NetworkFlow = {
                        method: item.method,
                        url: item.url,
                        domain: item.domain,
                        path: item.path,
                        scheme: item.scheme,
                        port: item.port,
                        status_code: item.status_code || 0,
                        status_message: item.status_message,
                        mime_type: item.mime_type,
                        resource_type: item.resource_type || 'Other',
                        content_length: item.content_length || 0,
                        duration_ms: item.duration_ms || 0,
                        request_headers: item.request_headers || {},
                        request_body: item.request_body,
                        response_headers: item.response_headers || {},
                        response_body: item.response_body,
                        in_scope: Boolean(item.in_scope),
                        timestamp: item.request_timestamp
                      };
                      setSelectedFlow(flowObj);
                    }}
                    className="cursor-pointer hover:bg-[#1c1e28] transition-colors"
                  >
                    <td className="py-1 px-2.5 text-slate-500">{idx + 1}</td>
                    <td className="py-1 px-2.5 font-bold">
                      <span className={`badge-method ${
                        item.method === 'GET' ? 'text-blue-400 bg-blue-950/40' :
                        item.method === 'POST' ? 'text-emerald-400 bg-emerald-950/40' :
                        item.method === 'PUT' ? 'text-amber-400 bg-amber-950/40' :
                        'text-red-400 bg-red-950/40'
                      }`}>
                        {item.method}
                      </span>
                    </td>
                    <td className="py-1 px-2.5">
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${statusClass}`}>
                        {item.status_code || '---'}
                      </span>
                    </td>
                    <td className="py-1 px-2.5 text-slate-300 truncate max-w-[170px]" title={item.domain}>
                      {item.domain}
                    </td>
                    <td className="py-1 px-2.5 text-slate-300 truncate max-w-md" title={item.url}>
                      {item.path || item.url}
                    </td>
                    <td className="py-1 px-2.5 text-slate-400">{item.resource_type || 'Other'}</td>
                    <td className="py-1 px-2.5 text-slate-400">
                      {item.content_length > 1024 
                        ? `${(item.content_length / 1024).toFixed(1)} KB`
                        : `${item.content_length || 0} B`}
                    </td>
                    <td className="py-1 px-2.5 text-slate-400">{item.duration_ms || 0} ms</td>
                    <td className="py-1 px-2.5 text-slate-400 text-[10px]">
                      {new Date(item.request_timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-1 px-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onSendToRepeater(item)}
                        title="Send to Repeater"
                        className="p-1 hover:bg-[#2c2f3d] rounded text-slate-400 hover:text-blue-400 transition-colors"
                      >
                        <Send className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedFlow && (
        <RequestDetailModal
          flow={selectedFlow}
          onClose={() => setSelectedFlow(null)}
          onSendToRepeater={(f) => {
            onSendToRepeater(f);
            setSelectedFlow(null);
          }}
        />
      )}
    </div>
  );
};
