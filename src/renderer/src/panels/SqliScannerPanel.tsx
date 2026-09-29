import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, ShieldCheck, Play, Square, RefreshCw, Trash2, 
  Download, AlertTriangle, CheckCircle, HelpCircle, Database, 
  Settings, ChevronRight, Eye, Code, Search, ArrowRight, X, FileText,
  Sparkles, KeyRound, Clock, Activity, SplitSquareVertical, Columns,
  Maximize2, Minimize2, Plus, Clipboard, Globe, Lock, Filter, ExternalLink,
  Cpu, FileCode, Users, Terminal, Check
} from 'lucide-react';
import { NetworkFlow } from '../types';

export interface ScanParameter {
  name: string;
  location: 'query' | 'body_form' | 'body_json' | 'header';
  originalValue: string;
  dataType: 'string' | 'number' | 'boolean' | 'json' | 'array';
  selected: boolean;
  status: 'pending' | 'testing' | 'completed' | 'skipped';
  testCount: number;
  isAuthField?: boolean;
  authFieldType?: 'email' | 'username' | 'password' | 'none';
}

export type SqliFindingClassification = 
  | 'Potential SQL Injection'
  | 'Database Error Detected'
  | 'Boolean-Based Behavior Detected'
  | 'Time-Based Behavior Detected'
  | 'Possible Data Exposure'
  | 'Source Code Risk Detected'
  | 'Inconclusive'
  | 'No Issue Detected';

export interface SqliScanReport {
  id: string;
  project_id?: string;
  target_url: string;
  method: string;
  param_name: string;
  param_location: 'query' | 'body_form' | 'body_json' | 'header';
  finding: SqliFindingClassification;
  confidence: 'High' | 'Medium' | 'Low' | 'Informational';
  verification_status?: 'Confirmed' | 'Suspected' | 'Inconclusive' | 'Safe';
  test_mode: 'active' | 'passive';
  test_category?: string;
  db_fingerprint?: string;
  requests_sent: number;
  duration_ms: number;
  response_difference?: {
    statusDivergence?: boolean;
    baselineStatus?: number;
    testStatus?: number;
    lengthDifference?: number;
    normalizedSimilarity?: number;
    structuralShift?: boolean;
    divergenceDetails?: string[];
  };
  timing_evidence?: {
    baselineLatencyMs?: number;
    testLatencyMs?: number;
    deltaMs?: number;
    repeatedLatencyMs?: number;
    isTimingAnomaly?: boolean;
    description?: string;
  };
  safe_verification?: {
    stoppedEarly?: boolean;
    confirmedPhase?: string;
    reason?: string;
    dataExtractionAttempted?: boolean;
  };
  evidence: Array<{
    probe?: string;
    description: string;
    matchedPattern?: string;
    snippet?: string;
    canaryObserved?: string;
  }>;
  remediation?: string;
  risk_assessment?: {
    technicalImpact: string;
    parameterized: boolean;
    errorsExposed: boolean;
    boundaryCrossed: boolean;
  };
  original_request?: any;
  test_request?: any;
  test_response?: any;
  timestamp: number;
}

interface SqliScannerPanelProps {
  flows: NetworkFlow[];
  currentUrl?: string;
  isBrowserVisible?: boolean;
  onToggleBrowserView?: () => void;
}

