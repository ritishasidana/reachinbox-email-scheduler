import IORedis, { type RedisOptions } from 'ioredis';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Creates a dedicated Redis connection. BullMQ workers use blocking commands, so each
 * queue/worker gets its own connection. `maxRetriesPerRequest: null` is required by BullMQ.
 */
export function createRedisConnection(name: string, options: RedisOptions = {}): IORedis {
  const client = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectionName: `reachinbox:${name}`,
    ...options,
  });
  client.on('error', (err) => logger.error({ err, connection: name }, 'Redis connection error'));
  return client;
}

/** Shared general-purpose client (sessions, rate-limit scripts, de-dup keys). */
export const redis = createRedisConnection('app');
