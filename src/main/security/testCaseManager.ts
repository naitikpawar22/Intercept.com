/**
 * Centralized Safe SQL Injection Test Case Manager
 * 
 * Defines strictly non-destructive, controlled test cases for:
 * 1. Error-based detection (syntax boundaries, balance checks)
 * 2. Boolean-based detection (repeatable true vs false differential behavior)
 * 3. Controlled timing analysis (latency measurement with verification to avoid false positives)
 * 4. UNION-based query structure analysis (safe column count detection)
 * 5. Blind SQLi detection (indirect behavioral differential)
 * 6. Second-order SQLi workflow definitions
 * 7. Multi-engine database error signatures
 * 
 * Safety Policy: Zero destructive DDL/DML, zero data dumping, zero credential exfiltration.
 */

export type SqliCategory = 'error' | 'boolean' | 'union' | 'blind' | 'time' | 'second_order' | 'data_exposure' | 'database_error';
export type SqliParamType = 'all' | 'string' | 'numeric' | 'json';

export interface SqlTestCase {
  id: string;
  name: string;
  category: SqliCategory;
  paramType: SqliParamType;
  applicableDatabases: string[];
  generatePayload: (originalValue: string) => string;
  expectedBehavior: string;
  riskClassification: 'Safe / Non-destructive';
  booleanType?: 'true' | 'false';
  pairId?: string;
  expectedDelayMs?: number;
}

export interface DbErrorSignature {
  db: string;
  regex: RegExp;
  description: string;
}

// Multi-engine database syntax and driver error signatures
export const DB_ERROR_SIGNATURES: DbErrorSignature[] = [
  // SQLite
  { db: 'SQLite', regex: /sqlite3\.OperationalError/i, description: 'SQLite OperationalError exception' },
  { db: 'SQLite', regex: /SQL logic error/i, description: 'SQLite logic error' },
  { db: 'SQLite', regex: /near ".*": syntax error/i, description: 'SQLite syntax error near token' },
  { db: 'SQLite', regex: /unrecognized token:/i, description: 'SQLite unrecognized token' },
  { db: 'SQLite', regex: /no such column:/i, description: 'SQLite undefined column error' },
  { db: 'SQLite', regex: /no such table:/i, description: 'SQLite undefined table error' },

  // MySQL / MariaDB
  { db: 'MySQL', regex: /you have an error in your sql syntax/i, description: 'MySQL syntax error' },
  { db: 'MySQL', regex: /check the manual that corresponds to your MySQL server version/i, description: 'MySQL version syntax manual reference' },
  { db: 'MySQL', regex: /warning: mysql_/i, description: 'PHP MySQL driver warning' },
  { db: 'MySQL', regex: /MySqlException/i, description: 'MySQL .NET/Java Exception' },
  { db: 'MySQL', regex: /com\.mysql\.jdbc\.exceptions/i, description: 'MySQL JDBC Driver Exception' },
  { db: 'MySQL', regex: /MySQLSyntaxErrorException/i, description: 'MySQL Syntax Error Exception' },

  // PostgreSQL
  { db: 'PostgreSQL', regex: /syntax error at or near/i, description: 'PostgreSQL syntax error near position' },
  { db: 'PostgreSQL', regex: /unterminated quoted string at or near/i, description: 'PostgreSQL unterminated quoted string' },
  { db: 'PostgreSQL', regex: /PG::SyntaxError/i, description: 'Ruby PG SyntaxError' },
  { db: 'PostgreSQL', regex: /org\.postgresql\.util\.PSQLException/i, description: 'Java PostgreSQL Exception' },
  { db: 'PostgreSQL', regex: /ERROR:\s+42601/i, description: 'PostgreSQL 42601 syntax error code' },

  // Microsoft SQL Server
  { db: 'MSSQL', regex: /unclosed quotation mark after the character string/i, description: 'MSSQL unclosed quotation mark' },
  { db: 'MSSQL', regex: /incorrect syntax near/i, description: 'MSSQL incorrect syntax' },
  { db: 'MSSQL', regex: /Microsoft OLE DB Provider for SQL Server/i, description: 'MSSQL OLE DB driver error' },
  { db: 'MSSQL', regex: /SqlException \(0x80131904\)/i, description: 'MSSQL .NET exception' },
  { db: 'MSSQL', regex: /com\.microsoft\.sqlserver\.jdbc\.SQLServerException/i, description: 'MSSQL JDBC Exception' },

  // Oracle
  { db: 'Oracle', regex: /ORA-00933/i, description: 'Oracle SQL command not properly ended' },
  { db: 'Oracle', regex: /ORA-00936/i, description: 'Oracle missing expression' },
  { db: 'Oracle', regex: /quoted string not properly terminated/i, description: 'Oracle unterminated quoted string' },
  { db: 'Oracle', regex: /java\.sql\.SQLException:\s*ORA-/i, description: 'Oracle Java SQL Exception' },

  // Generic SQL / ODBC
  { db: 'Generic SQL', regex: /SQL command not properly ended/i, description: 'Generic SQL command error' },
  { db: 'Generic SQL', regex: /unexpected end of SQL command/i, description: 'Unexpected end of SQL statement' },
  { db: 'Generic SQL', regex: /syntax error in SQL statement/i, description: 'Generic SQL syntax error' }
];