export const SqliScannerPanel: React.FC<SqliScannerPanelProps> = ({ 
  flows, 
  currentUrl,
  isBrowserVisible,
  onToggleBrowserView
}) => {
  // Navigation tabs inside advanced platform
  const [activeTab, setActiveTab] = useState<'scanner' | 'fingerprint' | 'exposure' | 'source_code' | 'remediation' | 'history' | 'settings'>('scanner');

  // Selected Request for Scanning
  const [selectedFlowId, setSelectedFlowId] = useState<string>('');
  const [targetReq, setTargetReq] = useState<{
    url: string;
    method: string;
    headers: Record<string, string>;
    body_text?: string;
    content_type?: string;
    original_response?: { status: number; headers: Record<string, string>; body: string };
  }>({
    url: currentUrl || 'http://127.0.0.1:4000/api/get?testParam=123',
    method: 'GET',
    headers: {},
    body_text: ''
  });

  // Parameters detected / configured
  const [params, setParams] = useState<ScanParameter[]>([]);
  const [showAddParam, setShowAddParam] = useState(false);
  const [newParamName, setNewParamName] = useState('');
  const [newParamValue, setNewParamValue] = useState('');
  const [newParamLocation, setNewParamLocation] = useState<'query' | 'body_form' | 'body_json'>('body_form');

  // Filter for outcomes list
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'confirmed' | 'suspected' | 'safe'>('all');

  // Scan state
  const [isScanning, setIsScanning] = useState(false);
  const [isAutoScanning, setIsAutoScanning] = useState(false);
  const [currentScanId, setCurrentScanId] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<{
    paramName: string;
    totalParams: number;
    currentParamIndex: number;
    requestsSent: number;
    status: string;
  }>({ paramName: '', totalParams: 0, currentParamIndex: 0, requestsSent: 0, status: 'idle' });

  // Scan settings
  const [settings, setSettings] = useState<{
    authorizedHost: string;
    maxRequestsPerParam: number;
    requestTimeoutMs: number;
    delayBetweenRequestsMs: number;
    maxScanDurationMs: number;
    enabledCategories: Array<'error' | 'boolean' | 'union' | 'time' | 'blind' | 'second_order' | 'data_exposure'>;
    syntheticCanaryMode: boolean;
    safeVerificationMode: boolean;
    testMode: 'active' | 'passive';
    requireConfirmation: boolean;
  }>({
    authorizedHost: '127.0.0.1',
    maxRequestsPerParam: 4,
    requestTimeoutMs: 8000,
    delayBetweenRequestsMs: 150,
    maxScanDurationMs: 60000,
    enabledCategories: ['error', 'boolean', 'union', 'time'],
    syntheticCanaryMode: true,
    safeVerificationMode: true,
    testMode: 'active',
    requireConfirmation: true
  });

  // Results & Reports
  const [latestReports, setLatestReports] = useState<SqliScanReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<SqliScanReport | null>(null);
  const [historyReports, setHistoryReports] = useState<SqliScanReport[]>([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [comparisonLayout, setComparisonLayout] = useState<'quad' | 'tabs'>('quad');
  const [activeComparisonTab, setActiveComparisonTab] = useState<'orig_req' | 'test_req' | 'orig_res' | 'test_res'>('test_res');
  const [normalizeDynamic, setNormalizeDynamic] = useState<boolean>(true);

  // Database Fingerprint state
  const [dbFingerprintResult, setDbFingerprintResult] = useState<any>(null);
  const [isFingerprinting, setIsFingerprinting] = useState(false);

  // Data Exposure state
  const [dataExposureResult, setDataExposureResult] = useState<any>(null);
  const [isVerifyingExposure, setIsVerifyingExposure] = useState(false);

  // Source Code Analysis state
  const [sourceCodeSnippet, setSourceCodeSnippet] = useState<string>(
    `// Unsafe Backend Query Example\nconst id = req.query.id;\nconst query = \`SELECT * FROM users WHERE id = '\${id}'\`;\ndb.all(query, (err, rows) => { ... });`
  );
  const [sourceRisks, setSourceRisks] = useState<any[]>([]);
  const [isScanningCode, setIsScanningCode] = useState(false);

  // Helper to extract and update authorized host whenever URL changes
  const updateUrlAndHost = (newUrl: string) => {
    let cleanUrl = newUrl.trim();
    if (cleanUrl && !cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'http://' + cleanUrl;
    }

    try {
      const parsed = new URL(cleanUrl);
      setSettings(prev => ({ ...prev, authorizedHost: parsed.hostname }));
    } catch {}

    setTargetReq(prev => ({ ...prev, url: cleanUrl }));
  };

  const isLoginEndpoint = (urlStr: string) => {
    return /login|signin|admin|auth|account|session/i.test(urlStr);
  };

  const createDefaultAuthParams = (isForm: boolean = true): ScanParameter[] => [
    {
      name: 'email',
      location: isForm ? 'body_form' : 'query',
      originalValue: 'admin@example.com',
      dataType: 'string',
      selected: true,
      status: 'pending',
      testCount: 0,
      isAuthField: true,
      authFieldType: 'email'
    },
    {
      name: 'password',
      location: isForm ? 'body_form' : 'query',
      originalValue: 'admin123',
      dataType: 'string',
      selected: true,
      status: 'pending',
      testCount: 0,
      isAuthField: true,
      authFieldType: 'password'
    }
  ];

  // Load parameter list whenever targetReq changes
  useEffect(() => {
    if (window.netscope?.sqli) {
      window.netscope.sqli.extractParams(targetReq).then((extracted: ScanParameter[]) => {
        if (!extracted || extracted.length === 0) {
          if (isLoginEndpoint(targetReq.url)) {
            const authDefaults = createDefaultAuthParams(targetReq.method !== 'GET');
            setParams(authDefaults);
          } else {
            setParams([]);
          }
          return;
        }

        const hasAuth = extracted.some(p => p.isAuthField);
        if (hasAuth) {
          setParams(extracted.map(p => ({
            ...p,
            selected: Boolean(p.isAuthField)
          })));
        } else {
          setParams(extracted.map(p => ({
            ...p,
            selected: true
          })));
        }
      });
    }
  }, [targetReq.url, targetReq.body_text, targetReq.method]);

  // Load history reports
  const loadReports = async () => {
    if (window.netscope?.sqli) {
      try {
        const reps = await window.netscope.sqli.getReports(100);
        setHistoryReports(reps || []);
      } catch (err) {
        console.error('Failed to load SQLi reports:', err);
      }
    }
  };

  useEffect(() => {
    loadReports();

    let unsub: (() => void) | undefined;
    if (window.netscope?.sqli?.onProgress) {
      unsub = window.netscope.sqli.onProgress((data: any) => {
        setScanProgress({
          paramName: data.paramName || '',
          totalParams: data.totalParams || 0,
          currentParamIndex: data.currentParamIndex || 0,
          requestsSent: data.requestsSent || 0,
          status: data.status || 'running'
        });

        if (data.report) {
          setLatestReports(prev => {
            const exists = prev.some(r => r.id === data.report.id);
            if (exists) return prev;
            return [data.report, ...prev];
          });
          if (!selectedReport) {
            setSelectedReport(data.report);
          }
        }

        if (data.status === 'completed' || data.status === 'stopped' || data.status === 'error') {
          setIsScanning(false);
          setIsAutoScanning(false);
          setCurrentScanId(null);
          loadReports();
        }
      });
    }

    return () => {
      if (unsub) unsub();
    };
  }, []);

  const handleSelectFlow = (flowId: string) => {
    setSelectedFlowId(flowId);
    const flow = flows.find(f => f.id === flowId);
    if (flow) {
      try {
        const parsed = new URL(flow.url);
        setSettings(prev => ({ ...prev, authorizedHost: parsed.hostname }));
      } catch {}

      setTargetReq({
        url: flow.url,
        method: flow.method,
        headers: flow.request_headers || {},
        body_text: flow.request_body,
        content_type: flow.request_headers ? flow.request_headers['content-type'] : undefined,
        original_response: flow.response_status ? {
          status: flow.response_status,
          headers: flow.response_headers || {},
          body: flow.response_body || ''
        } : undefined
      });
    }
  };

  const handleToggleParam = (name: string, location: string) => {
    setParams(prev => prev.map(p => {
      if (p.name === name && p.location === location) {
        return { ...p, selected: !p.selected };
      }
      return p;
    }));
  };

  const handleSelectAll = (select: boolean) => {
    setParams(prev => prev.map(p => ({ ...p, selected: select })));
  };

  const handleSelectAuthFieldsOnly = () => {
    const hasAuth = params.some(p => p.isAuthField);
    if (hasAuth) {
      setParams(prev => prev.map(p => ({
        ...p,
        selected: Boolean(p.isAuthField)
      })));
    } else {
      const defaults = createDefaultAuthParams(targetReq.method !== 'GET');
      setParams(defaults);
    }
  };

  const handleAddCustomParam = () => {
    if (!newParamName.trim()) return;
    const name = newParamName.trim();
    const val = newParamValue.trim() || 'test';
    const isEmail = /email|mail/i.test(name);
    const isPass = /pass|pwd|secret/i.test(name);
    const isUser = /user|login/i.test(name);

    const newParam: ScanParameter = {
      name,
      location: newParamLocation,
      originalValue: val,
      dataType: /^-?\d+$/.test(val) ? 'number' : 'string',
      selected: true,
      status: 'pending',
      testCount: 0,
      isAuthField: isEmail || isPass || isUser,
      authFieldType: isEmail ? 'email' : isPass ? 'password' : isUser ? 'username' : 'none'
    };

    setParams(prev => [...prev.filter(p => !(p.name === name && p.location === newParamLocation)), newParam]);
    setNewParamName('');
    setNewParamValue('');
    setShowAddParam(false);
  };

  const handleDeleteParam = (name: string, location: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setParams(prev => prev.filter(p => !(p.name === name && p.location === location)));
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        updateUrlAndHost(text);
      }
    } catch {
      const manual = prompt('Paste target URL to test:');
      if (manual) {
        updateUrlAndHost(manual);
      }
    }
  };

  const handleInitiateTest = () => {
    let selectedParams = params.filter(p => p.selected);
    if (selectedParams.length === 0) {
      const defaults = createDefaultAuthParams(targetReq.method !== 'GET');
      setParams(defaults);
      selectedParams = defaults;
    }

    if (settings.requireConfirmation && settings.testMode === 'active') {
      setShowConfirmModal(true);
    } else {
      executeActiveTest(selectedParams);
    }
  };

  const handleAutomaticSqliScan = () => {
    let targetsToSelect = params.map(p => ({ ...p, selected: true }));
    
    if (targetsToSelect.length === 0) {
      targetsToSelect = createDefaultAuthParams(targetReq.method !== 'GET');
    } else {
      const authParams = targetsToSelect.filter(p => p.isAuthField || /email|mail|pass|pwd|user/i.test(p.name));
      if (authParams.length > 0) {
        targetsToSelect = targetsToSelect.map(p => ({
          ...p,
          selected: Boolean(p.isAuthField || /email|mail|pass|pwd|user/i.test(p.name))
        }));
      }
    }

    setParams(targetsToSelect);
    setIsAutoScanning(true);

    const activeList = targetsToSelect.filter(p => p.selected);
    if (settings.requireConfirmation && settings.testMode === 'active') {
      setShowConfirmModal(true);
    } else {
      executeActiveTest(activeList);
    }
  };

  const executeActiveTest = async (overrideParams?: ScanParameter[]) => {
    setShowConfirmModal(false);
    let selectedParams = overrideParams || params.filter(p => p.selected);
    
    if (selectedParams.length === 0) {
      selectedParams = createDefaultAuthParams(targetReq.method !== 'GET');
      setParams(selectedParams);
    }

    setIsScanning(true);
    setLatestReports([]);
    setSelectedReport(null);

    let effectiveSettings = { ...settings };
    try {
      const parsed = new URL(targetReq.url);
      effectiveSettings.authorizedHost = parsed.hostname;
      setSettings(prev => ({ ...prev, authorizedHost: parsed.hostname }));
    } catch {}

    try {
      if (window.netscope?.sqli) {
        await window.netscope.sqli.startScan(targetReq, selectedParams, effectiveSettings);
      }
    } catch (err: any) {
      alert(`Scan failed: ${err.message}`);
      setIsScanning(false);
      setIsAutoScanning(false);
    }
  };

  const handleRunPassiveAnalysis = async () => {
    if (!targetReq.original_response) {
      alert('Passive analysis requires an intercepted response. Select an intercepted request that has already received a response.');
      return;
    }

    try {
      if (window.netscope?.sqli) {
        const rep = await window.netscope.sqli.passiveAnalyze({
          url: targetReq.url,
          method: targetReq.method,
          request_headers: targetReq.headers,
          request_body: targetReq.body_text,
          response_status: targetReq.original_response.status,
          response_headers: targetReq.original_response.headers,
          response_body: targetReq.original_response.body
        });

        setLatestReports([rep]);
        setSelectedReport(rep);
        loadReports();
      }
    } catch (err: any) {
      alert(`Passive analysis failed: ${err.message}`);
    }
  };

  const handleFingerprintDatabase = async () => {
    setIsFingerprinting(true);
    try {
      if (window.netscope?.sqli?.fingerprintDb) {
        const res = await window.netscope.sqli.fingerprintDb({
          body: targetReq.original_response?.body || selectedReport?.test_response?.body || '',
          headers: targetReq.original_response?.headers || {},
          status: targetReq.original_response?.status || 200
        });
        setDbFingerprintResult(res);
      }
    } catch (err: any) {
      alert(`Fingerprinting failed: ${err.message}`);
    } finally {
      setIsFingerprinting(false);
    }
  };

  const handleVerifyDataExposure = async () => {
    setIsVerifyingExposure(true);
    try {
      if (window.netscope?.sqli?.verifyDataExposure) {
        const res = await window.netscope.sqli.verifyDataExposure(targetReq);
        setDataExposureResult(res);
      }
    } catch (err: any) {
      alert(`Verification failed: ${err.message}`);
    } finally {
      setIsVerifyingExposure(false);
    }
  };

  const handleScanSourceCode = async () => {
    setIsScanningCode(true);
    try {
      if (window.netscope?.sqli?.scanSourceCode) {
        const risks = await window.netscope.sqli.scanSourceCode(sourceCodeSnippet);
        setSourceRisks(risks || []);
      }
    } catch (err: any) {
      alert(`Source scan failed: ${err.message}`);
    } finally {
      setIsScanningCode(false);
    }
  };

  const handleStopScan = () => {
    if (currentScanId && window.netscope?.sqli) {
      window.netscope.sqli.stopScan(currentScanId);
    }
    setIsScanning(false);
    setIsAutoScanning(false);
  };

  const handleDeleteReport = async (id: string) => {
    if (window.netscope?.sqli) {
      await window.netscope.sqli.deleteReport(id);
      if (selectedReport?.id === id) setSelectedReport(null);
      setLatestReports(prev => prev.filter(r => r.id !== id));
      loadReports();
    }
  };

  const handleClearReports = async () => {
    if (confirm('Clear all SQL injection scan reports?')) {
      if (window.netscope?.sqli) {
        await window.netscope.sqli.clearReports();
        setSelectedReport(null);
        setLatestReports([]);
        loadReports();
      }
    }
  };

  const handleExportReport = (report: SqliScanReport) => {
    const reportText = [
      `# SQL Injection Security Assessment Report`,
      `Target URL: ${report.target_url}`,
      `Method: ${report.method}`,
      `Tested Parameter: ${report.param_name} (${report.param_location})`,
      `Finding: ${report.finding}`,
      `Confidence: ${report.confidence}`,
      `Database Engine: ${report.db_fingerprint || 'Unknown Database'}`,
      `Test Category: ${report.test_category || 'Active Syntax Probe'}`,
      `Timestamp: ${new Date(report.timestamp).toISOString()}`,
      `Requests Sent: ${report.requests_sent}`,
      `Duration: ${report.duration_ms} ms`,
      '',
      `## Technical Risk Assessment:`,
      JSON.stringify(report.risk_assessment || {}, null, 2),
      '',
      `## Supporting Evidence:`,
      JSON.stringify(report.evidence, null, 2),
      '',
      `## Remediation Guidance:`,
      report.remediation || 'Use Parameterized Queries / Prepared Statements.'
    ].join('\n');

    const blob = new Blob([reportText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sqli_report_${report.param_name}_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAllOutcomes = () => {
    const reportsToExport = latestReports.length > 0 ? latestReports : historyReports;
    if (reportsToExport.length === 0) {
      alert('No scan outcomes to export.');
      return;
    }

    const lines = [
      `# Advanced SQL Injection Security Assessment Report`,
      `Target: ${targetReq.url}`,
      `Timestamp: ${new Date().toISOString()}`,
      `Total Parameters Tested: ${reportsToExport.length}`,
      `Vulnerable Parameters: ${reportsToExport.filter(r => r.finding === 'Potential SQL Injection' || r.finding === 'Boolean-Based Behavior Detected' || r.finding === 'Time-Based Behavior Detected' || r.finding === 'Possible Data Exposure').length}`,
      `Database Errors Detected: ${reportsToExport.filter(r => r.finding === 'Database Error Detected').length}`,
      `Safe Parameters: ${reportsToExport.filter(r => r.finding === 'No Issue Detected').length}`,
      '',
      `---`,
      ''
    ];

    reportsToExport.forEach((rep, idx) => {
      lines.push(`## ${idx + 1}. Parameter: ${rep.param_name} (${rep.param_location})`);
      lines.push(`- **Finding**: ${rep.finding} [Confidence: ${rep.confidence}]`);
      lines.push(`- **Database**: ${rep.db_fingerprint || 'Unknown Database'}`);
      lines.push(`- **Requests Sent**: ${rep.requests_sent}`);
      lines.push(`- **Duration**: ${rep.duration_ms} ms`);
      lines.push(`- **Evidence**:`);
      lines.push('```json');
      lines.push(JSON.stringify(rep.evidence, null, 2));
      lines.push('```');
      lines.push('');
    });

    lines.push(`## Remediation Recommendations:`);
    lines.push(`1. Use Parameterized Queries (Prepared Statements) for all user-supplied input.`);
    lines.push(`2. Avoid string concatenation and SQL statement interpolation.`);
    lines.push(`3. Use ORM abstractions or safe query builders.`);

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `advanced_sqli_assessment_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const detectedAuthCount = params.filter(p => p.isAuthField || /email|mail|pass|pwd|user/i.test(p.name)).length;

  const confirmedCount = latestReports.filter(r => 
    r.verification_status === 'Confirmed' ||
    (!r.verification_status && (
      r.finding === 'Potential SQL Injection' || 
      r.finding === 'Boolean-Based Behavior Detected' || 
      r.finding === 'Time-Based Behavior Detected' || 
      r.finding === 'Possible Data Exposure'
    ))
  ).length;

  const suspectedCount = latestReports.filter(r => 
    r.verification_status === 'Suspected' ||
    (!r.verification_status && (
      r.finding === 'Database Error Detected' || 
      r.finding === 'Inconclusive'
    ))
  ).length;

  const safeCount = latestReports.filter(r => 
    r.verification_status === 'Safe' || 
    r.finding === 'No Issue Detected'
  ).length;

  const filteredReports = latestReports.filter(rep => {
    const isConfirmed = rep.verification_status === 'Confirmed' ||
      (!rep.verification_status && (
        rep.finding === 'Potential SQL Injection' || 
        rep.finding === 'Boolean-Based Behavior Detected' || 
        rep.finding === 'Time-Based Behavior Detected' || 
        rep.finding === 'Possible Data Exposure'
      ));
    const isSuspected = rep.verification_status === 'Suspected' ||
      (!rep.verification_status && (
        rep.finding === 'Database Error Detected' || 
        rep.finding === 'Inconclusive'
      ));
    const isSafe = rep.verification_status === 'Safe' || rep.finding === 'No Issue Detected';

    if (outcomeFilter === 'confirmed') return isConfirmed;
    if (outcomeFilter === 'suspected') return isSuspected;
    if (outcomeFilter === 'safe') return isSafe;
    return true;
  });
  const isHttps = targetReq.url.startsWith('https://');

  return (
    <div className="h-full flex flex-col bg-[#121318] text-slate-200 select-none overflow-hidden font-sans">
      {/* Top Header & Tab Navigation */}
      <div className="h-10 bg-[#161722] border-b border-[#242635] flex items-center justify-between px-3 text-xs shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 font-bold text-rose-400">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span>Advanced SQL Injection Scanner</span>
          </div>
          <span className="text-[10px] text-slate-400 bg-[#202230] px-2 py-0.5 rounded font-mono border border-[#2c2f42]">
            DAST Security Engine
          </span>
          {detectedAuthCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60 font-medium">
              <KeyRound className="w-3 h-3 text-amber-400" />
              <span>{detectedAuthCount} Auth Field{detectedAuthCount > 1 ? 's' : ''} (Email / Pass)</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {onToggleBrowserView && (
            <button
              onClick={onToggleBrowserView}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border transition-all cursor-pointer mr-2 ${
                !isBrowserVisible
                  ? 'bg-blue-950/70 border-blue-600/70 text-blue-300 hover:bg-blue-900/80 shadow-sm'
                  : 'bg-[#1e202e] border-[#2e3146] text-slate-300 hover:bg-[#25283c]'
              }`}
              title={isBrowserVisible ? "Maximize Scanner to Full Window (Hide Browser)" : "Restore Split View with Browser"}
            >
              {!isBrowserVisible ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Split View</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Maximize Window</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={() => setActiveTab('scanner')}
            className={`px-3 py-1 rounded transition-colors cursor-pointer ${
              activeTab === 'scanner' ? 'bg-[#25283a] text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Scanner &amp; Analysis
          </button>
          <button
            onClick={() => { setActiveTab('fingerprint'); handleFingerprintDatabase(); }}
            className={`flex items-center gap-1 px-3 py-1 rounded transition-colors cursor-pointer ${
              activeTab === 'fingerprint' ? 'bg-[#25283a] text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span>DB Fingerprinting</span>
          </button>
          <button
            onClick={() => { setActiveTab('exposure'); handleVerifyDataExposure(); }}
            className={`flex items-center gap-1 px-3 py-1 rounded transition-colors cursor-pointer ${
              activeTab === 'exposure' ? 'bg-[#25283a] text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-amber-400" />
            <span>Data Exposure</span>
          </button>
          <button
            onClick={() => setActiveTab('source_code')}
            className={`flex items-center gap-1 px-3 py-1 rounded transition-colors cursor-pointer ${
              activeTab === 'source_code' ? 'bg-[#25283a] text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5 text-emerald-400" />
            <span>Source Inspector</span>
          </button>
          <button
            onClick={() => setActiveTab('remediation')}
            className={`flex items-center gap-1 px-3 py-1 rounded transition-colors cursor-pointer ${
              activeTab === 'remediation' ? 'bg-[#25283a] text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="w-3.5 h-3.5 text-teal-400" />
            <span>Remediation Center</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded transition-colors cursor-pointer ${
              activeTab === 'history' ? 'bg-[#25283a] text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Scan History</span>
            {historyReports.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#1d2d25] text-emerald-400">
                {historyReports.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-1 px-3 py-1 rounded transition-colors cursor-pointer ${
              activeTab === 'settings' ? 'bg-[#25283a] text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* TAB 1: SCANNER & ANALYSIS */}
      {activeTab === 'scanner' && (
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Request & Parameter Selection (380px) */}
          <div className="w-[380px] border-r border-[#242635] flex flex-col bg-[#14151c] p-3 space-y-3 overflow-y-auto shrink-0">
            {/* 1. Request Selector & Direct Paste URL Bar */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
                Target Request &amp; URL
              </label>

              {/* Intercepted Dropdown */}
              <select
                value={selectedFlowId}
                onChange={e => handleSelectFlow(e.target.value)}
                className="w-full bg-[#101116] border border-[#262838] rounded p-1.5 text-xs text-slate-200 truncate cursor-pointer"
              >
                <option value="">-- Choose Intercepted Request --</option>
                {flows.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.method} {f.url} ({f.response_status || 'Pending'})
                  </option>
                ))}
              </select>

              {/* Direct Paste & Edit URL Bar */}
              <div className="flex items-center gap-1 pt-0.5">
                <select
                  value={targetReq.method}
                  onChange={e => setTargetReq({ ...targetReq, method: e.target.value })}
                  className="bg-[#101116] border border-[#262838] rounded px-1.5 py-1 text-xs font-bold text-slate-300 cursor-pointer"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                </select>

                <div className="flex-1 relative flex items-center">
                  <input
                    type="text"
                    value={targetReq.url}
                    onChange={e => updateUrlAndHost(e.target.value)}
                    placeholder="Enter or paste URL (e.g. https://www.embeds2.com/admin/login/)..."
                    className="w-full bg-[#101116] border border-[#262838] focus:border-blue-500/80 rounded px-2 py-1 text-xs font-mono text-blue-300 truncate outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="p-1 bg-[#1c1e2b] hover:bg-[#25283a] text-slate-300 rounded border border-[#2b2e40] transition-colors cursor-pointer"
                  title="Paste URL from Clipboard"
                >
                  <Clipboard className="w-3.5 h-3.5 text-blue-400" />
                </button>
              </div>
            </div>

            {/* Quick Actions Row */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleAutomaticSqliScan}
                disabled={isScanning}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-rose-600 via-pink-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white rounded text-xs font-bold shadow-md shadow-rose-950/40 border border-rose-400/40 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                title="Automatically detect parameters, prioritize Email & Password, and execute security scan"
              >
                <Sparkles className="w-3.5 h-3.5 text-yellow-300 animate-pulse" />
                <span>Automatic SQLi Scan</span>
              </button>
            </div>

            {/* 2. Parameters Configuration & Selection */}
            <div className="space-y-2 flex-1 flex flex-col">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Parameters ({params.length})
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <button
                    onClick={() => handleSelectAll(true)}
                    className="text-blue-400 hover:underline cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    onClick={() => handleSelectAll(false)}
                    className="text-slate-400 hover:underline cursor-pointer"
                  >
                    Clear
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    onClick={handleSelectAuthFieldsOnly}
                    className="text-amber-400 hover:text-amber-300 hover:underline font-semibold cursor-pointer"
                    title="Select or inject Email & Password fields"
                  >
                    + Email &amp; Pass
                  </button>
                </div>
              </div>

              {/* Add Custom Parameter Inline Form */}
              {showAddParam ? (
                <div className="bg-[#0f1016] border border-blue-900/40 rounded p-2.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-[11px] font-bold text-blue-300">
                    <span>Add New Parameter</span>
                    <button onClick={() => setShowAddParam(false)} className="text-slate-400 hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      value={newParamName}
                      onChange={e => setNewParamName(e.target.value)}
                      placeholder="Param Name (e.g. email)"
                      className="bg-[#181a24] border border-[#2b2e40] rounded px-2 py-1 text-slate-200 font-mono text-xs"
                    />
                    <input
                      type="text"
                      value={newParamValue}
                      onChange={e => setNewParamValue(e.target.value)}
                      placeholder="Default Value (e.g. admin)"
                      className="bg-[#181a24] border border-[#2b2e40] rounded px-2 py-1 text-slate-200 font-mono text-xs"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <select
                      value={newParamLocation}
                      onChange={e => setNewParamLocation(e.target.value as any)}
                      className="bg-[#181a24] border border-[#2b2e40] rounded px-2 py-1 text-[11px] text-slate-300"
                    >
                      <option value="body_form">Form Body (POST)</option>
                      <option value="query">Query Parameter (URL)</option>
                      <option value="body_json">JSON Body</option>
                    </select>
                    <button
                      onClick={handleAddCustomParam}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold cursor-pointer"
                    >
                      Add Parameter
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setShowAddParam(true)}
                    className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Custom Parameter</span>
                  </button>
                </div>
              )}

              {/* Parameter List */}
              {params.length === 0 ? (
                <div className="bg-[#101116] border border-[#222432] rounded p-3 text-center text-slate-500 text-xs space-y-2">
                  <p>No parameters currently configured.</p>
                  <button
                    onClick={() => setParams(createDefaultAuthParams(targetReq.method !== 'GET'))}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#1a1c28] hover:bg-[#222538] border border-amber-800/40 text-amber-300 rounded text-[11px] font-semibold transition-colors cursor-pointer"
                  >
                    <KeyRound className="w-3 h-3" />
                    <span>Auto-Inject Email &amp; Password</span>
                  </button>
                </div>
              ) : (
                <div className="bg-[#101116] border border-[#222432] rounded divide-y divide-[#1e202d] max-h-56 overflow-y-auto">
                  {params.map(p => {
                    const isEmail = p.authFieldType === 'email' || /email|mail/i.test(p.name);
                    const isPass = p.authFieldType === 'password' || /pass|pwd|secret/i.test(p.name);
                    const isUser = p.authFieldType === 'username' || /user|login/i.test(p.name);

                    return (
                      <div
                        key={`${p.location}:${p.name}`}
                        onClick={() => handleToggleParam(p.name, p.location)}
                        className={`p-2 flex items-center justify-between cursor-pointer hover:bg-[#181a24] text-xs transition-colors ${
                          p.selected ? 'bg-[#171926]' : 'opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <input
                            type="checkbox"
                            checked={p.selected}
                            onChange={() => {}}
                            className="rounded bg-slate-900 border-slate-700 text-blue-600 cursor-pointer"
                          />
                          <div className="truncate flex items-center gap-1.5">
                            <span className="font-mono text-slate-200 font-semibold">{p.name}</span>
                            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-[#202232] text-slate-400 border border-[#2a2d40]">
                              {p.dataType || 'str'}
                            </span>
                            {isEmail && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-700/60">
                                EMAIL
                              </span>
                            )}
                            {isPass && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-950/80 text-purple-300 border border-purple-700/60">
                                PASS
                              </span>
                            )}
                            {isUser && !isEmail && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-700/60">
                                USER
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-slate-500 font-mono">
                            {p.location === 'body_json' ? 'json' : p.location === 'body_form' ? 'form' : 'query'}
                          </span>
                          <button
                            onClick={(e) => handleDeleteParam(p.name, p.location, e)}
                            className="text-slate-500 hover:text-red-400 p-0.5"
                            title="Remove parameter"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Safe Verification Mode Switch */}
            <div className="bg-[#101116] p-2 rounded border border-[#232536] flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className={`w-4 h-4 ${settings.safeVerificationMode ? 'text-emerald-400' : 'text-slate-500'}`} />
                <div>
                  <span className="font-semibold text-slate-200 text-[11px]">Safe Verification Mode</span>
                  <p className="text-[10px] text-slate-400">Halt upon confirm • Zero data dumping</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.safeVerificationMode}
                onChange={e => setSettings({ ...settings, safeVerificationMode: e.target.checked })}
                className="rounded bg-slate-900 border-slate-700 text-emerald-500 cursor-pointer"
                title="Toggle Safe Verification Mode (halts immediately once vulnerability confirmed, never exfiltrates data)"
              />
            </div>

            {/* 3. Action Buttons & Controls */}
            <div className="space-y-2 pt-2 border-t border-[#222432]">
              <div className="flex gap-2">
                {!isScanning ? (
                  <button
                    onClick={handleInitiateTest}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Start Security Test</span>
                  </button>
                ) : (
                  <button
                    onClick={handleStopScan}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Stop Security Test</span>
                  </button>
                )}

                <button
                  onClick={handleRunPassiveAnalysis}
                  disabled={isScanning}
                  className="px-3 py-2 bg-[#202230] hover:bg-[#282a3c] disabled:opacity-40 text-slate-300 rounded text-xs font-semibold border border-[#2b2d3e] transition-colors cursor-pointer"
                  title="Inspect intercepted response without sending additional traffic"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Progress Indicator */}
              {isScanning && (
                <div className="bg-[#101116] border border-blue-900/40 rounded p-2.5 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-blue-400 font-semibold flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Testing: {scanProgress.paramName || 'Initializing...'}
                    </span>
                    <span className="text-slate-400 font-mono">
                      {scanProgress.currentParamIndex} / {scanProgress.totalParams} params
                    </span>
                  </div>
                  <div className="w-full bg-[#1e202c] rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-blue-500 h-full transition-all duration-300"
                      style={{
                        width: scanProgress.totalParams > 0
                          ? `${(scanProgress.currentParamIndex / scanProgress.totalParams) * 100}%`
                          : '10%'
                      }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-500 flex justify-between">
                    <span>{scanProgress.requestsSent} requests sent</span>
                    <span>Rate limited &amp; scoped</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Outcomes Overview, Evidence, and Response Comparison */}
          <div className="flex-1 flex flex-col bg-[#101116] overflow-y-auto p-4 space-y-4">
            {/* SECTION A: ALL SCAN OUTCOMES DASHBOARD */}
            {latestReports.length > 0 && (
              <div className="bg-[#151722] border border-[#242636] rounded-xl p-4 space-y-3.5 shadow-lg">
                <div className="flex items-center justify-between border-b border-[#242636] pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-rose-400" />
                    <div>
                      <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wide">
                        All SQL Injection Outcomes ({latestReports.length})
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Target: <span className="font-mono text-blue-300">{targetReq.url}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleExportAllOutcomes}
                      className="flex items-center gap-1.5 px-3 py-1 bg-blue-950/60 hover:bg-blue-900/80 border border-blue-800/40 text-blue-300 rounded text-xs font-semibold cursor-pointer"
                      title="Download Markdown summary of all parameter results"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export All Outcomes</span>
                    </button>
                    <button
                      onClick={() => { setLatestReports([]); setSelectedReport(null); }}
                      className="px-2.5 py-1 bg-[#202230] hover:bg-[#282a3c] text-slate-400 hover:text-slate-200 rounded text-xs cursor-pointer"
                      title="Clear active outcomes view"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Summary Metrics Cards */}
                <div className="grid grid-cols-4 gap-2.5 text-xs">
                  <div className="bg-[#0f1016] border border-[#222434] rounded-lg p-2.5 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Scanned</div>
                      <div className="text-lg font-bold text-slate-100">{latestReports.length}</div>
                    </div>
                    <Database className="w-5 h-5 text-blue-400 opacity-60" />
                  </div>

                  <div className={`border rounded-lg p-2.5 flex items-center justify-between ${
                    confirmedCount > 0 ? 'bg-violet-950/40 border-violet-700/80 text-violet-200' : 'bg-[#0f1016] border-[#222434]'
                  }`}>
                    <div>
                      <div className="text-[10px] text-violet-400 uppercase font-semibold flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-violet-400" />
                        <span>Confirmed Findings</span>
                      </div>
                      <div className="text-lg font-bold text-violet-300">{confirmedCount}</div>
                    </div>
                    <ShieldCheck className={`w-5 h-5 ${confirmedCount > 0 ? 'text-violet-400' : 'text-slate-600'}`} />
                  </div>

                  <div className={`border rounded-lg p-2.5 flex items-center justify-between ${
                    suspectedCount > 0 ? 'bg-amber-950/40 border-amber-800/80 text-amber-200' : 'bg-[#0f1016] border-[#222434]'
                  }`}>
                    <div>
                      <div className="text-[10px] text-amber-400 uppercase font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        <span>Suspected Findings</span>
                      </div>
                      <div className="text-lg font-bold text-amber-300">{suspectedCount}</div>
                    </div>
                    <AlertTriangle className={`w-5 h-5 ${suspectedCount > 0 ? 'text-amber-400' : 'text-slate-600'}`} />
                  </div>

                  <div className="bg-[#0f1016] border border-[#222434] rounded-lg p-2.5 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-emerald-400 uppercase font-semibold">Clean / Safe</div>
                      <div className="text-lg font-bold text-emerald-300">{safeCount}</div>
                    </div>
                    <CheckCircle className="w-5 h-5 text-emerald-400 opacity-60" />
                  </div>
                </div>

                {/* Filter Selector */}
                <div className="flex items-center gap-1.5 pt-1 text-xs">
                  <span className="text-[11px] text-slate-500 font-semibold mr-1">Filter:</span>
                  <button
                    onClick={() => setOutcomeFilter('all')}
                    className={`px-2.5 py-0.5 rounded text-[11px] cursor-pointer font-medium ${
                      outcomeFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-[#181a24] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All ({latestReports.length})
                  </button>
                  <button
                    onClick={() => setOutcomeFilter('confirmed')}
                    className={`px-2.5 py-0.5 rounded text-[11px] cursor-pointer font-medium flex items-center gap-1 ${
                      outcomeFilter === 'confirmed' ? 'bg-violet-600 text-white font-bold' : 'bg-[#181a24] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <ShieldCheck className="w-3 h-3" />
                    <span>Confirmed ({confirmedCount})</span>
                  </button>
                  <button
                    onClick={() => setOutcomeFilter('suspected')}
                    className={`px-2.5 py-0.5 rounded text-[11px] cursor-pointer font-medium flex items-center gap-1 ${
                      outcomeFilter === 'suspected' ? 'bg-amber-600 text-white font-bold' : 'bg-[#181a24] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    <span>Suspected ({suspectedCount})</span>
                  </button>
                  <button
                    onClick={() => setOutcomeFilter('safe')}
                    className={`px-2.5 py-0.5 rounded text-[11px] cursor-pointer font-medium ${
                      outcomeFilter === 'safe' ? 'bg-emerald-600 text-white' : 'bg-[#181a24] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Safe ({safeCount})
                  </button>
                </div>

                {/* Live Outcomes Grid / Cards */}
                <div className="grid grid-cols-1 gap-2 pt-1">
                  {filteredReports.map((rep) => {
                    const isConfirmed = rep.verification_status === 'Confirmed' ||
                      (!rep.verification_status && (
                        rep.finding === 'Potential SQL Injection' || 
                        rep.finding === 'Boolean-Based Behavior Detected' || 
                        rep.finding === 'Time-Based Behavior Detected' || 
                        rep.finding === 'Possible Data Exposure'
                      ));
                    const isSuspected = rep.verification_status === 'Suspected' ||
                      (!rep.verification_status && (
                        rep.finding === 'Database Error Detected' || 
                        rep.finding === 'Inconclusive'
                      ));
                    const isSelected = selectedReport?.id === rep.id;

                    return (
                      <div
                        key={rep.id}
                        onClick={() => setSelectedReport(rep)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-[#1a1c2a] border-blue-500 shadow-md'
                            : isConfirmed
                            ? 'bg-[#13101b] border-violet-900/40 hover:bg-[#191524]'
                            : isSuspected
                            ? 'bg-[#15120d] border-amber-900/40 hover:bg-[#1a1710]'
                            : 'bg-[#101117] border-[#222434] hover:bg-[#151722]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded ${
                            isConfirmed ? 'bg-violet-950/80 text-violet-400 border border-violet-800/60' :
                            isSuspected ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60' :
                            'bg-emerald-950 text-emerald-400'
                          }`}>
                            {isConfirmed ? <ShieldCheck className="w-4 h-4 text-violet-400" /> :
                             isSuspected ? <AlertTriangle className="w-4 h-4 text-amber-400" /> :
                             <CheckCircle className="w-4 h-4 text-emerald-400" />}
                          </div>

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-slate-100 text-xs">{rep.param_name}</span>
                              <span className="text-[10px] font-mono text-slate-400 bg-[#1e202d] px-1.5 py-0.2 rounded border border-[#2a2d40]">
                                {rep.param_location}
                              </span>

                              {/* Status Badge: Confirmed vs Suspected */}
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
                                isConfirmed ? 'bg-violet-950 text-violet-300 border border-violet-600/80' :
                                isSuspected ? 'bg-amber-950 text-amber-300 border border-amber-600/80' :
                                'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                              }`}>
                                {isConfirmed ? <ShieldCheck className="w-3 h-3 text-violet-400" /> :
                                 isSuspected ? <AlertTriangle className="w-3 h-3 text-amber-400" /> :
                                 <CheckCircle className="w-3 h-3 text-emerald-400" />}
                                <span>{isConfirmed ? 'CONFIRMED' : isSuspected ? 'SUSPECTED' : 'SAFE'}</span>
                              </span>

                              <span className="text-[10px] text-slate-300 font-semibold">
                                {rep.finding}
                              </span>

                              <span className="text-[10px] text-slate-400 font-mono">
                                Confidence: {rep.confidence}
                              </span>

                              {rep.safe_verification?.stoppedEarly && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-950/80 text-blue-300 border border-blue-700/60">
                                  Safe Halt ({rep.safe_verification.confirmedPhase || 'Early Stop'})
                                </span>
                              )}

                              {rep.timing_evidence?.deltaMs && rep.timing_evidence.deltaMs > 300 && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800">
                                  +{rep.timing_evidence.deltaMs}ms delay
                                </span>
                              )}

                              {rep.response_difference?.lengthDifference !== undefined && rep.response_difference.lengthDifference !== 0 && (
                                <span className="text-[10px] font-mono text-slate-400">
                                  Δ {rep.response_difference.lengthDifference} B
                                </span>
                              )}

                              {rep.db_fingerprint && rep.db_fingerprint !== 'Unknown Database' && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                                  {rep.db_fingerprint}
                                </span>
                              )}
                            </div>

                            {rep.evidence && rep.evidence.length > 0 && rep.evidence[0].description && (
                              <p className="text-[11px] text-slate-400 font-mono mt-1 truncate max-w-xl">
                                {rep.evidence[0].description}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-right shrink-0">
                          <div className="text-[11px] text-slate-400 font-mono">
                            <div>{rep.requests_sent} reqs</div>
                            <div className="text-[10px] text-slate-500">{rep.duration_ms} ms</div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedReport(rep); }}
                            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                              isSelected ? 'bg-blue-600 text-white' : 'bg-[#1f2130] text-slate-300 hover:text-white'
                            }`}
                          >
                            Inspect
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SECTION B: DETAILED INSPECTION FOR SELECTED REPORT */}
            {selectedReport ? (
              <div className="space-y-4">
                {/* Result Banner */}
                {(() => {
                  const isVuln = selectedReport.finding === 'Potential SQL Injection' || 
                                 selectedReport.finding === 'Boolean-Based Behavior Detected' || 
                                 selectedReport.finding === 'Time-Based Behavior Detected' || 
                                 selectedReport.finding === 'Possible Data Exposure';
                  const isErr = selectedReport.finding === 'Database Error Detected';
                  const isInconclusive = selectedReport.finding === 'Inconclusive';

                  return (
                    <div className={`p-4 rounded-lg border flex items-start gap-3 shadow-md ${
                      isVuln ? 'bg-red-950/40 border-red-800 text-red-200' :
                      isErr ? 'bg-amber-950/40 border-amber-800 text-amber-200' :
                      isInconclusive ? 'bg-yellow-950/40 border-yellow-800 text-yellow-200' :
                      'bg-emerald-950/30 border-emerald-800 text-emerald-200'
                    }`}>
                      <div className="p-2 rounded bg-black/40">
                        {isVuln || isErr ? <AlertTriangle className="w-6 h-6" /> : <CheckCircle className="w-6 h-6" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm uppercase tracking-wide">
                            {selectedReport.finding}
                          </h3>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-black/50 border border-current">
                            Confidence: {selectedReport.confidence}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            Parameter: {selectedReport.param_name} ({selectedReport.param_location})
                          </span>
                          {selectedReport.db_fingerprint && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 font-mono border border-indigo-800">
                              Database: {selectedReport.db_fingerprint}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-300 mt-1">
                          {selectedReport.risk_assessment?.technicalImpact ||
                            (isVuln
                              ? 'Observed differential behavior and unescaped database syntax response indicates a possible SQL injection vulnerability. Manual verification with parameterized queries is recommended.'
                              : isErr
                              ? 'The server response contained an explicit database driver syntax error.'
                              : isInconclusive
                              ? 'The response indicated behavioral anomaly, but does not provide conclusive proof of SQL injection.'
                              : 'No SQL injection indicators detected during safe syntax testing.')}
                        </p>
                      </div>
                      <button
                        onClick={() => handleExportReport(selectedReport)}
                        className="px-2 py-1 bg-black/40 hover:bg-black/60 rounded text-slate-300 text-[11px] flex items-center gap-1 cursor-pointer"
                        title="Export Report"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export</span>
                      </button>
                    </div>
                  );
                })()}

                {/* Evidence Details */}
                {selectedReport.evidence && selectedReport.evidence.length > 0 && (
                  <div className="bg-[#151722] border border-[#242636] rounded-lg p-3.5 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200 uppercase tracking-wider">
                      <Search className="w-3.5 h-3.5 text-blue-400" />
                      <span>Supporting Evidence ({selectedReport.evidence.length})</span>
                    </div>
                    <div className="space-y-2">
                      {selectedReport.evidence.map((ev, idx) => (
                        <div key={idx} className="bg-[#0e0f15] border border-[#1e202d] rounded p-2.5 text-xs space-y-1">
                          <div className="flex items-center justify-between text-slate-300 font-medium">
                            <span>{ev.description}</span>
                            {ev.probe && (
                              <span className="font-mono text-[10px] bg-red-950/70 text-red-300 px-1.5 py-0.5 rounded border border-red-800/40">
                                Probe: {ev.probe}
                              </span>
                            )}
                          </div>
                          {ev.snippet && (
                            <div className="bg-[#050608] p-2 rounded text-[11px] font-mono text-amber-300 break-all border border-[#1a1c26]">
                              {ev.snippet}
                            </div>
                          )}
                          {ev.canaryObserved && (
                            <div className="bg-red-950/50 p-2 rounded text-[11px] font-mono text-red-300 border border-red-800/60">
                              Canary Marker Exposed: {ev.canaryObserved}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Response Comparison Quad View */}
                <div className="bg-[#151722] border border-[#242636] rounded-lg p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Columns className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                        Request &amp; Response Comparison
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-[11px] text-slate-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={normalizeDynamic}
                          onChange={e => setNormalizeDynamic(e.target.checked)}
                          className="rounded bg-slate-900 border-slate-700 text-blue-600 cursor-pointer"
                        />
                        <span>Normalize Dynamic Tokens</span>
                      </label>

                      <div className="flex items-center gap-1 bg-[#101116] p-0.5 rounded border border-[#262838]">
                        <button
                          onClick={() => setComparisonLayout('quad')}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                            comparisonLayout === 'quad' ? 'bg-[#222434] text-blue-400' : 'text-slate-400'
                          }`}
                        >
                          4-Way Quad View
                        </button>
                        <button
                          onClick={() => setComparisonLayout('tabs')}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                            comparisonLayout === 'tabs' ? 'bg-[#222434] text-blue-400' : 'text-slate-400'
                          }`}
                        >
                          Tabs View
                        </button>
                      </div>
                    </div>
                  </div>

                  {comparisonLayout === 'quad' ? (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {/* 1. Original Request */}
                      <div className="bg-[#0c0d12] border border-[#222432] rounded p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 border-b border-[#1e202c] pb-1">
                          <span className="text-blue-400">1. Original Request</span>
                          <span className="font-mono text-slate-500">{selectedReport.method}</span>
                        </div>
                        <div className="font-mono text-[11px] text-slate-400 break-all max-h-36 overflow-y-auto">
                          <div className="text-slate-200">{selectedReport.original_request?.url || selectedReport.target_url}</div>
                          {selectedReport.original_request?.body && (
                            <div className="mt-1 pt-1 border-t border-[#1a1b24] text-slate-400">
                              Payload: {selectedReport.original_request.body}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 2. Test Request */}
                      <div className="bg-[#0c0d12] border border-blue-900/30 rounded p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 border-b border-[#1e202c] pb-1">
                          <span className="text-cyan-400">2. Test Request (Generated)</span>
                          <span className="font-mono text-cyan-300">{selectedReport.test_request?.method || selectedReport.method}</span>
                        </div>
                        <div className="font-mono text-[11px] text-slate-400 break-all max-h-36 overflow-y-auto">
                          <div className="text-cyan-200">{selectedReport.test_request?.url || selectedReport.target_url}</div>
                          {selectedReport.test_request?.body && (
                            <div className="mt-1 pt-1 border-t border-[#1a1b24] text-cyan-400">
                              Injected Payload: {selectedReport.test_request.body}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 3. Original Response */}
                      <div className="bg-[#0c0d12] border border-[#222432] rounded p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 border-b border-[#1e202c] pb-1">
                          <span className="text-emerald-400">3. Original Baseline Response</span>
                          <span className="font-mono text-emerald-400">HTTP {targetReq.original_response?.status || 200}</span>
                        </div>
                        <div className="font-mono text-[10px] text-slate-400 max-h-40 overflow-y-auto break-all">
                          {targetReq.original_response?.body
                            ? targetReq.original_response.body.slice(0, 500)
                            : '// Baseline response captured from intercepted traffic'}
                        </div>
                      </div>

                      {/* 4. Test Response */}
                      <div className="bg-[#0c0d12] border border-rose-900/40 rounded p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 border-b border-[#1e202c] pb-1">
                          <span className="text-rose-400">4. Actual Test Response</span>
                          <span className="font-mono text-rose-400 font-bold">
                            HTTP {selectedReport.test_response?.status || 'N/A'}
                          </span>
                        </div>
                        <div className="font-mono text-[10px] text-slate-300 max-h-40 overflow-y-auto break-all">
                          {selectedReport.test_response?.body
                            ? selectedReport.test_response.body.slice(0, 600)
                            : '// No test response received'}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-1 border-b border-[#242636] pb-1">
                        <button
                          onClick={() => setActiveComparisonTab('orig_req')}
                          className={`px-3 py-1 rounded text-xs cursor-pointer ${activeComparisonTab === 'orig_req' ? 'bg-[#222434] text-blue-300 font-bold' : 'text-slate-400'}`}
                        >
                          Original Request
                        </button>
                        <button
                          onClick={() => setActiveComparisonTab('test_req')}
                          className={`px-3 py-1 rounded text-xs cursor-pointer ${activeComparisonTab === 'test_req' ? 'bg-[#222434] text-cyan-300 font-bold' : 'text-slate-400'}`}
                        >
                          Test Request
                        </button>
                        <button
                          onClick={() => setActiveComparisonTab('orig_res')}
                          className={`px-3 py-1 rounded text-xs cursor-pointer ${activeComparisonTab === 'orig_res' ? 'bg-[#222434] text-emerald-300 font-bold' : 'text-slate-400'}`}
                        >
                          Baseline Response
                        </button>
                        <button
                          onClick={() => setActiveComparisonTab('test_res')}
                          className={`px-3 py-1 rounded text-xs cursor-pointer ${activeComparisonTab === 'test_res' ? 'bg-[#222434] text-rose-300 font-bold' : 'text-slate-400'}`}
                        >
                          Test Response
                        </button>
                      </div>

                      <div className="bg-[#0b0c10] p-3 rounded font-mono text-[11px] text-slate-300 max-h-60 overflow-y-auto break-all border border-[#1f212d]">
                        {activeComparisonTab === 'orig_req' && JSON.stringify(selectedReport.original_request || {}, null, 2)}
                        {activeComparisonTab === 'test_req' && JSON.stringify(selectedReport.test_request || {}, null, 2)}
                        {activeComparisonTab === 'orig_res' && (targetReq.original_response?.body || '// Baseline response text')}
                        {activeComparisonTab === 'test_res' && (selectedReport.test_response?.body || '// Test response text')}
                      </div>
                    </div>
                  )}
                </div>

                {/* Remediation Guidance */}
                <div className="bg-[#11131c] border border-blue-900/30 rounded p-3.5 space-y-2 text-xs">
                  <div className="font-bold text-blue-300 flex items-center gap-1.5">
                    <Code className="w-4 h-4 text-blue-400" />
                    <span>Recommended Remediation &amp; Secure Coding</span>
                  </div>
                  <div className="prose prose-invert prose-xs text-slate-300 max-w-none space-y-2">
                    <p className="text-[11px] text-slate-400">
                      To prevent SQL injection vulnerabilities, separate user-supplied input from SQL statement syntax using parameterized queries and prepared statements:
                    </p>
                    <div className="bg-[#08090d] p-3 rounded border border-[#222434] font-mono text-[11px] text-emerald-300">
                      <code>
                        {`// Secure Parameterized Query (Node.js SQLite / PostgreSQL / MySQL)
const query = 'SELECT id, username, email FROM server_users WHERE email = ? AND password = ?';
db.all(query, [userEmail, hashedPassword], (err, rows) => { ... });`}
                      </code>
                    </div>
                  </div>
                </div>
              </div>
            ) : latestReports.length === 0 ? (
              /* SECTION C: RICH SCANNER LAUNCHPAD */
              <div className="space-y-4">
                {/* Target Information Card */}
                <div className="bg-[#151722] border border-[#242636] rounded-xl p-4 shadow-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded bg-indigo-950/60 border border-indigo-800/40 text-indigo-400">
                        <Globe className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#1e2130] text-blue-300 font-mono">
                            {targetReq.method}
                          </span>
                          <span className="font-mono text-sm font-bold text-slate-100 break-all">
                            {targetReq.url}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                          <span className="flex items-center gap-1">
                            {isHttps ? <Lock className="w-3 h-3 text-emerald-400" /> : <Globe className="w-3 h-3 text-slate-500" />}
                            {isHttps ? 'HTTPS Encrypted' : 'Plain HTTP'}
                          </span>
                          <span>•</span>
                          <span>Target Scope: <strong className="text-slate-200">{settings.authorizedHost}</strong></span>
                          <span>•</span>
                          <span className="text-emerald-400 font-semibold">Authorized Environment</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleAutomaticSqliScan}
                      className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold shadow-md cursor-pointer transition-transform active:scale-95"
                    >
                      <Sparkles className="w-4 h-4 text-yellow-300 animate-pulse" />
                      <span>⚡ Run Automated Scan</span>
                    </button>
                  </div>
                </div>

                {/* Quick Scan Profiles */}
                <div className="grid grid-cols-3 gap-3">
                  <div
                    onClick={handleAutomaticSqliScan}
                    className="p-3.5 bg-[#14151f] hover:bg-[#191b28] border border-[#232536] hover:border-rose-600/50 rounded-xl cursor-pointer transition-all space-y-2 group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="p-2 rounded-lg bg-rose-950/60 border border-rose-800/40 text-rose-400">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-rose-400 transition-colors" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-100 group-hover:text-rose-300 transition-colors">
                        Full Automated Scan
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Detects all parameters, applies syntax boundary probes, UNION column tests, and boolean logic.
                      </p>
                    </div>
                  </div>

                  <div
                    onClick={handleSelectAuthFieldsOnly}
                    className="p-3.5 bg-[#14151f] hover:bg-[#191b28] border border-[#232536] hover:border-amber-600/50 rounded-xl cursor-pointer transition-all space-y-2 group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="p-2 rounded-lg bg-amber-950/60 border border-amber-800/40 text-amber-400">
                        <KeyRound className="w-4 h-4" />
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-amber-400 transition-colors" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-100 group-hover:text-amber-300 transition-colors">
                        Login Form Audit (Email &amp; Pass)
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Targets authentication forms to assess whether credentials bypass validation via quote insertion.
                      </p>
                    </div>
                  </div>

                  <div
                    onClick={() => setShowAddParam(true)}
                    className="p-3.5 bg-[#14151f] hover:bg-[#191b28] border border-[#232536] hover:border-blue-600/50 rounded-xl cursor-pointer transition-all space-y-2 group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="p-2 rounded-lg bg-blue-950/60 border border-blue-800/40 text-blue-400">
                        <Plus className="w-4 h-4" />
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-blue-400 transition-colors" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-100 group-hover:text-blue-300 transition-colors">
                        Add Custom Parameter
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Add custom query parameters, JSON payload keys, or form body parameters to test specific entry points.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Safety & Scope Guarantees Card */}
                <div className="bg-[#11131a] border border-[#202230] rounded-xl p-4 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
                    <div>
                      <h4 className="font-bold text-slate-200">Safe, Controlled Non-Destructive Testing</h4>
                      <p className="text-[11px] text-slate-400">
                        All probes are read-only syntax tests. The scanner never executes DROP, DELETE, UPDATE, or TRUNCATE commands. Sensitive headers and credentials are automatically redacted.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400 shrink-0">
                    <span className="px-2 py-1 rounded bg-[#181a26] border border-[#262838]">SQLite</span>
                    <span className="px-2 py-1 rounded bg-[#181a26] border border-[#262838]">MySQL</span>
                    <span className="px-2 py-1 rounded bg-[#181a26] border border-[#262838]">PostgreSQL</span>
                    <span className="px-2 py-1 rounded bg-[#181a26] border border-[#262838]">MSSQL</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* TAB 2: DATABASE FINGERPRINTING */}
      {activeTab === 'fingerprint' && (
        <div className="flex-1 p-5 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between border-b border-[#252838] pb-3">
            <div>
              <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wider flex items-center gap-2">
                <Cpu className="w-4 h-4 text-indigo-400" />
                <span>Database Engine Fingerprinting</span>
              </h3>
              <p className="text-xs text-slate-500">
                Identifies database dialect and engine version based on driver exceptions, response headers, and syntax quirks.
              </p>
            </div>
            <button
              onClick={handleFingerprintDatabase}
              disabled={isFingerprinting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFingerprinting ? 'animate-spin' : ''}`} />
              <span>Run Database Fingerprint</span>
            </button>
          </div>

          {dbFingerprintResult ? (
            <div className="bg-[#151722] border border-[#252838] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#222434] pb-4">
                <div>
                  <div className="text-xs text-slate-400 font-semibold uppercase">Identified Engine</div>
                  <div className="text-2xl font-bold text-indigo-400 font-mono mt-0.5">
                    {dbFingerprintResult.database}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded text-xs font-bold bg-[#1e2236] text-indigo-300 border border-indigo-700/60 font-mono">
                    Confidence: {dbFingerprintResult.confidence}
                  </span>
                  <span className="px-2.5 py-1 rounded text-xs font-bold bg-[#172420] text-emerald-300 border border-emerald-700/60 font-mono">
                    Method: {dbFingerprintResult.detectionMethod}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wide mb-2">
                  Fingerprinting Evidence:
                </h4>
                <div className="space-y-1.5">
                  {dbFingerprintResult.evidence.map((ev: string, idx: number) => (
                    <div key={idx} className="bg-[#0d0e14] p-2.5 rounded border border-[#1f212e] text-xs font-mono text-slate-300">
                      {ev}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500 text-xs space-y-2">
              <Cpu className="w-10 h-10 mx-auto opacity-30" />
              <p>Click &quot;Run Database Fingerprint&quot; to inspect target response headers and error signatures.</p>
            </div>
          )}

          {/* Database Capabilities Matrix */}
          <div className="bg-[#14151e] border border-[#242636] rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Supported Database Engines &amp; Detection Heuristics
            </h4>
            <div className="grid grid-cols-5 gap-3 text-xs">
              <div className="p-3 bg-[#0d0e14] rounded border border-[#1e202e] space-y-1">
                <strong className="text-slate-100 block">SQLite</strong>
                <p className="text-[11px] text-slate-400">OperationalError, near syntax, table schema queries.</p>
              </div>
              <div className="p-3 bg-[#0d0e14] rounded border border-[#1e202e] space-y-1">
                <strong className="text-slate-100 block">MySQL</strong>
                <p className="text-[11px] text-slate-400">Syntax manual reference, mysql_ driver exceptions, SLEEP.</p>
              </div>
              <div className="p-3 bg-[#0d0e14] rounded border border-[#1e202e] space-y-1">
                <strong className="text-slate-100 block">PostgreSQL</strong>
                <p className="text-[11px] text-slate-400">42601 code, pg_sleep, PSQLException, string escapes.</p>
              </div>
              <div className="p-3 bg-[#0d0e14] rounded border border-[#1e202e] space-y-1">
                <strong className="text-slate-100 block">MS SQL Server</strong>
                <p className="text-[11px] text-slate-400">OLE DB provider, unclosed quote, WAITFOR DELAY.</p>
              </div>
              <div className="p-3 bg-[#0d0e14] rounded border border-[#1e202e] space-y-1">
                <strong className="text-slate-100 block">Oracle</strong>
                <p className="text-[11px] text-slate-400">ORA-00933, ORA-00936, PL/SQL command boundaries.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DATA EXPOSURE VERIFICATION */}
      {activeTab === 'exposure' && (
        <div className="flex-1 p-5 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between border-b border-[#252838] pb-3">
            <div>
              <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-400" />
                <span>Authorized Data Exposure Verification</span>
              </h3>
              <p className="text-xs text-slate-500">
                Controlled verification testing using synthetic canary accounts to confirm if multi-tenant authorization boundaries can be crossed.
              </p>
            </div>
            <button
              onClick={handleVerifyDataExposure}
              disabled={isVerifyingExposure}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingExposure ? 'animate-spin' : ''}`} />
              <span>Verify Canary Isolation</span>
            </button>
          </div>

          {dataExposureResult ? (
            <div className={`border rounded-xl p-5 space-y-4 ${
              dataExposureResult.boundaryCrossed
                ? 'bg-red-950/30 border-red-800'
                : 'bg-[#151722] border-[#252838]'
            }`}>
              <div className="flex items-center justify-between border-b border-current/20 pb-3">
                <div className="flex items-center gap-2">
                  {dataExposureResult.boundaryCrossed ? (
                    <AlertTriangle className="w-6 h-6 text-red-400" />
                  ) : (
                    <CheckCircle className="w-6 h-6 text-emerald-400" />
                  )}
                  <div>
                    <h4 className="font-bold text-sm uppercase">
                      {dataExposureResult.finding}
                    </h4>
                    <span className="text-xs text-slate-400">
                      Confidence: {dataExposureResult.confidence}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-300">
                {dataExposureResult.explanation}
              </p>

              {dataExposureResult.evidence && dataExposureResult.evidence.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-bold text-slate-200 uppercase">Verification Evidence:</h5>
                  {dataExposureResult.evidence.map((ev: any, idx: number) => (
                    <div key={idx} className="bg-[#0c0d12] p-3 rounded border border-[#222434] text-xs font-mono space-y-1">
                      <div>{ev.description}</div>
                      {ev.probe && <div className="text-amber-400">Probe: {ev.probe}</div>}
                      {ev.canaryObserved && <div className="text-red-400 font-bold">Canary Token Observed: {ev.canaryObserved}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500 text-xs space-y-2">
              <Users className="w-10 h-10 mx-auto opacity-30" />
              <p>Click &quot;Verify Canary Isolation&quot; to test synthetic canary records on authorized endpoints.</p>
            </div>
          )}

          {/* Canary Policy Note */}
          <div className="bg-[#12141c] border border-blue-900/30 rounded-xl p-4 text-xs space-y-1.5">
            <h4 className="font-bold text-blue-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              <span>Strict Non-Destructive Synthetic Canary Policy</span>
            </h4>
            <p className="text-slate-400 text-[11px]">
              This module operates strictly with synthetic test records containing canary tokens. It never attempts to dump production tables, extract real passwords, or access live user personal records.
            </p>
          </div>
        </div>
      )}

      {/* TAB 4: SOURCE CODE SECURITY INSPECTOR */}
      {activeTab === 'source_code' && (
        <div className="flex-1 p-5 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between border-b border-[#252838] pb-3">
            <div>
              <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wider flex items-center gap-2">
                <FileCode className="w-4 h-4 text-emerald-400" />
                <span>Static Source Code Security Inspector</span>
              </h3>
              <p className="text-xs text-slate-500">
                Audits backend source code for unsafe query concatenation, raw SQL bypasses, and unparameterized statements.
              </p>
            </div>
            <button
              onClick={handleScanSourceCode}
              disabled={isScanningCode}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanningCode ? 'animate-spin' : ''}`} />
              <span>Scan Source Code</span>
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Source Code Snippet or File Path (e.g. tests/mock-server.js):
            </label>
            <textarea
              value={sourceCodeSnippet}
              onChange={e => setSourceCodeSnippet(e.target.value)}
              rows={5}
              className="w-full bg-[#0d0e14] border border-[#252838] rounded-lg p-3 font-mono text-xs text-emerald-300 outline-none focus:border-emerald-500"
            />
          </div>

          {sourceRisks.length > 0 ? (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>Identified Unsafe Query Patterns ({sourceRisks.length})</span>
              </h4>
              <div className="space-y-2">
                {sourceRisks.map((risk, idx) => (
                  <div key={idx} className="bg-[#151722] border border-red-900/40 rounded-xl p-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-red-300 font-mono text-xs">{risk.patternType}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {risk.fileName}:{risk.lineNumber}
                      </span>
                    </div>
                    <div className="bg-[#090a0f] p-2.5 rounded font-mono text-[11px] text-rose-300 border border-red-950">
                      <code>{risk.snippet}</code>
                    </div>
                    <p className="text-slate-300 text-[11px]">{risk.explanation}</p>
                    <div className="bg-[#0f1b15] p-2.5 rounded font-mono text-[11px] text-emerald-300 border border-emerald-900/40">
                      <span className="text-slate-400 block font-sans text-[10px] uppercase font-bold mb-1">Recommended Secure Rewrite:</span>
                      <code>{risk.secureRewrite}</code>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-slate-500 text-xs">
              Click &quot;Scan Source Code&quot; to inspect code for unsafe query construction.
            </div>
          )}
        </div>
      )}

      {/* TAB 5: REMEDIATION CENTER */}
      {activeTab === 'remediation' && (
        <div className="flex-1 p-5 overflow-y-auto space-y-4">
          <div className="border-b border-[#252838] pb-3">
            <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wider flex items-center gap-2">
              <Code className="w-4 h-4 text-teal-400" />
              <span>SQL Injection Remediation Center</span>
            </h3>
            <p className="text-xs text-slate-500">
              Technical guides and secure coding blueprints to remediate SQL injection vulnerabilities across all modern tech stacks.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="bg-[#14151e] border border-[#242636] rounded-xl p-4 space-y-2.5">
              <h4 className="font-bold text-teal-300 text-xs flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-teal-400" />
                <span>1. Parameterized Queries (Node.js &amp; SQLite)</span>
              </h4>
              <p className="text-slate-400 text-[11px]">
                Separate statement grammar from user data using placeholder markers (<code className="text-teal-300">?</code>):
              </p>
              <pre className="bg-[#090a0f] p-3 rounded font-mono text-[11px] text-teal-300 overflow-x-auto border border-[#1e202d]">
{`// SECURE: Parameterized Query
const sql = 'SELECT * FROM users WHERE email = ? AND role = ?';
db.all(sql, [userEmail, 'user'], (err, rows) => {
  // Database treats parameters purely as literal values
});`}
              </pre>
            </div>

            <div className="bg-[#14151e] border border-[#242636] rounded-xl p-4 space-y-2.5">
              <h4 className="font-bold text-teal-300 text-xs flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-teal-400" />
                <span>2. PostgreSQL (Node.js pg / $1 placeholders)</span>
              </h4>
              <p className="text-slate-400 text-[11px]">
                Use numbered positional parameters (<code className="text-teal-300">$1, $2</code>) to bind untrusted input:
              </p>
              <pre className="bg-[#090a0f] p-3 rounded font-mono text-[11px] text-teal-300 overflow-x-auto border border-[#1e202d]">
{`// SECURE: PostgreSQL Query Binding
const query = 'SELECT id, name FROM accounts WHERE id = $1';
const res = await pool.query(query, [accountId]);`}
              </pre>
            </div>

            <div className="bg-[#14151e] border border-[#242636] rounded-xl p-4 space-y-2.5">
              <h4 className="font-bold text-teal-300 text-xs flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-teal-400" />
                <span>3. Dynamic Identifiers Allow-Listing</span>
              </h4>
              <p className="text-slate-400 text-[11px]">
                Column names and sort orders cannot use bind parameters. Validate against strict allow-lists:
              </p>
              <pre className="bg-[#090a0f] p-3 rounded font-mono text-[11px] text-teal-300 overflow-x-auto border border-[#1e202d]">
{`// SECURE: Allowlist Validation for Sort Orders
const ALLOWED_COLUMNS = ['created_at', 'username', 'email'];
const sortBy = ALLOWED_COLUMNS.includes(req.query.sort) ? req.query.sort : 'created_at';
const order = req.query.order === 'DESC' ? 'DESC' : 'ASC';
const sql = \`SELECT * FROM items ORDER BY \${sortBy} \${order}\`;`}
              </pre>
            </div>

            <div className="bg-[#14151e] border border-[#242636] rounded-xl p-4 space-y-2.5">
              <h4 className="font-bold text-teal-300 text-xs flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-teal-400" />
                <span>4. Safe ORM Querying (Prisma / TypeORM)</span>
              </h4>
              <p className="text-slate-400 text-[11px]">
                Never bypass ORM protections using raw string template interpolation:
              </p>
              <pre className="bg-[#090a0f] p-3 rounded font-mono text-[11px] text-teal-300 overflow-x-auto border border-[#1e202d]">
{`// SECURE: Type-safe ORM query
const users = await prisma.user.findMany({
  where: { email: userEmail, active: true }
});`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: TESTING HISTORY & REPORTS */}
      {activeTab === 'history' && (
        <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between border-b border-[#252838] pb-3">
            <div>
              <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wider">
                SQL Injection Testing History &amp; Reports
              </h3>
              <p className="text-xs text-slate-500">
                Persistent audit history of all security testing operations and findings.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadReports}
                className="p-1.5 bg-[#202230] hover:bg-[#282a3c] rounded text-slate-300 cursor-pointer"
                title="Refresh history"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              {historyReports.length > 0 && (
                <button
                  onClick={handleClearReports}
                  className="flex items-center gap-1 px-3 py-1 bg-red-950/40 hover:bg-red-900/60 border border-red-800/40 text-red-300 rounded text-xs cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear History</span>
                </button>
              )}
            </div>
          </div>

          {historyReports.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs space-y-1">
              <FileText className="w-10 h-10 mx-auto opacity-30" />
              <p>No testing reports recorded yet.</p>
            </div>
          ) : (
            <div className="bg-[#14151e] border border-[#242636] rounded-lg overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#242636] text-slate-400 text-[11px] bg-[#111218]">
                    <th className="py-2.5 px-3 font-semibold">Target URL</th>
                    <th className="py-2.5 px-3 font-semibold">Parameter</th>
                    <th className="py-2.5 px-3 font-semibold">Finding</th>
                    <th className="py-2.5 px-3 font-semibold">Confidence</th>
                    <th className="py-2.5 px-3 font-semibold">Database</th>
                    <th className="py-2.5 px-3 font-semibold">Requests</th>
                    <th className="py-2.5 px-3 font-semibold">Timestamp</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e202d]">
                  {historyReports.map(rep => {
                    const isVuln = rep.finding === 'Potential SQL Injection' || 
                                   rep.finding === 'Boolean-Based Behavior Detected' || 
                                   rep.finding === 'Time-Based Behavior Detected' || 
                                   rep.finding === 'Possible Data Exposure';
                    const isErr = rep.finding === 'Database Error Detected';

                    return (
                      <tr key={rep.id} className="hover:bg-[#181a24] transition-colors">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-200 truncate max-w-xs">
                          {rep.target_url}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-300">
                          {rep.param_name} <span className="text-[10px] text-slate-500">({rep.param_location})</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isVuln ? 'bg-red-950 text-red-300 border border-red-800' :
                            isErr ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                            'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          }`}>
                            {rep.finding}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">{rep.confidence}</td>
                        <td className="py-2.5 px-3 text-slate-400 font-mono text-[10px]">{rep.db_fingerprint || 'Unknown'}</td>
                        <td className="py-2.5 px-3 text-slate-400 font-mono">{rep.requests_sent}</td>
                        <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                          {new Date(rep.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedReport(rep);
                                setActiveTab('scanner');
                              }}
                              className="px-2 py-1 bg-blue-950/60 hover:bg-blue-900/80 border border-blue-800/40 text-blue-300 rounded text-[11px] cursor-pointer"
                            >
                              Inspect
                            </button>
                            <button
                              onClick={() => handleExportReport(rep)}
                              className="p-1 hover:text-white text-slate-400 cursor-pointer"
                              title="Export Report"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteReport(rep.id)}
                              className="p-1 hover:text-red-400 text-slate-500 cursor-pointer"
                              title="Delete Report"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 7: TEST SETTINGS & SCOPE */}
      {activeTab === 'settings' && (
        <div className="flex-1 p-5 overflow-y-auto max-w-2xl space-y-4">
          <div>
            <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wider">
              Advanced SQLi Test Settings &amp; Safety Controls
            </h3>
            <p className="text-xs text-slate-500">
              Configure authorized scopes, rate limits, timeouts, and safe test categories.
            </p>
          </div>

          <div className="bg-[#151722] border border-[#262838] rounded-lg p-4 space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-300 mb-1 font-semibold">Authorized Target Host</label>
              <input
                type="text"
                value={settings.authorizedHost}
                onChange={e => setSettings({ ...settings, authorizedHost: e.target.value })}
                placeholder="127.0.0.1"
                className="w-full bg-[#101116] border border-[#2b2e3e] rounded p-2 text-slate-200 font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Testing is strictly constrained to this host or matching target scopes.
              </span>
            </div>

            {/* Allowed Test Categories */}
            <div>
              <label className="block text-slate-300 mb-1.5 font-semibold">Allowed Test Categories</label>
              <div className="grid grid-cols-4 gap-2">
                <label className="flex items-center gap-2 p-2 bg-[#101116] rounded border border-[#2b2e3e] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enabledCategories.includes('error')}
                    onChange={e => {
                      const cats = e.target.checked
                        ? [...settings.enabledCategories, 'error']
                        : settings.enabledCategories.filter(c => c !== 'error');
                      setSettings({ ...settings, enabledCategories: cats as any });
                    }}
                    className="rounded bg-slate-900 text-blue-600 cursor-pointer"
                  />
                  <span>Error-Based</span>
                </label>
                <label className="flex items-center gap-2 p-2 bg-[#101116] rounded border border-[#2b2e3e] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enabledCategories.includes('boolean')}
                    onChange={e => {
                      const cats = e.target.checked
                        ? [...settings.enabledCategories, 'boolean']
                        : settings.enabledCategories.filter(c => c !== 'boolean');
                      setSettings({ ...settings, enabledCategories: cats as any });
                    }}
                    className="rounded bg-slate-900 text-blue-600 cursor-pointer"
                  />
                  <span>Boolean-Based</span>
                </label>
                <label className="flex items-center gap-2 p-2 bg-[#101116] rounded border border-[#2b2e3e] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enabledCategories.includes('union')}
                    onChange={e => {
                      const cats = e.target.checked
                        ? [...settings.enabledCategories, 'union']
                        : settings.enabledCategories.filter(c => c !== 'union');
                      setSettings({ ...settings, enabledCategories: cats as any });
                    }}
                    className="rounded bg-slate-900 text-blue-600 cursor-pointer"
                  />
                  <span>UNION-Based</span>
                </label>
                <label className="flex items-center gap-2 p-2 bg-[#101116] rounded border border-[#2b2e3e] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enabledCategories.includes('time')}
                    onChange={e => {
                      const cats = e.target.checked
                        ? [...settings.enabledCategories, 'time']
                        : settings.enabledCategories.filter(c => c !== 'time');
                      setSettings({ ...settings, enabledCategories: cats as any });
                    }}
                    className="rounded bg-slate-900 text-blue-600 cursor-pointer"
                  />
                  <span>Time-Based</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Max Requests Per Parameter</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={settings.maxRequestsPerParam}
                  onChange={e => setSettings({ ...settings, maxRequestsPerParam: parseInt(e.target.value, 10) || 4 })}
                  className="w-full bg-[#101116] border border-[#2b2e3e] rounded p-2 text-slate-200"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Delay Between Requests (ms)</label>
                <input
                  type="number"
                  min="0"
                  max="2000"
                  value={settings.delayBetweenRequestsMs}
                  onChange={e => setSettings({ ...settings, delayBetweenRequestsMs: parseInt(e.target.value, 10) || 0 })}
                  className="w-full bg-[#101116] border border-[#2b2e3e] rounded p-2 text-slate-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Request Timeout (ms)</label>
                <input
                  type="number"
                  min="1000"
                  max="30000"
                  value={settings.requestTimeoutMs}
                  onChange={e => setSettings({ ...settings, requestTimeoutMs: parseInt(e.target.value, 10) || 8000 })}
                  className="w-full bg-[#101116] border border-[#2b2e3e] rounded p-2 text-slate-200"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Max Scan Duration (ms)</label>
                <input
                  type="number"
                  min="10000"
                  max="300000"
                  value={settings.maxScanDurationMs}
                  onChange={e => setSettings({ ...settings, maxScanDurationMs: parseInt(e.target.value, 10) || 60000 })}
                  className="w-full bg-[#101116] border border-[#2b2e3e] rounded p-2 text-slate-200"
                />
              </div>
            </div>

            <div className="bg-[#101116] p-3 rounded border border-[#222432] space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.syntheticCanaryMode}
                  onChange={e => setSettings({ ...settings, syntheticCanaryMode: e.target.checked })}
                  className="rounded bg-slate-900 border-slate-700 text-blue-600"
                />
                <span className="font-semibold text-slate-200">
                  Enable Synthetic Canary Data Exposure Verification
                </span>
              </label>
              <p className="text-[11px] text-slate-500 pl-5">
                Tests authorization boundaries using safe synthetic canary records on supported test endpoints.
              </p>
            </div>

            <div className="bg-[#101116] p-3 rounded border border-[#222432] space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.requireConfirmation}
                  onChange={e => setSettings({ ...settings, requireConfirmation: e.target.checked })}
                  className="rounded bg-slate-900 border-slate-700 text-blue-600"
                />
                <span className="font-semibold text-slate-200">
                  Require Confirmation Modal Before Starting Active Scans
                </span>
              </label>
              <p className="text-[11px] text-slate-500 pl-5">
                Displays target URL, parameter count, and rate limits to prevent unintended testing.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL BEFORE ACTIVE TESTING */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161824] border border-[#2c2f42] rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#2c2f42] pb-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <AlertTriangle className="w-5 h-5" />
                <span>Confirm Active SQL Injection Test</span>
              </div>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-2">
              <p>
                You are about to launch a controlled, non-destructive SQL injection assessment:
              </p>
              <div className="bg-[#0f1016] p-3 rounded border border-[#262838] space-y-1 font-mono text-[11px]">
                <div><span className="text-slate-500">Target URL:</span> <span className="text-blue-400">{targetReq.url}</span></div>
                <div><span className="text-slate-500">Method:</span> <span className="text-slate-200">{targetReq.method}</span></div>
                <div><span className="text-slate-500">Selected Parameters:</span> <span className="text-emerald-400">{params.filter(p => p.selected).length} params</span></div>
                <div><span className="text-slate-500">Rate Limit:</span> <span className="text-slate-200">{settings.delayBetweenRequestsMs}ms delay</span></div>
                <div><span className="text-slate-500">Categories:</span> <span className="text-purple-300">{settings.enabledCategories.join(', ')}</span></div>
              </div>
              <p className="text-[11px] text-slate-400">
                Please verify that you own or are explicitly authorized to test this target. Probes are read-only syntax tests and do not perform database modifications.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#262838]">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-3.5 py-1.5 bg-[#202230] text-slate-300 rounded text-xs cursor-pointer font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => executeActiveTest()}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold cursor-pointer"
              >
                Proceed &amp; Start Test
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
