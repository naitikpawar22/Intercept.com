import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';

export interface DBRequest {
  id: string;
  project_id?: string;
  flow_id?: string;
  method: string;
  url: string;
  domain: string;
  path: string;
  scheme: string;
  port: number;
  headers: Record<string, string>;
  query_params?: Record<string, string>;
  body_text?: string;
  content_type?: string;
  content_length?: number;
  timestamp: number;
  is_intercepted?: number;
  is_modified?: number;
  in_scope?: number;
}

export interface DBResponse {
  id: string;
  request_id: string;
  status_code: number;
  status_message?: string;
  headers: Record<string, string>;
  body_text?: string;
  content_type?: string;
  content_length?: number;
  duration_ms: number;
  mime_type?: string;
  resource_type?: string;
  timestamp: number;
  is_modified?: number;
}

export interface ScopeRule {
  id: string;
  project_id?: string;
  pattern: string;
  is_regex: number;
  enabled: number;
  created_at?: string;
}

export class DatabaseManager {
  private db: sqlite3.Database | null = null;
  private dbPath: string;

  constructor(customPath?: string) {
    if (customPath) {
      this.dbPath = customPath;
    } else {
      const userDataDir = app ? app.getPath('userData') : path.resolve(__dirname, '../../data');
      if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
      }
      this.dbPath = path.join(userDataDir, 'netscope.db');
    }
  }

  public async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('[DB] Failed to open SQLite database:', err);
          return reject(err);
        }
        this.runMigrations()
          .then(() => resolve())
          .catch(reject);
      });
    });
  }

  private async runMigrations(): Promise<void> {
    const schemaFile = path.resolve(__dirname, '../../../database/schema.sql');
    let schemaSql = '';
    if (fs.existsSync(schemaFile)) {
      schemaSql = fs.readFileSync(schemaFile, 'utf-8');
    } else {
      const fallbackFile = path.resolve(process.cwd(), 'database/schema.sql');
      if (fs.existsSync(fallbackFile)) {
        schemaSql = fs.readFileSync(fallbackFile, 'utf-8');
      }
    }

    if (!schemaSql) {
      throw new Error('Could not find schema.sql');
    }

    return new Promise((resolve, reject) => {
      this.db!.exec(schemaSql, (err) => {
        if (err) {
          console.error('[DB] Migration error:', err);
          return reject(err);
        }
        console.log('[DB] Database schema initialized at:', this.dbPath);
        // Ensure new columns exist in sqli_scan_reports
        const colMigrations = [
          `ALTER TABLE sqli_scan_reports ADD COLUMN verification_status TEXT DEFAULT 'Suspected'`,
          `ALTER TABLE sqli_scan_reports ADD COLUMN response_difference TEXT DEFAULT '{}'`,
          `ALTER TABLE sqli_scan_reports ADD COLUMN timing_evidence TEXT DEFAULT '{}'`,
          `ALTER TABLE sqli_scan_reports ADD COLUMN safe_verification TEXT DEFAULT '{}'`
        ];
        colMigrations.forEach(sql => {
          this.db!.run(sql, () => {});
        });
        // Ensure default scope exists
        this.ensureDefaultScope().then(resolve).catch(reject);
      });
    });
  }

  private async ensureDefaultScope(): Promise<void> {
    const scopes = await this.getScopes();
    if (scopes.length === 0) {
      await this.addScope('*', 0);
    }
  }

  public async recordTransaction(req: Omit<DBRequest, 'id'>, res: Omit<DBResponse, 'id' | 'request_id'>): Promise<{ requestId: string; responseId: string }> {
    const requestId = uuidv4();
    const responseId = uuidv4();

    return new Promise((resolve, reject) => {
      this.db!.serialize(() => {
        const reqStmt = this.db!.prepare(`
          INSERT INTO requests (
            id, project_id, flow_id, method, url, domain, path, scheme, port,
            headers, query_params, body_text, content_type, content_length,
            timestamp, is_intercepted, is_modified, in_scope
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        reqStmt.run(
          requestId,
          req.project_id || 'default',
          req.flow_id || '',
          req.method,
          req.url,
          req.domain,
          req.path,
          req.scheme,
          req.port || 80,
          JSON.stringify(req.headers || {}),
          JSON.stringify(req.query_params || {}),
          req.body_text || '',
          req.content_type || '',
          req.content_length || 0,
          req.timestamp || Date.now(),
          req.is_intercepted || 0,
          req.is_modified || 0,
          req.in_scope !== undefined ? req.in_scope : 1,
          (err: Error | null) => {
            if (err) console.error('[DB] Error inserting request:', err);
          }
        );
        reqStmt.finalize();

        const resStmt = this.db!.prepare(`
          INSERT INTO responses (
            id, request_id, status_code, status_message, headers, body_text,
            content_type, content_length, duration_ms, mime_type, resource_type,
            timestamp, is_modified
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        resStmt.run(
          responseId,
          requestId,
          res.status_code,
          res.status_message || '',
          JSON.stringify(res.headers || {}),
          res.body_text || '',
          res.content_type || '',
          res.content_length || 0,
          res.duration_ms || 0,
          res.mime_type || '',
          res.resource_type || 'Other',
          res.timestamp || Date.now(),
          res.is_modified || 0,
          (err: Error | null) => {
            if (err) {
              console.error('[DB] Error inserting response:', err);
              return reject(err);
            }
            resolve({ requestId, responseId });
          }
        );
        resStmt.finalize();
      });
    });
  }

  public async getHistory(filters: {
    query?: string;
    method?: string;
    statusCode?: number;
    resourceType?: string;
    domain?: string;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT 
          r.id as request_id,
          r.method,
          r.url,
          r.domain,
          r.path,
          r.scheme,
          r.port,
          r.headers as request_headers,
          r.body_text as request_body,
          r.timestamp as request_timestamp,
          r.in_scope,
          s.id as response_id,
          s.status_code,
          s.status_message,
          s.headers as response_headers,
          s.body_text as response_body,
          s.content_length,
          s.duration_ms,
          s.mime_type,
          s.resource_type,
          s.timestamp as response_timestamp
        FROM requests r
        LEFT JOIN responses s ON r.id = s.request_id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (filters.query) {
        sql += ` AND (r.url LIKE ? OR r.body_text LIKE ? OR s.body_text LIKE ?)`;
        const q = `%${filters.query}%`;
        params.push(q, q, q);
      }
      if (filters.method && filters.method !== 'ALL') {
        sql += ` AND r.method = ?`;
        params.push(filters.method.toUpperCase());
      }
      if (filters.domain) {
        sql += ` AND r.domain LIKE ?`;
        params.push(`%${filters.domain}%`);
      }
      if (filters.statusCode) {
        sql += ` AND s.status_code = ?`;
        params.push(filters.statusCode);
      }
      if (filters.resourceType && filters.resourceType !== 'ALL') {
        sql += ` AND s.resource_type = ?`;
        params.push(filters.resourceType);
      }

      sql += ` ORDER BY r.timestamp DESC LIMIT ? OFFSET ?`;
      params.push(filters.limit || 500, filters.offset || 0);

      this.db!.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        const mapped = rows.map((row: any) => ({
          ...row,
          request_headers: this.safeJson(row.request_headers),
          response_headers: this.safeJson(row.response_headers)
        }));
        resolve(mapped);
      });
    });
  }

  public async getRequestById(requestId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          r.*,
          s.id as response_id,
          s.status_code,
          s.status_message,
          s.headers as response_headers,
          s.body_text as response_body,
          s.content_length as response_length,
          s.duration_ms,
          s.mime_type,
          s.resource_type
        FROM requests r
        LEFT JOIN responses s ON r.id = s.request_id
        WHERE r.id = ?
      `;
      this.db!.get(sql, [requestId], (err, row: any) => {
        if (err) return reject(err);
        if (!row) return resolve(null);
        row.headers = this.safeJson(row.headers);
        row.response_headers = this.safeJson(row.response_headers);
        resolve(row);
      });
    });
  }

  public async clearHistory(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db!.run(`DELETE FROM responses`, (err) => {
        if (err) return reject(err);
        this.db!.run(`DELETE FROM requests`, (err2) => {
          if (err2) return reject(err2);
          resolve();
        });
      });
    });
  }

  public async deleteRequest(requestId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db!.run(`DELETE FROM requests WHERE id = ?`, [requestId], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  // Scope rules
  public async getScopes(): Promise<ScopeRule[]> {
    return new Promise((resolve, reject) => {
      this.db!.all(`SELECT * FROM target_scopes ORDER BY created_at ASC`, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows as ScopeRule[]);
      });
    });
  }

  public async addScope(pattern: string, isRegex = 0): Promise<ScopeRule> {
    const id = uuidv4();
    return new Promise((resolve, reject) => {
      this.db!.run(
        `INSERT INTO target_scopes (id, pattern, is_regex, enabled) VALUES (?, ?, ?, 1)`,
        [id, pattern, isRegex],
        (err) => {
          if (err) return reject(err);
          resolve({ id, pattern, is_regex: isRegex, enabled: 1 });
        }
      );
    });
  }

  public async removeScope(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db!.run(`DELETE FROM target_scopes WHERE id = ?`, [id], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  public async toggleScope(id: string, enabled: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db!.run(
        `UPDATE target_scopes SET enabled = ? WHERE id = ?`,
        [enabled ? 1 : 0, id],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  // Repeater tabs
  public async getRepeaterTabs(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db!.all(`SELECT * FROM repeater_tabs ORDER BY sort_order ASC, created_at ASC`, [], (err, rows) => {
        if (err) return reject(err);
        resolve((rows || []).map((r: any) => ({
          ...r,
          headers: this.safeJson(r.headers),
          last_response: this.safeJson(r.last_response)
        })));
      });
    });
  }

  public async saveRepeaterTab(tab: {
    id: string;
    title: string;
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string;
    last_response?: any;
    sort_order?: number;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO repeater_tabs (id, title, method, url, headers, body, last_response, sort_order, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          method = excluded.method,
          url = excluded.url,
          headers = excluded.headers,
          body = excluded.body,
          last_response = excluded.last_response,
          sort_order = excluded.sort_order,
          updated_at = CURRENT_TIMESTAMP
      `;
      this.db!.run(
        sql,
        [
          tab.id,
          tab.title,
          tab.method,
          tab.url,
          JSON.stringify(tab.headers || {}),
          tab.body || '',
          JSON.stringify(tab.last_response || null),
          tab.sort_order || 0
        ],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  public async deleteRepeaterTab(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db!.run(`DELETE FROM repeater_tabs WHERE id = ?`, [id], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  public async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      this.db.close((err) => {
        if (err) return reject(err);
        this.db = null;
        resolve();
      });
    });
  }

  public async recordResponseModificationLog(log: Omit<ResponseModificationLog, 'id'>): Promise<string> {
    const id = uuidv4();
    const cleanUrl = sanitizeLogUrl(log.url);
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve(id);
      this.db.run(
        `INSERT INTO response_modification_logs (id, flow_id, url, method, original_status, modified_status, rule_name, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, log.flow_id || '', cleanUrl, log.method || 'GET', log.original_status, log.modified_status, log.rule_name || 'Auto Rule', log.timestamp || Date.now()],
        (err) => {
          if (err) return reject(err);
          resolve(id);
        }
      );
    });
  }

  public async getResponseModificationLogs(limit: number = 100): Promise<ResponseModificationLog[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve([]);
      this.db.all(
        `SELECT * FROM response_modification_logs ORDER BY timestamp DESC LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) return reject(err);
          resolve((rows as ResponseModificationLog[]) || []);
        }
      );
    });
  }

  public async clearResponseModificationLogs(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      this.db.run(`DELETE FROM response_modification_logs`, [], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  // --- Login Profiles CRUD ---
  public async saveLoginProfile(profile: Partial<LoginProfile> & { application_name: string; login_endpoint: string }): Promise<LoginProfile> {
    const id = profile.id || uuidv4();
    const now = Date.now();
    const existing = profile.id ? await this.getLoginProfileById(profile.id) : null;

    const record: LoginProfile = {
      id,
      project_id: profile.project_id || 'default',
      application_name: profile.application_name,
      target_host: profile.target_host || new URL(profile.login_endpoint).hostname,
      login_endpoint: profile.login_endpoint,
      http_method: profile.http_method || 'POST',
      payload_format: profile.payload_format || 'json',
      username_field: profile.username_field || 'username',
      password_field: profile.password_field || 'password',
      extra_fields: profile.extra_fields || {},
      username: profile.username || '',
      encrypted_credential_reference: profile.encrypted_credential_reference || null,
      credential_storage_enabled: profile.credential_storage_enabled ? 1 : 0,
      response_token_field: profile.response_token_field || 'accessToken',
      response_refresh_field: profile.response_refresh_field || 'refreshToken',
      response_user_field: profile.response_user_field || 'user.id',
      refresh_endpoint: profile.refresh_endpoint || '',
      auto_test_enabled: profile.auto_test_enabled !== undefined ? (profile.auto_test_enabled ? 1 : 0) : 1,
      created_at: existing ? existing.created_at : now,
      last_login_at: profile.last_login_at || existing?.last_login_at || null
    };

    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not connected'));
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO login_profiles (
          id, project_id, application_name, target_host, login_endpoint,
          http_method, payload_format, username_field, password_field,
          extra_fields, username, encrypted_credential_reference,
          credential_storage_enabled, response_token_field, response_refresh_field,
          response_user_field, refresh_endpoint, auto_test_enabled,
          created_at, last_login_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        record.id,
        record.project_id,
        record.application_name,
        record.target_host,
        record.login_endpoint,
        record.http_method,
        record.payload_format,
        record.username_field,
        record.password_field,
        JSON.stringify(record.extra_fields || {}),
        record.username,
        record.encrypted_credential_reference,
        record.credential_storage_enabled,
        record.response_token_field,
        record.response_refresh_field,
        record.response_user_field,
        record.refresh_endpoint,
        record.auto_test_enabled,
        record.created_at,
        record.last_login_at,
        (err) => {
          stmt.finalize();
          if (err) return reject(err);
          resolve(record);
        }
      );
    });
  }

  public async getLoginProfiles(): Promise<LoginProfile[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve([]);
      this.db.all(`SELECT * FROM login_profiles ORDER BY created_at DESC`, [], (err, rows: any[]) => {
        if (err) return reject(err);
        const mapped = (rows || []).map(r => ({
          ...r,
          extra_fields: this.safeJson(r.extra_fields),
          credential_storage_enabled: Boolean(r.credential_storage_enabled),
          auto_test_enabled: Boolean(r.auto_test_enabled)
        }));
        resolve(mapped);
      });
    });
  }

  public async getLoginProfileById(id: string): Promise<LoginProfile | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve(null);
      this.db.get(`SELECT * FROM login_profiles WHERE id = ?`, [id], (err, row: any) => {
        if (err) return reject(err);
        if (!row) return resolve(null);
        resolve({
          ...row,
          extra_fields: this.safeJson(row.extra_fields),
          credential_storage_enabled: Boolean(row.credential_storage_enabled),
          auto_test_enabled: Boolean(row.auto_test_enabled)
        });
      });
    });
  }

  public async deleteLoginProfile(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      this.db.run(`DELETE FROM login_profiles WHERE id = ?`, [id], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  // --- Authentication Sessions CRUD ---
  public async saveAuthSession(sessionData: Partial<AuthenticationSession> & { application_name: string; encrypted_access_token: string }): Promise<AuthenticationSession> {
    const id = sessionData.id || uuidv4();
    const now = Date.now();
    const existing = sessionData.id ? await this.getAuthSessionById(sessionData.id) : null;

    const record: AuthenticationSession = {
      id,
      profile_id: sessionData.profile_id || null,
      application_name: sessionData.application_name,
      login_endpoint: sessionData.login_endpoint || '',
      browser_session_id: sessionData.browser_session_id || 'default_session',
      user_id: sessionData.user_id || null,
      username: sessionData.username || null,
      encrypted_access_token: sessionData.encrypted_access_token,
      encrypted_refresh_token: sessionData.encrypted_refresh_token || null,
      token_type: sessionData.token_type || 'Bearer',
      is_jwt: sessionData.is_jwt ? 1 : 0,
      jwt_claims: sessionData.jwt_claims || {},
      status: sessionData.status || 'active',
      expires_at: sessionData.expires_at || null,
      created_at: existing ? existing.created_at : now,
      last_activity_at: now
    };

    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not connected'));
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO authentication_sessions (
          id, profile_id, application_name, login_endpoint, browser_session_id,
          user_id, username, encrypted_access_token, encrypted_refresh_token,
          token_type, is_jwt, jwt_claims, status, expires_at, created_at, last_activity_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        record.id,
        record.profile_id,
        record.application_name,
        record.login_endpoint,
        record.browser_session_id,
        record.user_id,
        record.username,
        record.encrypted_access_token,
        record.encrypted_refresh_token,
        record.token_type,
        record.is_jwt,
        JSON.stringify(record.jwt_claims || {}),
        record.status,
        record.expires_at,
        record.created_at,
        record.last_activity_at,
        (err) => {
          stmt.finalize();
          if (err) return reject(err);
          resolve(record);
        }
      );
    });
  }

  public async getAuthSessions(): Promise<AuthenticationSession[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve([]);
      this.db.all(`SELECT * FROM authentication_sessions ORDER BY last_activity_at DESC`, [], (err, rows: any[]) => {
        if (err) return reject(err);
        const mapped = (rows || []).map(r => ({
          ...r,
          jwt_claims: this.safeJson(r.jwt_claims),
          is_jwt: Boolean(r.is_jwt)
        }));
        resolve(mapped);
      });
    });
  }

  public async getAuthSessionById(id: string): Promise<AuthenticationSession | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve(null);
      this.db.get(`SELECT * FROM authentication_sessions WHERE id = ?`, [id], (err, row: any) => {
        if (err) return reject(err);
        if (!row) return resolve(null);
        resolve({
          ...row,
          jwt_claims: this.safeJson(row.jwt_claims),
          is_jwt: Boolean(row.is_jwt)
        });
      });
    });
  }

  public async revokeAuthSession(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      this.db.run(
        `UPDATE authentication_sessions SET status = 'revoked', last_activity_at = ? WHERE id = ?`,
        [Date.now(), id],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  public async deleteAuthSession(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      this.db.run(`DELETE FROM authentication_sessions WHERE id = ?`, [id], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  public async clearAuthSessions(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      this.db.run(`DELETE FROM authentication_sessions`, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  public async getDatabaseStats(): Promise<{
    dbPath: string;
    sizeBytes: number;
    requestsCount: number;
    responsesCount: number;
    profilesCount: number;
    sessionsCount: number;
    logsCount: number;
  }> {
    const stats = {
      dbPath: this.dbPath,
      sizeBytes: 0,
      requestsCount: 0,
      responsesCount: 0,
      profilesCount: 0,
      sessionsCount: 0,
      logsCount: 0
    };

    try {
      if (fs.existsSync(this.dbPath)) {
        const fileStat = fs.statSync(this.dbPath);
        stats.sizeBytes = fileStat.size;
      }
    } catch {}

    if (!this.db) return stats;

    const countTable = (table: string): Promise<number> => {
      return new Promise((resolve) => {
        this.db!.get(`SELECT COUNT(*) as cnt FROM ${table}`, (err, row: any) => {
          if (err || !row) resolve(0);
          else resolve(row.cnt || 0);
        });
      });
    };

    try {
      stats.requestsCount = await countTable('requests');
      stats.responsesCount = await countTable('responses');
      stats.profilesCount = await countTable('login_profiles');
      stats.sessionsCount = await countTable('authentication_sessions');
      stats.logsCount = await countTable('response_modification_logs');
      stats.sqliReportsCount = await countTable('sqli_scan_reports');
    } catch {}

    return stats;
  }

  // --- SQL Injection Scanner Reports CRUD ---
  public async saveSqliReport(reportData: Partial<SqliScanReport> & { target_url: string; param_name: string; finding: string }): Promise<SqliScanReport> {
    const id = reportData.id || uuidv4();
    const now = Date.now();

    const verification_status: SqliVerificationStatus = reportData.verification_status || (
      reportData.finding === 'Potential SQL Injection' ||
      reportData.finding === 'Boolean-Based Behavior Detected' ||
      reportData.finding === 'Time-Based Behavior Detected' ||
      reportData.finding === 'Possible Data Exposure'
        ? 'Confirmed'
        : reportData.finding === 'Database Error Detected'
        ? 'Suspected'
        : reportData.finding === 'Inconclusive'
        ? 'Inconclusive'
        : 'Safe'
    );

    const record: SqliScanReport = {
      id,
      project_id: reportData.project_id || 'default',
      target_url: reportData.target_url,
      method: reportData.method || 'GET',
      param_name: reportData.param_name,
      param_location: reportData.param_location || 'query',
      finding: (reportData.finding as any) || 'No Issue Detected',
      confidence: (reportData.confidence as any) || 'Informational',
      verification_status,
      test_mode: reportData.test_mode || 'active',
      test_category: reportData.test_category || 'general',
      db_fingerprint: reportData.db_fingerprint || 'Unknown Database',
      requests_sent: reportData.requests_sent || 0,
      duration_ms: reportData.duration_ms || 0,
      response_difference: reportData.response_difference || {
        statusDivergence: false,
        baselineStatus: 200,
        testStatus: 200,
        lengthDifference: 0,
        normalizedSimilarity: 1.0,
        structuralShift: false,
        divergenceDetails: []
      },
      timing_evidence: reportData.timing_evidence || {
        baselineLatencyMs: 0,
        testLatencyMs: 0,
        deltaMs: 0,
        isTimingAnomaly: false,
        description: 'Normal latency profile'
      },
      safe_verification: reportData.safe_verification || {
        stoppedEarly: false,
        dataExtractionAttempted: false
      },
      evidence: reportData.evidence || [],
      remediation: reportData.remediation || '',
      risk_assessment: reportData.risk_assessment,
      original_request: reportData.original_request || null,
      test_request: reportData.test_request || null,
      test_response: reportData.test_response || null,
      timestamp: reportData.timestamp || now
    };

    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not connected'));

      const fullSql = `
        INSERT OR REPLACE INTO sqli_scan_reports (
          id, project_id, target_url, method, param_name, param_location,
          finding, confidence, test_mode, requests_sent, duration_ms,
          evidence, remediation, original_request, test_request, test_response,
          verification_status, response_difference, timing_evidence, safe_verification, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const fallbackSql = `
        INSERT OR REPLACE INTO sqli_scan_reports (
          id, project_id, target_url, method, param_name, param_location,
          finding, confidence, test_mode, requests_sent, duration_ms,
          evidence, remediation, original_request, test_request, test_response, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(
        fullSql,
        [
          record.id,
          record.project_id,
          record.target_url,
          record.method,
          record.param_name,
          record.param_location,
          record.finding,
          record.confidence,
          record.test_mode,
          record.requests_sent,
          record.duration_ms,
          JSON.stringify(record.evidence || []),
          record.remediation,
          JSON.stringify(record.original_request || {}),
          JSON.stringify(record.test_request || {}),
          JSON.stringify(record.test_response || {}),
          record.verification_status,
          JSON.stringify(record.response_difference || {}),
          JSON.stringify(record.timing_evidence || {}),
          JSON.stringify(record.safe_verification || {}),
          record.timestamp
        ],
        (err) => {
          if (!err) {
            return resolve(record);
          }
          // Fallback if older table schema
          this.db!.run(
            fallbackSql,
            [
              record.id,
              record.project_id,
              record.target_url,
              record.method,
              record.param_name,
              record.param_location,
              record.finding,
              record.confidence,
              record.test_mode,
              record.requests_sent,
              record.duration_ms,
              JSON.stringify(record.evidence || []),
              record.remediation,
              JSON.stringify(record.original_request || {}),
              JSON.stringify(record.test_request || {}),
              JSON.stringify(record.test_response || {}),
              record.timestamp
            ],
            (fallbackErr) => {
              if (fallbackErr) return reject(fallbackErr);
              resolve(record);
            }
          );
        }
      );
    });
  }

  public async getSqliReports(limit: number = 100): Promise<SqliScanReport[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve([]);
      this.db.all(
        `SELECT * FROM sqli_scan_reports ORDER BY timestamp DESC LIMIT ?`,
        [limit],
        (err, rows: any[]) => {
          if (err) return reject(err);
          const mapped = (rows || []).map(r => ({
            ...r,
            verification_status: r.verification_status || (
              r.finding === 'Potential SQL Injection' ||
              r.finding === 'Boolean-Based Behavior Detected' ||
              r.finding === 'Time-Based Behavior Detected' ||
              r.finding === 'Possible Data Exposure'
                ? 'Confirmed'
                : r.finding === 'Database Error Detected'
                ? 'Suspected'
                : r.finding === 'Inconclusive'
                ? 'Inconclusive'
                : 'Safe'
            ),
            response_difference: this.safeJson(r.response_difference) || undefined,
            timing_evidence: this.safeJson(r.timing_evidence) || undefined,
            safe_verification: this.safeJson(r.safe_verification) || undefined,
            evidence: this.safeJson(r.evidence),
            original_request: this.safeJson(r.original_request),
            test_request: this.safeJson(r.test_request),
            test_response: this.safeJson(r.test_response)
          }));
          resolve(mapped);
        }
      );
    });
  }

  public async getSqliReportById(id: string): Promise<SqliScanReport | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve(null);
      this.db.get(`SELECT * FROM sqli_scan_reports WHERE id = ?`, [id], (err, row: any) => {
        if (err) return reject(err);
        if (!row) return resolve(null);
        resolve({
          ...row,
          verification_status: row.verification_status || (
            row.finding === 'Potential SQL Injection' ||
            row.finding === 'Boolean-Based Behavior Detected' ||
            row.finding === 'Time-Based Behavior Detected' ||
            row.finding === 'Possible Data Exposure'
              ? 'Confirmed'
              : row.finding === 'Database Error Detected'
              ? 'Suspected'
              : row.finding === 'Inconclusive'
              ? 'Inconclusive'
              : 'Safe'
          ),
          response_difference: this.safeJson(row.response_difference) || undefined,
          timing_evidence: this.safeJson(row.timing_evidence) || undefined,
          safe_verification: this.safeJson(row.safe_verification) || undefined,
          evidence: this.safeJson(row.evidence),
          original_request: this.safeJson(row.original_request),
          test_request: this.safeJson(row.test_request),
          test_response: this.safeJson(row.test_response)
        });
      });
    });
  }

  public async deleteSqliReport(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      this.db.run(`DELETE FROM sqli_scan_reports WHERE id = ?`, [id], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  public async clearSqliReports(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      this.db.run(`DELETE FROM sqli_scan_reports`, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  private safeJson(str: any): any {
    if (!str || typeof str !== 'string') return str || {};
    try {
      return JSON.parse(str);
    } catch {
      return {};
    }
  }
}

export interface ResponseModificationLog {
  id: string;
  flow_id?: string;
  url: string;
  method: string;
  original_status: number;
  modified_status: number;
  rule_name: string;
  timestamp: number;
}

export function sanitizeLogUrl(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    const sensitiveKeys = ['password', 'pass', 'token', 'access_token', 'auth', 'key', 'apikey', 'secret', 'code', 'session', 'jwt', 'cookie'];
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
        parsed.searchParams.set(key, '[REDACTED]');
      }
    }
    return parsed.toString();
  } catch {
    return urlStr.replace(/(password|token|secret|key|auth|jwt)=([^&]+)/gi, '$1=[REDACTED]');
  }
}

