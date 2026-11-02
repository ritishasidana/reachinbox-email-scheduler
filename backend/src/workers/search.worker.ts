import { Worker } from 'bullmq';
import { createRedisConnection } from '../db/redis';
import { ensureEmailIndex } from '../db/elasticsearch';
import { QUEUE_NAMES, searchQueue, type SearchSyncJobData } from '../queues';
import { drainOutbox, pruneOutbox } from '../services/search.service';
import { logger } from '../utils/logger';

const SWEEP_SCHEDULER_ID = 'search-outbox-sweep';

/**
 * Drains the search outbox into Elasticsearch. A BullMQ job scheduler adds a periodic "sweep" so
 * rows are eventually indexed even if ES was down or a kick job was lost. (This is index
 * maintenance — email sending itself is driven only by per-email delayed jobs.)
 */
export async function createSearchWorker(): Promise<Worker<SearchSyncJobData, number>> {
  await searchQueue.upsertJobScheduler(SWEEP_SCHEDULER_ID, { every: 30_000 }, { name: 'sweep', data: { reason: 'sweep' } });

  let indexReady = false;
  const worker = new Worker<SearchSyncJobData, number>(
    QUEUE_NAMES.SEARCH,
    async (job) => {
      if (!indexReady) {
        await ensureEmailIndex();
        indexReady = true;
      }
      const processed = await drainOutbox();
      if (job.name === 'sweep') await pruneOutbox();
      if (processed > 0) logger.debug({ processed, reason: job.data.reason }, 'Search outbox drained');
      return processed;
    },
    { connection: createRedisConnection('search-worker'), concurrency: 1 },
  );
  worker.on('failed', (job, err) =>
    logger.warn({ err: err.message, attempts: job?.attemptsMade }, 'Search sync failed; will retry'),
  );
  worker.on('error', (err) => logger.error({ err }, 'Search worker error'));
  return worker;
}
