/**
 * Runs the real Lua scripts against Redis (docker compose up redis).
 *   npm run test:integration
 */
import crypto from 'crypto';
import IORedis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RateLimiter } from '../../src/services/rateLimiter.service';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
let client: IORedis;
let limiter: RateLimiter;

beforeAll(async () => {
  client = new IORedis(redisUrl, { maxRetriesPerRequest: 1 });
  await client.ping();
  limiter = new RateLimiter(client, 24);
});

afterAll(async () => {
  await client.quit();
});

const newSender = () => `test-${crypto.randomUUID()}`;

describe('hourly reservation (Lua)', () => {
  it('fills the current hour up to the limit, then rolls over to the next hour in order', async () => {
    const sender = newSender();
    const results = [];
    for (let i = 0; i < 5; i += 1) results.push(await limiter.reserveHourlySlot(sender, `e${i}`, 3));
    const current = results[0]!.currentBucket;
    expect(results.map((r) => r.bucket)).toEqual([current, current, current, current + 1, current + 1]);
  });

  it('is idempotent per email (retries never double-reserve)', async () => {
    const sender = newSender();
    const first = await limiter.reserveHourlySlot(sender, 'same', 1);
    const again = await limiter.reserveHourlySlot(sender, 'same', 1);
    expect(again.bucket).toBe(first.bucket);
    expect(again.isNew).toBe(false);
    expect(await limiter.currentHourUsage(sender)).toBe(1);
  });

  it('is atomic under concurrency (never over-allocates)', async () => {
    const sender = newSender();
    const limit = 10;
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => limiter.reserveHourlySlot(sender, `c${i}`, limit)),
    );
    const current = results[0]!.currentBucket;
    const perBucket = new Map<number, number>();
    for (const r of results) perBucket.set(r.bucket, (perBucket.get(r.bucket) ?? 0) + 1);
    expect(perBucket.get(current)).toBe(limit);
    for (const count of perBucket.values()) expect(count).toBeLessThanOrEqual(limit);
    expect(perBucket.size).toBe(5);
  });

  it('isolates senders', async () => {
    const a = newSender();
    const b = newSender();
    await limiter.reserveHourlySlot(a, 'x', 1);
    const rb = await limiter.reserveHourlySlot(b, 'y', 1);
    expect(rb.bucket).toBe(rb.currentBucket);
  });
});

describe('send spacing (Lua)', () => {
  it('spaces consecutive sends by at least the minimum delay', async () => {
    const sender = newSender();
    const slots = await Promise.all(
      Array.from({ length: 5 }, (_, i) => limiter.reserveSendSlot(sender, `s${i}`, 1000)),
    );
    const sorted = slots.map((s) => s.slotMs).sort((x, y) => x - y);
    for (let i = 1; i < sorted.length; i += 1) expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(1000);
  });

  it('returns the same slot for the same email until released', async () => {
    const sender = newSender();
    const a = await limiter.reserveSendSlot(sender, 'm', 500);
    const b = await limiter.reserveSendSlot(sender, 'm', 500);
    expect(b.slotMs).toBe(a.slotMs);
    await limiter.releaseSendSlot(sender, 'm');
    const c = await limiter.reserveSendSlot(sender, 'm', 500);
    expect(c.slotMs).toBeGreaterThanOrEqual(a.slotMs + 500);
  });
});
