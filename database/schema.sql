-- NetScope Security Browser Database Schema
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS target_scopes (
    id TEXT PRIMARY KEY,
    project_id TEXT DEFAULT 'default',
    pattern TEXT NOT NULL,
    is_regex INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    project_id TEXT DEFAULT 'default',
    flow_id TEXT,
    method TEXT NOT NULL,
    url TEXT NOT NULL,
    domain TEXT NOT NULL,
    path TEXT NOT NULL,
    scheme TEXT NOT NULL,
    port INTEGER DEFAULT 80,
    headers TEXT NOT NULL,
    query_params TEXT,
    body BLOB,
    body_text TEXT,
    content_type TEXT,
    content_length INTEGER DEFAULT 0,
    timestamp INTEGER NOT NULL,
    is_intercepted INTEGER DEFAULT 0,
    is_modified INTEGER DEFAULT 0,
    in_scope INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS responses (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    status_message TEXT,
    headers TEXT NOT NULL,
    body BLOB,
    body_text TEXT,
    content_type TEXT,
    content_length INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    mime_type TEXT,
    resource_type TEXT,
    timestamp INTEGER NOT NULL,
    is_modified INTEGER DEFAULT 0,
    FOREIGN KEY(request_id) REFERENCES requests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS repeater_tabs (
    id TEXT PRIMARY KEY,
    project_id TEXT DEFAULT 'default',
    title TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'GET',
    url TEXT NOT NULL DEFAULT 'http://localhost:4000',
    headers TEXT NOT NULL DEFAULT '{}',
    body TEXT DEFAULT '',
    body_type TEXT DEFAULT 'raw',
    last_response TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS repeater_history (
    id TEXT PRIMARY KEY,
    tab_id TEXT NOT NULL,
    method TEXT NOT NULL,
    url TEXT NOT NULL,
    headers TEXT NOT NULL,
    body TEXT,
    status_code INTEGER,
    response_headers TEXT,
    response_body TEXT,
    duration_ms INTEGER,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY(tab_id) REFERENCES repeater_tabs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS proxy_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_requests_domain ON requests(domain);
CREATE INDEX IF NOT EXISTS idx_requests_method ON requests(method);
CREATE INDEX IF NOT EXISTS idx_requests_url ON requests(url);
CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp);
CREATE INDEX IF NOT EXISTS idx_responses_request_id ON responses(request_id);
CREATE INDEX IF NOT EXISTS idx_responses_status ON responses(status_code);

CREATE TABLE IF NOT EXISTS response_modification_logs (
    id TEXT PRIMARY KEY,
    flow_id TEXT,
    url TEXT NOT NULL,
    method TEXT NOT NULL,
    original_status INTEGER NOT NULL,
    modified_status INTEGER NOT NULL,
    rule_name TEXT NOT NULL,
    timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mod_logs_timestamp ON response_modification_logs(timestamp);

-- Saved Login Profiles for Authorized Test Applications
CREATE TABLE IF NOT EXISTS login_profiles (
    id TEXT PRIMARY KEY,
    project_id TEXT DEFAULT 'default',
    application_name TEXT NOT NULL,
    target_host TEXT NOT NULL,
    login_endpoint TEXT NOT NULL,
    http_method TEXT NOT NULL DEFAULT 'POST',
    payload_format TEXT NOT NULL DEFAULT 'json',
    username_field TEXT NOT NULL DEFAULT 'username',
    password_field TEXT NOT NULL DEFAULT 'password',
    extra_fields TEXT DEFAULT '{}',
    username TEXT NOT NULL,
    encrypted_credential_reference TEXT,
    credential_storage_enabled INTEGER DEFAULT 0,
    response_token_field TEXT DEFAULT 'accessToken',
    response_refresh_field TEXT DEFAULT 'refreshToken',
    response_user_field TEXT DEFAULT 'user.id',
    refresh_endpoint TEXT DEFAULT '',
    auto_test_enabled INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_login_profiles_host ON login_profiles(target_host);

-- Authentication Sessions with Encrypted Tokens
CREATE TABLE IF NOT EXISTS authentication_sessions (
    id TEXT PRIMARY KEY,
    profile_id TEXT,
    application_name TEXT NOT NULL,
    login_endpoint TEXT NOT NULL,
    browser_session_id TEXT,
    user_id TEXT,
    username TEXT,
    encrypted_access_token TEXT NOT NULL,
    encrypted_refresh_token TEXT,
    token_type TEXT DEFAULT 'Bearer',
    is_jwt INTEGER DEFAULT 0,
    jwt_claims TEXT DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active',
    expires_at INTEGER,
    created_at INTEGER NOT NULL,
    last_activity_at INTEGER NOT NULL,
    FOREIGN KEY(profile_id) REFERENCES login_profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_status ON authentication_sessions(status);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_created ON authentication_sessions(created_at);

-- SQL Injection Security Testing Reports & History
CREATE TABLE IF NOT EXISTS sqli_scan_reports (
    id TEXT PRIMARY KEY,
    project_id TEXT DEFAULT 'default',
    target_url TEXT NOT NULL,
    method TEXT NOT NULL,
    param_name TEXT NOT NULL,
    param_location TEXT NOT NULL,
    finding TEXT NOT NULL,
    confidence TEXT NOT NULL,
    test_mode TEXT NOT NULL DEFAULT 'active',
    requests_sent INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    evidence TEXT DEFAULT '[]',
    remediation TEXT,
    original_request TEXT,
    test_request TEXT,
    test_response TEXT,
    verification_status TEXT DEFAULT 'Suspected',
    response_difference TEXT DEFAULT '{}',
    timing_evidence TEXT DEFAULT '{}',
    safe_verification TEXT DEFAULT '{}',
    timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sqli_reports_timestamp ON sqli_scan_reports(timestamp);
CREATE INDEX IF NOT EXISTS idx_sqli_reports_finding ON sqli_scan_reports(finding);

