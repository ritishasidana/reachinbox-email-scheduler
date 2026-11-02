import crypto from 'crypto';

/**
 * AES-256-GCM authenticated encryption for secrets at rest (SMTP passwords, Slack tokens).
 * Format: v1:<iv b64>:<auth tag b64>:<ciphertext b64>
 */
export function encryptWithKey(keyHex: string, plaintext: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decryptWithKey(keyHex: string, payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(':');
  if (version !== 'v1' || !ivB64 || !tagB64 || dataB64 === undefined) {
    throw new Error('Unsupported encrypted payload format');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

/**
 * HMAC-signed, expiring state token (used for the Slack OAuth `state` parameter so the callback
 * works even when it arrives on a different host, e.g. an HTTPS tunnel, without the session cookie).
 */
export function signToken<T extends object>(secret: string, payload: T, ttlMs: number, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: now + ttlMs })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken<T extends object>(secret: string, token: string, now = Date.now()): T | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { exp: number };
    if (typeof parsed.exp !== 'number' || parsed.exp < now) return null;
    return parsed;
  } catch {
    return null;
  }
}
