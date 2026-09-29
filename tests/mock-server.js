const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const sqlite3 = require('sqlite3');

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Server-Side SQLite Database
const dbPath = path.resolve(__dirname, 'mock_server.db');
let serverDb = null;

function initServerDb() {
  return new Promise((resolve, reject) => {
    serverDb = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(err);
      serverDb.serialize(() => {
        // Users table
        serverDb.run(`
          CREATE TABLE IF NOT EXISTS server_users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            email TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            created_at INTEGER NOT NULL
          )
        `);

        // Sessions table
        serverDb.run(`
          CREATE TABLE IF NOT EXISTS server_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            access_token TEXT NOT NULL,
            refresh_token TEXT NOT NULL,
            token_type TEXT NOT NULL DEFAULT 'Bearer',
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            last_activity INTEGER NOT NULL,
            revoked INTEGER DEFAULT 0,
            FOREIGN KEY(user_id) REFERENCES server_users(id)
          )
        `);

        // Seed default users if empty
        const now = Date.now();
        const seedUsers = [
          { id: 'usr_admin', username: 'admin', password: 'Secret123!', email: 'admin@testapp.local', role: 'administrator' },
          { id: 'usr_tester', username: 'tester', password: 'UserPass2026!', email: 'tester@testapp.local', role: 'security_analyst' }
        ];

        const stmt = serverDb.prepare(`INSERT OR IGNORE INTO server_users (id, username, password, email, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
        seedUsers.forEach(u => {
          stmt.run(u.id, u.username, u.password, u.email, u.role, now);
        });
        stmt.finalize((finalErr) => {
          if (finalErr) return reject(finalErr);
          resolve(serverDb);
        });
      });
    });
  });
}

// JWT Helper Functions
const JWT_SECRET = 'netscope-test-auth-jwt-secret-key-2026';

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createJwt(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${data}.${signature}`;
}

// Root HTML test page
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>NetScope Test Application</title>
  <style>
    body { font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem; }
    h1 { color: #38bdf8; }
    button { background: #0284c7; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
    button:hover { background: #0369a1; }
    .card { background: #1e293b; padding: 1.5rem; border-radius: 8px; margin-bottom: 1rem; border: 1px solid #334155; }
    code { background: #090d16; padding: 2px 6px; border-radius: 4px; color: #38bdf8; }
  </style>
</head>
<body>
  <h1>NetScope Security Testing Target</h1>
  <p>Local target server active on port ${PORT} with server-side SQLite database. Use for security assessment, interception verification, and request inspection.</p>
  
  <div class="card">
    <h3>API Endpoints</h3>
    <ul>
      <li><a href="/api/get" style="color: #38bdf8;">/api/get</a> - JSON GET response</li>
      <li><a href="/api/cookies" style="color: #38bdf8;">/api/cookies</a> - Set and inspect cookies</li>
      <li><a href="/api/redirect" style="color: #38bdf8;">/api/redirect</a> - 302 Redirect test</li>
      <li><a href="/api/error" style="color: #38bdf8;">/api/error</a> - 500 Error test</li>
      <li><a href="/api/delayed" style="color: #38bdf8;">/api/delayed</a> - Response with latency</li>
      <li><a href="/api/db/status" style="color: #38bdf8;">/api/db/status</a> - Server-side database status</li>
    </ul>
  </div>

  <div class="card">
    <h3>Login Authentication Interception Test</h3>
    <p style="font-size: 13px; color: #94a3b8; margin-bottom: 12px;">
      Try logging in with the wrong password below, then use NetScope's <strong>Intercept</strong> panel to modify the request body or response.
    </p>
    <form action="/api/login" method="POST">
      <div style="margin-bottom: 8px;">
        <label style="display:inline-block; width: 90px; font-size: 13px;">Username:</label>
        <input type="text" name="username" value="admin" style="padding: 6px; background: #0f172a; color: white; border: 1px solid #475569; border-radius: 4px;" />
      </div>
      <div style="margin-bottom: 12px;">
        <label style="display:inline-block; width: 90px; font-size: 13px;">Password:</label>
        <input type="password" name="password" value="wrongpassword123" style="padding: 6px; background: #0f172a; color: white; border: 1px solid #475569; border-radius: 4px;" />
      </div>
      <button type="submit">Submit Login</button>
    </form>
    <p style="font-size: 12px; color: #64748b; margin-top: 8px;">
      Valid credentials in server DB: <code>admin</code> / <code>Secret123!</code> or <code>tester</code> / <code>UserPass2026!</code>
    </p>
  </div>

  <div class="card">
    <h3>Test Interactive Form Submission</h3>
    <form action="/api/post" method="POST">
      <input type="text" name="username" value="security_tester" style="padding: 6px; background: #0f172a; color: white; border: 1px solid #475569; border-radius: 4px;" />
      <button type="submit">Submit POST Request</button>
    </form>
  </div>

  <script>
    console.log("[TargetApp] Initialized NetScope test application client with server-side DB.");
    console.info("[TargetApp] Environment: Local Development & Security Testing.");
  </script>
</body>
</html>`);
});

// JSON GET
app.get('/api/get', (req, res) => {
  res.json({
    status: 'success',
    method: 'GET',
    message: 'NetScope test GET response',
    timestamp: Date.now(),
    query: req.query,
    headersReceived: {
      'user-agent': req.headers['user-agent'],
      'x-custom-header': req.headers['x-custom-header']
    }
  });
});

// JSON POST
app.post('/api/post', (req, res) => {
  res.json({
    status: 'success',
    method: 'POST',
    receivedBody: req.body,
    contentType: req.headers['content-type'],
    timestamp: Date.now()
  });
});

// Login Authentication Endpoint - Backed by Server-side SQLite DB
app.post('/api/login', (req, res) => {
  const username = req.body?.username || req.body?.email || '';
  const password = req.body?.password || '';

  if (!serverDb) {
    // Fallback if DB not ready
    if (username === 'admin' && password === 'Secret123!') {
      return res.json({
        success: true,
        status: 'authenticated',
        message: 'Login successful! Welcome administrator.',
        user: { id: 'usr_admin', username: 'admin', role: 'administrator' },
        accessToken: createJwt({ sub: 'usr_admin', username: 'admin', role: 'administrator' }),
        token: 'netscope_session_token_xyz987',
        refreshToken: 'rt_' + crypto.randomBytes(16).toString('hex'),
        timestamp: Date.now()
      });
    }
    return res.status(401).json({
      success: false,
      status: 'unauthorized',
      statusCode: 401,
      message: 'Invalid username or password.',
      timestamp: Date.now()
    });
  }

  serverDb.get(
    `SELECT * FROM server_users WHERE (username = ? OR email = ?) AND password = ?`,
    [username, username, password],
    (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Server database error', details: err.message });
      }

      if (!user) {
        return res.status(401).json({
          success: false,
          status: 'unauthorized',
          statusCode: 401,
          message: 'Invalid username or password.',
          receivedUsername: username || '',
          path: '/api/login',
          timestamp: Date.now()
        });
      }

      // Generate JWT Access Token and Refresh Token
      const now = Date.now();
      const expiresInSeconds = 3600;
      const jwtPayload = {
        sub: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        iss: 'netscope-test-server',
        iat: Math.floor(now / 1000),
        exp: Math.floor(now / 1000) + expiresInSeconds
      };

      const accessToken = createJwt(jwtPayload);
      const refreshToken = 'rt_' + crypto.randomBytes(24).toString('hex');
      const sessionId = 'srv_sess_' + crypto.randomBytes(8).toString('hex');

      // Store active session in server-side DB
      serverDb.run(
        `INSERT INTO server_sessions (id, user_id, username, access_token, refresh_token, token_type, expires_at, created_at, last_activity, revoked)
         VALUES (?, ?, ?, ?, ?, 'Bearer', ?, ?, ?, 0)`,
        [sessionId, user.id, user.username, accessToken, refreshToken, now + (expiresInSeconds * 1000), now, now],
        (insertErr) => {
          if (insertErr) {
            console.error('[MockServer] Failed to insert session:', insertErr);
          }

          res.json({
            success: true,
            status: 'authenticated',
            message: `Login successful! Welcome ${user.username}.`,
            sessionId: sessionId,
            accessToken: accessToken,
            refreshToken: refreshToken,
            token: accessToken, // legacy compatibility
            tokenType: 'Bearer',
            expiresIn: expiresInSeconds,
            user: {
              id: user.id,
              username: user.username,
              email: user.email,
              role: user.role
            },
            timestamp: now
          });
        }
      );
    }
  );
});

// Refresh Token Endpoint - Backed by Server-side SQLite DB
const handleRefresh = (req, res) => {
  const refreshToken = req.body?.refreshToken || req.body?.refresh_token || req.query?.refreshToken || '';

  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: 'Missing refreshToken in request body',
      timestamp: Date.now()
    });
  }

  if (!serverDb) {
    return res.status(500).json({ error: 'Server database not initialized' });
  }

  serverDb.get(
    `SELECT s.*, u.email, u.role FROM server_sessions s
     JOIN server_users u ON s.user_id = u.id
     WHERE s.refresh_token = ? AND s.revoked = 0`,
    [refreshToken],
    (err, session) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!session) {
        return res.status(401).json({
          success: false,
          statusCode: 401,
          message: 'Invalid or revoked refresh token',
          timestamp: Date.now()
        });
      }

      const now = Date.now();
      const expiresInSeconds = 3600;
      const newPayload = {
        sub: session.user_id,
        username: session.username,
        email: session.email,
        role: session.role,
        iss: 'netscope-test-server',
        iat: Math.floor(now / 1000),
        exp: Math.floor(now / 1000) + expiresInSeconds
      };

      const newAccessToken = createJwt(newPayload);
      const newExpiresAt = now + (expiresInSeconds * 1000);

      // Update session in server-side DB
      serverDb.run(
        `UPDATE server_sessions SET access_token = ?, expires_at = ?, last_activity = ? WHERE id = ?`,
        [newAccessToken, newExpiresAt, now, session.id],
        (updErr) => {
          if (updErr) console.error('[MockServer] Failed to update session:', updErr);
          res.json({
            success: true,
            status: 'refreshed',
            accessToken: newAccessToken,
            refreshToken: session.refresh_token,
            tokenType: 'Bearer',
            expiresIn: expiresInSeconds,
            message: 'Access token refreshed successfully',
            timestamp: now
          });
        }
      );
    }
  );
};

app.post('/api/refresh', handleRefresh);
app.post('/api/auth/refresh', handleRefresh);

// Revoke Session / Logout Endpoint
const handleRevoke = (req, res) => {
  const token = req.body?.refreshToken || req.body?.accessToken || req.body?.token || '';
  const authHeader = req.headers['authorization'] || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
  const targetToken = token || bearerToken;

  if (!serverDb) {
    return res.json({ success: true, message: 'Logged out' });
  }

  serverDb.run(
    `UPDATE server_sessions SET revoked = 1, last_activity = ?
     WHERE access_token = ? OR refresh_token = ?`,
    [Date.now(), targetToken, targetToken],
    (err) => {
      res.json({
        success: true,
        message: 'Session revoked successfully from server-side database',
        timestamp: Date.now()
      });
    }
  );
};

app.post('/api/logout', handleRevoke);
app.post('/api/auth/revoke', handleRevoke);

// Protected User Profile Endpoint
const handleUserProfile = (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : (req.query?.token || '');

  if (!token) {
    return res.status(401).json({
      success: false,
      statusCode: 401,
      message: 'Authorization Bearer token required'
    });
  }

  if (!serverDb) {
    return res.json({ success: true, user: { username: 'admin', role: 'administrator' } });
  }

  serverDb.get(
    `SELECT s.*, u.email, u.role FROM server_sessions s
     JOIN server_users u ON s.user_id = u.id
     WHERE s.access_token = ? AND s.revoked = 0`,
    [token],
    (err, session) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!session) {
        return res.status(401).json({
          success: false,
          statusCode: 401,
          message: 'Invalid or expired access token'
        });
      }
      res.json({
        success: true,
        user: {
          id: session.user_id,
          username: session.username,
          email: session.email,
          role: session.role
        },
        session: {
          id: session.id,
          expiresAt: session.expires_at,
          lastActivity: session.last_activity
        }
      });
    }
  );
};

app.get('/api/user', handleUserProfile);
app.get('/api/auth/me', handleUserProfile);

// Server-side DB Status & Inspector Endpoint
app.get('/api/db/status', (req, res) => {
  if (!serverDb) {
    return res.json({ status: 'uninitialized' });
  }

  serverDb.all(`SELECT id, username, email, role, created_at FROM server_users`, [], (err, users) => {
    serverDb.all(
      `SELECT id, user_id, username, token_type, expires_at, created_at, last_activity, revoked FROM server_sessions ORDER BY created_at DESC LIMIT 20`,
      [],
      (sErr, sessions) => {
        res.json({
          success: true,
          database: 'SQLite',
          databasePath: dbPath,
          users: users || [],
          activeSessionsCount: (sessions || []).filter(s => !s.revoked).length,
          recentSessions: sessions || [],
          timestamp: Date.now()
        });
      }
    );
  });
});

// Cookies endpoint
app.get('/api/cookies', (req, res) => {
  res.setHeader('Set-Cookie', 'netscope_session=test_token_12345; Path=/; HttpOnly');
  res.json({
    status: 'success',
    message: 'Cookie set',
    cookiesReceived: req.headers['cookie'] || 'none'
  });
});

// Redirect endpoint
app.get('/api/redirect', (req, res) => {
  res.redirect(302, '/api/get');
});

// Error endpoint
app.get('/api/error', (req, res) => {
  res.status(500).json({
    error: 'Internal Server Error',
    code: 500,
    message: 'Simulated backend application failure'
  });
});

// Delayed endpoint for timing tests
app.get('/api/delayed', (req, res) => {
  setTimeout(() => {
    res.json({
      status: 'success',
      delayMs: 300,
      timestamp: Date.now()
    });
  }, 300);
});

// Interception validation endpoint
app.post('/api/intercept-test', (req, res) => {
  const modifiedHeader = req.headers['x-netscope-modified'];
  const modifiedBodyParam = req.body?.injectedParam;

  res.json({
    isModified: Boolean(modifiedHeader || modifiedBodyParam),
    modifiedHeader: modifiedHeader || null,
    injectedParam: modifiedBodyParam || null,
    body: req.body
  });
});

// Controlled demonstration endpoint: Intentionally vulnerable to SQL syntax errors for testing
app.get('/api/sqli-test', (req, res) => {
  const id = req.query.id || '';
  if (!id) {
    return res.status(400).json({ error: 'Missing required query parameter: id' });
  }

  if (!serverDb) {
    return res.status(500).json({ error: 'Database not initialized' });
  }

  // Intentionally unescaped raw string concatenation for syntax checking demonstration
  const rawSql = `SELECT id, username, email, role FROM server_users WHERE id = '${id}'`;
  serverDb.all(rawSql, [], (err, rows) => {
    if (err) {
      // Return standard SQLite syntax error signature
      return res.status(500).json({
        error: 'Database error occurred',
        code: 'SQLITE_ERROR',
        details: `sqlite3.OperationalError: ${err.message}`,
        query: rawSql
      });
    }
    res.json({
      success: true,
      count: rows.length,
      user: rows[0] || null
    });
  });
});

// Safe parameterized search endpoint
app.all('/api/search', (req, res) => {
  const query = req.query.q || req.body?.q || req.query.query || req.body?.query || '';

  if (!serverDb) {
    return res.status(500).json({ error: 'Database not initialized' });
  }

  // Safe parameterized query using prepared statement placeholders
  serverDb.all(
    'SELECT id, username, email, role FROM server_users WHERE username LIKE ? OR email LIKE ?',
    [`%${query}%`, `%${query}%`],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Internal server error' });
      }
      res.json({
        success: true,
        count: rows.length,
        results: rows
      });
    }
  );
});

// Controlled demonstration endpoint: Boolean-based differential behavior
app.get('/api/sqli-boolean', (req, res) => {
  const id = req.query.id || '';
  if (!id) {
    return res.status(400).json({ error: 'Missing required query parameter: id' });
  }

  if (!serverDb) {
    return res.status(500).json({ error: 'Database not initialized' });
  }

  const rawSql = `SELECT id, username, email FROM server_users WHERE id = '${id}'`;
  serverDb.all(rawSql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database query error', details: err.message });
    }
    if (rows && rows.length > 0) {
      res.json({ success: true, count: rows.length, user: rows[0] });
    } else {
      res.status(404).json({ success: false, count: 0, message: 'User record not found' });
    }
  });
});

// Controlled demonstration endpoint: Login form with vulnerable email/password handling
app.post('/api/login-vulnerable', (req, res) => {
  const email = req.body?.email || req.body?.username || '';
  const pass = req.body?.password || req.body?.pass || '';

  if (!serverDb) {
    return res.status(500).json({ error: 'Database not initialized' });
  }

  const rawSql = `SELECT id, username, email, role FROM server_users WHERE email = '${email}' AND password = '${pass}'`;
  serverDb.all(rawSql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({
        error: 'Database execution exception',
        code: 'SQLITE_ERROR',
        details: `sqlite3.OperationalError: ${err.message}`,
        query: rawSql
      });
    }
    if (rows && rows.length > 0) {
      res.json({ success: true, user: rows[0], token: 'vulnerable-demo-token-123' });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  });
});

// Controlled endpoint: Time-based latency demonstration
app.all('/api/sqli-time', (req, res) => {
  const param = req.query.id || req.body?.id || req.query.q || '';
  const delay = /(pg_sleep|sleep|sqlite_master|waitfor)/i.test(param) ? 1500 : 0;
  
  setTimeout(() => {
    res.json({
      success: true,
      timeElapsedMs: delay,
      message: 'Time-based test endpoint response'
    });
  }, delay);
});

// Controlled endpoint: UNION-based structural column checking demonstration
app.all('/api/sqli-union', (req, res) => {
  const order = req.query.sort || req.query.id || req.body?.sort || '';
  if (/order\s+by\s+9\d+/i.test(order)) {
    return res.status(500).json({
      error: 'SQL logic error',
      details: 'sqlite3.OperationalError: 1st ORDER BY term out of range - should be between 1 and 4'
    });
  }
  res.json({
    success: true,
    columns: ['id', 'username', 'email', 'role'],
    rows: [
      { id: '1', username: 'item_1', email: 'test1@local', role: 'user' },
      { id: '2', username: 'item_2', email: 'test2@local', role: 'user' }
    ]
  });
});

// Controlled endpoint: Synthetic Canary Data Exposure Verification
const syntheticCanaryRecords = [
  { id: 'canary_1', company: 'CANARY_COMPANY_ALPHA', token: 'CANARY_TOKEN_ALPHA_771', role: 'customer_a' },
  { id: 'canary_2', company: 'CANARY_COMPANY_BETA', token: 'CANARY_TOKEN_BETA_992', role: 'customer_b' }
];

app.all('/api/sqli-canary', (req, res) => {
  const company = req.query.company || req.body?.company || '';
  // If company probe injects ' OR '1'='1 or similar, exposes both canaries
  if (/'\s*or\s*['"]?1['"]?\s*=\s*['"]?1/i.test(company)) {
    return res.json({
      success: true,
      count: syntheticCanaryRecords.length,
      records: syntheticCanaryRecords,
      note: 'Synthetic multi-tenant canary data exposure demonstrated'
    });
  }

  // Normal authorized query: returns only matching company
  const filtered = syntheticCanaryRecords.filter(r => r.company.toLowerCase() === company.toLowerCase());
  res.json({
    success: true,
    count: filtered.length,
    records: filtered
  });
});

// Controlled endpoints: Second-Order SQLi Workflow
let secondOrderStore = {};
app.post('/api/sqli-second-order-store', (req, res) => {
  const key = req.body?.userId || 'default_user';
  secondOrderStore[key] = req.body?.profileBio || '';
  res.json({ success: true, storedKey: key });
});

app.get('/api/sqli-second-order-view', (req, res) => {
  const key = req.query.userId || 'default_user';
  const storedVal = secondOrderStore[key] || '';
  if (/'/.test(storedVal)) {
    return res.status(500).json({
      error: 'Database syntax error on evaluating stored value',
      details: `sqlite3.OperationalError: near "${storedVal}": syntax error`
    });
  }
  res.json({ success: true, bio: storedVal });
});

let serverInstance = null;

async function startServer(port = PORT) {
  await initServerDb();
  return new Promise((resolve) => {
    serverInstance = app.listen(port, '127.0.0.1', () => {
      console.log(`[MockServer] Test server listening on http://127.0.0.1:${port} (with server-side DB)`);
      resolve(serverInstance);
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (serverInstance) {
      serverInstance.close(() => {
        serverInstance = null;
        if (serverDb) {
          serverDb.close(() => {
            serverDb = null;
            resolve();
          });
        } else {
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer, stopServer, initServerDb };

