import { Worker } from 'bullmq';
import { createRedisConnection } from '../db/redis';
import { QUEUE_NAMES, type RateLimitAlertJobData } from '../queues';
import { processRateLimitAlert } from '../services/notification.service';
import { logger } from '../utils/logger';

export function createNotificationWorker(): Worker<RateLimitAlertJobData, string> {
  const worker = new Worker<RateLimitAlertJobData, string>(
    QUEUE_NAMES.NOTIFICATION,
    async (job) => {
      const outcome = await processRateLimitAlert(job.data);
      logger.info({ ...job.data, outcome }, 'Rate-limit alert processed');
      return outcome;
    },
    { connection: createRedisConnection('notification-worker'), concurrency: 2 },
  );
  worker.on('error', (err) => logger.error({ err }, 'Notification worker error'));
  return worker;
}
