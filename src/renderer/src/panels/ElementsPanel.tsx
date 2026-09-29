import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, RefreshCw, Copy, Check, Code, Layers } from 'lucide-react';

interface DomNode {
  nodeId: number;
  backendNodeId: number;
  nodeType: number;
  nodeName: string;
  localName?: string;
  nodeValue?: string;
  attributes?: string[];
  children?: DomNode[];
  childNodeCount?: number;
}

export const ElementsPanel: React.FC = () => {
  const [rootNode, setRootNode] = useState<DomNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<DomNode | null>(null);
  const [computedStyles, setComputedStyles] = useState<any[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetchDom = async () => {
    setIsLoading(true);
    try {
      if (window.netscope?.cdp) {
        const root = await window.netscope.cdp.getDomTree();
        if (root) {
          setRootNode(root);
          // auto expand html and body
          const initialSet = new Set<number>();
          initialSet.add(root.nodeId);
          if (root.children) {
            root.children.forEach((c: any) => initialSet.add(c.nodeId));
          }
          setExpandedNodes(initialSet);
        }
      }
    } catch (e) {
      console.error('Failed to get DOM tree:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDom();
  }, []);

  const toggleExpand = async (node: DomNode, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(expandedNodes);
    if (newSet.has(node.nodeId)) {
      newSet.delete(node.nodeId);
    } else {
      newSet.add(node.nodeId);
      if (window.netscope?.cdp && (!node.children || node.children.length === 0)) {
        await window.netscope.cdp.requestChildNodes(node.nodeId);
      }
    }
    setExpandedNodes(newSet);
  };

  const handleSelectNode = async (node: DomNode) => {
    setSelectedNode(node);
    if (window.netscope?.cdp) {
      const styles = await window.netscope.cdp.getComputedStyle(node.nodeId);
      setComputedStyles(styles || []);
    }
  };

  const copySelector = () => {
    if (!selectedNode) return;
    const name = selectedNode.localName || selectedNode.nodeName.toLowerCase();
    navigator.clipboard.writeText(name);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const renderAttributes = (attrs?: string[]) => {
    if (!attrs || attrs.length === 0) return null;
    const pairs: { name: string; val: string }[] = [];
    for (let i = 0; i < attrs.length; i += 2) {
      pairs.push({ name: attrs[i], val: attrs[i + 1] });
    }
    return pairs.map((p, idx) => (
      <span key={idx} className="ml-1.5">
        <span className="text-amber-400">{p.name}</span>=
        <span className="text-emerald-300">"{p.val}"</span>
      </span>
    ));
  };

  const renderTree = (node: DomNode, depth: number = 0) => {
    if (node.nodeType === 3) {
      // Text node
      const val = node.nodeValue?.trim();
      if (!val) return null;
      return (
        <div key={node.nodeId} style={{ paddingLeft: `${depth * 14}px` }} className="text-slate-400 py-0.5">
          "{val}"
        </div>
      );
    }

    const hasChildren = (node.children && node.children.length > 0) || (node.childNodeCount || 0) > 0;
    const isExpanded = expandedNodes.has(node.nodeId);
    const isSelected = selectedNode?.nodeId === node.nodeId;
    const tagName = (node.localName || node.nodeName).toLowerCase();

    return (
      <div key={node.nodeId}>
        <div
          onClick={() => handleSelectNode(node)}
          style={{ paddingLeft: `${depth * 14}px` }}
          className={`flex items-center py-0.5 px-1 rounded cursor-pointer text-xs font-mono transition-colors ${
            isSelected ? 'bg-blue-900/40 text-blue-200' : 'hover:bg-[#1a1b26] text-slate-300'
          }`}
        >
          {hasChildren ? (
            <button onClick={(e) => toggleExpand(node, e)} className="p-0.5 mr-0.5 text-slate-500 hover:text-slate-200">
              {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          ) : (
            <span className="w-4" />
          )}

          <span className="text-blue-400 font-semibold">&lt;{tagName}</span>
          {renderAttributes(node.attributes)}
          <span className="text-blue-400 font-semibold">&gt;</span>

          {!isExpanded && hasChildren && (
            <span className="text-slate-500 text-[11px] ml-1">... &lt;/{tagName}&gt;</span>
          )}
        </div>

        {isExpanded && node.children && (
          <div>
            {node.children.map((child) => renderTree(child, depth + 1))}
            <div
              style={{ paddingLeft: `${depth * 14 + 16}px` }}
              className="text-blue-400 font-semibold text-xs font-mono py-0.5"
            >
              &lt;/{tagName}&gt;
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#14151b] text-slate-200 select-none">
      {/* Elements Toolbar */}
      <div className="h-9 bg-[#181922] border-b border-[#262835] flex items-center px-3 gap-2 text-xs">
        <button
          onClick={fetchDom}
          className="flex items-center gap-1 px-2.5 py-0.5 bg-[#20222d] hover:bg-[#282a38] border border-[#2d3040] rounded text-slate-300 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh DOM</span>
        </button>

        {selectedNode && (
          <button
            onClick={copySelector}
            className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-slate-400 hover:text-slate-200"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Copy Tag'}</span>
          </button>
        )}

        <div className="flex-1" />
        <span className="text-[11px] text-slate-500 font-sans">Live Chromium DOM Inspector</span>
      </div>

      {/* Split: DOM Tree and Computed Styles */}
      <div className="flex-1 flex overflow-hidden">
        {/* DOM Tree View */}
        <div className="w-2/3 border-r border-[#262835] p-3 overflow-auto font-mono text-xs">
          {rootNode ? (
            renderTree(rootNode)
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500 text-xs">
              <Layers className="w-8 h-8 opacity-25 mr-2" />
              <span>Click "Refresh DOM" to inspect embedded page structure.</span>
            </div>
          )}
        </div>

        {/* Selected Element Styles Inspector */}
        <div className="w-1/3 flex flex-col p-3 overflow-auto bg-[#161720]">
          <h4 className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-2 font-sans">
            Computed CSS Styles {selectedNode && `(<${(selectedNode.localName || selectedNode.nodeName).toLowerCase()}>)`}
          </h4>

          {computedStyles.length > 0 ? (
            <div className="space-y-1 font-mono text-[11px]">
              {computedStyles.slice(0, 50).map((style: any, idx: number) => (
                <div key={idx} className="flex justify-between py-0.5 border-b border-[#212330]">
                  <span className="text-blue-300 truncate w-36">{style.name}:</span>
                  <span className="text-slate-300 truncate text-right flex-1">{style.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-slate-500 text-xs italic mt-4">
              Select any DOM node to inspect its computed styles.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
