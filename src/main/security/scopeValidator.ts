import { ScopeRule } from '../database/db';

export class ScopeValidator {
  public static isUrlInScope(urlStr: string, scopes: ScopeRule[]): boolean {
    if (!scopes || scopes.length === 0) return true;

    // Filter enabled rules
    const enabledScopes = scopes.filter((s) => s.enabled);
    if (enabledScopes.length === 0) return true;

    try {
      const parsed = new URL(urlStr);
      const host = parsed.hostname.toLowerCase();

      for (const scope of enabledScopes) {
        const pattern = scope.pattern.trim().toLowerCase();
        if (pattern === '*' || pattern === host) return true;

        if (scope.is_regex) {
          try {
            const regex = new RegExp(scope.pattern, 'i');
            if (regex.test(urlStr) || regex.test(host)) return true;
          } catch (e) {
            // invalid regex, continue
          }
        } else {
          if (pattern.startsWith('*.')) {
            const suffix = pattern.substring(1); // e.g. .example.com
            if (host.endsWith(suffix) || host === pattern.substring(2)) {
              return true;
            }
          }
          if (host.includes(pattern)) {
            return true;
          }
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  public static redactSensitive(headers: Record<string, string>): Record<string, string> {
    const redacted: Record<string, string> = {};
    const sensitiveKeys = ['authorization', 'cookie', 'set-cookie', 'x-api-key', 'token', 'secret'];

    for (const [key, val] of Object.entries(headers)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = val;
      }
    }
    return redacted;
  }
}
