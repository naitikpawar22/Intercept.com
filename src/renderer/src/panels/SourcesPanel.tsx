import React, { useState, useEffect } from 'react';
import { FileCode, RefreshCw, Copy, Check } from 'lucide-react';

export const SourcesPanel: React.FC = () => {
  const [scripts, setScripts] = useState<any[]>([]);
  const [selectedScript, setSelectedScript] = useState<any | null>(null);
  const [sourceCode, setSourceCode] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchScripts = async () => {
    setIsLoading(true);
    try {
      if (window.netscope?.cdp) {
        const list = await window.netscope.cdp.getScripts();
        setScripts(list || []);
        if (list && list.length > 0 && !selectedScript) {
          handleSelectScript(list[0]);
        }
      }
    } catch (e) {
      console.error('Failed to get scripts:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectScript = async (script: any) => {
    setSelectedScript(script);
    if (window.netscope?.cdp) {
      const src = await window.netscope.cdp.getScriptSource(script.scriptId);
      setSourceCode(src || '// Script source not available');
    }
  };

  useEffect(() => {
    fetchScripts();
  }, []);

  const copySource = () => {
    navigator.clipboard.writeText(sourceCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="h-full flex flex-col bg-[#14151b] text-slate-200 select-none">
      {/* Sources Toolbar */}
      <div className="h-9 bg-[#181922] border-b border-[#262835] flex items-center px-3 gap-2 text-xs">
        <button
          onClick={fetchScripts}
          className="flex items-center gap-1 px-2.5 py-0.5 bg-[#20222d] hover:bg-[#282a38] border border-[#2d3040] rounded text-slate-300 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Scripts</span>
        </button>

        {selectedScript && (
          <button
            onClick={copySource}
            className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-slate-400 hover:text-slate-200"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Copy Source'}</span>
          </button>
        )}

        <div className="flex-1" />
        <span className="text-[11px] text-slate-500 font-sans">
          {scripts.length} loaded scripts detected
        </span>
      </div>

      {/* Split: Scripts List and Source Code */}
      <div className="flex-1 flex overflow-hidden">
        {/* Scripts Tree / List */}
        <div className="w-1/3 border-r border-[#262835] p-2 overflow-auto font-mono text-xs space-y-1">
          {scripts.length === 0 ? (
            <div className="p-4 text-center text-slate-500 font-sans text-xs">
              No JavaScript scripts captured yet. Navigate to any website above.
            </div>
          ) : (
            scripts.map((s, idx) => {
              const isSelected = selectedScript?.scriptId === s.scriptId;
              const name = s.url ? s.url.split('/').pop() : `inline-script-${s.scriptId}.js`;

              return (
                <div
                  key={s.scriptId || idx}
                  onClick={() => handleSelectScript(s)}
                  className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-900/40 text-blue-200 font-semibold' : 'hover:bg-[#1c1d27] text-slate-400'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate flex-1" title={s.url || 'Inline script'}>
                    {name || 'script.js'}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Source Code Viewer */}
        <div className="w-2/3 flex flex-col p-3 overflow-hidden bg-[#13141a]">
          <div className="text-slate-400 font-mono text-xs mb-2 truncate">
            {selectedScript?.url || 'Inline Script'}
          </div>
          <textarea
            readOnly
            value={sourceCode}
            className="flex-1 w-full bg-[#181922] border border-[#272938] rounded p-3 text-slate-200 font-mono text-xs outline-none resize-none overflow-auto"
          />
        </div>
      </div>
    </div>
  );
};
