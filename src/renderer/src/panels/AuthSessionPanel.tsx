import React, { useState, useEffect } from 'react';
import { 
  KeyRound, ShieldCheck, ShieldAlert, Plus, Play, RefreshCw, Trash2, 
  ExternalLink, Eye, EyeOff, Copy, Check, Lock, Unlock, Database, 
  Server, AlertTriangle, Layers, Clock, UserCheck, X, FileText 
} from 'lucide-react';

interface LoginProfile {
  id: string;
  project_id?: string;
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

interface AuthenticationSession {
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

interface DatabaseStats {
  dbPath: string;
  sizeBytes: number;
  requestsCount: number;
  responsesCount: number;
  profilesCount: number;
  sessionsCount: number;
  logsCount: number;
}

interface ServerDbStatus {
  success: boolean;
  database?: string;
  users?: any[];
  activeSessionsCount?: number;
  databasePath?: string;
}

export const AuthSessionPanel: React.FC = () => {
  // Profiles and Sessions
  const [profiles, setProfiles] = useState<LoginProfile[]>([]);
  const [sessions, setSessions] = useState<AuthenticationSession[]>([]);
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerDbStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Modals & Inspections
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Partial<LoginProfile> | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [testPasswordModal, setTestPasswordModal] = useState<{ profile: LoginProfile } | null>(null);
  const [customPasswordForTest, setCustomPasswordForTest] = useState('');
  const [inspectSession, setInspectSession] = useState<AuthenticationSession | null>(null);
  const [revealedTokens, setRevealedTokens] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [detectedLoginAlert, setDetectedLoginAlert] = useState<any | null>(null);

  // Load all data
  const loadAll = async () => {
    setIsLoading(true);
    try {
      if (window.netscope?.auth) {
        const [profList, sessList] = await Promise.all([
          window.netscope.auth.getProfiles(),
          window.netscope.auth.getSessions()
        ]);
        setProfiles(profList || []);
        setSessions(sessList || []);
      }

      if (window.netscope?.db?.getStats) {
        const stats = await window.netscope.db.getStats();
        setDbStats(stats || null);
      }

      // Check test server-side database
      try {
        const sRes = await fetch('http://127.0.0.1:4000/api/db/status');
        if (sRes.ok) {
          const sData = await sRes.json();
          setServerStatus(sData);
        }
      } catch {
        setServerStatus(null);
      }
    } catch (e: any) {
      console.error('Failed to load auth data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAll();

    // Listen for live login detections from the proxy
    let unsubLogin: (() => void) | undefined;
    if (window.netscope?.auth?.onLoginDetected) {
      unsubLogin = window.netscope.auth.onLoginDetected((data: any) => {
        setDetectedLoginAlert(data);
      });
    }

    return () => {
      if (unsubLogin) unsubLogin();
    };
  }, []);

  const showNotification = (type: 'success' | 'error' | 'info', text: string) => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 6000);
  };

