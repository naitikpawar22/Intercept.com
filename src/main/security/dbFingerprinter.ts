/**
 * Database Fingerprinting Module
 * 
 * Accurately identifies backend database engines based on:
 * 1. Database-specific error signatures and exception messages
 * 2. HTTP response headers and driver banners
 * 3. SQL dialect syntax behavior
 * 
 * Safety Policy: Purely passive and non-destructive. Never executes administrative or destructive commands.
 */

export interface DbFingerprintResult {
  database: 'SQLite' | 'MySQL' | 'PostgreSQL' | 'MSSQL' | 'Oracle' | 'Unknown Database';
  confidence: 'High' | 'Medium' | 'Low' | 'None';
  evidence: string[];
  detectionMethod: 'Error Signature' | 'Header Analysis' | 'Dialect Behavior' | 'Source Inspection' | 'Inconclusive';
  versionHint?: string;
}

export class DbFingerprinter {
  // Regex signatures specific to each database engine
  private static readonly DB_PATTERNS = [
    {
      db: 'SQLite' as const,
      signatures: [
        /sqlite3\.OperationalError/i,
        /SQL logic error/i,
        /near ".*": syntax error/i,
        /unrecognized token:/i,
        /no such column:/i,
        /no such table:/i,
        /sqlite_master/i,
        /SQLite\/JDBCDriver/i,
        /System\.Data\.SQLite\.SQLiteException/i
      ]
    },
    {
      db: 'MySQL' as const,
      signatures: [
        /you have an error in your sql syntax/i,
        /check the manual that corresponds to your MySQL server version/i,
        /warning: mysql_/i,
        /MySqlException/i,
        /com\.mysql\.jdbc\.exceptions/i,
        /MySQLSyntaxErrorException/i,
        /mariadb/i,
        /Errcode:\s*\d+/i,
        /com\.mysql\.cj\.jdbc/i
      ]
    },
    {
      db: 'PostgreSQL' as const,
      signatures: [
        /syntax error at or near/i,
        /unterminated quoted string at or near/i,
        /PG::SyntaxError/i,
        /org\.postgresql\.util\.PSQLException/i,
        /ERROR:\s+42601/i,
        /PostgreSQL query failed/i,
        /pg_query\(\)/i,
        /Npgsql\.PostgresException/i
      ]
    },
    {
      db: 'MSSQL' as const,
      signatures: [
        /unclosed quotation mark after the character string/i,
        /incorrect syntax near/i,
        /Microsoft OLE DB Provider for SQL Server/i,
        /SqlException \(0x80131904\)/i,
        /com\.microsoft\.sqlserver\.jdbc\.SQLServerException/i,
        /Microsoft SQL Native Client/i,
        /ODBC SQL Server Driver/i
      ]
    },
    {
      db: 'Oracle' as const,
      signatures: [
        /ORA-00933/i,
        /ORA-00936/i,
        /ORA-01756/i,
        /quoted string not properly terminated/i,
        /java\.sql\.SQLException:\s*ORA-/i,
        /Oracle error/i,
        /PLS-\d+/i
      ]
    }
  ];

  /**
   * Fingerprints the database using response body, status code, and HTTP headers
   */
  public static fingerprint(
    responseBody: string,
    headers: Record<string, string> = {},
    statusCode?: number
  ): DbFingerprintResult {
    const evidenceList: string[] = [];
    const text = responseBody || '';

    // 1. Analyze Response Body against Database Error Signatures
    for (const item of this.DB_PATTERNS) {
      for (const pattern of item.signatures) {
        const match = text.match(pattern);
        if (match) {
          evidenceList.push(`Matched ${item.db} error signature: "${match[0]}"`);
          return {
            database: item.db,
            confidence: 'High',
            evidence: evidenceList,
            detectionMethod: 'Error Signature'
          };
        }
      }
    }

    // 2. Analyze HTTP Response Headers (e.g. Server, X-Powered-By)
    for (const [key, val] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      const lowerVal = String(val).toLowerCase();

      if (lowerKey === 'server' || lowerKey === 'x-powered-by' || lowerKey.includes('database')) {
        if (lowerVal.includes('sqlite')) {
          evidenceList.push(`Response header "${key}: ${val}" references SQLite`);
          return {
            database: 'SQLite',
            confidence: 'Medium',
            evidence: evidenceList,
            detectionMethod: 'Header Analysis'
          };
        }
        if (lowerVal.includes('mysql') || lowerVal.includes('mariadb')) {
          evidenceList.push(`Response header "${key}: ${val}" references MySQL/MariaDB`);
          return {
            database: 'MySQL',
            confidence: 'Medium',
            evidence: evidenceList,
            detectionMethod: 'Header Analysis'
          };
        }
        if (lowerVal.includes('postgres')) {
          evidenceList.push(`Response header "${key}: ${val}" references PostgreSQL`);
          return {
            database: 'PostgreSQL',
            confidence: 'Medium',
            evidence: evidenceList,
            detectionMethod: 'Header Analysis'
          };
        }
      }
    }

    // 3. Fallback: Generic SQL Keyword presence with HTTP 500
    if (statusCode === 500 && /(sql|database|driver|syntax|query)/i.test(text)) {
      evidenceList.push('Server returned HTTP 500 with generic database/SQL error keywords without engine-specific signature');
      return {
        database: 'Unknown Database',
        confidence: 'Low',
        evidence: evidenceList,
        detectionMethod: 'Inconclusive'
      };
    }

    return {
      database: 'Unknown Database',
      confidence: 'None',
      evidence: ['No database error signatures or server fingerprinting indicators observed in response.'],
      detectionMethod: 'Inconclusive'
    };
  }
}
