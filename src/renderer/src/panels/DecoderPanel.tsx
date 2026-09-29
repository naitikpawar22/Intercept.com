import React, { useState } from 'react';
import { Copy, Trash2, ArrowRightLeft, Check, Sparkles } from 'lucide-react';

export const DecoderPanel: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [copied, setCopied] = useState(false);

  const handleUrlEncode = () => {
    setOutputText(encodeURIComponent(inputText));
  };

  const handleUrlDecode = () => {
    try {
      setOutputText(decodeURIComponent(inputText));
    } catch (e: any) {
      setOutputText(`Error decoding URL: ${e.message}`);
    }
  };

  const handleBase64Encode = () => {
    try {
      setOutputText(btoa(unescape(encodeURIComponent(inputText))));
    } catch (e: any) {
      setOutputText(`Error Base64 encoding: ${e.message}`);
    }
  };

  const handleBase64Decode = () => {
    try {
      setOutputText(decodeURIComponent(escape(atob(inputText))));
    } catch (e: any) {
      setOutputText(`Error Base64 decoding: ${e.message}`);
    }
  };

  const handleHexEncode = () => {
    let hex = '';
    for (let i = 0; i < inputText.length; i++) {
      hex += inputText.charCodeAt(i).toString(16).padStart(2, '0');
    }
    setOutputText(hex);
  };

  const handleHexDecode = () => {
    try {
      const cleanHex = inputText.replace(/[^0-9a-fA-F]/g, '');
      let str = '';
      for (let i = 0; i < cleanHex.length; i += 2) {
        str += String.fromCharCode(parseInt(cleanHex.substring(i, i + 2), 16));
      }
      setOutputText(str);
    } catch (e: any) {
      setOutputText(`Error Hex decoding: ${e.message}`);
    }
  };

  const handleHtmlEncode = () => {
    const el = document.createElement('div');
    el.innerText = inputText;
    setOutputText(el.innerHTML);
  };

  const handleHtmlDecode = () => {
    const el = document.createElement('textarea');
    el.innerHTML = inputText;
    setOutputText(el.value);
  };

  const handleJsonFormat = () => {
    try {
      setOutputText(JSON.stringify(JSON.parse(inputText), null, 2));
    } catch (e: any) {
      setOutputText(`Invalid JSON: ${e.message}`);
    }
  };

  const handleJsonMinify = () => {
    try {
      setOutputText(JSON.stringify(JSON.parse(inputText)));
    } catch (e: any) {
      setOutputText(`Invalid JSON: ${e.message}`);
    }
  };

  const handleHash = async (algo: 'SHA-1' | 'SHA-256') => {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(inputText);
      const hashBuffer = await crypto.subtle.digest(algo, data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      setOutputText(hashHex);
    } catch (e: any) {
      setOutputText(`Error calculating hash: ${e.message}`);
    }
  };

  const swapText = () => {
    setInputText(outputText);
    setOutputText(inputText);
  };

  const copyOutput = () => {
    navigator.clipboard.writeText(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const clearAll = () => {
    setInputText('');
    setOutputText('');
  };

  return (
    <div className="h-full flex flex-col bg-[#14151b] text-slate-200 select-none p-3 space-y-3 font-sans">
      {/* Transformation Operations Buttons */}
      <div className="bg-[#181922] border border-[#272938] rounded-lg p-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-400 font-bold mr-2 text-[11px] uppercase tracking-wider">Transform:</span>

        {/* URL */}
        <button onClick={handleUrlEncode} className="px-2.5 py-1 bg-[#20222d] hover:bg-[#282a39] border border-[#2c2f3e] rounded text-slate-300">
          URL Encode
        </button>
        <button onClick={handleUrlDecode} className="px-2.5 py-1 bg-[#20222d] hover:bg-[#282a39] border border-[#2c2f3e] rounded text-slate-300">
          URL Decode
        </button>

        {/* Base64 */}
        <button onClick={handleBase64Encode} className="px-2.5 py-1 bg-[#20222d] hover:bg-[#282a39] border border-[#2c2f3e] rounded text-blue-300">
          Base64 Encode
        </button>
        <button onClick={handleBase64Decode} className="px-2.5 py-1 bg-[#20222d] hover:bg-[#282a39] border border-[#2c2f3e] rounded text-blue-300">
          Base64 Decode
        </button>

        {/* Hex */}
        <button onClick={handleHexEncode} className="px-2.5 py-1 bg-[#20222d] hover:bg-[#282a39] border border-[#2c2f3e] rounded text-emerald-300">
          Hex Encode
        </button>
        <button onClick={handleHexDecode} className="px-2.5 py-1 bg-[#20222d] hover:bg-[#282a39] border border-[#2c2f3e] rounded text-emerald-300">
          Hex Decode
        </button>

        {/* HTML */}
        <button onClick={handleHtmlEncode} className="px-2.5 py-1 bg-[#20222d] hover:bg-[#282a39] border border-[#2c2f3e] rounded text-amber-300">
          HTML Encode
        </button>
        <button onClick={handleHtmlDecode} className="px-2.5 py-1 bg-[#20222d] hover:bg-[#282a39] border border-[#2c2f3e] rounded text-amber-300">
          HTML Decode
        </button>

        {/* JSON */}
        <button onClick={handleJsonFormat} className="px-2.5 py-1 bg-[#20222d] hover:bg-[#282a39] border border-[#2c2f3e] rounded text-purple-300">
          Format JSON
        </button>
        <button onClick={handleJsonMinify} className="px-2.5 py-1 bg-[#20222d] hover:bg-[#282a39] border border-[#2c2f3e] rounded text-purple-300">
          Minify JSON
        </button>

        {/* Hashing */}
        <button onClick={() => handleHash('SHA-256')} className="px-2.5 py-1 bg-[#20222d] hover:bg-[#282a39] border border-[#2c2f3e] rounded text-red-300">
          SHA-256
        </button>
        <button onClick={() => handleHash('SHA-1')} className="px-2.5 py-1 bg-[#20222d] hover:bg-[#282a39] border border-[#2c2f3e] rounded text-red-300">
          SHA-1
        </button>

        <div className="flex-1" />

        <button onClick={swapText} title="Swap input and output" className="p-1 hover:bg-[#282a39] rounded text-slate-400 hover:text-slate-200">
          <ArrowRightLeft className="w-3.5 h-3.5" />
        </button>
        <button onClick={clearAll} title="Clear text" className="p-1 hover:bg-[#282a39] rounded text-slate-400 hover:text-red-400">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Split Input & Output Editor */}
      <div className="flex-1 flex gap-3 overflow-hidden">
        {/* Input */}
        <div className="w-1/2 flex flex-col space-y-1">
          <span className="text-slate-400 text-xs font-medium">Input String:</span>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type or paste payload here..."
            className="flex-1 w-full bg-[#181922] border border-[#282a38] rounded-md p-3 text-slate-200 font-mono text-xs outline-none focus:border-blue-500 resize-none"
          />
        </div>

        {/* Output */}
        <div className="w-1/2 flex flex-col space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-medium">Decoded / Transformed Result:</span>
            <button
              onClick={copyOutput}
              className="flex items-center gap-1 text-[11px] text-blue-400 hover:underline"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy Result'}</span>
            </button>
          </div>
          <textarea
            readOnly
            value={outputText}
            placeholder="Result will appear here..."
            className="flex-1 w-full bg-[#181922] border border-[#282a38] rounded-md p-3 text-slate-200 font-mono text-xs outline-none resize-none"
          />
        </div>
      </div>
    </div>
  );
};
