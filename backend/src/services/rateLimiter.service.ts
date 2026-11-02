import type IORedis from 'ioredis';
import { HOUR_MS } from '../utils/time';

/**
 * Distributed, per-sender rate limiting implemented as atomic Redis Lua scripts.
 *
 * Why Lua: the "read counter -> compare -> increment -> record reservation" sequence must be atomic
 * across every worker process and API instance. Redis executes a script as a single isolated unit,
 * so two workers can never both take the last slot of an hour. Both scripts read the clock from
 * Redis (`TIME`) so all instances agree on "now" and on hour boundaries regardless of local clock skew.
 *
 * All keys of one sender share the `{senderId}` hash tag so the scripts remain Redis Cluster safe.
 */

/**
 * Hourly slot reservation.
 * KEYS[1]  reservation key for this email  (rl:{sender}:res:{email})
 * ARGV[1]  counter key prefix               (rl:{sender}:cnt:)  -> full key = prefix .. hourBucket
 * ARGV[2]  hourly limit
 * ARGV[3]  look-ahead hours
 * ARGV[4]  key TTL seconds
 * Returns  { reservedBucket | -1, currentBucket, isNewReservation(0/1) }
 */
const RESERVE_HOURLY_LUA = `
local t = redis.call('TIME')
local nowMs = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local current = math.floor(nowMs / ${HOUR_MS})

local existing = redis.call('GET', KEYS[1])
if existing then
  local b = tonumber(existing)
  -- Idempotent: a retried/redelivered job keeps the slot it already holds.
  if b >= current then
    return { b, current, 0 }
  end
  -- Reservation is for an hour that has already passed (job was delayed beyond it). That slot was
  -- consumed conservatively; fall through and reserve a slot in the hour we actually send in.
end

local limit = tonumber(ARGV[2])
local lookahead = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
for b = current, current + lookahead - 1 do
  local key = ARGV[1] .. b
  local used = tonumber(redis.call('GET', key) or '0')
  if used < limit then
    redis.call('INCR', key)
    redis.call('EXPIRE', key, ttl)
    redis.call('SET', KEYS[1], b, 'EX', ttl)
    return { b, current, 1 }
  end
end
return { -1, current, 0 }
`;

/**
 * Minimum spacing between two sends of the same sender.
 * KEYS[1]  last assigned slot for the sender   (sp:{sender}:last)
 * KEYS[2]  slot reservation for this email     (sp:{sender}:res:{email})
 * ARGV[1]  minimum delay in ms
 * Returns  { slotEpochMs, nowEpochMs }
 */
const RESERVE_SEND_SLOT_LUA = `
local t = redis.call('TIME')
local nowMs = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

local existing = redis.call('GET', KEYS[2])
if existing then
  return { tonumber(existing), nowMs }
end

local delay = tonumber(ARGV[1])
local last = tonumber(redis.call('GET', KEYS[1]) or '0')
local slot = nowMs
if last + delay > slot then
  slot = last + delay
end
local ttl = (slot - nowMs) + delay + 3600000
redis.call('SET', KEYS[1], slot, 'PX', ttl)
redis.call('SET', KEYS[2], slot, 'PX', ttl)
return { slot, nowMs }
`;

interface RateLimitCommands {
  reserveHourlySlot(
    reservationKey: string,
    counterPrefix: string,
    limit: number,
    lookahead: number,
    ttlSeconds: number,
  ): Promise<[number, number, number]>;
  reserveSendSlot(lastKey: string, reservationKey: string, delayMs: number): Promise<[number, number]>;
}

export interface HourlyReservation {
  /** Hour bucket in which the email may be sent, or -1 if no capacity within the look-ahead window. */
  bucket: number;
  currentBucket: number;
  isNew: boolean;
}

export interface SendSlot {
  slotMs: number;
  nowMs: number;
}

const keys = {
  hourlyReservation: (senderId: string, emailId: string) => `rl:{${senderId}}:res:${emailId}`,
  hourlyCounterPrefix: (senderId: string) => `rl:{${senderId}}:cnt:`,
  lastSlot: (senderId: string) => `sp:{${senderId}}:last`,
  slotReservation: (senderId: string, emailId: string) => `sp:{${senderId}}:res:${emailId}`,
};

export class RateLimiter {
  private readonly client: IORedis & RateLimitCommands;

  constructor(
    client: IORedis,
    private readonly lookaheadHours: number,
  ) {
    client.defineCommand('reserveHourlySlot', { numberOfKeys: 1, lua: RESERVE_HOURLY_LUA });
    client.defineCommand('reserveSendSlot', { numberOfKeys: 2, lua: RESERVE_SEND_SLOT_LUA });
    this.client = client as IORedis & RateLimitCommands;
  }

  /** Reserves (idempotently) one unit of the sender's hourly quota for this email. */
  async reserveHourlySlot(senderId: string, emailId: string, limit: number): Promise<HourlyReservation> {
    const ttlSeconds = (this.lookaheadHours + 2) * 3600;
    const [bucket, currentBucket, isNew] = await this.client.reserveHourlySlot(
      keys.hourlyReservation(senderId, emailId),
      keys.hourlyCounterPrefix(senderId),
      limit,
      this.lookaheadHours,
      ttlSeconds,
    );
    return { bucket: Number(bucket), currentBucket: Number(currentBucket), isNew: Number(isNew) === 1 };
  }

  /** Reserves (idempotently) the earliest send time that respects the sender's minimum spacing. */
  async reserveSendSlot(senderId: string, emailId: string, delayMs: number): Promise<SendSlot> {
    const [slotMs, nowMs] = await this.client.reserveSendSlot(
      keys.lastSlot(senderId),
      keys.slotReservation(senderId, emailId),
      delayMs,
    );
    return { slotMs: Number(slotMs), nowMs: Number(nowMs) };
  }

  /** Drops the spacing reservation so a retry after an SMTP failure gets a fresh, correctly spaced slot. */
  async releaseSendSlot(senderId: string, emailId: string): Promise<void> {
    await this.client.del(keys.slotReservation(senderId, emailId));
  }

  /** Current hour usage for a sender (observability / API). */
  async currentHourUsage(senderId: string, nowMs = Date.now()): Promise<number> {
    const bucket = Math.floor(nowMs / HOUR_MS);
    const value = await this.client.get(`${keys.hourlyCounterPrefix(senderId)}${bucket}`);
    return Number(value ?? 0);
  }
}