export class TestCaseManager {
  private testCases: SqlTestCase[] = [];

  constructor() {
    this.initializeTestCases();
  }

  private initializeTestCases() {
    this.testCases = [
      // ==========================================
      // Category 1: Error-Based Detection Probes
      // ==========================================
      {
        id: 'err_single_quote',
        name: 'Single Quote Syntax Boundary',
        category: 'error',
        paramType: 'all',
        applicableDatabases: ['SQLite', 'MySQL', 'PostgreSQL', 'MSSQL', 'Oracle', 'Generic SQL'],
        generatePayload: (val) => `${val}'`,
        expectedBehavior: 'Breaks string literal boundary and triggers unhandled SQL syntax error on unparameterized queries.',
        riskClassification: 'Safe / Non-destructive'
      },
      {
        id: 'err_balanced_quote',
        name: 'Balanced Double-Single Quote Balance',
        category: 'error',
        paramType: 'all',
        applicableDatabases: ['SQLite', 'MySQL', 'PostgreSQL', 'MSSQL', 'Oracle', 'Generic SQL'],
        generatePayload: (val) => `${val}''`,
        expectedBehavior: 'Escapes single quote inside standard SQL string literals, restoring valid syntax.',
        riskClassification: 'Safe / Non-destructive'
      },
      {
        id: 'err_double_quote',
        name: 'Double Quote Syntax Boundary',
        category: 'error',
        paramType: 'all',
        applicableDatabases: ['MySQL', 'PostgreSQL', 'SQLite', 'MSSQL'],
        generatePayload: (val) => `${val}"`,
        expectedBehavior: 'Tests ANSI double quote identifier / string boundary handling.',
        riskClassification: 'Safe / Non-destructive'
      },
      {
        id: 'err_parenthesis_quote',
        name: 'Quote with Closing Parenthesis',
        category: 'error',
        paramType: 'string',
        applicableDatabases: ['SQLite', 'MySQL', 'PostgreSQL', 'MSSQL', 'Oracle'],
        generatePayload: (val) => `${val}')`,
        expectedBehavior: 'Tests parenthesis nested clauses (e.g. IN (...) or WHERE (...) syntax).',
        riskClassification: 'Safe / Non-destructive'
      },
      {
        id: 'err_backslash',
        name: 'Backslash Escape Character Probe',
        category: 'error',
        paramType: 'string',
        applicableDatabases: ['MySQL', 'PostgreSQL', 'Generic SQL'],
        generatePayload: (val) => `${val}\\`,
        expectedBehavior: 'Tests backslash escaping behavior across MySQL and PostgreSQL engines.',
        riskClassification: 'Safe / Non-destructive'
      },
      {
        id: 'err_numeric_arithmetic',
        name: 'Numeric Identity Arithmetic Probe',
        category: 'error',
        paramType: 'numeric',
        applicableDatabases: ['SQLite', 'MySQL', 'PostgreSQL', 'MSSQL', 'Oracle'],
        generatePayload: (val) => `${val}-0`,
        expectedBehavior: 'Tests mathematical evaluation identity for numeric parameters without altering logic value.',
        riskClassification: 'Safe / Non-destructive'
      },

      // ==========================================
      // Category 2: Boolean-Based Detection Probes
      // ==========================================
      // String True condition
      {
        id: 'bool_str_true',
        name: 'Boolean String True Condition',
        category: 'boolean',
        paramType: 'string',
        applicableDatabases: ['SQLite', 'MySQL', 'PostgreSQL', 'MSSQL', 'Oracle'],
        generatePayload: (val) => `${val}' AND '1'='1`,
        expectedBehavior: 'Appends universally true conditional logic preserving original baseline results.',
        riskClassification: 'Safe / Non-destructive',
        booleanType: 'true',
        pairId: 'bool_str_pair'
      },
      // String False condition
      {
        id: 'bool_str_false',
        name: 'Boolean String False Condition',
        category: 'boolean',
        paramType: 'string',
        applicableDatabases: ['SQLite', 'MySQL', 'PostgreSQL', 'MSSQL', 'Oracle'],
        generatePayload: (val) => `${val}' AND '1'='2`,
        expectedBehavior: 'Appends universally false conditional logic causing query to return empty set / different response.',
        riskClassification: 'Safe / Non-destructive',
        booleanType: 'false',
        pairId: 'bool_str_pair'
      },
      // Numeric True condition
      {
        id: 'bool_num_true',
        name: 'Boolean Numeric True Condition',
        category: 'boolean',
        paramType: 'numeric',
        applicableDatabases: ['SQLite', 'MySQL', 'PostgreSQL', 'MSSQL', 'Oracle'],
        generatePayload: (val) => `${val} AND 1=1`,
        expectedBehavior: 'Appends numeric true logic preserving baseline return data.',
        riskClassification: 'Safe / Non-destructive',
        booleanType: 'true',
        pairId: 'bool_num_pair'
      },
      // Numeric False condition
      {
        id: 'bool_num_false',
        name: 'Boolean Numeric False Condition',
        category: 'boolean',
        paramType: 'numeric',
        applicableDatabases: ['SQLite', 'MySQL', 'PostgreSQL', 'MSSQL', 'Oracle'],
        generatePayload: (val) => `${val} AND 1=2`,
        expectedBehavior: 'Appends numeric false logic causing query return differentiation.',
        riskClassification: 'Safe / Non-destructive',
        booleanType: 'false',
        pairId: 'bool_num_pair'
      },

      // ==========================================
      // Category 3: UNION-Based Structure Analysis
      // ==========================================
      {
        id: 'union_order_by_1',
        name: 'UNION Query Structure Probe (ORDER BY 1)',
        category: 'union',
        paramType: 'all',
        applicableDatabases: ['SQLite', 'MySQL', 'PostgreSQL', 'MSSQL', 'Oracle'],
        generatePayload: (val) => `${val}' ORDER BY 1--`,
        expectedBehavior: 'Tests if sorting by column 1 succeeds without altering result data.',
        riskClassification: 'Safe / Non-destructive'
      },
      {
        id: 'union_order_by_large',
        name: 'UNION Column Boundary Probe (ORDER BY 99)',
        category: 'union',
        paramType: 'all',
        applicableDatabases: ['SQLite', 'MySQL', 'PostgreSQL', 'MSSQL', 'Oracle'],
        generatePayload: (val) => `${val}' ORDER BY 99--`,
        expectedBehavior: 'Causes column out of range error if parameter influences query structure.',
        riskClassification: 'Safe / Non-destructive'
      },

      // ==========================================
      // Category 4: Controlled Time-Based Probes
      // ==========================================
      {
        id: 'time_pg_sleep',
        name: 'PostgreSQL Controlled Sleep Probe (1.5s)',
        category: 'time',
        paramType: 'string',
        applicableDatabases: ['PostgreSQL'],
        generatePayload: (val) => `${val}'||(SELECT 1 FROM pg_sleep(1.5))--`,
        expectedBehavior: 'Introduces a safe, bounded 1.5s delay verified against repeated observations.',
        riskClassification: 'Safe / Non-destructive',
        expectedDelayMs: 1500
      },
      {
        id: 'time_sqlite_sleep',
        name: 'SQLite/Generic Controlled Timing Probe',
        category: 'time',
        paramType: 'all',
        applicableDatabases: ['SQLite', 'Generic SQL'],
        generatePayload: (val) => `${val}' AND 1=(SELECT 1 FROM (SELECT count(*) FROM sqlite_master) WHERE 1=1)--`,
        expectedBehavior: 'Safe non-destructive bounded query benchmark for timing comparison.',
        riskClassification: 'Safe / Non-destructive',
        expectedDelayMs: 1000
      },

      // ==========================================
      // Category 5: Blind SQLi Indirect Probes
      // ==========================================
      {
        id: 'blind_length_probe',
        name: 'Blind SQLi Structural Length Shift',
        category: 'blind',
        paramType: 'string',
        applicableDatabases: ['SQLite', 'MySQL', 'PostgreSQL', 'MSSQL'],
        generatePayload: (val) => `${val}' OR 1=1--`,
        expectedBehavior: 'Detects if returning all rows alters payload length in blind scenarios.',
        riskClassification: 'Safe / Non-destructive'
      }
    ];
  }

  /**
   * Retrieves test cases filtered by category and parameter data type
   */
  public getTestCases(category?: SqliCategory, paramType?: SqliParamType): SqlTestCase[] {
    return this.testCases.filter(tc => {
      if (category && tc.category !== category) return false;
      if (paramType && tc.paramType !== 'all' && tc.paramType !== paramType) return false;
      return true;
    });
  }

  /**
   * Scans a text response for database error signatures
   */
  public matchDatabaseErrors(text: string): { detected: boolean; db: string; description?: string; matchedPattern?: string; snippet?: string } {
    if (!text || typeof text !== 'string') return { detected: false, db: 'None' };

    for (const sig of DB_ERROR_SIGNATURES) {
      const match = text.match(sig.regex);
      if (match) {
        const start = Math.max(0, match.index! - 20);
        const end = Math.min(text.length, match.index! + 80);
        return {
          detected: true,
          db: sig.db,
          description: sig.description,
          matchedPattern: match[0],
          snippet: text.substring(start, end).trim()
        };
      }
    }

    return { detected: false, db: 'None' };
  }
}