  const handleOpenAddProfile = () => {
    setEditingProfile({
      application_name: 'Local Test Application',
      target_host: 'http://127.0.0.1:4000',
      login_endpoint: '/api/login',
      http_method: 'POST',
      payload_format: 'json',
      username_field: 'username',
      password_field: 'password',
      username: 'admin',
      credential_storage_enabled: true,
      response_token_field: 'accessToken',
      response_refresh_field: 'refreshToken',
      response_user_field: 'user.id',
      refresh_endpoint: '/api/refresh',
      auto_test_enabled: true,
      extra_fields: {}
    });
    setPasswordInput('Secret123!');
    setShowProfileModal(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;

    try {
      const payload: any = {
        ...editingProfile,
        plain_password_for_encryption: editingProfile.credential_storage_enabled && passwordInput ? passwordInput : undefined
      };

      await window.netscope.auth.saveProfile(payload);
      setShowProfileModal(false);
      setEditingProfile(null);
      setPasswordInput('');
      await loadAll();
      showNotification('success', `Saved login profile "${payload.application_name}" successfully.`);
    } catch (err: any) {
      showNotification('error', `Failed to save profile: ${err.message}`);
    }
  };

  const handleDeleteProfile = async (id: string, name: string) => {
    if (!confirm(`Delete login profile "${name}"?`)) return;
    try {
      await window.netscope.auth.deleteProfile(id);
      await loadAll();
      showNotification('info', `Profile "${name}" removed from local database.`);
    } catch (err: any) {
      showNotification('error', `Failed to delete profile: ${err.message}`);
    }
  };

  const handleExecuteLoginTest = async (profile: LoginProfile, overridePass?: string) => {
    setIsLoading(true);
    try {
      const res = await window.netscope.auth.testLogin(profile.id, overridePass);
      if (res.success) {
        showNotification('success', `Login test succeeded! Status: ${res.statusCode}. Authenticated session generated & encrypted.`);
      } else {
        showNotification('error', `Login test failed (HTTP ${res.statusCode}): ${res.error || 'Server rejected credentials'}`);
      }
      await loadAll();
    } catch (err: any) {
      showNotification('error', `Login execution error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshSession = async (sessionId: string) => {
    setIsLoading(true);
    try {
      const res = await window.netscope.auth.refreshSession(sessionId);
      if (res.success) {
        showNotification('success', 'Token successfully refreshed from test server! New access token stored.');
      } else {
        showNotification('error', `Refresh failed: ${res.error || 'Server rejected refresh token'}`);
      }
      await loadAll();
    } catch (err: any) {
      showNotification('error', `Refresh error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await window.netscope.auth.revokeSession(sessionId);
      showNotification('info', 'Session revoked.');
      await loadAll();
    } catch (err: any) {
      showNotification('error', `Revocation error: ${err.message}`);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await window.netscope.auth.deleteSession(sessionId);
      showNotification('info', 'Session deleted from local database.');
      await loadAll();
    } catch (err: any) {
      showNotification('error', `Delete error: ${err.message}`);
    }
  };

  const handleClearAllSessions = async () => {
    if (!confirm('Clear all stored authentication sessions?')) return;
    try {
      await window.netscope.auth.clearSessions();
      await loadAll();
      showNotification('info', 'All sessions cleared from database.');
    } catch (err: any) {
      showNotification('error', `Failed to clear sessions: ${err.message}`);
    }
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return '0 KB';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div className="h-full flex flex-col bg-[#121318] text-slate-200 select-none overflow-y-auto p-4 space-y-5">
      {/* Toast Feedback Banner */}
      {feedbackMsg && (
        <div className={`p-3 rounded-lg border text-xs flex items-center justify-between shadow-lg transition-all ${
          feedbackMsg.type === 'success' 
            ? 'bg-emerald-950/80 border-emerald-700/60 text-emerald-200' 
            : feedbackMsg.type === 'error'
            ? 'bg-red-950/80 border-red-700/60 text-red-200'
            : 'bg-blue-950/80 border-blue-700/60 text-blue-200'
        }`}>
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' && <ShieldCheck className="w-4 h-4 text-emerald-400" />}
            {feedbackMsg.type === 'error' && <ShieldAlert className="w-4 h-4 text-red-400" />}
            {feedbackMsg.type === 'info' && <Database className="w-4 h-4 text-blue-400" />}
            <span className="font-medium">{feedbackMsg.text}</span>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="text-slate-400 hover:text-white cursor-pointer ml-3">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Live Login Detection Alert */}
      {detectedLoginAlert && (
        <div className="p-3 bg-amber-950/40 border border-amber-600/50 rounded-lg flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-400 animate-pulse" />
            <span>
              <strong>HTTP Login POST Detected!</strong> URL: <code className="bg-black/40 px-1 py-0.5 rounded">{detectedLoginAlert.url}</code>
              {detectedLoginAlert.username && <> &bull; User: <strong>{detectedLoginAlert.username}</strong></>}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditingProfile({
                  application_name: new URL(detectedLoginAlert.url).hostname,
                  target_host: new URL(detectedLoginAlert.url).origin,
                  login_endpoint: new URL(detectedLoginAlert.url).pathname,
                  http_method: 'POST',
                  payload_format: detectedLoginAlert.format || 'json',
                  username_field: detectedLoginAlert.usernameField || 'username',
                  password_field: detectedLoginAlert.passwordField || 'password',
                  username: detectedLoginAlert.username || '',
                  credential_storage_enabled: false,
                  response_token_field: 'accessToken',
                  response_refresh_field: 'refreshToken',
                  response_user_field: 'user.id',
                  refresh_endpoint: '/api/refresh',
                  auto_test_enabled: true,
                  extra_fields: {}
                });
                setPasswordInput(detectedLoginAlert.password || '');
                setShowProfileModal(true);
                setDetectedLoginAlert(null);
              }}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-black font-semibold rounded text-[11px] cursor-pointer"
            >
              Save as Login Profile
            </button>
            <button
              onClick={() => setDetectedLoginAlert(null)}
              className="p-1 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Top Architecture Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Card 1: Local Database ("myDb") */}
        <div className="bg-[#171822] border border-[#272a38] rounded-lg p-3.5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <Database className="w-4 h-4 text-blue-400" />
              <span>Local Application DB (myDb)</span>
            </div>
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-950 border border-emerald-700/50 text-emerald-400">
              SQLite Active
            </span>
          </div>
          <div className="text-[11px] text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>DB Size:</span>
              <span className="font-mono text-slate-200">{formatFileSize(dbStats?.sizeBytes || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Saved Profiles:</span>
              <span className="font-mono text-slate-200">{profiles.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Stored Auth Sessions:</span>
              <span className="font-mono text-slate-200">{sessions.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Encryption:</span>
              <span className="text-emerald-400 font-medium">AES-256-GCM (Isolated Key)</span>
            </div>
          </div>
        </div>

        {/* Card 2: Server-Side Test Target DB */}
        <div className="bg-[#171822] border border-[#272a38] rounded-lg p-3.5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <Server className="w-4 h-4 text-indigo-400" />
              <span>Server-Side Database (Target)</span>
            </div>
            {serverStatus ? (
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-950 border border-emerald-700/50 text-emerald-400">
                Online (Port 4000)
              </span>
            ) : (
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-950 border border-red-700/50 text-red-400">
                Offline
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Target DB Engine:</span>
              <span className="font-mono text-slate-200">SQLite (mock_server.db)</span>
            </div>
            <div className="flex justify-between">
              <span>Test Users Seeded:</span>
              <span className="font-mono text-slate-200">{serverStatus?.users?.length || 2} accounts (admin, tester)</span>
            </div>
            <div className="flex justify-between">
              <span>Server Active Sessions:</span>
              <span className="font-mono text-slate-200">{serverStatus?.activeSessionsCount || 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Auth Endpoints:</span>
              <span className="font-mono text-indigo-300">/api/login, /api/refresh</span>
            </div>
          </div>
        </div>

        {/* Card 3: Session Security Summary */}
        <div className="bg-[#171822] border border-[#272a38] rounded-lg p-3.5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Security & Token Policy</span>
            </div>
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-blue-950 border border-blue-700/50 text-blue-300">
              Burp Standard
            </span>
          </div>
          <div className="text-[11px] text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Token Storage:</span>
              <span className="text-slate-200">Authenticated Ciphertext</span>
            </div>
            <div className="flex justify-between">
              <span>Token Extraction:</span>
              <span className="text-slate-200">Real Server Response Only</span>
            </div>
            <div className="flex justify-between">
              <span>JWT Claim Parsing:</span>
              <span className="text-amber-400 font-medium">Unverified Display Only</span>
            </div>
            <div className="flex justify-between">
              <span>Token Refresh:</span>
              <span className="text-slate-200">On-demand & Automatic</span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 1: Saved Login Profiles */}
      <div className="bg-[#171822] border border-[#272a38] rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-[#272a38] pb-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-blue-400" />
            <h3 className="font-semibold text-xs text-slate-200 tracking-wide uppercase">Saved Login Profiles</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#222432] text-slate-300 font-bold">
              {profiles.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenAddProfile}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Profile</span>
            </button>
            <button
              onClick={loadAll}
              title="Refresh profiles and sessions"
              className="p-1.5 bg-[#20222d] hover:bg-[#282a38] border border-[#2d3040] rounded text-slate-300 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {profiles.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs space-y-2">
            <KeyRound className="w-8 h-8 mx-auto opacity-30" />
            <p>No login profiles saved yet. Click &quot;Add Profile&quot; to configure a target authentication endpoint.</p>
            <button
              onClick={handleOpenAddProfile}
              className="px-3 py-1 bg-[#20222d] hover:bg-[#282a38] border border-blue-500/40 text-blue-400 rounded text-xs cursor-pointer"
            >
              Configure Default Local Target
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {profiles.map(p => (
              <div key={p.id} className="bg-[#12131a] border border-[#242636] hover:border-blue-500/40 rounded-lg p-3 space-y-2 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-xs text-slate-100 flex items-center gap-1.5">
                      <span>{p.application_name}</span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-300 font-mono">
                        {p.payload_format.toUpperCase()}
                      </span>
                    </h4>
                    <p className="text-[11px] font-mono text-blue-400 truncate max-w-xs">
                      {p.target_host}{p.login_endpoint}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {p.credential_storage_enabled ? (
                      <span title="Password encrypted with AES-256-GCM" className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
                        <Lock className="w-3 h-3" />
                        <span>Saved</span>
                      </span>
                    ) : (
                      <span title="Password not saved in DB" className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/40">
                        <Unlock className="w-3 h-3" />
                        <span>Manual</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 text-[11px] text-slate-400 bg-[#161722] p-2 rounded border border-[#1f2130] gap-1">
                  <div>
                    <span className="text-slate-500">Username: </span>
                    <span className="font-mono text-slate-200">{p.username}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Token Field: </span>
                    <span className="font-mono text-slate-200">{p.response_token_field}</span>
                  </div>
                  <div className="col-span-2 text-[10px] text-slate-500 truncate">
                    Last login: {p.last_login_at ? new Date(p.last_login_at).toLocaleTimeString() : 'Never tested'}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => {
                      if (!p.credential_storage_enabled || !p.encrypted_credential_reference) {
                        setTestPasswordModal({ profile: p });
                        setCustomPasswordForTest('');
                      } else {
                        handleExecuteLoginTest(p);
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Test Login</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingProfile(p);
                        setPasswordInput('');
                        setShowProfileModal(true);
                      }}
                      className="px-2 py-1 bg-[#1e202d] hover:bg-[#282a3c] rounded text-[11px] text-slate-300 cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteProfile(p.id, p.application_name)}
                      className="p-1 text-slate-400 hover:text-red-400 cursor-pointer"
                      title="Delete Profile"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 2: Active Authentication Sessions */}
      <div className="bg-[#171822] border border-[#272a38] rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-[#272a38] pb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="font-semibold text-xs text-slate-200 tracking-wide uppercase">Authentication Sessions</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#222432] text-slate-300 font-bold">
              {sessions.length}
            </span>
          </div>
          {sessions.length > 0 && (
            <button
              onClick={handleClearAllSessions}
              className="flex items-center gap-1 px-2 py-1 bg-red-950/40 hover:bg-red-900/60 border border-red-800/40 text-red-300 rounded text-xs cursor-pointer transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear All Sessions</span>
            </button>
          )}
        </div>

        {sessions.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs space-y-1">
            <Lock className="w-8 h-8 mx-auto opacity-30" />
            <p>No active sessions stored in database.</p>
            <p className="text-[11px] text-slate-600">Run &quot;Test Login&quot; on any configured profile above to generate an authenticated session.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#262838] text-slate-400 text-[11px]">
                  <th className="py-2 px-2 font-medium">Application</th>
                  <th className="py-2 px-2 font-medium">User</th>
                  <th className="py-2 px-2 font-medium">Status</th>
                  <th className="py-2 px-2 font-medium">Token Type</th>
                  <th className="py-2 px-2 font-medium">Access Token</th>
                  <th className="py-2 px-2 font-medium">Expiration</th>
                  <th className="py-2 px-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e202d]">
                {sessions.map(s => {
                  const isRevealed = revealedTokens[s.id];
                  const tokenDisplay = isRevealed 
                    ? s.encrypted_access_token 
                    : s.encrypted_access_token.substring(0, 16) + '••••••••' + s.encrypted_access_token.substring(s.encrypted_access_token.length - 8);

                  const isExpired = s.expires_at ? s.expires_at < Date.now() : false;

                  return (
                    <tr key={s.id} className="hover:bg-[#1a1c27] transition-colors">
                      <td className="py-2.5 px-2 font-medium text-slate-200">
                        <div>{s.application_name}</div>
                        <div className="text-[10px] text-slate-500 font-mono truncate max-w-[150px]">{s.login_endpoint}</div>
                      </td>
                      <td className="py-2.5 px-2">
                        <span className="font-mono text-slate-300">{s.username || s.user_id || 'anonymous'}</span>
                      </td>
                      <td className="py-2.5 px-2">
                        {s.status === 'revoked' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950/80 border border-red-800 text-red-300">
                            Revoked
                          </span>
                        ) : isExpired ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 border border-amber-800 text-amber-300">
                            Expired
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/80 border border-emerald-800 text-emerald-300">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-2">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                          {s.token_type || 'Bearer'} {s.is_jwt ? '(JWT)' : '(Opaque)'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 font-mono text-[11px] text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate max-w-[160px] bg-[#101117] px-1.5 py-0.5 rounded border border-[#222432]">
                            {tokenDisplay}
                          </span>
                          <button
                            onClick={() => setRevealedTokens(prev => ({ ...prev, [s.id]: !prev[s.id] }))}
                            className="p-1 hover:text-white text-slate-500 cursor-pointer"
                            title={isRevealed ? "Mask Token" : "Reveal Encrypted Token"}
                          >
                            {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleCopyText(s.encrypted_access_token, s.id)}
                            className="p-1 hover:text-white text-slate-500 cursor-pointer"
                            title="Copy Token Ciphertext"
                          >
                            {copiedId === s.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-[11px] text-slate-400">
                        {s.expires_at ? (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span>{new Date(s.expires_at).toLocaleTimeString()}</span>
                          </div>
                        ) : (
                          <span className="text-slate-600">No expiration</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {s.is_jwt ? (
                            <button
                              onClick={() => setInspectSession(s)}
                              className="px-2 py-1 bg-blue-950/60 hover:bg-blue-900/80 border border-blue-800/40 text-blue-300 rounded text-[11px] cursor-pointer"
                              title="Inspect Decoded Claims"
                            >
                              Claims
                            </button>
                          ) : null}

                          {s.encrypted_refresh_token && s.status === 'active' && (
                            <button
                              onClick={() => handleRefreshSession(s.id)}
                              className="px-2 py-1 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-800/40 text-emerald-300 rounded text-[11px] cursor-pointer"
                              title="Contact Server Refresh Endpoint"
                            >
                              Refresh
                            </button>
                          )}

                          {s.status === 'active' && (
                            <button
                              onClick={() => handleRevokeSession(s.id)}
                              className="px-2 py-1 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-800/40 text-amber-300 rounded text-[11px] cursor-pointer"
                              title="Revoke session"
                            >
                              Revoke
                            </button>
                          )}

                          <button
                            onClick={() => handleDeleteSession(s.id)}
                            className="p-1 hover:text-red-400 text-slate-500 cursor-pointer"
                            title="Delete Session Record"
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

      {/* MODAL 1: Add / Edit Login Profile */}
      {showProfileModal && editingProfile && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#171822] border border-[#2c2f40] rounded-xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#2c2f40] pb-3">
              <div className="flex items-center gap-2 text-slate-100 font-bold text-sm">
                <KeyRound className="w-4 h-4 text-blue-400" />
                <span>{editingProfile.id ? 'Edit Login Profile' : 'Configure New Login Profile'}</span>
              </div>
              <button
                onClick={() => setShowProfileModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Application Name</label>
                <input
                  type="text"
                  required
                  value={editingProfile.application_name || ''}
                  onChange={e => setEditingProfile({ ...editingProfile, application_name: e.target.value })}
                  placeholder="e.g. NetScope Test Target"
                  className="w-full bg-[#101116] border border-[#2b2e3e] rounded p-2 text-slate-200 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Target Host / Base URL</label>
                  <input
                    type="text"
                    required
                    value={editingProfile.target_host || ''}
                    onChange={e => setEditingProfile({ ...editingProfile, target_host: e.target.value })}
                    placeholder="http://127.0.0.1:4000"
                    className="w-full bg-[#101116] border border-[#2b2e3e] rounded p-2 text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Login Endpoint</label>
                  <input
                    type="text"
                    required
                    value={editingProfile.login_endpoint || ''}
                    onChange={e => setEditingProfile({ ...editingProfile, login_endpoint: e.target.value })}
                    placeholder="/api/login"
                    className="w-full bg-[#101116] border border-[#2b2e3e] rounded p-2 text-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Format</label>
                  <select
                    value={editingProfile.payload_format || 'json'}
                    onChange={e => setEditingProfile({ ...editingProfile, payload_format: e.target.value as any })}
                    className="w-full bg-[#101116] border border-[#2b2e3e] rounded p-2 text-slate-200 font-medium"
                  >
                    <option value="json">JSON</option>
                    <option value="form">Form Url-Encoded</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Username Field</label>
                  <input
                    type="text"
                    value={editingProfile.username_field || 'username'}
                    onChange={e => setEditingProfile({ ...editingProfile, username_field: e.target.value })}
                    className="w-full bg-[#101116] border border-[#2b2e3e] rounded p-2 text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Password Field</label>
                  <input
                    type="text"
                    value={editingProfile.password_field || 'password'}
                    onChange={e => setEditingProfile({ ...editingProfile, password_field: e.target.value })}
                    className="w-full bg-[#101116] border border-[#2b2e3e] rounded p-2 text-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={editingProfile.username || ''}
                    onChange={e => setEditingProfile({ ...editingProfile, username: e.target.value })}
                    placeholder="admin"
                    className="w-full bg-[#101116] border border-[#2b2e3e] rounded p-2 text-slate-200 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">
                    Password {editingProfile.credential_storage_enabled && '(Encrypted)'}
                  </label>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={e => setPasswordInput(e.target.value)}
                    placeholder={editingProfile.credential_storage_enabled && editingProfile.encrypted_credential_reference ? '••••••••' : 'Enter test password'}
                    className="w-full bg-[#101116] border border-[#2b2e3e] rounded p-2 text-slate-200 font-medium"
                  />
                </div>
              </div>

              {/* Secure Credential Storage Toggle */}
              <div className="bg-[#12131b] p-3 rounded border border-[#292c3d] space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingProfile.credential_storage_enabled)}
                    onChange={e => setEditingProfile({ ...editingProfile, credential_storage_enabled: e.target.checked })}
                    className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
                  />
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Enable Authenticated Credential Storage (AES-256-GCM)</span>
                  </span>
                </label>
                <p className="text-[11px] text-slate-400 pl-5">
                  When enabled, passwords for this authorized test application will be encrypted with an isolated key before storage. Passwords are never saved in plaintext or logged.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="block text-slate-400 mb-1">Response Token Field</label>
                  <input
                    type="text"
                    value={editingProfile.response_token_field || 'accessToken'}
                    onChange={e => setEditingProfile({ ...editingProfile, response_token_field: e.target.value })}
                    className="w-full bg-[#101116] border border-[#2b2e3e] rounded p-2 text-slate-200 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Response Refresh Field</label>
                  <input
                    type="text"
                    value={editingProfile.response_refresh_field || 'refreshToken'}
                    onChange={e => setEditingProfile({ ...editingProfile, response_refresh_field: e.target.value })}
                    className="w-full bg-[#101116] border border-[#2b2e3e] rounded p-2 text-slate-200 font-mono text-[11px]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#292c3d]">
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="px-3 py-1.5 bg-[#20222d] hover:bg-[#282a38] text-slate-300 rounded font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded cursor-pointer"
                >
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Enter Password to Test Login (When Credential Storage is OFF) */}
      {testPasswordModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#171822] border border-[#2c2f40] rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#2c2f40] pb-3">
              <div className="flex items-center gap-2 text-slate-100 font-bold text-sm">
                <Lock className="w-4 h-4 text-emerald-400" />
                <span>Provide Password for Test Login</span>
              </div>
              <button
                onClick={() => setTestPasswordModal(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Credential storage is disabled for profile <strong>{testPasswordModal.profile.application_name}</strong>. Provide the password to submit the test login request:
            </p>
            <input
              type="password"
              autoFocus
              value={customPasswordForTest}
              onChange={e => setCustomPasswordForTest(e.target.value)}
              placeholder="Enter password..."
              className="w-full bg-[#101116] border border-[#2b2e3e] rounded p-2 text-slate-200 text-xs font-medium"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleExecuteLoginTest(testPasswordModal.profile, customPasswordForTest);
                  setTestPasswordModal(null);
                }
              }}
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setTestPasswordModal(null)}
                className="px-3 py-1.5 bg-[#20222d] text-slate-300 rounded text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleExecuteLoginTest(testPasswordModal.profile, customPasswordForTest);
                  setTestPasswordModal(null);
                }}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold cursor-pointer"
              >
                Submit Login
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: JWT Claims Inspector */}
      {inspectSession && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#171822] border border-[#2c2f40] rounded-xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#2c2f40] pb-3">
              <div className="flex items-center gap-2 text-slate-100 font-bold text-sm">
                <FileText className="w-4 h-4 text-blue-400" />
                <span>JWT Token Claims (Unverified Display)</span>
              </div>
              <button
                onClick={() => setInspectSession(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-amber-950/30 border border-amber-700/40 p-2.5 rounded text-[11px] text-amber-200/90 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>Security Notice:</strong> Decoded claims are parsed client-side for inspection purposes only and are NOT treated as verified until validated by the target server.
              </span>
            </div>

            <div className="space-y-1">
              <div className="text-[11px] text-slate-400 font-medium">Decoded Payload Claims:</div>
              <pre className="bg-[#0f1015] border border-[#252838] p-3 rounded text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-56">
                {JSON.stringify(inspectSession.jwt_claims || {}, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectSession(null)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
