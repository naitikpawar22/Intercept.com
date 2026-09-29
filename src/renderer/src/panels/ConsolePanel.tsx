import React, { useState } from 'react';
import { Trash2, Search, Filter, AlertCircle, AlertTriangle, Info, Terminal, Copy, Check } from 'lucide-react';
import { ConsoleEntry } from '../types';

interface ConsolePanelProps {
  entries: ConsoleEntry[];
  onClear: () => void;
}

export const ConsolePanel: React.FC<ConsolePanelProps> = ({ entries, onClear }) => {
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);

  const filtered = entries.filter((e) => {
    if (levelFilter !== 'all' && e.level !== levelFilter) return false;
    if (search.trim() && !e.text.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const copyAll = () => {
    const text = filtered.map(e => `[${e.level.toUpperCase()}] ${e.text} (${e.url || 'inline'}:${e.line || 0})`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="h-full flex flex-col bg-[#14151b] text-slate-200 select-none">
      {/* Console Toolbar */}
      <div className="h-9 bg-[#181922] border-b border-[#262835] flex items-center px-3 gap-2 text-xs">
        <button
          onClick={onClear}
          className="p-1 rounded hover:bg-[#262835] text-slate-400 hover:text-slate-200 transition-colors"
          title="Clear console"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-[#2c2f3d] mx-1" />

        <div className="flex items-center gap-1">
          {['all', 'error', 'warn', 'info', 'log'].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLevelFilter(lvl)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize transition-colors ${
                levelFilter === lvl
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#1f212a] text-slate-400 hover:text-slate-200'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-[#2c2f3d] mx-1" />

        <div className="flex-1 flex items-center max-w-xs relative">
          <Search className="w-3 h-3 text-slate-500 absolute left-2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter console..."
            className="w-full bg-[#1b1c25] border border-[#2b2e3c] rounded pl-7 pr-2 py-0.5 text-xs text-slate-200 outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex-1" />

        <button
          onClick={copyAll}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded hover:bg-[#20222d] transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Copy All'}</span>
        </button>
      </div>

      {/* Console Messages List */}
      <div className="flex-1 overflow-auto font-mono text-xs divide-y divide-[#1e202c]">
        {filtered.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500 text-xs">
            <Terminal className="w-8 h-8 opacity-25 mr-2" />
            <span>No console messages captured yet.</span>
          </div>
        ) : (
          filtered.map((entry) => {
            const isError = entry.level === 'error';
            const isWarn = entry.level === 'warn';
            const isInfo = entry.level === 'info';

            return (
              <div
                key={entry.id}
                className={`py-1.5 px-3 flex items-start gap-2 ${
                  isError
                    ? 'bg-red-950/20 text-red-300'
                    : isWarn
                    ? 'bg-amber-950/20 text-amber-300'
                    : 'text-slate-200 hover:bg-[#1a1c26]'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {isError && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                  {isWarn && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                  {isInfo && <Info className="w-3.5 h-3.5 text-blue-400" />}
                  {!isError && !isWarn && !isInfo && <span className="text-slate-500 font-bold">&gt;</span>}
                </div>

                <div className="flex-1 break-all whitespace-pre-wrap">{entry.text}</div>

                {entry.url && (
                  <div className="text-[10px] text-slate-500 hover:underline shrink-0 truncate max-w-xs font-sans">
                    {entry.url.split('/').pop()}:{entry.line}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
