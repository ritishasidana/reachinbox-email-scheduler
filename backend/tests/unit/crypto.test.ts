import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { decryptWithKey, encryptWithKey, signToken, verifyToken } from '../../src/utils/crypto';
import { bucketStartMs, hourBucketOf, HOUR_MS } from '../../src/utils/time';

const key = crypto.randomBytes(32).toString('hex');

describe('AES-256-GCM secrets', () => {
  it('round-trips and uses a fresh IV each time', () => {
    const a = encryptWithKey(key, 'smtp-password');
    const b = encryptWithKey(key, 'smtp-password');
    expect(a).not.toEqual(b);
    expect(decryptWithKey(key, a)).toBe('smtp-password');
  });

  it('rejects tampered ciphertext', () => {
    const [v, iv, tag, data] = encryptWithKey(key, 'secret').split(':');
    const tampered = [v, iv, tag, Buffer.from('x' + data).toString('base64')].join(':');
    expect(() => decryptWithKey(key, tampered)).toThrow();
  });

  it('rejects a wrong key', () => {
    const other = crypto.randomBytes(32).toString('hex');
    expect(() => decryptWithKey(other, encryptWithKey(key, 'secret'))).toThrow();
  });
});

describe('signed state tokens', () => {
  it('verifies valid tokens', () => {
    const t = signToken('s'.repeat(32), { userId: 'u1' }, 60_000);
    expect(verifyToken<{ userId: string }>('s'.repeat(32), t)?.userId).toBe('u1');
  });
  it('rejects expired, tampered and wrong-secret tokens', () => {
    const secret = 's'.repeat(32);
    const t = signToken(secret, { userId: 'u1' }, 1000, 0);
    expect(verifyToken(secret, t, 5000)).toBeNull();
    const fresh = signToken(secret, { userId: 'u1' }, 60_000);
    expect(verifyToken(secret, fresh.replace(/^./, 'x'))).toBeNull();
    expect(verifyToken('t'.repeat(32), fresh)).toBeNull();
  });
});

describe('hour buckets', () => {
  it('maps timestamps to UTC epoch hours', () => {
    const t = Date.UTC(2026, 10, 3, 10, 59, 59, 999);
    expect(bucketStartMs(hourBucketOf(t))).toBe(Date.UTC(2026, 10, 3, 10));
    expect(hourBucketOf(t + 1)).toBe(hourBucketOf(t) + 1);
    expect(HOUR_MS).toBe(3_600_000);
  });
});
