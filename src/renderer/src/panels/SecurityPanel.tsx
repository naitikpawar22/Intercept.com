import React from 'react';
import { Shield, ShieldAlert, ShieldCheck, Lock, Unlock, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { NetworkFlow } from '../types';

interface SecurityPanelProps {
  currentUrl?: string;
  latestFlow?: NetworkFlow | null;
}

export const SecurityPanel: React.FC<SecurityPanelProps> = ({ currentUrl, latestFlow }) => {
  const isHttps = currentUrl?.toLowerCase().startsWith('https://');
  const headers = latestFlow?.response_headers || {};

  const securityHeaders = [
    {
      key: 'content-security-policy',
      name: 'Content-Security-Policy (CSP)',
      description: 'Mitigates Cross-Site Scripting (XSS) and data injection attacks by restricting resources that the browser can load.',
      present: Boolean(headers['content-security-policy']),
      value: headers['content-security-policy']
    },
    {
      key: 'strict-transport-security',
      name: 'Strict-Transport-Security (HSTS)',
      description: 'Enforces secure HTTPS connections and prevents SSL stripping attacks.',
      present: Boolean(headers['strict-transport-security']),
      value: headers['strict-transport-security']
    },
    {
      key: 'x-content-type-options',
      name: 'X-Content-Type-Options',
      description: 'Prevents MIME-type sniffing by browsers (should be "nosniff").',
      present: headers['x-content-type-options'] === 'nosniff',
      value: headers['x-content-type-options']
    },
    {
      key: 'x-frame-options',
      name: 'X-Frame-Options',
      description: 'Protects against clickjacking attacks by controlling whether the site can be embedded in an iframe.',
      present: Boolean(headers['x-frame-options']),
      value: headers['x-frame-options']
    },
    {
      key: 'referrer-policy',
      name: 'Referrer-Policy',
      description: 'Governs which referrer information should be included with requests made from this page.',
      present: Boolean(headers['referrer-policy']),
      value: headers['referrer-policy']
    },
    {
      key: 'permissions-policy',
      name: 'Permissions-Policy',
      description: 'Explicitly declares which browser features and APIs (camera, microphone, geolocation) may be used.',
      present: Boolean(headers['permissions-policy']),
      value: headers['permissions-policy']
    }
  ];

  return (
    <div className="h-full flex flex-col bg-[#14151b] text-slate-200 select-none overflow-auto p-4 space-y-4 font-sans">
      {/* Top Banner */}
      <div className="bg-[#181922] border border-[#272938] rounded-lg p-4 flex items-center gap-4">
        <div className={`p-3 rounded-full ${isHttps ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-700/50' : 'bg-amber-950/60 text-amber-400 border border-amber-700/50'}`}>
          {isHttps ? <Lock className="w-6 h-6" /> : <Unlock className="w-6 h-6" />}
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <span>{isHttps ? 'Encrypted Connection (HTTPS)' : 'Unencrypted Plain Connection (HTTP)'}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${isHttps ? 'badge-2xx' : 'badge-3xx'}`}>
              {isHttps ? 'TLS Active' : 'Plaintext'}
            </span>
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            {isHttps
              ? 'Data transmitted between the browser and the target server is encrypted. When mitmproxy interception is enabled, certificates are validated through the NetScope Local CA.'
              : 'Traffic is transmitted in plaintext without transport encryption. Vulnerable to local sniffing and tampering if used on public networks.'}
          </p>
        </div>
      </div>

      {/* Security Headers Audit */}
      <div className="bg-[#181922] border border-[#272938] rounded-lg p-4 space-y-3">
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-400" />
          HTTP Security Headers Audit
        </h4>
        <p className="text-xs text-slate-500">
          Evaluated against the latest HTTP response received for: <span className="font-mono text-slate-400">{currentUrl || 'none'}</span>
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          {securityHeaders.map((sh) => (
            <div key={sh.key} className="p-3 bg-[#13141a] border border-[#232532] rounded flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-slate-200">{sh.name}</span>
                  {sh.present ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Present
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-red-400 font-medium">
                      <XCircle className="w-3.5 h-3.5" />
                      Missing
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  {sh.description}
                </p>
              </div>

              {sh.value && (
                <div className="mt-2 pt-2 border-t border-[#20222d] font-mono text-[10px] text-blue-300 break-all truncate" title={sh.value}>
                  Value: {sh.value}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
