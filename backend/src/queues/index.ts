import { Queue } from 'bullmq';
import { env } from '../config/env';
import { createRedisConnection } from '../db/redis';

export const QUEUE_NAMES = {
  EMAIL: 'email-send',
  NOTIFICATION: 'notifications',
  SEARCH: 'search-sync',
} as const;

export interface EmailJobData {
  emailId: string;
}

export interface RateLimitAlertJobData {
  senderId: string;
  hourBucket: number;
  /** Epoch ms when the sender's next slot opens. */
  nextAvailableAt: number;
  /** Effective hourly limit that was hit (sender, global or campaign cap, whichever is lowest). */
  limit?: number;
}

export interface SearchSyncJobData {
  reason: string;
}

/**
 * Stable job IDs: one email row <-> one job. Re-adding the same ID is a no-op in BullMQ, which
 * makes enqueueing idempotent (safe on retries of the API request and on startup reconciliation).
 * (Custom IDs avoid ':' which BullMQ uses as a key separator.)
 */
export const emailJobId = (emailId: string): string => `email-${emailId}`;
export const rateLimitAlertJobId = (senderId: string, hourBucket: number): string =>
  `ratelimit-${senderId}-${hourBucket}`;

const queueConnection = createRedisConnection('queues');

export const emailQueue = new Queue<EmailJobData>(QUEUE_NAMES.EMAIL, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: env.EMAIL_JOB_ATTEMPTS,
    backoff: { type: 'exponential', delay: env.EMAIL_JOB_BACKOFF_MS },
    // Keep history for Bull Board; the database (not job retention) is what prevents re-sends.
    removeOnComplete: { age: 7 * 24 * 3600, count: 50_000 },
    removeOnFail: { age: 30 * 24 * 3600 },
  },
});

export const notificationQueue = new Queue<RateLimitAlertJobData>(QUEUE_NAMES.NOTIFICATION, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { age: 24 * 3600 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

export const searchQueue = new Queue<SearchSyncJobData>(QUEUE_NAMES.SEARCH, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 8,
    backoff: { type: 'exponential', delay: 2_000 },
    removeOnComplete: true,
    removeOnFail: { age: 24 * 3600 },
  },
});

export const allQueues = [emailQueue, notificationQueue, searchQueue];

export async function closeQueues(): Promise<void> {
  await Promise.all(allQueues.map((q) => q.close()));
  await queueConnection.quit().catch(() => undefined);
}
