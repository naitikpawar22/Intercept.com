import React, { useState, useMemo } from 'react';
import { 
  Play, Pause, Trash2, Download, Search, Filter, ExternalLink, Send, ArrowUpDown 
} from 'lucide-react';
import { NetworkFlow } from '../types';
import { RequestDetailModal } from './RequestDetailModal';

interface NetworkPanelProps {
  flows: NetworkFlow[];
  onClear: () => void;
  onSendToRepeater: (flow: NetworkFlow) => void;
}

export const NetworkPanel: React.FC<NetworkPanelProps> = ({
  flows,
  onClear,
  onSendToRepeater
}) => {
  const [isPaused, setIsPaused] = useState(false);
  const [selectedFlow, setSelectedFlow] = useState<NetworkFlow | null>(null);
  const [filterType, setFilterType] = useState('All');
  const [filterMethod, setFilterMethod] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'id' | 'duration_ms' | 'content_length' | 'status_code'>('id');
  const [sortAsc, setSortAsc] = useState(false);

  const resourceTypes = ['All', 'Fetch', 'XHR', 'Document', 'Script', 'Stylesheet', 'Image', 'Font', 'Media', 'Other'];
  const methods = ['ALL', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];

  const filteredFlows = useMemo(() => {
    let result = flows;
    if (filterType !== 'All') {
      result = result.filter(f => f.resource_type === filterType);
    }
    if (filterMethod !== 'ALL') {
      result = result.filter(f => f.method.toUpperCase() === filterMethod);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(f => f.url.toLowerCase().includes(q) || f.domain.toLowerCase().includes(q));
    }

    return [...result].sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];
      if (valA === undefined) valA = 0;
      if (valB === undefined) valB = 0;
      return sortAsc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });
  }, [flows, filterType, filterMethod, searchQuery, sortField, sortAsc]);

  const exportHistory = async (format: 'json' | 'csv') => {
    let content = '';
    if (format === 'json') {
      content = JSON.stringify(flows, null, 2);
    } else {
      const headers = ['Method', 'Status', 'Domain', 'URL', 'Type', 'Size', 'Duration', 'Timestamp'];
      const rows = flows.map(f => [
        f.method,
        f.status_code,
        `"${f.domain}"`,
        `"${f.url.replace(/"/g, '""')}"`,
        f.resource_type,
        f.content_length,
        f.duration_ms,
        new Date(f.timestamp).toISOString()
      ]);
      content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }

    if (window.netscope?.export) {
      await window.netscope.export.saveFile({
        defaultPath: `netscope-network-${Date.now()}.${format}`,
        content,
        fileType: format.toUpperCase()
      });
    }
  };

  const handleSort = (field: 'id' | 'duration_ms' | 'content_length' | 'status_code') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#14151b] text-slate-200 select-none">
      {/* Network Toolbar */}
      <div className="h-9 bg-[#181922] border-b border-[#262835] flex items-center px-3 gap-2 text-xs">
        {/* Record / Pause */}
        <button
          onClick={() => setIsPaused(!isPaused)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded font-medium transition-colors ${
            isPaused ? 'bg-amber-950/40 text-amber-400 border border-amber-800/40' : 'bg-[#22242f] text-slate-300 hover:bg-[#2b2e3c]'
          }`}
          title={isPaused ? "Resume live capture" : "Pause live capture"}
        >
          {isPaused ? <Play className="w-3 h-3 text-emerald-400 fill-emerald-400" /> : <Pause className="w-3 h-3 text-amber-400" />}
          <span>{isPaused ? 'Paused' : 'Recording'}</span>
        </button>

        {/* Clear */}
        <button
          onClick={onClear}
          className="p-1 rounded hover:bg-[#262835] text-slate-400 hover:text-red-400 transition-colors"
          title="Clear all recorded requests"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-[#2c2f3d] mx-1" />

        {/* Method Filter */}
        <select
          value={filterMethod}
          onChange={(e) => setFilterMethod(e.target.value)}
          className="bg-[#20222c] border border-[#2d303e] rounded px-2 py-0.5 text-xs text-slate-300 outline-none"
        >
          {methods.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {/* Resource Type Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {resourceTypes.map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                filterType === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#1e2029] text-slate-400 hover:bg-[#252834] hover:text-slate-200'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-[#2c2f3d] mx-1" />

        {/* Search URL/Domain */}
        <div className="flex-1 flex items-center max-w-xs relative">
          <Search className="w-3 h-3 text-slate-500 absolute left-2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by URL or domain..."
            className="w-full bg-[#1b1c25] border border-[#2b2e3c] rounded pl-7 pr-2 py-0.5 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex-1" />

        {/* Export options */}
        <button
          onClick={() => exportHistory('json')}
          className="flex items-center gap-1 px-2 py-0.5 bg-[#20222c] hover:bg-[#272a37] border border-[#2c2f3f] rounded text-[11px] text-slate-300 transition-colors"
          title="Export captured requests to JSON"
        >
          <Download className="w-3 h-3" />
          <span>JSON</span>
        </button>
        <button
          onClick={() => exportHistory('csv')}
          className="flex items-center gap-1 px-2 py-0.5 bg-[#20222c] hover:bg-[#272a37] border border-[#2c2f3f] rounded text-[11px] text-slate-300 transition-colors"
          title="Export captured requests to CSV"
        >
          <Download className="w-3 h-3" />
          <span>CSV</span>
        </button>

        <span className="text-[11px] text-slate-500 font-mono">
          {filteredFlows.length} / {flows.length} reqs
        </span>
      </div>

      {/* Network Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left font-mono text-[11px] border-collapse">
          <thead className="sticky top-0 bg-[#161720] border-b border-[#282a38] text-slate-400 select-none z-10">
            <tr>
              <th className="py-1.5 px-2.5 w-12 cursor-pointer hover:text-slate-200" onClick={() => handleSort('id')}>
                #
              </th>
              <th className="py-1.5 px-2.5 w-20">Method</th>
              <th className="py-1.5 px-2.5 w-20 cursor-pointer hover:text-slate-200" onClick={() => handleSort('status_code')}>
                Status
              </th>
              <th className="py-1.5 px-2.5 w-44">Domain</th>
              <th className="py-1.5 px-2.5 min-w-[200px]">URL Path</th>
              <th className="py-1.5 px-2.5 w-24">Type</th>
              <th className="py-1.5 px-2.5 w-24 cursor-pointer hover:text-slate-200" onClick={() => handleSort('content_length')}>
                Size
              </th>
              <th className="py-1.5 px-2.5 w-24 cursor-pointer hover:text-slate-200" onClick={() => handleSort('duration_ms')}>
                Duration
              </th>
              <th className="py-1.5 px-2.5 w-20 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e202b]">
            {filteredFlows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-500 font-sans text-xs">
                  {flows.length === 0 
                    ? "No requests captured yet. Browse any website above to start capturing traffic." 
                    : "No requests match the current filter criteria."}
                </td>
              </tr>
            ) : (
              filteredFlows.map((flow, index) => {
                const isSelected = selectedFlow?.id === flow.id || selectedFlow?.flow_id === flow.flow_id;
                const statusClass = flow.status_code >= 200 && flow.status_code < 300
                  ? 'badge-2xx'
                  : flow.status_code >= 300 && flow.status_code < 400
                  ? 'badge-3xx'
                  : flow.status_code >= 400 && flow.status_code < 500
                  ? 'badge-4xx'
                  : flow.status_code >= 500
                  ? 'badge-5xx'
                  : 'bg-slate-800 text-slate-400';

                return (
                  <tr
                    key={flow.flow_id || index}
                    onClick={() => setSelectedFlow(flow)}
                    className={`cursor-pointer hover:bg-[#1c1e28] transition-colors ${
                      isSelected ? 'bg-[#212431]' : ''
                    }`}
                  >
                    <td className="py-1 px-2.5 text-slate-500">{index + 1}</td>
                    <td className="py-1 px-2.5 font-bold">
                      <span className={`badge-method ${
                        flow.method === 'GET' ? 'text-blue-400 bg-blue-950/40' :
                        flow.method === 'POST' ? 'text-emerald-400 bg-emerald-950/40' :
                        flow.method === 'PUT' ? 'text-amber-400 bg-amber-950/40' :
                        flow.method === 'DELETE' ? 'text-red-400 bg-red-950/40' :
                        'text-purple-400 bg-purple-950/40'
                      }`}>
                        {flow.method}
                      </span>
                    </td>
                    <td className="py-1 px-2.5">
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${statusClass}`}>
                        {flow.status_code || '---'}
                      </span>
                    </td>
                    <td className="py-1 px-2.5 text-slate-300 truncate max-w-[170px]" title={flow.domain}>
                      {flow.domain}
                    </td>
                    <td className="py-1 px-2.5 text-slate-300 truncate max-w-md" title={flow.url}>
                      {flow.path || flow.url}
                    </td>
                    <td className="py-1 px-2.5 text-slate-400">{flow.resource_type || 'Other'}</td>
                    <td className="py-1 px-2.5 text-slate-400">
                      {flow.content_length > 1024 
                        ? `${(flow.content_length / 1024).toFixed(1)} KB`
                        : `${flow.content_length} B`}
                    </td>
                    <td className="py-1 px-2.5 text-slate-400">{flow.duration_ms} ms</td>
                    <td className="py-1 px-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onSendToRepeater(flow)}
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

      {/* Detail Inspection Modal */}
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
