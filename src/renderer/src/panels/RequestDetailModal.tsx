import React, { useState } from 'react';
import { X, Copy, ExternalLink, Send, Shield, Clock, FileText, Check } from 'lucide-react';
import { NetworkFlow } from '../types';

interface RequestDetailModalProps {
  flow: NetworkFlow | null;
  onClose: () => void;
  onSendToRepeater: (flow: NetworkFlow) => void;
}

export const RequestDetailModal: React.FC<RequestDetailModalProps> = ({
  flow,
  onClose,
  onSendToRepeater
}) => {
  const [activeTab, setActiveTab] = useState<'headers' | 'payload' | 'response' | 'cookies' | 'timing' | 'security'>('headers');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!flow) return null;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const getCurlCommand = () => {
    let curl = `curl -X ${flow.method} "${flow.url}"`;
    for (const [k, v] of Object.entries(flow.request_headers || {})) {
      curl += ` \\\n  -H "${k}: ${v}"`;
    }
    if (flow.request_body) {
      curl += ` \\\n  --data '${flow.request_body.replace(/'/g, "'\\''")}'`;
    }
    return curl;
  };

  const formatJson = (text?: string) => {
    if (!text) return '';
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  };

  const statusClass = flow.status_code >= 200 && flow.status_code < 300
    ? 'badge-2xx'
    : flow.status_code >= 300 && flow.status_code < 400
    ? 'badge-3xx'
    : flow.status_code >= 400 && flow.status_code < 500
    ? 'badge-4xx'
    : 'badge-5xx';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#181920] border border-[#2b2e3b] w-full max-w-5xl h-[85vh] rounded-lg flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="h-12 bg-[#14151b] border-b border-[#262833] flex items-center justify-between px-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="font-mono font-bold text-xs bg-blue-950/70 border border-blue-700/50 text-blue-300 px-2 py-0.5 rounded">
              {flow.method}
            </span>
            <span className={`font-mono text-xs px-2 py-0.5 rounded font-semibold ${statusClass}`}>
              {flow.status_code || '---'} {flow.status_message}
            </span>
            <span className="text-xs font-mono text-slate-300 truncate max-w-xl" title={flow.url}>
              {flow.url}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onSendToRepeater(flow)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition-colors"
            >
              <Send className="w-3 h-3" />
              <span>Send to Repeater</span>
            </button>

            <button
              onClick={() => copyToClipboard(getCurlCommand(), 'curl')}
              className="flex items-center gap-1 px-2.5 py-1 bg-[#22242f] hover:bg-[#2b2e3c] border border-[#333747] text-slate-300 rounded text-xs transition-colors"
            >
              {copiedField === 'curl' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedField === 'curl' ? 'Copied cURL' : 'Copy cURL'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1 hover:bg-[#272936] text-slate-400 hover:text-slate-200 rounded transition-colors ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="h-9 bg-[#16171f] border-b border-[#232530] flex items-center px-4 gap-4 text-xs font-medium">
          {(['headers', 'payload', 'response', 'cookies', 'timing', 'security'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`h-full border-b-2 capitalize transition-colors flex items-center gap-1.5 ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto p-4 font-mono text-xs bg-[#13141a]">
          {activeTab === 'headers' && (
            <div className="space-y-4">
              {/* General Summary */}
              <div className="bg-[#191a22] border border-[#262835] rounded p-3">
                <h4 className="text-slate-400 text-[11px] uppercase tracking-wider mb-2 font-sans font-bold">General Information</h4>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div className="text-slate-400">Request URL:</div>
                  <div className="col-span-3 text-slate-200 break-all">{flow.url}</div>
                  <div className="text-slate-400">Request Method:</div>
                  <div className="col-span-3 text-slate-200">{flow.method}</div>
                  <div className="text-slate-400">Status Code:</div>
                  <div className="col-span-3 text-slate-200">{flow.status_code} {flow.status_message}</div>
                  <div className="text-slate-400">Resource Type:</div>
                  <div className="col-span-3 text-slate-200">{flow.resource_type || 'Other'}</div>
                  <div className="text-slate-400">Duration:</div>
                  <div className="col-span-3 text-slate-200">{flow.duration_ms} ms</div>
                </div>
              </div>

              {/* Request Headers */}
              <div className="bg-[#191a22] border border-[#262835] rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-slate-400 text-[11px] uppercase tracking-wider font-sans font-bold">Request Headers</h4>
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(flow.request_headers, null, 2), 'req-headers')}
                    className="text-[11px] text-blue-400 hover:underline flex items-center gap-1 font-sans"
                  >
                    <Copy className="w-3 h-3" />
                    Copy
                  </button>
                </div>
                <div className="space-y-1">
                  {Object.entries(flow.request_headers || {}).map(([k, v]) => (
                    <div key={k} className="flex">
                      <span className="text-blue-300 w-48 shrink-0">{k}:</span>
                      <span className="text-slate-300 break-all">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Response Headers */}
              <div className="bg-[#191a22] border border-[#262835] rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-slate-400 text-[11px] uppercase tracking-wider font-sans font-bold">Response Headers</h4>
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(flow.response_headers, null, 2), 'res-headers')}
                    className="text-[11px] text-blue-400 hover:underline flex items-center gap-1 font-sans"
                  >
                    <Copy className="w-3 h-3" />
                    Copy
                  </button>
                </div>
                <div className="space-y-1">
                  {Object.entries(flow.response_headers || {}).map(([k, v]) => (
                    <div key={k} className="flex">
                      <span className="text-emerald-400 w-48 shrink-0">{k}:</span>
                      <span className="text-slate-300 break-all">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'payload' && (
            <div className="space-y-3 h-full flex flex-col">
              <div className="flex justify-between items-center text-slate-400 text-xs font-sans">
                <span>Request Body ({flow.request_body ? flow.request_body.length : 0} bytes)</span>
                <button
                  onClick={() => copyToClipboard(flow.request_body || '', 'body')}
                  className="text-blue-400 hover:underline flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  Copy Body
                </button>
              </div>
              <textarea
                readOnly
                value={formatJson(flow.request_body)}
                placeholder="No request body was sent."
                className="flex-1 w-full bg-[#181920] border border-[#2a2c3a] rounded p-3 text-slate-200 font-mono text-xs outline-none resize-none"
              />
            </div>
          )}

          {activeTab === 'response' && (
            <div className="space-y-3 h-full flex flex-col">
              <div className="flex justify-between items-center text-slate-400 text-xs font-sans">
                <span>Response Body ({flow.content_length || 0} bytes, MIME: {flow.mime_type || 'unknown'})</span>
                <button
                  onClick={() => copyToClipboard(flow.response_body || '', 'res-body')}
                  className="text-blue-400 hover:underline flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  Copy Response
                </button>
              </div>
              <textarea
                readOnly
                value={formatJson(flow.response_body)}
                placeholder="No response body or binary content."
                className="flex-1 w-full bg-[#181920] border border-[#2a2c3a] rounded p-3 text-slate-200 font-mono text-xs outline-none resize-none"
              />
            </div>
          )}

          {activeTab === 'cookies' && (
            <div className="space-y-4">
              <div className="bg-[#191a22] border border-[#262835] rounded p-3">
                <h4 className="text-slate-400 text-[11px] uppercase tracking-wider mb-2 font-sans font-bold">Request Cookies</h4>
                {flow.request_headers?.['cookie'] ? (
                  <div className="space-y-1">
                    {flow.request_headers['cookie'].split(';').map((c, i) => (
                      <div key={i} className="text-slate-300 py-0.5 border-b border-[#22242f]">{c.trim()}</div>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-500 italic">No Cookie header present in request.</div>
                )}
              </div>

              <div className="bg-[#191a22] border border-[#262835] rounded p-3">
                <h4 className="text-slate-400 text-[11px] uppercase tracking-wider mb-2 font-sans font-bold">Response Set-Cookie</h4>
                {flow.response_headers?.['set-cookie'] ? (
                  <div className="text-slate-300">{flow.response_headers['set-cookie']}</div>
                ) : (
                  <div className="text-slate-500 italic">No Set-Cookie header in response.</div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'timing' && (
            <div className="bg-[#191a22] border border-[#262835] rounded p-4 space-y-3 font-sans">
              <h4 className="text-slate-300 font-bold text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                Timing Breakdown
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-[#242735]">
                  <span className="text-slate-400">Total Roundtrip:</span>
                  <span className="text-slate-200 font-mono font-bold">{flow.duration_ms} ms</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#242735]">
                  <span className="text-slate-400">Request Sent Timestamp:</span>
                  <span className="text-slate-200 font-mono">{new Date(flow.timestamp).toISOString()}</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="bg-[#191a22] border border-[#262835] rounded p-4 space-y-3 font-sans">
              <h4 className="text-slate-300 font-bold text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                Connection & Security
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-[#242735]">
                  <span className="text-slate-400">Target Scheme:</span>
                  <span className="text-slate-200 font-mono uppercase">{flow.scheme || 'HTTP'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#242735]">
                  <span className="text-slate-400">Domain Host:</span>
                  <span className="text-slate-200 font-mono">{flow.domain}:{flow.port}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#242735]">
                  <span className="text-slate-400">In Authorized Target Scope:</span>
                  <span className={`font-semibold ${flow.in_scope ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {flow.in_scope ? 'Yes (Authorized Scope)' : 'Out of Scope'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
