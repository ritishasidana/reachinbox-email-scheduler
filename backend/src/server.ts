import { env } from './config/env';
import { createApp } from './app';
import { prisma } from './db/prisma';
import { redis } from './db/redis';
import { ensureEmailIndex } from './db/elasticsearch';
import { closeQueues } from './queues';
import { reconcileScheduledEmails } from './services/email.service';
import { closeAllTransporters } from './services/mailer.service';
import { kickSearchSync } from './services/search.service';
import { logger } from './utils/logger';
import { startWorkers } from './workers';

async function main() {
  await prisma.$connect();
  await redis.ping();

  // Elasticsearch is a derived index: the API must still start (and fall back to Postgres search) if it's down.
  await ensureEmailIndex().catch((err) =>
    logger.warn({ err: (err as Error).message }, 'Elasticsearch unavailable at startup; search will fall back to Postgres'),
  );

  const recovered = await reconcileScheduledEmails();
  logger.info({ pending: recovered }, 'Reconciled pending emails with the queue');
  await kickSearchSync('startup');

  const stopWorkers = env.RUN_WORKERS_IN_API ? await startWorkers() : null;

  const server = createApp().listen(env.PORT, () => {
    logger.info(`API listening on ${env.BACKEND_URL} (Bull Board: ${env.BACKEND_URL}/admin/queues)`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down gracefully');
    server.close();
    await stopWorkers?.();
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
  logger.fatal({ err }, 'Failed to start API');
  process.exit(1);
});
