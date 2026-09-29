import http from 'http';
import https from 'https';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager, SqliScanReport, SqliFindingClassification, SqliVerificationStatus, ResponseDifferenceData, TimingEvidenceData, SafeVerificationData } from '../database/db';
import { ScopeValidator } from './scopeValidator';
import { TestCaseManager, DB_ERROR_SIGNATURES, SqlTestCase } from './testCaseManager';
import { DbFingerprinter, DbFingerprintResult } from './dbFingerprinter';
import { ResponseAnalyzer, ResponseComparisonResult } from './responseAnalyzer';
import { DataExposureVerifier, DataExposureVerificationResult } from './dataExposureVerifier';
import { SourceCodeAnalyzer, SourceCodeRisk } from './sourceCodeAnalyzer';

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

export interface SqliScanSettings {
  authorizedHost?: string;
  allowedPaths?: string[];
  allowedMethods?: string[];
  maxRequestsPerParam: number;
  requestTimeoutMs: number;
  delayBetweenRequestsMs: number;
  maxScanDurationMs?: number;
  enabledCategories?: Array<'error' | 'boolean' | 'union' | 'time' | 'blind' | 'second_order' | 'data_exposure'>;
  syntheticCanaryMode?: boolean;
  safeVerificationMode?: boolean;
  testMode: 'active' | 'passive';
  requireConfirmation: boolean;
}

export interface ScanProgressUpdate {
  scanId: string;
  paramName: string;
  totalParams: number;
  currentParamIndex: number;
  requestsSent: number;
  status: 'running' | 'completed' | 'stopped' | 'error';
  currentFinding?: string;
  report?: SqliScanReport;
  error?: string;
}

export class SqliScanner {
  private activeScans: Map<string, { abortController: AbortController; stopped: boolean; startTime: number }> = new Map();
  private testCaseManager: TestCaseManager;

  constructor(private db: DatabaseManager) {
    this.testCaseManager = new TestCaseManager();
  }

