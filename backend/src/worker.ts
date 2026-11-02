/**
 * Standalone worker process. Run one or many (`npm run start:worker`) alongside the API with
 * RUN_WORKERS_IN_API=false to scale sending horizontally; rate limits stay correct because all
 * coordination happens in Redis.
 */
import { env } from './config/env';
import { prisma } from './db/prisma';
import { redis } from './db/redis';
import { closeQueues } from './queues';
import { closeAllTransporters } from './services/mailer.service';
import { logger } from './utils/logger';
import { startWorkers } from './workers';

async function main() {
  await prisma.$connect();
  await redis.ping();
  const stop = await startWorkers();
  logger.info({ concurrency: env.WORKER_CONCURRENCY, pid: process.pid }, 'Worker process ready');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Worker shutting down (waiting for in-flight jobs)');
    await stop();
    await closeQueues();
    closeAllTransporters();
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Worker failed to start');
  process.exit(1);
});
