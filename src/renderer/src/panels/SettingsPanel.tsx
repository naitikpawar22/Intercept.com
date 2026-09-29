import React, { useState, useEffect } from 'react';
import { 
  Shield, Check, Copy, Trash2, Plus, Terminal, RefreshCw, FileText, AlertTriangle, Radio 
} from 'lucide-react';
import { ProxyStatus, ScopeRule } from '../types';

interface SettingsPanelProps {
  proxyStatus: ProxyStatus;
  onToggleProxy: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ proxyStatus, onToggleProxy }) => {
  const [scopes, setScopes] = useState<ScopeRule[]>([]);
  const [newScopePattern, setNewScopePattern] = useState('');
  const [certInfo, setCertInfo] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [strictScope, setStrictScope] = useState(proxyStatus.strictScope);

  const fetchScopes = async () => {
    if (window.netscope?.scope) {
      const all = await window.netscope.scope.getAll();
      setScopes(all || []);
    }
  };

  const fetchCertInfo = async () => {
    if (window.netscope?.proxy) {
      const info = await window.netscope.proxy.getCertificateInfo();
      setCertInfo(info);
      const l = await window.netscope.proxy.getLogs();
      setLogs(l || []);
    }
  };

  useEffect(() => {
    fetchScopes();
    fetchCertInfo();
  }, []);

  const handleAddScope = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScopePattern.trim()) return;
    if (window.netscope?.scope) {
      await window.netscope.scope.add(newScopePattern.trim(), false);
      setNewScopePattern('');
      fetchScopes();
    }
  };

  const handleToggleScope = async (id: string, current: number) => {
    if (window.netscope?.scope) {
      await window.netscope.scope.toggle(id, current === 0);
      fetchScopes();
    }
  };

  const handleRemoveScope = async (id: string) => {
    if (window.netscope?.scope) {
      await window.netscope.scope.remove(id);
      fetchScopes();
    }
  };

  const handleToggleStrictScope = async () => {
    const nextVal = !strictScope;
    setStrictScope(nextVal);
    if (window.netscope?.proxy) {
      await window.netscope.proxy.setConfig({ strictScope: nextVal });
    }
  };

  const copyCertCommand = () => {
    if (certInfo?.trustCommand) {
      navigator.clipboard.writeText(certInfo.trustCommand);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 1500);
    }
  };

  const handleGenerateReport = async () => {
    // Generate HTML Security Testing Report
    const history = window.netscope?.history ? await window.netscope.history.get({ limit: 1000 }) : [];
    const reportHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>NetScope Web Security Testing Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f1f5f9; padding: 40px; margin: 0; }
    .card { background: #1e293b; border-radius: 8px; border: 1px solid #334155; padding: 24px; margin-bottom: 24px; }
    h1 { color: #60a5fa; margin-top: 0; }
    table { width: 100%; border-collapse: collapse; font-family: monospace; font-size: 12px; }
    th, td { border: 1px solid #334155; padding: 8px 12px; text-align: left; }
    th { background: #0f172a; color: #94a3b8; }
    .badge { padding: 2px 6px; border-radius: 4px; font-weight: bold; }
    .b-2xx { background: #064e3b; color: #34d399; }
    .b-4xx { background: #7f1d1d; color: #f87171; }
  </style>
</head>
<body>
  <h1>NetScope Security Browser - Authorized Testing Report</h1>
  <div class="card">
    <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
    <p><strong>Total Recorded Requests:</strong> ${history.length}</p>
    <p><strong>Configured Scope:</strong> ${scopes.filter(s => s.enabled).map(s => s.pattern).join(', ')}</p>
  </div>
  <div class="card">
    <h2>Traffic History Log</h2>
    <table>
      <thead>
        <tr>
          <th>Method</th>
          <th>Status</th>
          <th>Domain</th>
          <th>URL</th>
          <th>Size</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        ${history.map((h: any) => `
          <tr>
            <td><strong>${h.method}</strong></td>
            <td><span class="badge ${h.status_code < 400 ? 'b-2xx' : 'b-4xx'}">${h.status_code || '---'}</span></td>
            <td>${h.domain}</td>
            <td>${h.url}</td>
            <td>${h.content_length} B</td>
            <td>${h.duration_ms} ms</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
</body>
</html>`;

    if (window.netscope?.export) {
      await window.netscope.export.saveFile({
        defaultPath: `netscope-report-${Date.now()}.html`,
        content: reportHtml,
        fileType: 'HTML'
      });
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#14151b] text-slate-200 select-none overflow-auto p-4 space-y-5 font-sans">
      {/* Target Scope Section */}
      <div className="bg-[#181922] border border-[#272938] rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-bold text-slate-100">Authorized Target Scope</h3>
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={strictScope}
              onChange={handleToggleStrictScope}
              className="rounded"
            />
            <span className="text-slate-300 font-medium">Strict Scope Enforcement (block out-of-scope requests)</span>
          </label>
        </div>

        <p className="text-xs text-slate-400">
          Only domains listed below are in-scope for security assessment. Requests outside scope can be inspected or blocked.
        </p>

        {/* Add Scope Form */}
        <form onSubmit={handleAddScope} className="flex gap-2 max-w-lg">
          <input
            type="text"
            value={newScopePattern}
            onChange={(e) => setNewScopePattern(e.target.value)}
            placeholder="Add domain (e.g. 127.0.0.1, localhost, *.target.com)..."
            className="flex-1 bg-[#1b1c25] border border-[#2b2e3c] rounded px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-blue-500 font-mono"
          />
          <button
            type="submit"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Domain</span>
          </button>
        </form>

        {/* Scopes List */}
        <div className="space-y-1.5 max-w-2xl pt-1">
          {scopes.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between p-2 bg-[#13141a] border border-[#22242f] rounded text-xs font-mono"
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(s.enabled)}
                  onChange={() => handleToggleScope(s.id, s.enabled)}
                />
                <span className={s.enabled ? 'text-blue-300 font-semibold' : 'text-slate-500 line-through'}>
                  {s.pattern}
                </span>
              </div>

              <button
                onClick={() => handleRemoveScope(s.id)}
                className="text-slate-500 hover:text-red-400 p-1 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Local CA Certificate & HTTPS Interception */}
      <div className="bg-[#181922] border border-[#272938] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <Radio className="w-4 h-4 text-emerald-400" />
          HTTPS Interception & Mitmproxy CA Certificate
        </h3>

        <p className="text-xs text-slate-400 leading-relaxed">
          To intercept HTTPS websites without browser certificate warnings, install and trust the NetScope Local CA certificate in your Windows Certificate Store.
        </p>

        <div className="p-3 bg-[#13141a] border border-[#22242f] rounded font-mono text-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Windows Installation Command:</span>
            <button
              onClick={copyCertCommand}
              className="text-blue-400 hover:underline flex items-center gap-1 font-sans text-[11px]"
            >
              {copiedCmd ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedCmd ? 'Copied' : 'Copy Command'}</span>
            </button>
          </div>
          <div className="p-2 bg-[#0d0e13] rounded text-emerald-400 break-all select-text border border-[#1e202b]">
            {certInfo?.trustCommand || 'certutil -addstore -user Root "%USERPROFILE%\\.mitmproxy\\mitmproxy-ca-cert.cer"'}
          </div>
        </div>
      </div>

      {/* Reporting and Data Management */}
      <div className="bg-[#181922] border border-[#272938] rounded-lg p-4 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-slate-100">Export Testing Report</h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Generates a self-contained HTML report with test session metadata, target domains, and full traffic logs.
          </p>
        </div>

        <button
          onClick={handleGenerateReport}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium text-xs transition-colors shadow-sm"
        >
          <FileText className="w-4 h-4" />
          <span>Generate HTML Report</span>
        </button>
      </div>

      {/* Proxy Engine Logs */}
      <div className="bg-[#181922] border border-[#272938] rounded-lg p-4 space-y-2">
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <Terminal className="w-4 h-4 text-slate-400" />
          Mitmproxy Engine Logs
        </h4>
        <div className="h-44 bg-[#0d0e13] border border-[#1e202b] rounded p-2 overflow-auto font-mono text-[11px] text-slate-400 space-y-0.5">
          {logs.length === 0 ? (
            <div className="text-slate-600 italic">No proxy engine logs recorded yet.</div>
          ) : (
            logs.map((l, i) => <div key={i}>{l}</div>)
          )}
        </div>
      </div>
    </div>
  );
};
