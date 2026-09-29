import http from 'http';
import https from 'https';
import { URL } from 'url';
import { DatabaseManager, LoginProfile, AuthenticationSession } from '../database/db';
import { encryptString, decryptString, decodeJwtClaims, extractValueByPath } from './credentialCrypto';

export interface TestLoginResult {
  success: boolean;
  statusCode: number;
  responseHeaders: Record<string, string>;
  responseBody: any;
  session?: AuthenticationSession;
  error?: string;
}

export interface RefreshSessionResult {
  success: boolean;
  statusCode?: number;
  responseBody?: any;
  session?: AuthenticationSession;
  error?: string;
}

export class AuthTestManager {
  constructor(private db: DatabaseManager) {}

  /**
   * Detects login requests from HTTP POST traffic based on URL patterns, headers, and body parameters
   */
  public detectLoginRequest(req: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body_text?: string;
    content_type?: string;
  }): {
    isLogin: boolean;
    username?: string;
    password?: string;
    format: 'json' | 'form';
    usernameField?: string;
    passwordField?: string;
  } {
    if (req.method.toUpperCase() !== 'POST') {
      return { isLogin: false, format: 'json' };
    }

    const urlLower = req.url.toLowerCase();
    const isLoginUrl = urlLower.includes('/login') ||
                       urlLower.includes('/signin') ||
                       urlLower.includes('/auth') ||
                       urlLower.includes('/authenticate') ||
                       urlLower.includes('/token') ||
                       urlLower.includes('/session');

    const contentType = (req.content_type || req.headers['content-type'] || '').toLowerCase();
    const isForm = contentType.includes('application/x-www-form-urlencoded');
    const isJson = contentType.includes('application/json');

    const bodyText = req.body_text || '';
    if (!bodyText) {
      return { isLogin: Boolean(isLoginUrl), format: isForm ? 'form' : 'json' };
    }

    let parsedBody: Record<string, any> = {};
    let detectedFormat: 'json' | 'form' = isForm ? 'form' : 'json';

    if (isJson || bodyText.trim().startsWith('{')) {
      detectedFormat = 'json';
      try {
        parsedBody = JSON.parse(bodyText);
      } catch {}
    } else if (isForm || bodyText.includes('=')) {
      detectedFormat = 'form';
      try {
        const params = new URLSearchParams(bodyText);
        for (const [k, v] of params.entries()) {
          parsedBody[k] = v;
        }
      } catch {}
    }

    const userKeys = ['username', 'user', 'email', 'login', 'account', 'user_id', 'identifier'];
    const passKeys = ['password', 'pass', 'pwd', 'secret', 'passcode'];

    let foundUserKey: string | undefined;
    let foundPassKey: string | undefined;
    let username: string | undefined;
    let password: string | undefined;

    for (const k of Object.keys(parsedBody)) {
      const lowerKey = k.toLowerCase();
      if (!foundUserKey && userKeys.some(uk => lowerKey === uk || lowerKey.includes(uk))) {
        foundUserKey = k;
        username = String(parsedBody[k]);
      }
      if (!foundPassKey && passKeys.some(pk => lowerKey === pk || lowerKey.includes(pk))) {
        foundPassKey = k;
        password = String(parsedBody[k]);
      }
    }

    const hasCreds = Boolean(foundUserKey && foundPassKey);
    const isLogin = isLoginUrl || hasCreds;

    return {
      isLogin,
      username,
      password,
      format: detectedFormat,
      usernameField: foundUserKey || 'username',
      passwordField: foundPassKey || 'password'
    };
  }

  /**
   * Executes a real authentication login test against the authorized application endpoint
   */
  public async testLogin(profileId: string, overridePassword?: string): Promise<TestLoginResult> {
    const profile = await this.db.getLoginProfileById(profileId);
    if (!profile) {
      throw new Error(`Login profile not found with ID: ${profileId}`);
    }

    // Resolve password safely
    let passwordToUse = overridePassword;
    if (!passwordToUse && profile.credential_storage_enabled && profile.encrypted_credential_reference) {
      try {
        passwordToUse = decryptString(profile.encrypted_credential_reference);
      } catch (err: any) {
        return {
          success: false,
          statusCode: 0,
          responseHeaders: {},
          responseBody: null,
          error: `Failed to decrypt stored credential reference: ${err.message}`
        };
      }
    }

    if (!passwordToUse) {
      return {
        success: false,
        statusCode: 0,
        responseHeaders: {},
        responseBody: null,
        error: 'No password configured or saved for this profile. Provide password or enable secure credential storage.'
      };
    }

    // Assemble payload
    let reqBody = '';
    const headers: Record<string, string> = {
      'User-Agent': 'NetScope-Security-Browser/1.0 (Testing Engine)'
    };

    const extraFields = profile.extra_fields || {};
    const payloadObj: Record<string, any> = {
      [profile.username_field]: profile.username,
      [profile.password_field]: passwordToUse,
      ...extraFields
    };

    if (profile.payload_format === 'form') {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(payloadObj)) {
        params.append(k, String(v));
      }
      reqBody = params.toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else {
      reqBody = JSON.stringify(payloadObj);
      headers['Content-Type'] = 'application/json';
    }
    headers['Content-Length'] = String(Buffer.byteLength(reqBody, 'utf-8'));

    // Perform real HTTP request to test application endpoint
    const httpRes = await this.makeHttpRequest({
      url: profile.login_endpoint,
      method: profile.http_method || 'POST',
      headers,
      body: reqBody
    });

    const isHttpSuccess = httpRes.statusCode >= 200 && httpRes.statusCode < 300;
    let parsedBody: any = httpRes.bodyText;
    try {
      parsedBody = JSON.parse(httpRes.bodyText);
    } catch {}

    // Check for logical application error even with 200 (e.g. { success: false })
    const isLogicalSuccess = isHttpSuccess && !(parsedBody && typeof parsedBody === 'object' && parsedBody.success === false);

    if (!isLogicalSuccess) {
      return {
        success: false,
        statusCode: httpRes.statusCode,
        responseHeaders: httpRes.headers,
        responseBody: parsedBody,
        error: (parsedBody && typeof parsedBody === 'object' && (parsedBody.message || parsedBody.error)) ||
               `Authentication failed with status ${httpRes.statusCode}`
      };
    }

    // Extract real access token
    const tokenField = profile.response_token_field || 'accessToken';
    const accessToken = extractValueByPath(parsedBody, tokenField, [
      'token', 'access_token', 'accessToken', 'jwt', 'data.token', 'data.accessToken', 'data.access_token'
    ]);

    if (!accessToken || typeof accessToken !== 'string') {
      return {
        success: true,
        statusCode: httpRes.statusCode,
        responseHeaders: httpRes.headers,
        responseBody: parsedBody,
        error: `Login HTTP 200 succeeded, but no access token found at field '${tokenField}'.`
      };
    }

    // Extract optional refresh token and user id
    const refreshField = profile.response_refresh_field || 'refreshToken';
    const refreshToken = extractValueByPath(parsedBody, refreshField, [
      'refreshToken', 'refresh_token', 'data.refreshToken', 'data.refresh_token'
    ]);

    const userField = profile.response_user_field || 'user.id';
    const userId = extractValueByPath(parsedBody, userField, [
      'user.id', 'user.email', 'user.username', 'userId', 'user_id', 'id'
    ]);

    // Inspect token format (JWT claims decoding without unverified trust)
    const jwtInfo = decodeJwtClaims(accessToken);

    // Encrypt sensitive tokens before saving into SQLite
    const encryptedAccessToken = encryptString(accessToken);
    const encryptedRefreshToken = refreshToken ? encryptString(String(refreshToken)) : undefined;

    // Create authenticated session record
    const session = await this.db.saveAuthSession({
      profile_id: profile.id,
      application_name: profile.application_name,
      login_endpoint: profile.login_endpoint,
      browser_session_id: 'browser_active_session',
      user_id: userId ? String(userId) : profile.username,
      username: profile.username,
      encrypted_access_token: encryptedAccessToken,
      encrypted_refresh_token: encryptedRefreshToken,
      token_type: 'Bearer',
      is_jwt: jwtInfo.isJwt ? 1 : 0,
      jwt_claims: jwtInfo.claims || {},
      status: 'active',
      expires_at: jwtInfo.expiresAt || (Date.now() + 3600 * 1000)
    });

    // Update profile last login
    await this.db.saveLoginProfile({
      ...profile,
      last_login_at: Date.now()
    });

    return {
      success: true,
      statusCode: httpRes.statusCode,
      responseHeaders: httpRes.headers,
      responseBody: parsedBody,
      session
    };
  }

  /**
   * Refreshes an active session token using the application's actual refresh endpoint
   */
  public async refreshSession(sessionId: string): Promise<RefreshSessionResult> {
    const session = await this.db.getAuthSessionById(sessionId);
    if (!session) {
      throw new Error(`Authentication session not found: ${sessionId}`);
    }

    if (!session.encrypted_refresh_token) {
      return {
        success: false,
        error: 'This session does not have a refresh token.'
      };
    }

    let profile: LoginProfile | null = null;
    if (session.profile_id) {
      profile = await this.db.getLoginProfileById(session.profile_id);
    }

    // Determine refresh endpoint
    let refreshUrl = profile?.refresh_endpoint;
    if (!refreshUrl) {
      try {
        const parsedLogin = new URL(session.login_endpoint);
        refreshUrl = `${parsedLogin.origin}/api/token/refresh`;
      } catch {
        return {
          success: false,
          error: 'No refresh endpoint configured for this session.'
        };
      }
    }

    let plainRefreshToken = '';
    try {
      plainRefreshToken = decryptString(session.encrypted_refresh_token);
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to decrypt refresh token: ${e.message}`
      };
    }

    const payload = JSON.stringify({
      refreshToken: plainRefreshToken,
      refresh_token: plainRefreshToken
    });

    const httpRes = await this.makeHttpRequest({
      url: refreshUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(payload, 'utf-8')),
        'User-Agent': 'NetScope-Security-Browser/1.0 (Testing Engine)'
      },
      body: payload
    });

    let parsedBody: any = httpRes.bodyText;
    try {
      parsedBody = JSON.parse(httpRes.bodyText);
    } catch {}

    const isSuccess = httpRes.statusCode >= 200 && httpRes.statusCode < 300 && !(parsedBody && parsedBody.success === false);

    if (!isSuccess) {
      // Mark session as expired if refresh rejected by origin
      await this.db.saveAuthSession({
        ...session,
        status: 'expired'
      });

      return {
        success: false,
        statusCode: httpRes.statusCode,
        responseBody: parsedBody,
        error: (parsedBody && (parsedBody.message || parsedBody.error)) || 'Refresh token rejected or expired. Please re-login.'
      };
    }

    const tokenField = profile?.response_token_field || 'accessToken';
    const newAccessToken = extractValueByPath(parsedBody, tokenField, [
      'token', 'access_token', 'accessToken', 'data.token', 'data.accessToken'
    ]);

    if (!newAccessToken || typeof newAccessToken !== 'string') {
      return {
        success: false,
        statusCode: httpRes.statusCode,
        responseBody: parsedBody,
        error: 'Refresh endpoint returned 200, but no new access token was present in response.'
      };
    }

    // Optional rotated refresh token
    const newRefreshToken = extractValueByPath(parsedBody, profile?.response_refresh_field || 'refreshToken', [
      'refreshToken', 'refresh_token', 'data.refreshToken'
    ]);

    const jwtInfo = decodeJwtClaims(newAccessToken);
    const updatedEncryptedToken = encryptString(newAccessToken);
    const updatedEncryptedRefresh = newRefreshToken ? encryptString(String(newRefreshToken)) : session.encrypted_refresh_token;

    const updatedSession = await this.db.saveAuthSession({
      ...session,
      encrypted_access_token: updatedEncryptedToken,
      encrypted_refresh_token: updatedEncryptedRefresh,
      is_jwt: jwtInfo.isJwt ? 1 : 0,
      jwt_claims: jwtInfo.claims || session.jwt_claims,
      expires_at: jwtInfo.expiresAt || (parsedBody.expiresIn ? Date.now() + parsedBody.expiresIn * 1000 : Date.now() + 3600 * 1000),
      status: 'active',
      last_activity_at: Date.now()
    });

    return {
      success: true,
      statusCode: httpRes.statusCode,
      responseBody: parsedBody,
      session: updatedSession
    };
  }

  /**
   * Helper to execute HTTP/HTTPS requests cleanly with error handling
   */
  private makeHttpRequest(options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  }): Promise<{ statusCode: number; headers: Record<string, string>; bodyText: string }> {
    return new Promise((resolve, reject) => {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(options.url);
      } catch (err) {
        return reject(new Error(`Invalid URL: ${options.url}`));
      }

      const isHttps = parsedUrl.protocol === 'https:';
      const transport = isHttps ? https : http;

      const reqOptions: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method,
        headers: options.headers,
        timeout: 10000
      };

      if (isHttps) {
        (reqOptions as https.RequestOptions).rejectUnauthorized = false; // Testing environment allowance
      }

      const req = transport.request(reqOptions, (res) => {
        let bodyText = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => {
          bodyText += chunk;
        });
        res.on('end', () => {
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (v !== undefined) {
              headers[k] = Array.isArray(v) ? v.join(', ') : v;
            }
          }
          resolve({
            statusCode: res.statusCode || 200,
            headers,
            bodyText
          });
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Authentication request timed out after 10 seconds'));
      });

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }
}
