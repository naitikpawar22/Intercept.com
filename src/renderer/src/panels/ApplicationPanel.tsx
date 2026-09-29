import React, { useState, useEffect } from 'react';
import { Database, Trash2, RefreshCw, Cookie, HardDrive } from 'lucide-react';

interface ApplicationPanelProps {
  currentUrl?: string;
}

export const ApplicationPanel: React.FC<ApplicationPanelProps> = ({ currentUrl }) => {
  const [activeSection, setActiveSection] = useState<'cookies' | 'localStorage' | 'sessionStorage'>('cookies');
  const [cookies, setCookies] = useState<any[]>([]);
  const [storageItems, setStorageItems] = useState<{ localStorage: any[]; sessionStorage: any[] }>({
    localStorage: [],
    sessionStorage: []
  });
  const [isLoading, setIsLoading] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      if (window.netscope?.cdp) {
        const cks = await window.netscope.cdp.getCookies(currentUrl);
        setCookies(cks || []);
        if (currentUrl && !currentUrl.startsWith('about:')) {
          const st = await window.netscope.cdp.getStorage(currentUrl);
          setStorageItems(st || { localStorage: [], sessionStorage: [] });
        }
      }
    } catch (e) {
      console.error('Failed to get application storage:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentUrl]);

  const handleClearCookies = async () => {
    if (confirm('Clear all cookies for current site?')) {
      if (window.netscope?.cdp) {
        await window.netscope.cdp.clearCookies();
        fetchData();
      }
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#14151b] text-slate-200 select-none">
      {/* Application Toolbar */}
      <div className="h-9 bg-[#181922] border-b border-[#262835] flex items-center px-3 gap-2 text-xs">
        <button
          onClick={fetchData}
          className="flex items-center gap-1 px-2.5 py-0.5 bg-[#20222d] hover:bg-[#282a38] border border-[#2d3040] rounded text-slate-300 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>

        <button
          onClick={handleClearCookies}
          className="flex items-center gap-1 px-2.5 py-0.5 bg-[#22242f] hover:bg-[#2c2f3d] border border-[#313545] rounded text-slate-300 hover:text-red-400 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          <span>Clear Cookies</span>
        </button>

        <div className="flex-1" />
        <span className="text-[11px] text-slate-500 font-sans">Website Storage Inspector</span>
      </div>

      {/* Split: Section Navigator and Data Table */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <div className="w-48 border-r border-[#262835] p-2 space-y-1 bg-[#161720] text-xs font-medium">
          <button
            onClick={() => setActiveSection('cookies')}
            className={`w-full flex items-center gap-2 px-3 py-1.5 rounded transition-colors ${
              activeSection === 'cookies' ? 'bg-blue-600 text-white' : 'hover:bg-[#20222d] text-slate-400'
            }`}
          >
            <Cookie className="w-3.5 h-3.5" />
            <span>Cookies ({cookies.length})</span>
          </button>

          <button
            onClick={() => setActiveSection('localStorage')}
            className={`w-full flex items-center gap-2 px-3 py-1.5 rounded transition-colors ${
              activeSection === 'localStorage' ? 'bg-blue-600 text-white' : 'hover:bg-[#20222d] text-slate-400'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Local Storage</span>
          </button>

          <button
            onClick={() => setActiveSection('sessionStorage')}
            className={`w-full flex items-center gap-2 px-3 py-1.5 rounded transition-colors ${
              activeSection === 'sessionStorage' ? 'bg-blue-600 text-white' : 'hover:bg-[#20222d] text-slate-400'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Session Storage</span>
          </button>
        </div>

        {/* Content Table */}
        <div className="flex-1 overflow-auto p-3 font-mono text-xs">
          {activeSection === 'cookies' && (
            <table className="w-full text-left border-collapse">
              <thead className="border-b border-[#292b3a] text-slate-400 text-[11px]">
                <tr>
                  <th className="py-1 px-2">Name</th>
                  <th className="py-1 px-2">Value</th>
                  <th className="py-1 px-2">Domain</th>
                  <th className="py-1 px-2">Path</th>
                  <th className="py-1 px-2">HttpOnly</th>
                  <th className="py-1 px-2">Secure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#20222d]">
                {cookies.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 font-sans text-xs">
                      No cookies found for current website.
                    </td>
                  </tr>
                ) : (
                  cookies.map((c, idx) => (
                    <tr key={idx} className="hover:bg-[#1a1b24]">
                      <td className="py-1 px-2 font-bold text-blue-300">{c.name}</td>
                      <td className="py-1 px-2 text-slate-300 truncate max-w-xs" title={c.value}>{c.value}</td>
                      <td className="py-1 px-2 text-slate-400">{c.domain}</td>
                      <td className="py-1 px-2 text-slate-400">{c.path}</td>
                      <td className="py-1 px-2 text-slate-400">{c.httpOnly ? 'Yes' : 'No'}</td>
                      <td className="py-1 px-2 text-slate-400">{c.secure ? 'Yes' : 'No'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeSection === 'localStorage' && (
            <div className="space-y-2">
              <div className="text-slate-400 text-xs font-sans font-bold">LocalStorage Entries:</div>
              {storageItems.localStorage.length === 0 ? (
                <div className="text-slate-500 font-sans text-xs italic py-4">No LocalStorage items.</div>
              ) : (
                <div className="space-y-1">
                  {storageItems.localStorage.map(([key, val], idx) => (
                    <div key={idx} className="flex p-2 bg-[#181922] border border-[#272938] rounded">
                      <span className="w-48 text-blue-300 font-bold shrink-0">{key}:</span>
                      <span className="text-slate-300 break-all">{val}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSection === 'sessionStorage' && (
            <div className="space-y-2">
              <div className="text-slate-400 text-xs font-sans font-bold">SessionStorage Entries:</div>
              {storageItems.sessionStorage.length === 0 ? (
                <div className="text-slate-500 font-sans text-xs italic py-4">No SessionStorage items.</div>
              ) : (
                <div className="space-y-1">
                  {storageItems.sessionStorage.map(([key, val], idx) => (
                    <div key={idx} className="flex p-2 bg-[#181922] border border-[#272938] rounded">
                      <span className="w-48 text-blue-300 font-bold shrink-0">{key}:</span>
                      <span className="text-slate-300 break-all">{val}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
