import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

// Authenticated Encryption for Credentials & Tokens (AES-256-GCM)
// Encryption key is strictly kept outside the database and source code.

let cachedKey: Buffer | null = null;

export function getMasterKey(): Buffer {
  if (cachedKey) return cachedKey;

  // 1. Check environment variable first
  const envKey = process.env.NETSCOPE_MASTER_KEY;
  if (envKey) {
    if (envKey.length === 64) {
      cachedKey = Buffer.from(envKey, 'hex');
      return cachedKey;
    }
    // Derive 256-bit key from passphrase using SHA-256
    cachedKey = crypto.createHash('sha256').update(envKey).digest();
    return cachedKey;
  }

  // 2. Load or generate secure key file in user application data directory
  const keyDir = app ? app.getPath('userData') : path.resolve(process.cwd(), '.netscope_keystore');
  if (!fs.existsSync(keyDir)) {
    try {
      fs.mkdirSync(keyDir, { recursive: true });
    } catch {}
  }

  const keyFilePath = path.join(keyDir, '.netscope_key');
  if (fs.existsSync(keyFilePath)) {
    try {
      const hex = fs.readFileSync(keyFilePath, 'utf-8').trim();
      if (hex.length === 64) {
        cachedKey = Buffer.from(hex, 'hex');
        return cachedKey;
      }
    } catch (e) {
      console.warn('[Crypto] Error reading key file, regenerating:', e);
    }
  }

  // Generate a cryptographically secure 256-bit key
  const newKey = crypto.randomBytes(32);
  try {
    fs.writeFileSync(keyFilePath, newKey.toString('hex'), { mode: 0o600 });
  } catch (e) {
    console.warn('[Crypto] Warning saving key file:', e);
  }
  cachedKey = newKey;
  return cachedKey;
}

export function encryptString(plaintext: string): string {
  if (!plaintext) return '';
  const key = getMasterKey();
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for AES-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 128-bit authentication tag

  // Format: iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptString(ciphertextPayload: string): string {
  if (!ciphertextPayload) return '';
  const parts = ciphertextPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted ciphertext format (expected iv:authTag:ciphertext)');
  }

  const key = getMasterKey();
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = Buffer.from(parts[2], 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf-8');
}

// Mask sensitive values in UI and logs
export function maskSecret(secret: string): string {
  if (!secret) return '';
  if (secret.length <= 8) return '••••••••';
  if (secret.length <= 16) return secret.slice(0, 2) + '••••••••' + secret.slice(-2);
  return secret.slice(0, 4) + '••••••••' + secret.slice(-4);
}

// Decode JWT token for display without treating claims as cryptographically verified
export function decodeJwtClaims(token: string): {
  isJwt: boolean;
  header?: any;
  claims?: any;
  expiresAt?: number;
} {
  if (!token || typeof token !== 'string') return { isJwt: false };

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return { isJwt: false };
  }

  try {
    const headerJson = Buffer.from(parts[0], 'base64url').toString('utf-8');
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf-8');

    const header = JSON.parse(headerJson);
    const claims = JSON.parse(payloadJson);

    let expiresAt: number | undefined;
    if (claims.exp) {
      // JWT exp is standard UNIX timestamp in seconds
      expiresAt = claims.exp * 1000;
    }

    return {
      isJwt: true,
      header,
      claims,
      expiresAt
    };
  } catch {
    return { isJwt: false };
  }
}

// Extract nested values from JSON response using dot paths or fallback keys
export function extractValueByPath(obj: any, pathStr: string, fallbacks: string[] = []): any {
  if (!obj || typeof obj !== 'object') return undefined;

  // Try configured path first
  if (pathStr) {
    const parts = pathStr.split('.');
    let curr = obj;
    let found = true;
    for (const part of parts) {
      if (curr && typeof curr === 'object' && part in curr) {
        curr = curr[part];
      } else {
        found = false;
        break;
      }
    }
    if (found && curr !== undefined) return curr;
  }

  // Try fallbacks
  for (const fb of fallbacks) {
    const parts = fb.split('.');
    let curr = obj;
    let found = true;
    for (const part of parts) {
      if (curr && typeof curr === 'object' && part in curr) {
        curr = curr[part];
      } else {
        found = false;
        break;
      }
    }
    if (found && curr !== undefined) return curr;
  }

  return undefined;
}