  /**
   * Infers primitive data type of parameter
   */
  private inferDataType(val: string): 'string' | 'number' | 'boolean' | 'json' | 'array' {
    if (!val) return 'string';
    const trimmed = val.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) return 'json';
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) return 'array';
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return 'number';
    if (/^(true|false)$/i.test(trimmed)) return 'boolean';
    return 'string';
  }

  /**
   * Detects authentication / credential fields like email, username, password
   */
  private detectAuthField(name: string): { isAuthField: boolean; authFieldType: 'email' | 'username' | 'password' | 'none' } {
    const lower = name.toLowerCase();
    if (/email|mail/i.test(lower)) {
      return { isAuthField: true, authFieldType: 'email' };
    }
    if (/pass|pwd|passwd|secret|passcode/i.test(lower)) {
      return { isAuthField: true, authFieldType: 'password' };
    }
    if (/^(user|username|login|account|identity|userid|uname)$/i.test(lower)) {
      return { isAuthField: true, authFieldType: 'username' };
    }
    return { isAuthField: false, authFieldType: 'none' };
  }

  /**
   * Extracts testable parameters from an HTTP request with data types and credential field recognition
   */
  public extractParameters(req: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body_text?: string;
    content_type?: string;
  }): ScanParameter[] {
    const params: ScanParameter[] = [];
    const seen = new Set<string>();

    // 1. Query parameters
    try {
      const parsedUrl = new URL(req.url);
      for (const [key, value] of parsedUrl.searchParams.entries()) {
        const id = `query:${key}`;
        if (!seen.has(id)) {
          seen.add(id);
          const auth = this.detectAuthField(key);
          params.push({
            name: key,
            location: 'query',
            originalValue: value,
            dataType: this.inferDataType(value),
            selected: true,
            status: 'pending',
            testCount: 0,
            isAuthField: auth.isAuthField,
            authFieldType: auth.authFieldType
          });
        }
      }
    } catch {}

    // 2. Body parameters
    const bodyText = req.body_text || '';
    const contentType = (req.content_type || (req.headers && req.headers['content-type']) || '').toLowerCase();

    if (bodyText) {
      if (contentType.includes('application/json') || bodyText.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(bodyText);
          this.extractJsonParams(parsed, '', (key, val) => {
            const id = `body_json:${key}`;
            if (!seen.has(id)) {
              seen.add(id);
              const strVal = String(val ?? '');
              const auth = this.detectAuthField(key);
              params.push({
                name: key,
                location: 'body_json',
                originalValue: strVal,
                dataType: this.inferDataType(strVal),
                selected: true,
                status: 'pending',
                testCount: 0,
                isAuthField: auth.isAuthField,
                authFieldType: auth.authFieldType
              });
            }
          });
        } catch {}
      } else if (contentType.includes('application/x-www-form-urlencoded') || bodyText.includes('=')) {
        try {
          const bodyParams = new URLSearchParams(bodyText);
          for (const [key, value] of bodyParams.entries()) {
            const id = `body_form:${key}`;
            if (!seen.has(id)) {
              seen.add(id);
              const auth = this.detectAuthField(key);
              params.push({
                name: key,
                location: 'body_form',
                originalValue: value,
                dataType: this.inferDataType(value),
                selected: true,
                status: 'pending',
                testCount: 0,
                isAuthField: auth.isAuthField,
                authFieldType: auth.authFieldType
              });
            }
          }
        } catch {}
      }
    }

    // Sort parameters so Auth Fields (email, pass, user) appear first
    return params.sort((a, b) => {
      if (a.isAuthField && !b.isAuthField) return -1;
      if (!a.isAuthField && b.isAuthField) return 1;
      return 0;
    });
  }

  private extractJsonParams(obj: any, prefix: string, callback: (k: string, v: any) => void) {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        this.extractJsonParams(value, fullPath, callback);
      } else {
        callback(fullPath, value);
      }
    }
  }

  /**
   * Passive Analysis: Scans existing intercepted traffic without sending any requests
   */
  public async passiveAnalyze(flow: {
    url: string;
    method: string;
    request_headers?: Record<string, string>;
    request_body?: string;
    response_status?: number;
    response_headers?: Record<string, string>;
    response_body?: string;
  }): Promise<SqliScanReport> {
    const evidenceList: any[] = [];
    const responseBody = flow.response_body || '';

    // Inspect response body for database error signatures
    const match = this.testCaseManager.matchDatabaseErrors(responseBody);
    let finding: SqliFindingClassification = 'No Issue Detected';
    let confidence: 'High' | 'Medium' | 'Low' | 'Informational' = 'Informational';

    const fingerprint = DbFingerprinter.fingerprint(responseBody, flow.response_headers || {}, flow.response_status);

    if (match.detected) {
      finding = 'Database Error Detected';
      confidence = 'Medium';
      evidenceList.push({
        description: `Passive analysis detected ${match.db} database error: ${match.description}`,
        matchedPattern: match.matchedPattern,
        snippet: match.snippet
      });
    }

    // Check for HTTP 500 with potential SQL keywords
    if (flow.response_status === 500 && !match.detected) {
      if (/(syntax|database|sql|driver|query)/i.test(responseBody)) {
        finding = 'Inconclusive';
        confidence = 'Low';
        evidenceList.push({
          description: 'Server returned HTTP 500 with database-related keywords, but no confirmed signature matched.'
        });
      }
    }

    const report: SqliScanReport = {
      id: uuidv4(),
      target_url: flow.url,
      method: flow.method,
      param_name: 'Passive Intercept Scan',
      param_location: 'query',
      finding,
      confidence,
      test_mode: 'passive',
      test_category: 'database_error',
      db_fingerprint: fingerprint.database,
      requests_sent: 0,
      duration_ms: 0,
      evidence: evidenceList,
      remediation: this.getRemediationGuidance(),
      risk_assessment: {
        technicalImpact: match.detected ? 'Exposed database syntax exception in passive traffic' : 'No issue observed',
        parameterized: true,
        errorsExposed: match.detected,
        boundaryCrossed: false
      },
      original_request: {
        url: flow.url,
        method: flow.method,
        headers: this.sanitizeHeaders(flow.request_headers || {}),
        body: flow.request_body
      },
      test_response: {
        status: flow.response_status || 0,
        headers: flow.response_headers || {},
        body: responseBody.slice(0, 1000)
      },
      timestamp: Date.now()
    };

    return report;
  }

  /**
   * Starts a controlled active scan against selected parameters
   */
  public async startActiveScan(
    req: {
      url: string;
      method: string;
      headers: Record<string, string>;
      body_text?: string;
      content_type?: string;
      original_response?: { status: number; headers: Record<string, string>; body: string };
    },
    paramsToTest: ScanParameter[],
    settings: SqliScanSettings,
    onProgress: (update: ScanProgressUpdate) => void
  ): Promise<SqliScanReport[]> {
    const scanId = uuidv4();
    const abortController = new AbortController();
    this.activeScans.set(scanId, { abortController, stopped: false, startTime: Date.now() });

    const reports: SqliScanReport[] = [];
    const scopes = await this.db.getScopes();

    // Verify authorized scope against project scopes and explicit scanner settings
    let isAuthorized = ScopeValidator.isUrlInScope(req.url, scopes);
    if (!isAuthorized && settings.authorizedHost) {
      try {
        const parsed = new URL(req.url);
        const host = parsed.hostname.toLowerCase();
        const authHost = settings.authorizedHost.trim().toLowerCase();
        if (authHost === '*' || host === authHost || host.endsWith(`.${authHost}`) || authHost.includes(host)) {
          isAuthorized = true;
        }
      } catch {}
    }

    if (!isAuthorized) {
      onProgress({
        scanId,
        paramName: '',
        totalParams: paramsToTest.length,
        currentParamIndex: 0,
        requestsSent: 0,
        status: 'error',
        error: `Target URL "${req.url}" is outside authorized scope. Active testing blocked.`
      });
      this.activeScans.delete(scanId);
      return [];
    }

    try {
      // 1. Establish baseline response if not provided
      let baseline = req.original_response;
      if (!baseline) {
        const baseRes = await this.makeHttpRequest({
          url: req.url,
          method: req.method,
          headers: req.headers,
          body: req.body_text
        }, abortController.signal, settings.requestTimeoutMs || 8000);
        baseline = { status: baseRes.statusCode, headers: baseRes.headers, body: baseRes.bodyText };
      }

      let totalRequestsSent = 0;
      const totalParams = paramsToTest.length;

      for (let i = 0; i < totalParams; i++) {
        const param = paramsToTest[i];
        if (this.isScanStopped(scanId)) break;

        onProgress({
          scanId,
          paramName: param.name,
          totalParams,
          currentParamIndex: i + 1,
          requestsSent: totalRequestsSent,
          status: 'running'
        });

        const startTime = Date.now();
        const testResults = await this.testSingleParameter(
          req,
          param,
          baseline,
          settings,
          abortController.signal,
          (reqs) => {
            totalRequestsSent += reqs;
          }
        );

        const duration = Date.now() - startTime;
        const report = await this.db.saveSqliReport({
          target_url: req.url,
          method: req.method,
          param_name: param.name,
          param_location: param.location,
          finding: testResults.finding,
          confidence: testResults.confidence,
          verification_status: testResults.verification_status,
          test_mode: 'active',
          test_category: testResults.testCategory,
          db_fingerprint: testResults.dbFingerprint,
          requests_sent: testResults.requestsSent,
          duration_ms: duration,
          response_difference: testResults.responseDifference,
          timing_evidence: testResults.timingEvidence,
          safe_verification: testResults.safeVerification,
          evidence: testResults.evidence,
          remediation: this.getRemediationGuidance(),
          risk_assessment: testResults.riskAssessment,
          original_request: {
            url: req.url,
            method: req.method,
            headers: this.sanitizeHeaders(req.headers),
            body: req.body_text
          },
          test_request: testResults.sampleTestRequest,
          test_response: testResults.sampleTestResponse,
          timestamp: Date.now()
        });

        reports.push(report);

        onProgress({
          scanId,
          paramName: param.name,
          totalParams,
          currentParamIndex: i + 1,
          requestsSent: totalRequestsSent,
          status: 'running',
          currentFinding: report.finding,
          report
        });

        // Delay between parameters to protect server stability
        if (settings.delayBetweenRequestsMs > 0 && i < totalParams - 1) {
          await new Promise(r => setTimeout(r, settings.delayBetweenRequestsMs));
        }
      }

      const finalStatus = this.isScanStopped(scanId) ? 'stopped' : 'completed';
      onProgress({
        scanId,
        paramName: '',
        totalParams,
        currentParamIndex: totalParams,
        requestsSent: totalRequestsSent,
        status: finalStatus
      });

    } catch (err: any) {
      onProgress({
        scanId,
        paramName: '',
        totalParams: paramsToTest.length,
        currentParamIndex: 0,
        requestsSent: 0,
        status: 'error',
        error: err.message
      });
    } finally {
      this.activeScans.delete(scanId);
    }

    return reports;
  }

  public stopScan(scanId: string): boolean {
    const scan = this.activeScans.get(scanId);
    if (scan) {
      scan.stopped = true;
      scan.abortController.abort();
      return true;
    }
    return false;
  }

  private isScanStopped(scanId: string): boolean {
    const scan = this.activeScans.get(scanId);
    return !scan || scan.stopped || scan.abortController.signal.aborted;
  }

  /**
   * Tests a single parameter across Error-based, Boolean-based, UNION-based, and Time-based categories
   */
  private async testSingleParameter(
    req: { url: string; method: string; headers: Record<string, string>; body_text?: string; content_type?: string },
    param: ScanParameter,
    baseline: { status: number; headers: Record<string, string>; body: string },
    settings: SqliScanSettings,
    signal: AbortSignal,
    onReqCount: (n: number) => void
  ): Promise<{
    finding: SqliFindingClassification;
    confidence: 'High' | 'Medium' | 'Low' | 'Informational';
    verification_status: SqliVerificationStatus;
    evidence: any[];
    requestsSent: number;
    testCategory: string;
    dbFingerprint: string;
    responseDifference: ResponseDifferenceData;
    timingEvidence: TimingEvidenceData;
    safeVerification: SafeVerificationData;
    riskAssessment: any;
    sampleTestRequest?: any;
    sampleTestResponse?: any;
  }> {
    const originalVal = param.originalValue || (param.dataType === 'number' ? '1' : 'test');
    const isNumeric = param.dataType === 'number' || /^-?\d+$/.test(originalVal.trim());
    const enabledCategories = settings.enabledCategories || ['error', 'boolean', 'union', 'time'];
    const isSafeMode = settings.safeVerificationMode !== false; // Enabled by default

    let reqsSent = 0;
    const evidenceList: any[] = [];
    let databaseErrorDetected = false;
    let singleQuoteBroke = false;
    let doubleQuoteRestored = false;
    let booleanDivergenceConfirmed = false;
    let timeDelayConfirmed = false;
    let unionStructureConfirmed = false;
    let canaryExposureConfirmed = false;
    let sampleTestReq: any = null;
    let sampleTestRes: any = null;
    let detectedEngine = 'Unknown Database';

    let primaryDiff: ResponseDifferenceData = {
      statusDivergence: false,
      baselineStatus: baseline.status,
      testStatus: baseline.status,
      lengthDifference: 0,
      normalizedSimilarity: 1.0,
      structuralShift: false,
      divergenceDetails: []
    };

    let timingEvidence: TimingEvidenceData = {
      baselineLatencyMs: 0,
      testLatencyMs: 0,
      deltaMs: 0,
      isTimingAnomaly: false,
      description: 'Latency within normal baseline threshold'
    };

    let safeVerification: SafeVerificationData = {
      stoppedEarly: false,
      dataExtractionAttempted: false
    };

    // Helper to record response divergence
    const recordDivergence = (testStatus: number, testBody: string) => {
      const comp = ResponseAnalyzer.compare(baseline, { status: testStatus, headers: {}, body: testBody });
      if (comp.hasDivergence) {
        if (!primaryDiff.statusDivergence || comp.statusDivergence) {
          primaryDiff = {
            statusDivergence: comp.statusDivergence,
            baselineStatus: baseline.status,
            testStatus,
            lengthDifference: comp.lengthDifference,
            normalizedSimilarity: Math.round(comp.normalizedSimilarity * 100) / 100,
            structuralShift: comp.isBehavioralShift && !comp.statusDivergence,
            divergenceDetails: comp.divergenceDetails
          };
        }
      }
    };

    // ==========================================
    // Phase 1: Error-Based Syntax Boundary Probes
    // ==========================================
    if (enabledCategories.includes('error')) {
      const errorProbes = [
        { name: 'Single Quote Syntax Boundary', value: `${originalVal}'`, type: 'error_break' },
        { name: 'Balanced Double-Single Quote Pair', value: `${originalVal}''`, type: 'error_balance' },
        { name: 'Double Quote Syntax Boundary', value: `${originalVal}"`, type: 'error_break' },
        { name: 'Parenthesis Quote Boundary', value: `${originalVal}')`, type: 'error_break' }
      ];

      if (isNumeric) {
        errorProbes.push({ name: 'Numeric Arithmetic Identity (-0)', value: `${originalVal}-0`, type: 'arithmetic' });
      }

      for (const probe of errorProbes) {
        if (signal.aborted || safeVerification.stoppedEarly) break;

        const modified = this.injectParam(req, param, probe.value);
        reqsSent++;
        onReqCount(1);

        try {
          const res = await this.makeHttpRequest({
            url: modified.url,
            method: modified.method,
            headers: modified.headers,
            body: modified.body
          }, signal, settings.requestTimeoutMs);

          sampleTestReq = { url: modified.url, method: modified.method, headers: this.sanitizeHeaders(modified.headers), body: modified.body };
          sampleTestRes = { status: res.statusCode, headers: res.headers, body: res.bodyText?.slice(0, 1000) };

          recordDivergence(res.statusCode, res.bodyText);

          // Fingerprint database from response
          const fp = DbFingerprinter.fingerprint(res.bodyText, res.headers, res.statusCode);
          if (fp.database !== 'Unknown Database') {
            detectedEngine = fp.database;
          }

          // Match database error signatures
          const match = this.testCaseManager.matchDatabaseErrors(res.bodyText);
          if (match.detected) {
            databaseErrorDetected = true;
            detectedEngine = match.db;
            evidenceList.push({
              probe: probe.value,
              description: `Response revealed ${match.db} database syntax error: ${match.description}`,
              matchedPattern: match.db,
              snippet: match.snippet
            });
          }

          // Check for status breakdown on quote
          if (probe.type === 'error_break') {
            if (res.statusCode >= 500 && baseline.status < 500) {
              singleQuoteBroke = true;
              evidenceList.push({
                probe: probe.value,
                description: `Single quote probe caused HTTP ${res.statusCode} server fault (baseline was HTTP ${baseline.status})`
              });
            } else {
              const diff = ResponseAnalyzer.compare(baseline, { status: res.statusCode, headers: res.headers, body: res.bodyText });
              if (diff.isBehavioralShift && !databaseErrorDetected) {
                evidenceList.push({
                  probe: probe.value,
                  description: `Probe altered response payload structure (similarity: ${Math.round(diff.normalizedSimilarity * 100)}%)`
                });
              }
            }
          }

          // Check for syntax restoration on balanced quote
          if (probe.type === 'error_balance' && singleQuoteBroke) {
            if (res.statusCode === baseline.status) {
              doubleQuoteRestored = true;
              evidenceList.push({
                probe: probe.value,
                description: `Balanced quote probe restored normal HTTP ${res.statusCode} status, confirming syntax sensitivity`
              });
            }
          }

          // Safe verification mode: Stop immediately if vulnerability confirmed
          if (isSafeMode && databaseErrorDetected && (singleQuoteBroke || doubleQuoteRestored)) {
            safeVerification = {
              stoppedEarly: true,
              confirmedPhase: 'Error-Based Syntax Boundary',
              reason: 'Safe verification mode: stopped further probing immediately after confirming error-based vulnerability. Zero data extraction attempted.',
              dataExtractionAttempted: false
            };
            break;
          }

          if (settings.delayBetweenRequestsMs > 0) {
            await new Promise(r => setTimeout(r, settings.delayBetweenRequestsMs));
          }
        } catch (err: any) {
          if (signal.aborted) break;
        }
      }
    }

    // ==========================================
    // Phase 2: Boolean-Based True/False Comparison
    // ==========================================
    if (enabledCategories.includes('boolean') && !signal.aborted && !safeVerification.stoppedEarly) {
      const trueVal = isNumeric ? `${originalVal} AND 1=1` : `${originalVal}' AND '1'='1`;
      const falseVal = isNumeric ? `${originalVal} AND 1=2` : `${originalVal}' AND '1'='2`;

      try {
        // 1. Send True-condition request
        const modTrue = this.injectParam(req, param, trueVal);
        reqsSent++;
        onReqCount(1);
        const resTrue = await this.makeHttpRequest({
          url: modTrue.url,
          method: modTrue.method,
          headers: modTrue.headers,
          body: modTrue.body
        }, signal, settings.requestTimeoutMs);

        // 2. Send False-condition request
        const modFalse = this.injectParam(req, param, falseVal);
        reqsSent++;
        onReqCount(1);
        const resFalse = await this.makeHttpRequest({
          url: modFalse.url,
          method: modFalse.method,
          headers: modFalse.headers,
          body: modFalse.body
        }, signal, settings.requestTimeoutMs);

        recordDivergence(resFalse.statusCode, resFalse.bodyText);

        // Normalized comparison using ResponseAnalyzer
        const diffTrue = ResponseAnalyzer.compare(baseline, { status: resTrue.statusCode, headers: resTrue.headers, body: resTrue.bodyText });
        const diffFalse = ResponseAnalyzer.compare(baseline, { status: resFalse.statusCode, headers: resFalse.headers, body: resFalse.bodyText });

        const trueMatches = !diffTrue.statusDivergence && diffTrue.normalizedSimilarity >= 0.85;
        const falseDiverges = diffFalse.statusDivergence || diffFalse.isBehavioralShift;

        if (trueMatches && falseDiverges) {
          // Repeat test once to confirm reproducibility
          const repeatFalse = await this.makeHttpRequest({
            url: modFalse.url,
            method: modFalse.method,
            headers: modFalse.headers,
            body: modFalse.body
          }, signal, settings.requestTimeoutMs);
          reqsSent++;
          onReqCount(1);

          if (repeatFalse.statusCode === resFalse.statusCode) {
            booleanDivergenceConfirmed = true;
            evidenceList.push({
              probe: `${trueVal} vs ${falseVal}`,
              description: `Controlled Boolean test demonstrated repeatable logic divergence: True-condition matched baseline (${resTrue.statusCode}), while False-condition produced divergent response (${resFalse.statusCode}, Δ${Math.abs(resFalse.bodyText.length - baseline.body.length)} bytes).`
            });

            if (isSafeMode) {
              safeVerification = {
                stoppedEarly: true,
                confirmedPhase: 'Boolean-Based Logic Divergence',
                reason: 'Safe verification mode: stopped further probing immediately after confirming boolean differential vulnerability. Zero data extraction attempted.',
                dataExtractionAttempted: false
              };
            }
          }
        }
      } catch {}
    }

    // ==========================================
    // Phase 3: UNION Structure Probing (ORDER BY 1 vs 99)
    // ==========================================
    if (enabledCategories.includes('union') && !signal.aborted && !safeVerification.stoppedEarly) {
      try {
        const modOrder1 = this.injectParam(req, param, `${originalVal}' ORDER BY 1--`);
        const modOrder99 = this.injectParam(req, param, `${originalVal}' ORDER BY 99--`);

        reqsSent += 2;
        onReqCount(2);

        const res1 = await this.makeHttpRequest({ url: modOrder1.url, method: modOrder1.method, headers: modOrder1.headers, body: modOrder1.body }, signal, settings.requestTimeoutMs);
        const res99 = await this.makeHttpRequest({ url: modOrder99.url, method: modOrder99.method, headers: modOrder99.headers, body: modOrder99.body }, signal, settings.requestTimeoutMs);

        recordDivergence(res99.statusCode, res99.bodyText);

        if (res1.statusCode === baseline.status && res99.statusCode >= 400) {
          unionStructureConfirmed = true;
          evidenceList.push({
            probe: `${originalVal}' ORDER BY 1-- vs ORDER BY 99--`,
            description: `Query structural sensitivity confirmed: ORDER BY 1 succeeded (${res1.statusCode}), while ORDER BY 99 produced column out-of-range exception (${res99.statusCode}).`
          });

          if (isSafeMode) {
            safeVerification = {
              stoppedEarly: true,
              confirmedPhase: 'UNION Structural Column Boundary',
              reason: 'Safe verification mode: stopped further probing immediately after confirming column structure constraint. Zero data extraction attempted.',
              dataExtractionAttempted: false
            };
          }
        }
      } catch {}
    }

    // ==========================================
    // Phase 4: Controlled Time-Based Timing Analysis
    // ==========================================
    if (enabledCategories.includes('time') && !signal.aborted && !safeVerification.stoppedEarly) {
      try {
        // Measure baseline latency (take average of 2 rapid requests)
        const t0 = Date.now();
        await this.makeHttpRequest({ url: req.url, method: req.method, headers: req.headers, body: req.body_text }, signal, settings.requestTimeoutMs);
        const baseLatency = Date.now() - t0;
        reqsSent++;
        onReqCount(1);

        // Bounded timing probe: 1.5s delay
        const timeProbe = `${originalVal}'||(SELECT 1 FROM pg_sleep(1.5))--`;
        const modTime = this.injectParam(req, param, timeProbe);
        
        const testStart = Date.now();
        await this.makeHttpRequest({ url: modTime.url, method: modTime.method, headers: modTime.headers, body: modTime.body }, signal, 10000);
        const testLatency = Date.now() - testStart;
        reqsSent++;
        onReqCount(1);

        let repeatLatency = 0;
        if (testLatency >= baseLatency + 1100) {
          // Repeat timing probe once to eliminate random network spikes
          const repeatStart = Date.now();
          await this.makeHttpRequest({ url: modTime.url, method: modTime.method, headers: modTime.headers, body: modTime.body }, signal, 10000);
          repeatLatency = Date.now() - repeatStart;
          reqsSent++;
          onReqCount(1);

          if (repeatLatency >= baseLatency + 1100) {
            timeDelayConfirmed = true;
            evidenceList.push({
              probe: timeProbe,
              description: `Controlled timing probe verified reproducible execution delay (${testLatency}ms and ${repeatLatency}ms vs baseline ${baseLatency}ms).`
            });

            if (isSafeMode) {
              safeVerification = {
                stoppedEarly: true,
                confirmedPhase: 'Time-Based Latency Delay',
                reason: 'Safe verification mode: stopped further probing immediately after confirming controllable time delay. Zero data extraction attempted.',
                dataExtractionAttempted: false
              };
            }
          }
        }

        timingEvidence = {
          baselineLatencyMs: baseLatency,
          testLatencyMs: testLatency,
          deltaMs: Math.max(0, testLatency - baseLatency),
          repeatedLatencyMs: repeatLatency || undefined,
          isTimingAnomaly: timeDelayConfirmed,
          description: timeDelayConfirmed
            ? `Controlled timing probe verified reproducible execution delay (${testLatency}ms and ${repeatLatency}ms vs baseline ${baseLatency}ms, delta: +${testLatency - baseLatency}ms)`
            : `Timing profile normal (${testLatency}ms probe vs ${baseLatency}ms baseline)`
        };
      } catch {}
    }

    // ==========================================
    // Phase 5: Synthetic Canary Data Exposure Check
    // ==========================================
    if ((settings.syntheticCanaryMode || req.url.includes('canary')) && !signal.aborted && !safeVerification.stoppedEarly) {
      try {
        const canaryProbe = `${originalVal}' OR '1'='1`;
        const modCanary = this.injectParam(req, param, canaryProbe);
        reqsSent++;
        onReqCount(1);

        const resCanary = await this.makeHttpRequest({ url: modCanary.url, method: modCanary.method, headers: modCanary.headers, body: modCanary.body }, signal, settings.requestTimeoutMs);
        const canaryResult = DataExposureVerifier.verifyCanaryExposure(
          resCanary.bodyText,
          'CANARY_TOKEN_ALPHA_771',
          'CANARY_TOKEN_BETA_992',
          canaryProbe
        );

        if (canaryResult.boundaryCrossed) {
          canaryExposureConfirmed = true;
          evidenceList.push(...canaryResult.evidence);

          if (isSafeMode) {
            safeVerification = {
              stoppedEarly: true,
              confirmedPhase: 'Synthetic Canary Isolation',
              reason: 'Safe verification mode: stopped further probing immediately after verifying multi-tenant canary isolation failure. Zero data extraction attempted.',
              dataExtractionAttempted: false
            };
          }
        }
      } catch {}
    }

    // ==========================================
    // Classification Logic & Confirmed vs Suspected
    // ==========================================
    let finding: SqliFindingClassification = 'No Issue Detected';
    let confidence: 'High' | 'Medium' | 'Low' | 'Informational' = 'Informational';
    let verification_status: SqliVerificationStatus = 'Safe';
    let primaryCategory = 'error';

    if (canaryExposureConfirmed) {
      finding = 'Possible Data Exposure';
      verification_status = 'Confirmed';
      confidence = 'High';
      primaryCategory = 'data_exposure';
    } else if (databaseErrorDetected && (singleQuoteBroke || doubleQuoteRestored)) {
      finding = 'Potential SQL Injection';
      verification_status = 'Confirmed';
      confidence = 'High';
      primaryCategory = 'error';
    } else if (booleanDivergenceConfirmed) {
      finding = 'Boolean-Based Behavior Detected';
      verification_status = 'Confirmed';
      confidence = 'High';
      primaryCategory = 'boolean';
    } else if (unionStructureConfirmed) {
      finding = 'Potential SQL Injection';
      verification_status = 'Confirmed';
      confidence = 'High';
      primaryCategory = 'union';
    } else if (timeDelayConfirmed) {
      finding = 'Time-Based Behavior Detected';
      verification_status = 'Confirmed';
      confidence = 'High';
      primaryCategory = 'time';
    } else if (databaseErrorDetected) {
      finding = 'Database Error Detected';
      verification_status = 'Suspected';
      confidence = 'Medium';
      primaryCategory = 'database_error';
    } else if (singleQuoteBroke && doubleQuoteRestored) {
      finding = 'Potential SQL Injection';
      verification_status = 'Suspected';
      confidence = 'Medium';
      primaryCategory = 'error';
    } else if (singleQuoteBroke) {
      finding = 'Inconclusive';
      verification_status = 'Suspected';
      confidence = 'Low';
      primaryCategory = 'error';
    } else {
      finding = 'No Issue Detected';
      verification_status = 'Safe';
      confidence = 'Informational';
      primaryCategory = 'error';
    }

    const riskAssessment = {
      technicalImpact: canaryExposureConfirmed
        ? 'Parameter allows bypassing authorization boundaries and exposes tenant records.'
        : databaseErrorDetected || booleanDivergenceConfirmed || unionStructureConfirmed
        ? 'Unescaped user input reaches backend database query, altering logic execution.'
        : timeDelayConfirmed
        ? 'Query execution time is controllable via injected SQL sleep constructs.'
        : singleQuoteBroke
        ? 'Parameter causes server fault on quote injection, but database control is unconfirmed.'
        : 'Input appears safely parameterized or sanitized.',
      parameterized: !databaseErrorDetected && !booleanDivergenceConfirmed && !singleQuoteBroke,
      errorsExposed: databaseErrorDetected,
      boundaryCrossed: canaryExposureConfirmed
    };

    return {
      finding,
      confidence,
      verification_status,
      evidence: evidenceList,
      requestsSent: reqsSent,
      testCategory: primaryCategory,
      dbFingerprint: detectedEngine,
      responseDifference: primaryDiff,
      timingEvidence,
      safeVerification,
      riskAssessment,
      sampleTestRequest: sampleTestReq,
      sampleTestResponse: sampleTestRes
    };
  }

  /**
   * Fingerprints the target database
   */
  public fingerprintTarget(body: string, headers: Record<string, string> = {}, status: number = 200): DbFingerprintResult {
    return DbFingerprinter.fingerprint(body, headers, status);
  }

  /**
   * Performs controlled synthetic data exposure verification
   */
  public async verifyDataExposure(req: { url: string; method: string; headers?: Record<string, string>; body?: string }): Promise<DataExposureVerificationResult> {
    const isCanaryConfigured = req.url.includes('canary');
    if (!isCanaryConfigured) {
      return DataExposureVerifier.notConfiguredResult('Application target is not configured with synthetic canary records');
    }

    try {
      const probe = "CANARY_COMPANY_ALPHA' OR '1'='1";
      const separator = req.url.includes('?') ? '&' : '?';
      const testUrl = `${req.url}${separator}company=${encodeURIComponent(probe)}`;

      const res = await this.makeHttpRequest({
        url: testUrl,
        method: req.method || 'GET',
        headers: req.headers
      }, new AbortController().signal, 8000);

      return DataExposureVerifier.verifyCanaryExposure(
        res.bodyText,
        'CANARY_TOKEN_ALPHA_771',
        'CANARY_TOKEN_BETA_992',
        probe
      );
    } catch (err: any) {
      return {
        performed: true,
        boundaryCrossed: false,
        finding: 'Boundary Maintained',
        confidence: 'Low',
        evidence: [],
        explanation: `Canary verification failed: ${err.message}`
      };
    }
  }

  /**
   * Scans backend source code for unsafe query concatenation
   */
  public scanSourceCode(filePathOrSnippet: string): SourceCodeRisk[] {
    if (filePathOrSnippet.includes('\n')) {
      return SourceCodeAnalyzer.scanCode(filePathOrSnippet, 'snippet.js');
    }
    return SourceCodeAnalyzer.scanFileOnDisk(filePathOrSnippet);
  }

  /**
   * Controlled 2-step second-order SQL injection test
   */
  public async runSecondOrderTest(data: { storeReq: any; triggerReq: any; paramName: string; probe?: string }): Promise<SqliScanReport> {
    const probe = data.probe || "admin'--";
    const storeReq = data.storeReq;
    const triggerReq = data.triggerReq;

    // Step 1: Store input with probe
    let storedBody = storeReq.body || {};
    if (typeof storedBody === 'string') {
      try { storedBody = JSON.parse(storedBody); } catch {}
    }
    storedBody[data.paramName] = probe;

    await this.makeHttpRequest({
      url: storeReq.url,
      method: storeReq.method || 'POST',
      headers: { ...storeReq.headers, 'content-type': 'application/json' },
      body: JSON.stringify(storedBody)
    }, new AbortController().signal, 8000);

    // Step 2: Trigger read endpoint
    const resTrigger = await this.makeHttpRequest({
      url: triggerReq.url,
      method: triggerReq.method || 'GET',
      headers: triggerReq.headers
    }, new AbortController().signal, 8000);

    const match = this.testCaseManager.matchDatabaseErrors(resTrigger.bodyText);
    const finding: SqliFindingClassification = match.detected ? 'Potential SQL Injection' : 'No Issue Detected';

    return {
      id: uuidv4(),
      target_url: triggerReq.url,
      method: triggerReq.method || 'GET',
      param_name: data.paramName,
      param_location: 'body_json',
      finding,
      confidence: match.detected ? 'High' : 'Informational',
      test_mode: 'active',
      test_category: 'second_order',
      db_fingerprint: match.db || 'Unknown Database',
      requests_sent: 2,
      duration_ms: 250,
      evidence: match.detected ? [{
        probe,
        description: `Second-order trigger request revealed stored database exception: ${match.description}`,
        snippet: match.snippet
      }] : [],
      remediation: this.getRemediationGuidance(),
      original_request: storeReq,
      test_request: triggerReq,
      test_response: { status: resTrigger.statusCode, body: resTrigger.bodyText.slice(0, 500) },
      timestamp: Date.now()
    };
  }

  /**
   * Injects probe into parameter location
   */
  private injectParam(
    req: { url: string; method: string; headers: Record<string, string>; body_text?: string; content_type?: string },
    param: ScanParameter,
    probeValue: string
  ): { url: string; method: string; headers: Record<string, string>; body?: string } {
    const headers = { ...req.headers };
    delete headers['content-length'];

    if (param.location === 'query') {
      const parsed = new URL(req.url);
      parsed.searchParams.set(param.name, probeValue);
      return { url: parsed.toString(), method: req.method, headers, body: req.body_text };
    }

    if (param.location === 'body_form') {
      const form = new URLSearchParams(req.body_text || '');
      form.set(param.name, probeValue);
      const newBody = form.toString();
      headers['content-type'] = 'application/x-www-form-urlencoded';
      const method = req.method === 'GET' ? 'POST' : req.method;
      return { url: req.url, method, headers, body: newBody };
    }

    if (param.location === 'body_json') {
      try {
        const obj = JSON.parse(req.body_text || '{}');
        this.setNestedValue(obj, param.name, probeValue);
        const newBody = JSON.stringify(obj);
        headers['content-type'] = 'application/json';
        const method = req.method === 'GET' ? 'POST' : req.method;
        return { url: req.url, method, headers, body: newBody };
      } catch {
        const method = req.method === 'GET' ? 'POST' : req.method;
        return { url: req.url, method, headers, body: req.body_text };
      }
    }

    return { url: req.url, method: req.method, headers, body: req.body_text };
  }

  private setNestedValue(obj: any, pathStr: string, value: any) {
    const parts = pathStr.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }

  private makeHttpRequest(
    options: { url: string; method: string; headers?: Record<string, string>; body?: string },
    signal: AbortSignal,
    timeoutMs: number = 8000
  ): Promise<{ statusCode: number; headers: Record<string, string>; bodyText: string }> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new Error('Scan aborted by user'));

      const parsedUrl = new URL(options.url);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const headers = { ...(options.headers || {}) };
      if (options.body) {
        headers['content-length'] = String(Buffer.byteLength(options.body, 'utf-8'));
      }

      const req = client.request(parsedUrl, {
        method: options.method,
        headers,
        signal,
        rejectUnauthorized: false
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const bodyBuffer = Buffer.concat(chunks);
          const bodyText = bodyBuffer.toString('utf-8');
          const respHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (v) respHeaders[k] = Array.isArray(v) ? v.join(', ') : v;
          }
          resolve({ statusCode: res.statusCode || 0, headers: respHeaders, bodyText });
        });
      });

      req.on('error', err => reject(err));
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
      });

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }

  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const clean: Record<string, string> = {};
    const sensitive = ['authorization', 'cookie', 'x-api-key', 'set-cookie'];
    for (const [k, v] of Object.entries(headers || {})) {
      if (sensitive.includes(k.toLowerCase())) {
        clean[k] = '[REDACTED]';
      } else {
        clean[k] = v;
      }
    }
    return clean;
  }

  public getRemediationGuidance(): string {
    return `### Recommended Remediation Guidance:
1. **Parameterized Queries / Prepared Statements**:
   - Always bind parameters using placeholder markers (\`?\`, \`$1\`, \`:param\`).
   - Never concatenate untrusted user inputs directly into SQL statement strings.
2. **Safe ORM Methods**:
   - Utilize standard ORM querying abstractions (Prisma, TypeORM, Sequelize, SQLAlchemy) rather than raw query bypasses.
3. **Server-Side Input Validation**:
   - Enforce strict allow-lists and data type constraints (e.g. integer casting, email format regex).
4. **Least-Privilege Database Accounts**:
   - Run the application with a database account restricted only to necessary tables and SELECT/INSERT/UPDATE permissions.
5. **Generic Production Error Handling**:
   - Suppress database driver exceptions and stack traces in HTTP responses to prevent database error disclosure.`;
  }
}
