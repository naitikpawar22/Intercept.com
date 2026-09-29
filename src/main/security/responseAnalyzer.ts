/**
 * Advanced Response Analysis Engine
 * 
 * Compares baseline responses against test probe responses while normalizing
 * dynamic values (timestamps, tokens, request IDs, UUIDs) to eliminate false positives.
 */

export interface ResponseComparisonResult {
  hasDivergence: boolean;
  isBehavioralShift: boolean;
  statusDivergence: boolean;
  lengthDifference: number;
  normalizedSimilarity: number; // 0.0 to 1.0 (1.0 = identical)
  dbErrorDetected: boolean;
  dbEngine?: string;
  divergenceDetails: string[];
  normalizedBaselineBody: string;
  normalizedTestBody: string;
}

export class ResponseAnalyzer {
  /**
   * Normalizes dynamic, non-deterministic values:
   * - ISO 8601 timestamps (e.g. 2026-09-29T10:15:30.000Z)
   * - Epoch timestamps (e.g. 1740829183912)
   * - UUIDs / GUIDs
   * - JWT tokens / Session hashes
   * - Dynamic request IDs
   */
  public static normalizeDynamicValues(text: string): string {
    if (!text || typeof text !== 'string') return '';

    return text
      // ISO 8601 Timestamps
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g, '<DYNAMIC_TIMESTAMP>')
      // Date strings (e.g. Mon, 29 Sep 2026 10:15:30 GMT)
      .replace(/[A-Za-z]{3},\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+GMT/g, '<DYNAMIC_DATE>')
      // 10 or 13 digit Unix timestamps in JSON: e.g. "timestamp": 1727582049123
      .replace(/"(timestamp|time|ts|created_at|updated_at|expires_at)":\s*\d{10,13}/gi, '"$1": <DYNAMIC_EPOCH>')
      // UUIDs (8-4-4-4-12 hex representation)
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<DYNAMIC_UUID>')
      // JWT tokens (3 base64url segments separated by dots)
      .replace(/eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, '<DYNAMIC_JWT>')
      // Hex hashes / session IDs (32 or 64 characters)
      .replace(/\b[0-9a-f]{32,64}\b/gi, '<DYNAMIC_HASH>');
  }

  /**
   * Compares a baseline response with a test response
   */
  public static compare(
    baseline: { status: number; headers: Record<string, string>; body: string },
    test: { status: number; headers: Record<string, string>; body: string }
  ): ResponseComparisonResult {
    const divergenceDetails: string[] = [];
    const statusDivergence = baseline.status !== test.status;

    if (statusDivergence) {
      divergenceDetails.push(`Status changed from HTTP ${baseline.status} to HTTP ${test.status}`);
    }

    const normBase = this.normalizeDynamicValues(baseline.body || '');
    const normTest = this.normalizeDynamicValues(test.body || '');
    const lengthDifference = Math.abs(normTest.length - normBase.length);

    if (lengthDifference > 40 && !statusDivergence) {
      divergenceDetails.push(`Normalized payload length shifted by ${lengthDifference} bytes (${normBase.length} -> ${normTest.length})`);
    }

    // Calculate normalized similarity using Levenshtein distance or token similarity
    const similarity = this.calculateSimilarity(normBase, normTest);

    // Detect structural JSON changes if applicable
    let structuralDiff = false;
    try {
      const baseJson = JSON.parse(normBase);
      const testJson = JSON.parse(normTest);
      const baseKeys = Object.keys(baseJson).sort().join(',');
      const testKeys = Object.keys(testJson).sort().join(',');
      if (baseKeys !== testKeys) {
        structuralDiff = true;
        divergenceDetails.push(`JSON response structure altered (keys changed: [${baseKeys}] vs [${testKeys}])`);
      }
    } catch {}

    const isBehavioralShift = statusDivergence || lengthDifference > 80 || structuralDiff || similarity < 0.85;

    return {
      hasDivergence: statusDivergence || isBehavioralShift,
      isBehavioralShift,
      statusDivergence,
      lengthDifference,
      normalizedSimilarity: similarity,
      dbErrorDetected: false,
      divergenceDetails,
      normalizedBaselineBody: normBase,
      normalizedTestBody: normTest
    };
  }

  /**
   * Fast normalized string similarity metric (0.0 to 1.0)
   */
  private static calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1.0;
    if (!a.length || !b.length) return 0.0;

    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;

    if (shorter.length === 0) return 0.0;

    // Approximate token Jaccard similarity for fast performance
    const wordsA = new Set(a.split(/\s+/));
    const wordsB = new Set(b.split(/\s+/));
    let intersection = 0;

    for (const w of wordsA) {
      if (wordsB.has(w)) intersection++;
    }

    const union = new Set([...wordsA, ...wordsB]).size;
    return union > 0 ? intersection / union : 1.0;
  }
}