export interface LoginProfile {
  id: string;
  project_id: string;
  application_name: string;
  target_host: string;
  login_endpoint: string;
  http_method: string;
  payload_format: 'json' | 'form';
  username_field: string;
  password_field: string;
  extra_fields: Record<string, any>;
  username: string;
  encrypted_credential_reference?: string | null;
  credential_storage_enabled: boolean | number;
  response_token_field: string;
  response_refresh_field: string;
  response_user_field: string;
  refresh_endpoint?: string;
  auto_test_enabled: boolean | number;
  created_at: number;
  last_login_at?: number | null;
}

export interface AuthenticationSession {
  id: string;
  profile_id?: string | null;
  application_name: string;
  login_endpoint: string;
  browser_session_id?: string;
  user_id?: string | null;
  username?: string | null;
  encrypted_access_token: string;
  encrypted_refresh_token?: string | null;
  token_type: string;
  is_jwt: boolean | number;
  jwt_claims?: any;
  status: 'active' | 'expired' | 'revoked';
  expires_at?: number | null;
  created_at: number;
  last_activity_at: number;
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

export type SqliVerificationStatus = 'Confirmed' | 'Suspected' | 'Inconclusive' | 'Safe';

export interface ResponseDifferenceData {
  statusDivergence?: boolean;
  baselineStatus?: number;
  testStatus?: number;
  lengthDifference?: number;
  normalizedSimilarity?: number;
  structuralShift?: boolean;
  divergenceDetails?: string[];
}

export interface TimingEvidenceData {
  baselineLatencyMs?: number;
  testLatencyMs?: number;
  deltaMs?: number;
  repeatedLatencyMs?: number;
  isTimingAnomaly?: boolean;
  description?: string;
}

export interface SafeVerificationData {
  stoppedEarly?: boolean;
  confirmedPhase?: string;
  reason?: string;
  dataExtractionAttempted?: boolean;
}

export interface SqliScanReport {
  id: string;
  project_id?: string;
  target_url: string;
  method: string;
  param_name: string;
  param_location: 'query' | 'body_form' | 'body_json' | 'header';
  finding: SqliFindingClassification;
  confidence: 'High' | 'Medium' | 'Low' | 'Informational';
  verification_status?: SqliVerificationStatus;
  test_mode: 'active' | 'passive';
  test_category?: string;
  db_fingerprint?: string;
  requests_sent: number;
  duration_ms: number;
  response_difference?: ResponseDifferenceData;
  timing_evidence?: TimingEvidenceData;
  safe_verification?: SafeVerificationData;
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


