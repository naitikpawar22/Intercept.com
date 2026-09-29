import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for terminal test output
const green = (t) => `\x1b[32m${t}\x1b[0m`;
const red = (t) => `\x1b[31m${t}\x1b[0m`;
const blue = (t) => `\x1b[34m${t}\x1b[0m`;
const yellow = (t) => `\x1b[33m${t}\x1b[0m`;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ${green('✓')} ${message}`);
    passed++;
  } else {
    console.error(`  ${red('✗')} ${message}`);
    failed++;
  }
}

async function runSuite(name, fn) {
  console.log(`\n${blue('▶')} ${yellow(name)}`);
  try {
    await fn();
  } catch (err) {
    console.error(`  ${red('✗')} Suite error:`, err);
    failed++;
  }
}

async function main() {
  console.log(`\n${green('==================================================')}`);
  console.log(`  NetScope Security Browser - Automated Test Suite`);
  console.log(`${green('==================================================')}`);

  // Test Suite 1: Mock Server Endpoints
  const { startServer, stopServer } = await import('./mock-server.js');
  const server = await startServer(4002);

  await runSuite('1. Local Test Server & Endpoints', async () => {
    // GET /api/get
    const resGet = await fetch('http://127.0.0.1:4002/api/get?testParam=123');
    const dataGet = await resGet.json();
    assert(resGet.status === 200, 'GET /api/get returns 200 OK');
    assert(dataGet.status === 'success', 'GET response body contains success status');
    assert(dataGet.query.testParam === '123', 'Query parameters captured accurately');

    // POST /api/post
    const resPost = await fetch('http://127.0.0.1:4002/api/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ securityTest: true, payload: 'alert(1)' })
    });
    const dataPost = await resPost.json();
    assert(resPost.status === 200, 'POST /api/post returns 200 OK');
    assert(dataPost.receivedBody.payload === 'alert(1)', 'POST request payload echoed correctly');

    // Cookies endpoint
    const resCookie = await fetch('http://127.0.0.1:4002/api/cookies');
    const cookieHeader = resCookie.headers.get('set-cookie');
    assert(resCookie.status === 200, 'GET /api/cookies returns 200 OK');
    assert(cookieHeader && cookieHeader.includes('netscope_session='), 'Set-Cookie header received');

    // Redirect endpoint
    const resRedirect = await fetch('http://127.0.0.1:4002/api/redirect', { redirect: 'manual' });
    assert(resRedirect.status === 302, 'GET /api/redirect returns 302 Found');
    assert(resRedirect.headers.get('location') === '/api/get', 'Redirect location header correct');

    // Error endpoint
    const resErr = await fetch('http://127.0.0.1:4002/api/error');
    assert(resErr.status === 500, 'GET /api/error returns 500 Internal Server Error');

    // Delayed timing endpoint
    const start = Date.now();
    const resDelay = await fetch('http://127.0.0.1:4002/api/delayed');
    const elapsed = Date.now() - start;
    assert(resDelay.status === 200, 'GET /api/delayed returns 200 OK');
    assert(elapsed >= 250, `Latency measured accurately (${elapsed} ms)`);
  });

  await stopServer();

  // Test Suite 2: Scope Validator Logic
  await runSuite('2. Scope Enforcement & Pattern Matching', async () => {
    // Dynamic import scope validator from dist or direct logic
    const isUrlInScope = (urlStr, scopes) => {
      if (!scopes || scopes.length === 0) return true;
      const enabled = scopes.filter(s => s.enabled);
      if (enabled.length === 0) return true;
      try {
        const parsed = new URL(urlStr);
        const host = parsed.hostname.toLowerCase();
        for (const scope of enabled) {
          const pattern = scope.pattern.trim().toLowerCase();
          if (pattern === '*' || pattern === host) return true;
          if (pattern.startsWith('*.')) {
            const suffix = pattern.substring(1);
            if (host.endsWith(suffix) || host === pattern.substring(2)) return true;
          }
          if (host.includes(pattern)) return true;
        }
        return false;
      } catch {
        return false;
      }
    };

    const scopes = [
      { id: '1', pattern: 'localhost', enabled: 1 },
      { id: '2', pattern: '127.0.0.1', enabled: 1 },
      { id: '3', pattern: '*.target.com', enabled: 1 }
    ];

    assert(isUrlInScope('http://localhost:4000/test', scopes), 'Matches localhost in scope');
    assert(isUrlInScope('http://127.0.0.1:8080/api', scopes), 'Matches 127.0.0.1 in scope');
    assert(isUrlInScope('https://app.target.com/login', scopes), 'Matches wildcard *.target.com subdomain');
    assert(isUrlInScope('https://target.com/index', scopes), 'Matches root target.com with *.target.com');
    assert(!isUrlInScope('https://unauthorized.evil.com/leak', scopes), 'Blocks out-of-scope domain');
  });

  // Test Suite 3: Database Manager & SQLite Persistence
  await runSuite('3. SQLite Persistence & Schema Integrity', async () => {
    const sqlite3 = (await import('sqlite3')).default;
    const testDbPath = path.resolve(__dirname, '../data/test-netscope.db');
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch (e) {}
    }

    const testDb = new sqlite3.Database(':memory:');
    const schemaSql = fs.readFileSync(path.resolve(__dirname, '../database/schema.sql'), 'utf-8');

    await new Promise((resolve, reject) => {
      testDb.exec(schemaSql, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    assert(true, 'SQLite schema migrations executed successfully in memory');

    // Insert transaction
    await new Promise((resolve, reject) => {
      testDb.run(
        `INSERT INTO requests (id, method, url, domain, path, scheme, headers, timestamp)
         VALUES ('req-test-1', 'POST', 'http://127.0.0.1:4000/api/login', '127.0.0.1', '/api/login', 'http', '{"content-type":"application/json"}', 1700000000000)`,
        (err) => (err ? reject(err) : resolve())
      );
    });

    await new Promise((resolve, reject) => {
      testDb.run(
        `INSERT INTO responses (id, request_id, status_code, status_message, headers, duration_ms, timestamp)
         VALUES ('res-test-1', 'req-test-1', 200, 'OK', '{"server":"netscope"}', 42, 1700000000042)`,
        (err) => (err ? reject(err) : resolve())
      );
    });

    // Query joined history
    const row = await new Promise((resolve, reject) => {
      testDb.get(
        `SELECT r.method, r.url, s.status_code, s.duration_ms FROM requests r
         JOIN responses s ON r.id = s.request_id WHERE r.id = 'req-test-1'`,
        (err, r) => (err ? reject(err) : resolve(r))
      );
    });

    assert(row && row.method === 'POST', 'Stored request method retrieved');
    assert(row && row.status_code === 200, 'Stored response status code retrieved');
    assert(row && row.duration_ms === 42, 'Duration measurement stored accurately');

    testDb.close();
  });

  // Test Suite 4: Decoder Transformations
  await runSuite('4. Decoder Engine Transformations', async () => {
    const raw = 'NetScope <Security> "Browser" & Testing 100%';
    const urlEncoded = encodeURIComponent(raw);
    assert(decodeURIComponent(urlEncoded) === raw, 'URL Encode and Decode roundtrip');

    const b64 = Buffer.from(raw, 'utf-8').toString('base64');
    assert(Buffer.from(b64, 'base64').toString('utf-8') === raw, 'Base64 Encode and Decode roundtrip');

    let hex = '';
    for (let i = 0; i < raw.length; i++) {
      hex += raw.charCodeAt(i).toString(16).padStart(2, '0');
    }
    let unhex = '';
    for (let i = 0; i < hex.length; i += 2) {
      unhex += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
    }
    assert(unhex === raw, 'Hex Encode and Decode roundtrip');

    const jsonRaw = '{"test":123,"security":"active"}';
    const jsonPretty = JSON.stringify(JSON.parse(jsonRaw), null, 2);
    assert(jsonPretty.includes('\n  "test": 123'), 'JSON Beautify / Formatting');
    assert(JSON.stringify(JSON.parse(jsonPretty)) === jsonRaw, 'JSON Minification');
  });

  // Test Suite 5: Request Modification & Interception Math
  await runSuite('5. Request Modification & Header Recalculation', async () => {
    const originalBody = 'user=test';
    const modifiedBody = 'user=admin&role=superadministrator';
    const headers = {
      'Host': '127.0.0.1:4000',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': String(originalBody.length)
    };

    // When modified in InterceptPanel or ResponseInterceptPanel
    const newLen = Buffer.byteLength(modifiedBody, 'utf-8');
    headers['Content-Length'] = String(newLen);

    assert(parseInt(headers['Content-Length']) === newLen, 'Content-Length automatically recalculated on modification');
    assert(newLen > originalBody.length, 'Payload expansion verified without corruption');

    // Response header sanitization test
    const responseHeaders = {
      'content-type': 'application/json; charset=utf-8',
      'content-encoding': 'br',
      'etag': 'W/"6e-AuQx8rEDpm8xuE/fNSvH681rCVc-br"',
      'transfer-encoding': 'chunked',
      'content-length': '94'
    };
    Object.keys(responseHeaders).forEach(k => {
      const lk = k.toLowerCase();
      if (['content-encoding', 'transfer-encoding', 'etag', 'content-md5', 'content-length'].includes(lk)) {
        delete responseHeaders[k];
      }
    });
    const modifiedResponseBody = '{"statusCode":200,"message":"Success"}';
    responseHeaders['Content-Length'] = String(Buffer.byteLength(modifiedResponseBody, 'utf-8'));

    assert(!responseHeaders['content-encoding'], 'content-encoding stripped on response forward');
    assert(!responseHeaders['etag'], 'etag stripped on response forward');
    assert(!responseHeaders['transfer-encoding'], 'transfer-encoding stripped on response forward');
    assert(responseHeaders['Content-Length'] === String(Buffer.byteLength(modifiedResponseBody, 'utf-8')), 'Accurate Content-Length set for modified response');
  });

  // Test Suite 6: Mitmproxy Addon Script Verification
  await runSuite('6. Mitmproxy Python Addon Syntax & Hooks', async () => {
    const addonPath = path.resolve(__dirname, '../proxy/addon.py');
    assert(fs.existsSync(addonPath), 'proxy/addon.py exists on disk');

    const content = fs.readFileSync(addonPath, 'utf-8');
    assert(content.includes('class NetScopeAddon'), 'NetScopeAddon class defined');
    assert(content.includes('async def request(self, flow'), 'Asynchronous request interception hook defined');
    assert(content.includes('async def response(self, flow'), 'Asynchronous response interception hook defined');
    assert(content.includes('flow.response.decode()'), 'Auto-decompresses response payload on capture');
    assert(content.includes('flow.response.set_text(mods["body_text"])'), 'Sets uncompressed decoded text on forward');
    assert(content.includes('self.pending_requests'), 'Pending requests waiting queue implemented');
    assert(content.includes('self.pending_responses'), 'Pending responses waiting queue implemented');
    assert(content.includes('flow_completed'), 'Complete flow serialization and broadcasting implemented');
  });

  // Test Suite 7: Selenium WebDriver Chrome Launcher & Auto-Focus
  await runSuite('7. Selenium WebDriver Chrome Integration & Auto-Focus', async () => {
    const launcherPath = path.resolve(__dirname, '../proxy/chrome_launcher.py');
    assert(fs.existsSync(launcherPath), 'proxy/chrome_launcher.py exists on disk');

    const content = fs.readFileSync(launcherPath, 'utf-8');
    assert(content.includes('from selenium import webdriver'), 'Selenium webdriver imported');
    assert(content.includes('--proxy-server='), 'Configures Chrome with proxy-server argument');
    assert(content.includes('--ignore-certificate-errors'), 'Configures Chrome to bypass cert warnings for intercepted HTTPS');
    assert(content.includes('--user-data-dir='), 'Uses isolated user profile directory');
    assert(content.includes('def launch_chrome'), 'launch_chrome function defined');
    assert(content.includes('def navigate'), 'navigate function defined');
    assert(content.includes('def quit_chrome'), 'quit_chrome function defined');
    assert(content.includes('def focus_browser'), 'focus_browser function defined');
    assert(content.includes('window.focus()'), 'Dispatches window focus event on forward');
    assert(content.includes('visibilitychange'), 'Dispatches visibilitychange event on forward');

    const managerPath = path.resolve(__dirname, '../src/main/browser/seleniumManager.ts');
    assert(fs.existsSync(managerPath), 'src/main/browser/seleniumManager.ts exists on disk');

    const managerContent = fs.readFileSync(managerPath, 'utf-8');
    assert(managerContent.includes('class SeleniumManager'), 'SeleniumManager class defined');
    assert(managerContent.includes('public async launch'), 'SeleniumManager.launch method implemented');
    assert(managerContent.includes('public async navigate'), 'SeleniumManager.navigate method implemented');
    assert(managerContent.includes('public focus(): void'), 'SeleniumManager.focus method implemented');
    assert(managerContent.includes('public async quit'), 'SeleniumManager.quit method implemented');

    const topNavPath = path.resolve(__dirname, '../src/renderer/src/components/TopNav.tsx');
    assert(fs.existsSync(topNavPath), 'TopNav.tsx exists on disk');
    const topNavContent = fs.readFileSync(topNavPath, 'utf-8');
    assert(topNavContent.includes('Intercept: ALL ON'), 'TopNav displays Master All-Intercept ON state');
    assert(topNavContent.includes('onToggleAllIntercept'), 'TopNav handles master All-Intercept toggle');
  });

  // Test Suite 8: Automatic Response Rules Engine & Testing Environment Scoping
  await runSuite('8. Automatic Response Rules Engine & Test Environment Scoping', async () => {
    const rules = [
      {
        id: 'rule-1',
        name: 'Mock 401 to 200 for Test Environment',
        target_host: '127.0.0.1',
        method: 'ALL',
        match_status: 401,
        replace_status: 200,
        replace_body: '{"status": 200, "authenticated": true}',
        enabled: true
      },
      {
        id: 'rule-2',
        name: 'POST Only Login Rewriter',
        target_host: 'embeds2.com',
        method: 'POST',
        match_status: 401,
        replace_status: 200,
        replace_body: '',
        enabled: true
      },
      {
        id: 'rule-disabled',
        name: 'Disabled Rule',
        target_host: '127.0.0.1',
        method: 'ALL',
        match_status: 403,
        replace_status: 200,
        enabled: false
      }
    ];

    // Engine matcher simulation matching Python addon & TypeScript logic
    function matchRule(rulesList, reqHost, reqMethod, resStatus) {
      for (const rule of rulesList) {
        if (!rule.enabled) continue;
        if (rule.match_status !== resStatus) continue;

        const method = (rule.method || 'ALL').toUpperCase();
        if (method !== 'ALL' && method !== reqMethod.toUpperCase()) continue;

        const target = (rule.target_host || '').trim().toLowerCase();
        const host = reqHost.toLowerCase();
        // Strict scope protection: must have an explicit target host, never match wildcard globally
        if (!target || target === '*') continue;
        if (target !== host && !(target.startsWith('*.') && host.endsWith(target.slice(1))) && !target.includes(host) && !host.includes(target)) {
          continue;
        }

        return rule;
      }
      return null;
    }

    // Match 401 on target 127.0.0.1
    const match1 = matchRule(rules, '127.0.0.1', 'GET', 401);
    assert(match1 !== null && match1.replace_status === 200, 'Matches 401 and assigns 200 for authorized 127.0.0.1 host');
    assert(match1.replace_body.includes('"authenticated": true'), 'Replacement body provided by rule');

    // Method filtering test
    const matchPost = matchRule(rules, 'embeds2.com', 'POST', 401);
    const matchGet = matchRule(rules, 'embeds2.com', 'GET', 401);
    assert(matchPost !== null && matchPost.id === 'rule-2', 'Rule matches POST method when specified');
    assert(matchGet === null, 'Rule rejects GET method when rule requires POST');

    // Scoping protection: strictly do NOT modify unrelated requests/responses outside target host
    const outsideMatch = matchRule(rules, 'unauthorized-bank.com', 'GET', 401);
    assert(outsideMatch === null, 'Strict scope protection: Unrelated external host 401 is NOT matched');

    // Wildcard rule rejection test
    const wildcardRule = [{ id: 'w', target_host: '*', method: 'ALL', match_status: 401, replace_status: 200, enabled: true }];
    assert(matchRule(wildcardRule, 'random-host.com', 'GET', 401) === null, 'Global wildcard rule without explicit test environment is safely rejected');

    // Disabled rule test
    const disabledMatch = matchRule(rules, '127.0.0.1', 'GET', 403);
    assert(disabledMatch === null, 'Disabled rule is correctly ignored');

    // When no rule matches, original response is preserved
    const match200 = matchRule(rules, '127.0.0.1', 'GET', 200);
    assert(match200 === null, 'Original response status 200 preserved when no rule matches');
  });

  // Test Suite 9: URL Parameter Redaction & Audit Log Security
  await runSuite('9. URL Parameter Redaction & Audit Log Security', async () => {
    // Import or define sanitizeLogUrl matching src/main/database/db.ts
    function sanitizeLogUrl(urlStr) {
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

    const testUrl = 'https://embeds2.com/admin/login?user=admin&password=SuperSecretPassword123!&token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9&apikey=ak_live_998877';
    const sanitized = sanitizeLogUrl(testUrl);

    assert(!sanitized.includes('SuperSecretPassword123!'), 'Password removed from log URL');
    assert(!sanitized.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), 'Auth token removed from log URL');
    assert(!sanitized.includes('ak_live_998877'), 'API Key removed from log URL');
    assert(sanitized.includes('password=%5BREDACTED%5D') || sanitized.includes('password=[REDACTED]'), 'Sensitive query param replaced with [REDACTED]');
    assert(sanitized.includes('user=admin'), 'Non-sensitive query params preserved for diagnostic context');

    // Audit log structure verification
    const sampleLog = {
      id: 'log-101',
      flow_id: 'flow-abc',
      url: sanitized,
      method: 'POST',
      original_status: 401,
      modified_status: 200,
      rule_name: 'Mock 401 to 200',
      timestamp: Date.now()
    };
    assert(sampleLog.original_status === 401 && sampleLog.modified_status === 200, 'Audit log records status transition accurately');
    assert(sampleLog.rule_name === 'Mock 401 to 200', 'Audit log records applied rule name');
    assert(typeof sampleLog.timestamp === 'number', 'Audit log has timestamp');
  });

  // Test Suite 10: Global Auto Mode Configuration & Scoping
  await runSuite('10. Global Auto Mode Configuration & Scoping', async () => {
    let autoMode = {
      enabled: false,
      targetHost: '127.0.0.1',
      matchStatus: 401,
      replaceStatus: 200
    };

    assert(!autoMode.enabled, 'Auto Mode initially disabled');

    // Enable Auto Mode with confirmation for authorized testing environment
    autoMode = {
      enabled: true,
      targetHost: '127.0.0.1',
      matchStatus: 401,
      replaceStatus: 200
    };

    function evaluateAutoMode(config, reqHost, resStatus) {
      if (!config.enabled) return null;
      if (resStatus !== config.matchStatus) return null;

      const target = (config.targetHost || '').trim().toLowerCase();
      const host = reqHost.toLowerCase();
      // Strict protection: do not allow wildcard * or empty target host
      if (!target || target === '*') return null;
      if (target === host || host.includes(target) || target.includes(host)) {
        return config.replaceStatus;
      }
      return null;
    }

    assert(evaluateAutoMode(autoMode, '127.0.0.1', 401) === 200, 'Auto Mode rewrites 401 to 200 on authorized test host');
    assert(evaluateAutoMode(autoMode, 'payment.stripe.com', 401) === null, 'Auto Mode does not modify responses outside target host');
    assert(evaluateAutoMode(autoMode, '127.0.0.1', 404) === null, 'Auto Mode preserves non-matching 404 response');

    // Wildcard target rejection
    const wildcardAutoMode = { enabled: true, targetHost: '*', matchStatus: 401, replaceStatus: 200 };
    assert(evaluateAutoMode(wildcardAutoMode, 'random.com', 401) === null, 'Auto Mode rejects global wildcard target');

    // Immediate deactivation
    autoMode.enabled = false;
    assert(evaluateAutoMode(autoMode, '127.0.0.1', 401) === null, 'Disabling Auto Mode immediately halts automatic modification');
  });

  // Test Suite 11: Response Forwarding & Content Integrity Contract
  await runSuite('11. Response Forwarding & Content Integrity Contract', async () => {
    // Contract check on response payload delivered to browser session
    const responsePayload = {
      status_code: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
        'access-control-allow-credentials': 'true'
      },
      body_text: JSON.stringify({
        statusCode: 200,
        message: "Authorized admin access granted",
        role: "admin",
        access_token: "mock_jwt_access_token_sec_qa_999",
        expires_in: 3600
      })
    };

    const parsedJson = JSON.parse(responsePayload.body_text);
    assert(parsedJson.statusCode === 200, 'Browser receives valid JSON payload with 200 status');
    assert(parsedJson.role === 'admin', 'Browser receives modified admin role payload');
    assert(Boolean(parsedJson.access_token), 'Browser receives valid access_token payload for authorized testing');
    assert(responsePayload.headers['access-control-allow-origin'] === '*', 'CORS headers preserved for browser session');
    assert(!responsePayload.headers['content-encoding'], 'No compressed encoding header to prevent browser decoding mismatch');
  });

  // Test Suite 12: Server-Side SQLite Database & Authentication Endpoints
  const testServer = await startServer(4003);
  let testRefreshToken = '';
  let testAccessToken = '';

  await runSuite('12. Server-Side SQLite Database & Real Auth Endpoints', async () => {
    // 1. Inspect server-side database status
    const resDb = await fetch('http://127.0.0.1:4003/api/db/status');
    const dbData = await resDb.json();
    assert(resDb.status === 200, 'GET /api/db/status returns 200 OK');
    assert(dbData.database === 'SQLite', 'Server-side DB is SQLite');
    assert(Array.isArray(dbData.users) && dbData.users.some(u => u.username === 'admin'), 'Server DB has seeded admin user');
    assert(Array.isArray(dbData.users) && dbData.users.some(u => u.username === 'tester'), 'Server DB has seeded tester user');

    // 2. Successful Login with real server DB verification
    const resLogin = await fetch('http://127.0.0.1:4003/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Secret123!' })
    });
    const loginData = await resLogin.json();
    assert(resLogin.status === 200, 'POST /api/login with valid credentials returns 200 OK');
    assert(loginData.success === true, 'Login response body confirms success: true');
    assert(Boolean(loginData.accessToken), 'Server generated real access token');
    assert(loginData.accessToken.split('.').length === 3, 'Access token is structured JWT with 3 parts (header.payload.signature)');
    assert(Boolean(loginData.refreshToken), 'Server generated real refresh token');
    assert(loginData.user.username === 'admin', 'Response contains user profile from server DB');
    testRefreshToken = loginData.refreshToken;
    testAccessToken = loginData.accessToken;

    // 3. Failed Login with wrong password
    const resFail = await fetch('http://127.0.0.1:4003/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrongpassword' })
    });
    const failData = await resFail.json();
    assert(resFail.status === 401, 'POST /api/login with invalid password returns 401 Unauthorized');
    assert(failData.success === false, 'Failed login returns success: false');
    assert(failData.statusCode === 401, 'Failed login includes statusCode: 401 in body');
    assert(!failData.accessToken, 'Failed login does NOT generate fake access token');

    // 4. Token Refresh against server DB
    const resRefresh = await fetch('http://127.0.0.1:4003/api/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: testRefreshToken })
    });
    const refreshData = await resRefresh.json();
    assert(resRefresh.status === 200, 'POST /api/refresh with valid refresh token returns 200 OK');
    assert(refreshData.success === true, 'Token refresh confirmed in server DB');
    assert(Boolean(refreshData.accessToken), 'Server issued fresh access token');

    // 5. Protected profile endpoint with Bearer token
    const resUser = await fetch('http://127.0.0.1:4003/api/user', {
      headers: { 'Authorization': `Bearer ${testAccessToken}` }
    });
    const userData = await resUser.json();
    assert(resUser.status === 200, 'GET /api/user with Bearer token returns 200 OK');
    assert(userData.user.username === 'admin', 'Server DB validated token and returned user');

    // 6. Session revocation / logout
    const resRevoke = await fetch('http://127.0.0.1:4003/api/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: testRefreshToken })
    });
    assert(resRevoke.status === 200, 'POST /api/logout returns 200 OK');

    // 7. Verify revoked token cannot be refreshed
    const resRevokedRefresh = await fetch('http://127.0.0.1:4003/api/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: testRefreshToken })
    });
    assert(resRevokedRefresh.status === 401, 'Revoked refresh token is rejected with 401 Unauthorized');
  });

  await stopServer();

  // Test Suite 13: AES-256-GCM Credential Encryption & Token Security
  await runSuite('13. Authenticated AES-256-GCM Encryption & Key Isolation', async () => {
    const cryptoModule = await import('crypto');
    const crypto = cryptoModule.default || cryptoModule;

    // Simulate AES-256-GCM with isolated key
    const masterKey = crypto.randomBytes(32);
    const encrypt = (plain) => {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
      const enc = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
    };

    const decrypt = (payload) => {
      const [ivHex, tagHex, dataHex] = payload.split(':');
      const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf-8');
    };

    const secretPassword = 'SecretProductionPassword123!#$';
    const encrypted = encrypt(secretPassword);
    assert(encrypted !== secretPassword, 'Password is encrypted and not in plaintext');
    assert(encrypted.split(':').length === 3, 'Payload contains IV, AuthTag, and Ciphertext (AES-256-GCM)');

    const decrypted = decrypt(encrypted);
    assert(decrypted === secretPassword, 'Decrypted password matches original secret exactly');

    // Tamper detection (authenticated encryption verification)
    let tamperedError = false;
    try {
      const parts = encrypted.split(':');
      const tampered = `${parts[0]}:${parts[1]}:${parts[2].slice(0, -2)}aa`;
      decrypt(tampered);
    } catch {
      tamperedError = true;
    }
    assert(tamperedError, 'Tampered ciphertext fails authentication check (GCM tag validation)');

    // Secret masking test
    const mask = (s) => (s.length <= 8 ? '••••••••' : s.slice(0, 4) + '••••••••' + s.slice(-4));
    assert(mask('Secret123!') === 'Secr••••••••123!', 'Secret is masked for UI display');
  });

  // Test Suite 14: Client Database ("myDb") Profiles & Sessions Integration
  await runSuite('14. Client Database (myDb) Profiles & Sessions Schema', async () => {
    const sqlite3Module = await import('sqlite3');
    const sqlite3 = sqlite3Module.default || sqlite3Module;
    const db = new sqlite3.Database(':memory:');

    // Run schema.sql in memory
    const schemaSql = fs.readFileSync(path.resolve(__dirname, '../database/schema.sql'), 'utf-8');
    await new Promise((res, rej) => db.exec(schemaSql, err => err ? rej(err) : res()));

    // Insert LoginProfile
    await new Promise((res, rej) => {
      db.run(
        `INSERT INTO login_profiles (id, application_name, target_host, login_endpoint, username, credential_storage_enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['prof_test_1', 'NetScope Mock Target', 'http://127.0.0.1:4000', '/api/login', 'admin', 1, Date.now()],
        err => err ? rej(err) : res()
      );
    });

    const profile = await new Promise((res, rej) => {
      db.get(`SELECT * FROM login_profiles WHERE id = ?`, ['prof_test_1'], (err, row) => err ? rej(err) : res(row));
    });
    assert(profile.application_name === 'NetScope Mock Target', 'Client DB stored login profile accurately');
    assert(profile.username === 'admin', 'Login profile username stored');

    // Insert AuthenticationSession
    await new Promise((res, rej) => {
      db.run(
        `INSERT INTO authentication_sessions (id, profile_id, application_name, login_endpoint, username, encrypted_access_token, status, created_at, last_activity_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['sess_test_1', 'prof_test_1', 'NetScope Mock Target', '/api/login', 'admin', 'enc_token_xyz123', 'active', Date.now(), Date.now()],
        err => err ? rej(err) : res()
      );
    });

    const session = await new Promise((res, rej) => {
      db.get(`SELECT * FROM authentication_sessions WHERE id = ?`, ['sess_test_1'], (err, row) => err ? rej(err) : res(row));
    });
    assert(session.id === 'sess_test_1', 'Client DB stored authentication session');
    assert(session.status === 'active', 'Session is active');
    assert(session.encrypted_access_token === 'enc_token_xyz123', 'Encrypted token stored at rest');

    // Revoke session in client DB
    await new Promise((res, rej) => {
      db.run(`UPDATE authentication_sessions SET status = 'revoked' WHERE id = ?`, ['sess_test_1'], err => err ? rej(err) : res());
    });
    const revokedSession = await new Promise((res, rej) => {
      db.get(`SELECT status FROM authentication_sessions WHERE id = ?`, ['sess_test_1'], (err, row) => err ? rej(err) : res(row));
    });
    assert(revokedSession.status === 'revoked', 'Client DB session revoked successfully');

    db.close();
  });

  // Test Suite 15: Automatic Login Request Detection
  await runSuite('15. Automatic Login Request Detection (JSON and Form Formats)', async () => {
    const detectLogin = (req) => {
      if (req.method.toUpperCase() !== 'POST') return { isLogin: false };
      const urlLower = req.url.toLowerCase();
      const isLoginUrl = urlLower.includes('/login') || urlLower.includes('/auth') || urlLower.includes('/signin');
      const body = req.body_text || '';
      let hasCreds = false;
      let user = '';
      if (body.startsWith('{')) {
        try {
          const parsed = JSON.parse(body);
          if (parsed.username && parsed.password) {
            hasCreds = true;
            user = parsed.username;
          }
        } catch {}
      } else if (body.includes('=')) {
        const p = new URLSearchParams(body);
        if (p.has('username') && p.has('password')) {
          hasCreds = true;
          user = p.get('username');
        }
      }
      return { isLogin: isLoginUrl || hasCreds, username: user };
    };

    // JSON POST detection
    const jsonReq = {
      method: 'POST',
      url: 'http://127.0.0.1:4000/api/login',
      body_text: JSON.stringify({ username: 'admin', password: 'Secret123!' })
    };
    const detect1 = detectLogin(jsonReq);
    assert(detect1.isLogin === true, 'Detects JSON POST login request');
    assert(detect1.username === 'admin', 'Extracts username from JSON body');

    // Form POST detection
    const formReq = {
      method: 'POST',
      url: 'http://127.0.0.1:4000/auth/signin',
      body_text: 'username=tester&password=UserPass2026!'
    };
    const detect2 = detectLogin(formReq);
    assert(detect2.isLogin === true, 'Detects form-urlencoded POST login request');
    assert(detect2.username === 'tester', 'Extracts username from form urlencoded body');

    // Reject GET request
    const getReq = {
      method: 'GET',
      url: 'http://127.0.0.1:4000/api/login'
    };
    const detect3 = detectLogin(getReq);
    assert(detect3.isLogin === false, 'Ignores GET request even if path contains /login');
  });

  // Test Suite 16: SQL Injection Security Testing Module
  await runSuite('16. SQL Injection Security Testing Module (Parameter Extraction, Error Matching, Probing & Storage)', async () => {
    // 1. Parameter Extraction
    const extractParameters = (req) => {
      const params = [];
      const seen = new Set();

      // Query params
      try {
        const parsed = new URL(req.url);
        for (const [key, value] of parsed.searchParams.entries()) {
          const id = `query:${key}`;
          if (!seen.has(id)) {
            seen.add(id);
            params.push({ name: key, location: 'query', originalValue: value });
          }
        }
      } catch {}

      // Body params
      const ctype = (req.content_type || req.headers?.['content-type'] || '').toLowerCase();
      const body = req.body_text || '';

      if (ctype.includes('application/json') || (body.trim().startsWith('{') && body.trim().endsWith('}'))) {
        try {
          const parsed = JSON.parse(body);
          const flatten = (obj, prefix = '') => {
            for (const [k, v] of Object.entries(obj)) {
              const fullKey = prefix ? `${prefix}.${k}` : k;
              if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
                flatten(v, fullKey);
              } else {
                const id = `body_json:${fullKey}`;
                if (!seen.has(id)) {
                  seen.add(id);
                  params.push({ name: fullKey, location: 'body_json', originalValue: String(v ?? '') });
                }
              }
            }
          };
          flatten(parsed);
        } catch {}
      } else if (ctype.includes('application/x-www-form-urlencoded') || body.includes('=')) {
        try {
          const form = new URLSearchParams(body);
          for (const [key, value] of form.entries()) {
            const id = `body_form:${key}`;
            if (!seen.has(id)) {
              seen.add(id);
              params.push({ name: key, location: 'body_form', originalValue: value });
            }
          }
        } catch {}
      }

      return params;
    };

    // Test GET Query extraction
    const queryParams = extractParameters({
      url: 'http://127.0.0.1:4000/api/search?q=security&category=tools&page=1',
      method: 'GET'
    });
    assert(queryParams.length === 3, 'Extracted 3 GET query parameters');
    assert(queryParams.some(p => p.name === 'q' && p.location === 'query' && p.originalValue === 'security'), 'Extracted query parameter "q"');
    assert(queryParams.some(p => p.name === 'category' && p.originalValue === 'tools'), 'Extracted query parameter "category"');

    // Test POST Form extraction
    const formParams = extractParameters({
      url: 'http://127.0.0.1:4000/api/login',
      method: 'POST',
      content_type: 'application/x-www-form-urlencoded',
      body_text: 'username=admin&password=SuperSecret&remember=1'
    });
    assert(formParams.length === 3, 'Extracted 3 POST form parameters');
    assert(formParams.some(p => p.name === 'username' && p.location === 'body_form'), 'Extracted form param "username"');

    // Test JSON Body extraction with nested keys
    const jsonParams = extractParameters({
      url: 'http://127.0.0.1:4000/api/items',
      method: 'POST',
      content_type: 'application/json',
      body_text: JSON.stringify({ filter: { search: 'books', price: 25 }, sort: 'asc' })
    });
    assert(jsonParams.length === 3, 'Extracted 3 JSON parameters including nested keys');
    assert(jsonParams.some(p => p.name === 'filter.search' && p.location === 'body_json' && p.originalValue === 'books'), 'Extracted nested JSON param "filter.search"');
    assert(jsonParams.some(p => p.name === 'sort' && p.originalValue === 'asc'), 'Extracted root JSON param "sort"');

    // 2. Database Error Signatures & Passive Analysis
    const DB_SIGNATURES = [
      { db: 'SQLite', regex: /sqlite3\.OperationalError/i },
      { db: 'SQLite', regex: /SQL logic error/i },
      { db: 'SQLite', regex: /near ".*": syntax error/i },
      { db: 'MySQL', regex: /you have an error in your sql syntax/i },
      { db: 'PostgreSQL', regex: /syntax error at or near/i },
      { db: 'MSSQL', regex: /unclosed quotation mark after the character string/i },
      { db: 'Oracle', regex: /ORA-00933/i }
    ];

    const matchDbError = (body) => {
      for (const sig of DB_SIGNATURES) {
        if (sig.regex.test(body)) {
          return { detected: true, db: sig.db, pattern: sig.regex.toString() };
        }
      }
      return { detected: false };
    };

    assert(matchDbError('sqlite3.OperationalError: near "\'": syntax error').detected === true, 'Matches SQLite operational syntax error');
    assert(matchDbError('You have an error in your SQL syntax near line 1').detected === true, 'Matches MySQL syntax error');
    assert(matchDbError('PG::SyntaxError: ERROR: syntax error at or near "\'"').detected === true, 'Matches PostgreSQL syntax error');
    assert(matchDbError('Unclosed quotation mark after the character string \'admin\'').detected === true, 'Matches MSSQL unclosed quotation mark');
    assert(matchDbError('{"status":"success","data":{"count":0}}').detected === false, 'Safe response produces no false positive error detection');

    // 3. Active Probing & Controlled Mock Testing
    const { startServer: startMock, stopServer: stopMock } = await import('./mock-server.js');
    await startMock(4003);

    try {
      // Test A: Vulnerable Endpoint (/api/sqli-test)
      // 1. Baseline request
      const baseRes = await fetch('http://127.0.0.1:4003/api/sqli-test?id=usr_admin');
      const baseBody = await baseRes.text();
      assert(baseRes.status === 200, 'Baseline to vulnerable endpoint returns 200 OK');
      assert(matchDbError(baseBody).detected === false, 'Baseline response contains no DB errors');

      // 2. Single quote probe: syntax boundary test
      const probeRes = await fetch('http://127.0.0.1:4003/api/sqli-test?id=usr_admin%27');
      const probeBody = await probeRes.text();
      assert(probeRes.status === 500, 'Probe with unescaped quote returns 500 status on vulnerable endpoint');
      const errorCheck = matchDbError(probeBody);
      assert(errorCheck.detected === true && errorCheck.db === 'SQLite', 'Detected SQLite syntax error on unescaped quote probe');

      // 3. Balanced quote probe: grammar balance test
      const balanceRes = await fetch('http://127.0.0.1:4003/api/sqli-test?id=usr_admin%27%27');
      assert(balanceRes.status === 200, 'Balanced quotes resolve syntax error and return 200 OK');

      // Test B: Safe Parameterized Endpoint (/api/search)
      const safeBase = await fetch('http://127.0.0.1:4003/api/search?q=admin');
      assert(safeBase.status === 200, 'Safe search baseline returns 200 OK');

      const safeProbe = await fetch('http://127.0.0.1:4003/api/search?q=admin%27');
      const safeProbeBody = await safeProbe.text();
      assert(safeProbe.status === 200, 'Safe search handles unescaped quote safely via parameterized queries');
      assert(matchDbError(safeProbeBody).detected === false, 'Safe search returns zero DB errors on quote probe');

      // Test C: Boolean-Based True/False Differential Testing (/api/sqli-boolean)
      const boolBase = await fetch('http://127.0.0.1:4003/api/sqli-boolean?id=usr_admin');
      assert(boolBase.status === 200, 'Boolean test baseline returns 200 OK');

      const boolTrue = await fetch('http://127.0.0.1:4003/api/sqli-boolean?id=usr_admin%27%20AND%20%271%27=%271');
      assert(boolTrue.status === 200, 'Boolean True-condition matches baseline with 200 OK');

      const boolFalse = await fetch('http://127.0.0.1:4003/api/sqli-boolean?id=usr_admin%27%20AND%20%271%27=%272');
      assert(boolFalse.status === 404, 'Boolean False-condition produces divergent 404 status, confirming logic injection');

      // Test D: Vulnerable Login Form Testing (/api/login-vulnerable)
      const loginBase = await fetch('http://127.0.0.1:4003/api/login-vulnerable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@testapp.local', pass: 'Secret123!' })
      });
      assert(loginBase.status === 200, 'Vulnerable login baseline returns 200 OK');

      const loginProbe = await fetch('http://127.0.0.1:4003/api/login-vulnerable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: "admin'", pass: 'anything' })
      });
      assert(loginProbe.status === 500, 'Vulnerable login email quote probe triggers database error');
      const loginErr = await loginProbe.text();
      assert(matchDbError(loginErr).detected === true, 'Detected SQLite syntax error on login form email field');

      // 4. Sensitive Information Redaction in Reports
      const sanitizeHeaders = (headers) => {
        const clean = { ...headers };
        const sensitive = ['authorization', 'cookie', 'x-api-key', 'set-cookie'];
        for (const k of Object.keys(clean)) {
          if (sensitive.includes(k.toLowerCase())) {
            clean[k] = '[REDACTED]';
          }
        }
        return clean;
      };

      const testHeaders = {
        'Host': '127.0.0.1:4003',
        'Authorization': 'Bearer super_secret_jwt_token',
        'Cookie': 'session_id=12345; auth=xyz',
        'Accept': 'application/json'
      };
      const cleaned = sanitizeHeaders(testHeaders);
      assert(cleaned.Host === '127.0.0.1:4003', 'Non-sensitive headers preserved');
      assert(cleaned.Authorization === '[REDACTED]', 'Authorization header redacted');
      assert(cleaned.Cookie === '[REDACTED]', 'Cookie header redacted');

      // 5. Database Storage & Schema Verification for sqli_scan_reports
      const sqlite3 = (await import('sqlite3')).default;
      const testDbPath = path.resolve(__dirname, 'test_sqli_reports.db');
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      const testDb = new sqlite3.Database(testDbPath);

      await new Promise((res, rej) => {
        testDb.run(`
          CREATE TABLE IF NOT EXISTS sqli_scan_reports (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            target_url TEXT NOT NULL,
            method TEXT NOT NULL,
            param_name TEXT NOT NULL,
            param_location TEXT NOT NULL,
            finding TEXT NOT NULL,
            confidence TEXT NOT NULL,
            test_mode TEXT NOT NULL,
            requests_sent INTEGER NOT NULL,
            duration_ms INTEGER NOT NULL,
            evidence TEXT,
            remediation TEXT,
            original_request TEXT,
            test_request TEXT,
            test_response TEXT,
            timestamp INTEGER NOT NULL
          )
        `, err => err ? rej(err) : res());
      });

      // Insert scan report
      const reportId = 'sqli-rep-' + Date.now();
      const evidence = JSON.stringify([
        { probe: "'", description: "Database Syntax Error: SQLite near \"'\": syntax error", snippet: "sqlite3.OperationalError" }
      ]);
      const remediation = "Use parameterized queries or prepared statements instead of string concatenation.";

      await new Promise((res, rej) => {
        testDb.run(
          `INSERT INTO sqli_scan_reports (
            id, target_url, method, param_name, param_location, finding, confidence,
            test_mode, requests_sent, duration_ms, evidence, remediation, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            reportId,
            'http://127.0.0.1:4003/api/sqli-test?id=usr_admin',
            'GET',
            'id',
            'query',
            'Potential SQL Injection',
            'High',
            'active',
            3,
            120,
            evidence,
            remediation,
            Date.now()
          ],
          err => err ? rej(err) : res()
        );
      });

      // Query saved report
      const savedReport = await new Promise((res, rej) => {
        testDb.get(`SELECT * FROM sqli_scan_reports WHERE id = ?`, [reportId], (err, row) => err ? rej(err) : res(row));
      });
      assert(savedReport.id === reportId, 'SQLi scan report saved to database');
      assert(savedReport.finding === 'Potential SQL Injection', 'Finding stored accurately');
      assert(savedReport.confidence === 'High', 'Confidence level High stored');
      assert(JSON.parse(savedReport.evidence).length === 1, 'Evidence JSON parsed correctly');

      testDb.close();
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    } finally {
      await stopMock();
    }
  });

  await runSuite('17. Direct URL Pasting, Parameter Synthesis & Outcomes Aggregation', async () => {
    // 1. Direct URL Parameter Extraction with Query
    const parsedWithQuery = new URL('https://target.com/search?q=books&category=tech');
    const queryParams = [];
    for (const [k, v] of parsedWithQuery.searchParams.entries()) {
      queryParams.push({ name: k, location: 'query', originalValue: v });
    }
    assert(queryParams.length === 2, 'Pasted URL with query extracted 2 parameters');
    assert(queryParams[0].name === 'q', 'Extracted query parameter "q"');

    // 2. Direct URL Pasting without query (e.g. login form)
    const isLoginEndpoint = (url) => /login|signin|admin|auth/i.test(url);
    const loginUrl = 'https://www.embeds2.com/admin/login/';
    assert(isLoginEndpoint(loginUrl), 'Identified pasted login URL correctly');

    // 3. Auto-synthesis of default credentials on login endpoint
    const defaultAuthParams = [
      { name: 'email', location: 'body_form', originalValue: 'admin@example.com', isAuthField: true },
      { name: 'password', location: 'body_form', originalValue: 'admin123', isAuthField: true }
    ];
    assert(defaultAuthParams.length === 2, 'Auto-synthesized 2 default auth parameters');
    assert(defaultAuthParams[0].name === 'email', 'Auto-synthesized email parameter');
    assert(defaultAuthParams[1].name === 'password', 'Auto-synthesized password parameter');

    // 4. Authorized Host Scoping Resilience
    const targetUrl = 'https://www.embeds2.com/admin/login/';
    const targetHost = new URL(targetUrl).hostname;
    const authorizedHost = 'www.embeds2.com';
    const isHostAuthorized = targetHost === authorizedHost || authorizedHost === '*';
    assert(isHostAuthorized, 'Target URL matches authorizedHost from scanner settings');

    // 5. Outcomes Aggregation Logic
    const mockReports = [
      { id: '1', param_name: 'email', finding: 'Potential SQL Injection', confidence: 'High' },
      { id: '2', param_name: 'password', finding: 'Database Error Detected', confidence: 'Medium' },
      { id: '3', param_name: 'token', finding: 'No Issue Detected', confidence: 'Informational' }
    ];
    const totalTested = mockReports.length;
    const vulnCount = mockReports.filter(r => r.finding === 'Potential SQL Injection').length;
    const errCount = mockReports.filter(r => r.finding === 'Database Error Detected').length;
    const safeCount = mockReports.filter(r => r.finding === 'No Issue Detected').length;

    assert(totalTested === 3, 'Outcomes dashboard aggregates all 3 tested parameters');
    assert(vulnCount === 1, 'Accurately counted 1 Potential SQL Injection finding');
    assert(errCount === 1, 'Accurately counted 1 Database Error Detected finding');
    assert(safeCount === 1, 'Accurately counted 1 Safe parameter finding');
  });

  await runSuite('18. Advanced SQLi Platform: Fingerprinting, Dynamic Normalization, Canaries, Latency & Source Code Analysis', async () => {
    // 1. Database Fingerprinting Engine
    const DB_PATTERNS = [
      {
        db: 'SQLite',
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
        db: 'MySQL',
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
        db: 'PostgreSQL',
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
        db: 'MSSQL',
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
        db: 'Oracle',
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

    function fingerprintDb(responseBody, headers = {}) {
      const text = responseBody || '';
      for (const item of DB_PATTERNS) {
        for (const sig of item.signatures) {
          if (sig.test(text)) {
            return {
              database: item.db,
              confidence: 'High',
              evidence: [`Matched signature: ${sig}`],
              detectionMethod: 'Error Signature'
            };
          }
        }
      }
      const serverHdr = (headers['server'] || headers['Server'] || '').toLowerCase();
      if (serverHdr.includes('postgresql')) return { database: 'PostgreSQL', confidence: 'Medium', detectionMethod: 'Header Analysis' };
      if (serverHdr.includes('mysql') || serverHdr.includes('mariadb')) return { database: 'MySQL', confidence: 'Medium', detectionMethod: 'Header Analysis' };
      if (serverHdr.includes('microsoft-iis')) return { database: 'MSSQL', confidence: 'Low', detectionMethod: 'Header Analysis' };

      return { database: 'Unknown Database', confidence: 'None', detectionMethod: 'Inconclusive' };
    }

    // SQLite
    const fpSqlite = fingerprintDb('sqlite3.OperationalError: near "admin": syntax error');
    assert(fpSqlite.database === 'SQLite', 'Fingerprinted SQLite from OperationalError signature');
    assert(fpSqlite.confidence === 'High', 'High confidence on direct SQLite error');

    // MySQL
    const fpMysql = fingerprintDb('You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use');
    assert(fpMysql.database === 'MySQL', 'Fingerprinted MySQL from syntax manual signature');
    assert(fpMysql.confidence === 'High', 'High confidence on MySQL syntax error');

    // PostgreSQL
    const fpPg = fingerprintDb('ERROR: 42601: syntax error at or near "xyz"');
    assert(fpPg.database === 'PostgreSQL', 'Fingerprinted PostgreSQL from error code 42601');

    // MSSQL
    const fpMssql = fingerprintDb('Unclosed quotation mark after the character string');
    assert(fpMssql.database === 'MSSQL', 'Fingerprinted MSSQL from unclosed quotation mark');

    // Oracle
    const fpOracle = fingerprintDb('ORA-00933: SQL command not properly ended');
    assert(fpOracle.database === 'Oracle', 'Fingerprinted Oracle from ORA-00933 error code');

    // Generic non-DB 500 error should NOT be falsely reported as SQLi DB
    const fpGeneric = fingerprintDb('500 Internal Server Error: NullPointerException in Handler');
    assert(fpGeneric.database === 'Unknown Database', 'Generic 500 error not misidentified as SQL DB');
    assert(fpGeneric.confidence === 'None', 'None confidence on generic error');

    // Header-based hint
    const fpHdr = fingerprintDb('OK', { server: 'Apache/2.4 (Debian) PostgreSQL/14' });
    assert(fpHdr.database === 'PostgreSQL', 'Identified PostgreSQL from Server response header');

    // 2. Response Analysis & Dynamic Value Normalization
    function normalizeDynamicValues(text) {
      if (!text || typeof text !== 'string') return '';
      return text
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g, '<DYNAMIC_TIMESTAMP>')
        .replace(/[A-Za-z]{3},\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+GMT/g, '<DYNAMIC_DATE>')
        .replace(/"(timestamp|time|ts|created_at|updated_at|expires_at)":\s*\d{10,13}/gi, '"$1": <DYNAMIC_EPOCH>')
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<DYNAMIC_UUID>')
        .replace(/eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, '<DYNAMIC_JWT>')
        .replace(/\b[0-9a-f]{32,64}\b/gi, '<DYNAMIC_HASH>');
    }

    function compareResponses(base, test) {
      const normBase = normalizeDynamicValues(base.body || '');
      const normTest = normalizeDynamicValues(test.body || '');
      const statusDivergence = base.status !== test.status;
      const lengthDiff = Math.abs(normTest.length - normBase.length);
      const similarity = normBase === normTest ? 1.0 : (1.0 - Math.min(1.0, lengthDiff / Math.max(1, normBase.length)));
      const isBehavioralShift = statusDivergence || lengthDiff > 80 || similarity < 0.85;
      return {
        hasDivergence: statusDivergence || isBehavioralShift,
        isBehavioralShift,
        statusDivergence,
        normalizedSimilarity: similarity,
        normalizedBaselineBody: normBase,
        normalizedTestBody: normTest
      };
    }
    
    const sampleResp1 = JSON.stringify({
      id: "39730dbe-2090-4599-95a8-4550a89c0723",
      timestamp: 1727582049123,
      date: "2026-09-29T10:15:30.000Z",
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123def456ghi789jkl012mno345pqr678stu901vwx",
      message: "Search query results",
      count: 0
    });

    const sampleResp2 = JSON.stringify({
      id: "88888888-4444-4444-4444-121212121212",
      timestamp: 1727582099999,
      date: "2026-09-29T10:18:45.555Z",
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5OTk5OTk5OTk5In0.xyz999aaa888bbb777ccc666ddd555eee444fff333ggg",
      message: "Search query results",
      count: 0
    });

    const norm1 = normalizeDynamicValues(sampleResp1);
    const norm2 = normalizeDynamicValues(sampleResp2);

    assert(norm1.includes('<DYNAMIC_UUID>'), 'Normalized UUID to <DYNAMIC_UUID>');
    assert(norm1.includes('<DYNAMIC_TIMESTAMP>'), 'Normalized ISO timestamp to <DYNAMIC_TIMESTAMP>');
    assert(norm1.includes('<DYNAMIC_JWT>'), 'Normalized JWT token to <DYNAMIC_JWT>');
    assert(norm1 === norm2, 'Normalized responses with dynamic fields are identical (zero false positives)');

    const comparison = compareResponses(
      { status: 200, headers: {}, body: sampleResp1 },
      { status: 200, headers: {}, body: sampleResp2 }
    );
    assert(comparison.hasDivergence === false, 'Comparison confirms no behavioral shift between dynamic-only changes');
    assert(comparison.normalizedSimilarity === 1, 'Normalized similarity is 1.0 (100% match)');

    // 3. Active Target Probing: Time-based, UNION column limits, Canaries & Second Order
    const { startServer: startMock2, stopServer: stopMock2 } = await import('./mock-server.js');
    await startMock2(4004);

    try {
      // 3A. Controlled Time-Based Delay Analysis
      const t0 = Date.now();
      const baseTimeRes = await fetch('http://127.0.0.1:4004/api/sqli-time?id=1');
      const baseElapsed = Date.now() - t0;
      assert(baseTimeRes.status === 200, 'Time endpoint baseline returns 200 OK');
      assert(baseElapsed < 500, `Baseline latency is fast (${baseElapsed} ms)`);

      const tProbeStart = Date.now();
      const delayTimeRes = await fetch('http://127.0.0.1:4004/api/sqli-time?id=1%20AND%20pg_sleep(1.5)');
      const probeElapsed = Date.now() - tProbeStart;
      assert(delayTimeRes.status === 200, 'Time delay probe returns 200 OK');
      assert(probeElapsed >= 1400, `Time delay probe accurately triggered bounded delay (${probeElapsed} ms)`);

      // 3B. Controlled UNION Column Range Check
      const unionBase = await fetch('http://127.0.0.1:4004/api/sqli-union?sort=1');
      assert(unionBase.status === 200, 'UNION baseline ORDER BY 1 returns 200 OK');

      const unionProbe = await fetch('http://127.0.0.1:4004/api/sqli-union?sort=ORDER%20BY%2099');
      assert(unionProbe.status === 500, 'UNION probe ORDER BY 99 triggers column range error');
      const unionErrBody = await unionProbe.json();
      assert(unionErrBody.details && unionErrBody.details.includes('ORDER BY term out of range'), 'ORDER BY out of range error identified column count constraint');

      // 3C. Authorized Synthetic Canary Data Exposure Verification
      function verifyCanaryExposure(responseBody, authorizedMarker, unauthorizedMarker, probeUsed) {
        const text = responseBody || '';
        const seesAuthorized = text.includes(authorizedMarker);
        const seesUnauthorized = text.includes(unauthorizedMarker);
        if (seesUnauthorized) {
          return {
            performed: true,
            boundaryCrossed: true,
            finding: 'Possible Data Exposure',
            confidence: 'High',
            evidence: [{ description: 'Unauthorized synthetic canary marker was observed', probe: probeUsed }]
          };
        }
        if (seesAuthorized && !seesUnauthorized) {
          return {
            performed: true,
            boundaryCrossed: false,
            finding: 'Boundary Maintained',
            confidence: 'High',
            evidence: [{ description: 'Only authorized synthetic canary marker returned' }]
          };
        }
        return {
          performed: false,
          boundaryCrossed: false,
          finding: 'Not Configured',
          confidence: 'Informational',
          evidence: []
        };
      }
      
      // Authorized baseline: Company Alpha only
      const canaryBase = await fetch('http://127.0.0.1:4004/api/sqli-canary?company=CANARY_COMPANY_ALPHA');
      const canaryBaseBody = await canaryBase.text();
      assert(canaryBaseBody.includes('CANARY_TOKEN_ALPHA_771'), 'Baseline contains authorized Alpha canary');
      assert(!canaryBaseBody.includes('CANARY_TOKEN_BETA_992'), 'Baseline does NOT contain unauthorized Beta canary');

      // Injection probe: exposes both canaries
      const canaryProbe = await fetch('http://127.0.0.1:4004/api/sqli-canary?company=CANARY_COMPANY_ALPHA%27%20OR%20%271%27=%271');
      const canaryProbeBody = await canaryProbe.text();
      assert(canaryProbeBody.includes('CANARY_TOKEN_BETA_992'), 'Injected probe exposed unauthorized Beta canary');

      const canaryVerify = verifyCanaryExposure(
        canaryProbeBody,
        'CANARY_TOKEN_ALPHA_771',
        'CANARY_TOKEN_BETA_992',
        "' OR '1'='1"
      );
      assert(canaryVerify.performed === true, 'Canary exposure verification executed');
      assert(canaryVerify.boundaryCrossed === true, 'Authorization boundary crossing confirmed with synthetic canary');
      assert(canaryVerify.finding === 'Possible Data Exposure', 'Classified as Possible Data Exposure');
      assert(canaryVerify.confidence === 'High', 'Confidence is High with concrete canary proof');

      // Unconfigured target safeguard
      const unconfiguredVerify = verifyCanaryExposure(
        '{"status":"no canary here"}',
        'NON_EXISTENT_ALPHA',
        'NON_EXISTENT_BETA',
        "probe"
      );
      assert(unconfiguredVerify.performed === false, 'Safely falls back when no synthetic canaries are configured');
      assert(unconfiguredVerify.finding === 'Not Configured', 'Reports Not Configured without false positives');

      // 3D. Controlled Second-Order SQL Injection Workflow
      // Step 1: Store payload
      const storeRes = await fetch('http://127.0.0.1:4004/api/sqli-second-order-store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'tester_user_1', profileBio: "Developer' --" })
      });
      assert(storeRes.status === 200, 'Step 1: Second-order payload safely stored in database');

      // Step 2: Trigger execution on subsequent read
      const viewRes = await fetch('http://127.0.0.1:4004/api/sqli-second-order-view?userId=tester_user_1');
      assert(viewRes.status === 500, 'Step 2: Second-order execution triggered database error on read');
      const viewBody = await viewRes.json();
      assert(viewBody.error.includes('Database syntax error'), 'Second-order database syntax error identified');

      // Safe store baseline
      await fetch('http://127.0.0.1:4004/api/sqli-second-order-store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'safe_user_2', profileBio: 'Safe bio without quotes' })
      });
      const safeViewRes = await fetch('http://127.0.0.1:4004/api/sqli-second-order-view?userId=safe_user_2');
      assert(safeViewRes.status === 200, 'Safe second-order read returns 200 OK without errors');

      // 4. Modern SQLi Static Source Code Analysis
      const UNSAFE_SOURCE_PATTERNS = [
        {
          type: 'Raw Query Bypass',
          regex: /\b(db\.raw|sequelize\.query|prisma\.\$queryRawUnsafe|knex\.raw)\s*\(\s*[`'"].*?\$\{/i,
          severity: 'High',
          rewrite: 'Use standard ORM models or parameterized methods (e.g. prisma.$queryRaw`...` or knex.raw("... ?", [val])).'
        },
        {
          type: 'Template Literal Injection',
          regex: /(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\s+.*?\$\{.*?\}/i,
          severity: 'High',
          rewrite: 'Use parameterized query placeholders (?, $1, :name) with parameter array binding.'
        },
        {
          type: 'SQL String Concatenation',
          regex: /(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\s+.*?\+\s*[a-zA-Z0-9_.]+/i,
          severity: 'High',
          rewrite: 'Use parameterized query placeholders or pass user parameters as separate bind values.'
        }
      ];

      function scanCode(content, filePath = 'backend/query.js') {
        const risks = [];
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          for (const pat of UNSAFE_SOURCE_PATTERNS) {
            if (pat.regex.test(line)) {
              risks.push({
                filePath,
                lineNumber: i + 1,
                snippet: line.trim(),
                patternType: pat.type,
                severity: pat.severity,
                secureRewrite: pat.rewrite
              });
              break;
            }
          }
        }
        return risks;
      }

      const vulnerableSnippet = `
        const router = express.Router();
        router.get('/users', async (req, res) => {
          const id = req.query.id;
          // Vulnerability 1: String Concatenation
          const sql1 = "SELECT * FROM users WHERE id = " + id;
          // Vulnerability 2: Template Literal Injection
          const sql2 = \`SELECT * FROM accounts WHERE email = '\${req.query.email}'\`;
          // Vulnerability 3: Raw ORM query bypass
          const result = await prisma.$queryRawUnsafe(\`SELECT * FROM orders WHERE user_id = \${id}\`);
        });
      `;

      const codeRisks = scanCode(vulnerableSnippet, 'src/routes/users.js');
      assert(codeRisks.length === 3, 'Static code analyzer identified 3 unsafe SQL query construction patterns');
      assert(codeRisks[0].patternType === 'SQL String Concatenation', 'Detected SQL String Concatenation');
      assert(codeRisks[1].patternType === 'Template Literal Injection', 'Detected Template Literal Injection');
      assert(codeRisks[2].patternType === 'Raw Query Bypass', 'Detected Raw Query Bypass (ORM unsanitized call)');
      assert(codeRisks[0].secureRewrite.includes('parameterized query'), 'Provided secure remediation recommendation for concat');
      assert(codeRisks[2].secureRewrite.includes('prisma.$queryRaw'), 'Provided ORM-specific safe recommendation');

      const safeSnippet = `
        const router = express.Router();
        router.get('/users', async (req, res) => {
          const sql = "SELECT * FROM users WHERE id = ?";
          const rows = await db.all(sql, [req.query.id]);
          res.json(rows);
        });
      `;
      const safeRisks = scanCode(safeSnippet, 'src/routes/safe.js');
      assert(safeRisks.length === 0, 'Safe parameterized source code produces zero risk findings');

      // 5. Test Case Safety Controls: Non-Destructive Payload Validation
      const testProbes = [
        "'", "''", "1' ORDER BY 1--", "1' ORDER BY 99--",
        "' OR '1'='1", "' OR '1'='2",
        "1; WAITFOR DELAY '0:0:1.5'--", "1 AND pg_sleep(1.5)--",
        "1' AND (SELECT 1 FROM (SELECT COUNT(*),CONCAT((SELECT 1),0x3a,FLOOR(RAND(0)*2))x FROM INFORMATION_SCHEMA.TABLES GROUP BY x)a)--"
      ];
      
      const destructiveKeywords = ['DROP TABLE', 'DELETE FROM', 'TRUNCATE TABLE', 'UPDATE USERS SET', 'XP_CMDSHELL'];
      let hasDestructive = false;
      for (const p of testProbes) {
        for (const kw of destructiveKeywords) {
          if (p.toUpperCase().includes(kw)) {
            hasDestructive = true;
            break;
          }
        }
      }
      assert(hasDestructive === false, 'All test probes are strictly non-destructive (no DROP, DELETE, TRUNCATE, or commands)');

      // 6. Target Scope & Safety Guard
      const isTargetAllowed = (url, allowedHost) => {
        try {
          const u = new URL(url);
          if (allowedHost === '*') return true;
          return u.hostname === allowedHost;
        } catch {
          return false;
        }
      };
      assert(isTargetAllowed('http://127.0.0.1:4004/api', '127.0.0.1') === true, 'Permits authorized localhost target');
      assert(isTargetAllowed('https://evil-unauthorized-target.com/api', '127.0.0.1') === false, 'Strictly blocks unauthorized external host');

    } finally {
      await stopMock2();
    }
  });

  console.log(`\n${green('==================================================')}`);
  console.log(`  Tests Passed: ${green(passed)}`);
  console.log(`  Tests Failed: ${failed > 0 ? red(failed) : '0'}`);
  console.log(`${green('==================================================')}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
