

export interface CanaryTestProfile {
  targetEndpoint: string;
  syntheticUserA: {
    id: string;
    username: string;
    canaryMarker: string; // e.g. "CANARY_TOKEN_ALPHA_771"
  };
  syntheticUserB: {
    id: string;
    username: string;
    canaryMarker: string; // e.g. "CANARY_TOKEN_BETA_992"
  };
}

export interface DataExposureVerificationResult {
  performed: boolean;
  boundaryCrossed: boolean;
  finding: 'Possible Data Exposure' | 'Boundary Maintained' | 'Not Configured';
  confidence: 'High' | 'Medium' | 'Low' | 'Informational';
  evidence: Array<{
    description: string;
    probe?: string;
    canaryObserved?: string;
    expectedBoundary?: string;
  }>;
  explanation: string;
}

export class DataExposureVerifier {
  // Known local test synthetic canaries
  public static readonly DEFAULT_SYNTHETIC_CANARIES: CanaryTestProfile = {
    targetEndpoint: '/api/sqli-canary',
    syntheticUserA: {
      id: 'usr_canary_a',
      username: 'synthetic_user_a',
      canaryMarker: 'CANARY_ALPHA_SECRET_101'
    },
    syntheticUserB: {
      id: 'usr_canary_b',
      username: 'synthetic_user_b',
      canaryMarker: 'CANARY_BETA_SECRET_202'
    }
  };

  /**
   * Verifies if a response exposes canary data beyond intended authorization boundaries
   */
  public static verifyCanaryExposure(
    responseBody: string,
    authorizedCanaryMarker: string,
    unauthorizedCanaryMarker: string,
    probeUsed: string
  ): DataExposureVerificationResult {
    const text = responseBody || '';
    const seesAuthorized = text.includes(authorizedCanaryMarker);
    const seesUnauthorized = text.includes(unauthorizedCanaryMarker);

    if (seesUnauthorized) {
      return {
        performed: true,
        boundaryCrossed: true,
        finding: 'Possible Data Exposure',
        confidence: 'High',
        evidence: [
          {
            description: 'Unauthorized synthetic canary marker was observed in response payload.',
            probe: probeUsed,
            canaryObserved: unauthorizedCanaryMarker,
            expectedBoundary: `Only authorized marker "${authorizedCanaryMarker}" should be returned`
          }
        ],
        explanation: 'The controlled SQL probe caused the application to return records belonging to an unauthorized synthetic test tenant, proving that authorization boundaries can be bypassed via SQL injection.'
      };
    }

    if (seesAuthorized && !seesUnauthorized) {
      return {
        performed: true,
        boundaryCrossed: false,
        finding: 'Boundary Maintained',
        confidence: 'High',
        evidence: [
          {
            description: 'Only authorized synthetic canary marker was returned. Authorization boundary held.',
            probe: probeUsed,
            expectedBoundary: `Only authorized marker "${authorizedCanaryMarker}"`
          }
        ],
        explanation: 'Application returned only the expected authorized synthetic records. No boundary crossing detected.'
      };
    }

    return {
      performed: true,
      boundaryCrossed: false,
      finding: 'Boundary Maintained',
      confidence: 'Low',
      evidence: [],
      explanation: 'No synthetic canary markers were returned in response.'
    };
  }

  /**
   * Returns a safe non-performed result when the target environment does not have synthetic canaries configured
   */
  public static notConfiguredResult(reason: string = 'Target is not configured with synthetic canary test data'): DataExposureVerificationResult {
    return {
      performed: false,
      boundaryCrossed: false,
      finding: 'Not Configured',
      confidence: 'Informational',
      evidence: [],
      explanation: `${reason}. Data exposure verification was not performed to prevent accessing real production records.`
    };
  }
}
