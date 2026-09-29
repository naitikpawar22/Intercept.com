import React from 'react';
import { Plus, X, Globe, Loader2, Trash2 } from 'lucide-react';
import { BrowserTab } from '../types';

interface TabBarProps {
  tabs: BrowserTab[];
  activeTabId: string | null;
  onSwitchTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onCreateTab: () => void;
  onClearSession: () => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onSwitchTab,
  onCloseTab,
  onCreateTab,
  onClearSession
}) => {
  return (
    <div className="h-8 bg-[#13141a] border-b border-[#232530] flex items-center px-2 select-none justify-between">
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 max-w-4xl">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => onSwitchTab(tab.id)}
              className={`group flex items-center gap-2 px-3 py-1 text-xs rounded-t cursor-pointer max-w-[200px] border-t border-x transition-colors ${
                isActive
                  ? 'bg-[#181920] border-[#2d303e] text-slate-100 font-medium'
                  : 'bg-[#121318] border-transparent text-slate-400 hover:bg-[#161720] hover:text-slate-300'
              }`}
            >
              {tab.isLoading ? (
                <Loader2 className="w-3 h-3 text-blue-400 animate-spin shrink-0" />
              ) : tab.favicon ? (
                <img src={tab.favicon} alt="" className="w-3.5 h-3.5 shrink-0 object-contain" />
              ) : (
                <Globe className="w-3 h-3 text-slate-500 shrink-0" />
              )}

              <span className="truncate flex-1 text-[11px]">
                {tab.title || tab.url || 'New Tab'}
              </span>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                className="opacity-0 group-hover:opacity-100 hover:bg-[#2c2f3d] p-0.5 rounded text-slate-400 hover:text-slate-200 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        <button
          onClick={onCreateTab}
          title="New Tab (Ctrl+Shift+N)"
          className="p-1 rounded hover:bg-[#232530] text-slate-400 hover:text-slate-200 transition-colors ml-1"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onClearSession}
          title="Clear browsing cookies & storage"
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-400 px-2 py-0.5 rounded hover:bg-[#20222c] transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          <span>Clear Data</span>
        </button>
      </div>
    </div>
  );
};
