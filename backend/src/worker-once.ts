/**
 * One-shot worker for schedulers that cannot keep a process running (e.g. a GitHub Actions cron).
 *
 *  1. Cheap check (a few Redis commands, no database): is any email / Slack-notification job waiting,
 *     active (e.g. left by a crashed run) or delayed until within WORKER_ONCE_LOOKAHEAD_MS?
 *     If not, exit immediately.
 *  2. Otherwise start the normal workers (search sync only if Elasticsearch answers), keep processing
 *     while work is due, and exit after two consecutive idle checks or WORKER_ONCE_MAX_MS.
 *     close() lets in-flight jobs finish before the process exits.
 *
 * Overlapping runs are safe: BullMQ locks give each job to a single processor, the DB claim only moves
 * SCHEDULED/SENDING rows, and rate-limit/spacing reservations in Redis are atomic and idempotent.
 */
import type { Queue, Worker } from 'bullmq';
import { env } from './config/env';
import { es } from './db/elasticsearch';
import { prisma } from './db/prisma';
import { redis } from './db/redis';
import { closeQueues, emailQueue, notificationQueue } from './queues';
import { closeAllTransporters } from './services/mailer.service';
import { logger } from './utils/logger';
import { createEmailWorker } from './workers/email.worker';
import { createNotificationWorker } from './workers/notification.worker';
import { createSearchWorker } from './workers/search.worker';

const POLL_MS = 3_000;
const IDLE_CHECKS_TO_EXIT = 2;
/** BullMQ v5 stores delayed jobs in a ZSET scored `timestampMs * 0x1000 + counter`. */
const DELAYED_SCORE_FACTOR = 0x1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function dueWork(queue: Queue, lookaheadMs: number): Promise<string | null> {
  const counts = await queue.getJobCounts('waiting', 'active', 'prioritized');
  const ready = (counts.waiting ?? 0) + (counts.prioritized ?? 0);
  if (ready > 0) return `${queue.name}: ${ready} waiting`;
  if ((counts.active ?? 0) > 0) return `${queue.name}: ${counts.active} active`;
  const maxScore = (Date.now() + lookaheadMs) * DELAYED_SCORE_FACTOR + (DELAYED_SCORE_FACTOR - 1);
  const next = await redis.zrangebyscore(queue.toKey('delayed'), '-inf', maxScore, 'LIMIT', 0, 1);
  return next.length > 0 ? `${queue.name}: delayed job due within ${Math.round(lookaheadMs / 1000)}s` : null;
}

async function findDueWork(lookaheadMs: number): Promise<string | null> {
  for (const queue of [emailQueue, notificationQueue] as Queue[]) {
    const reason = await dueWork(queue, lookaheadMs);
    if (reason) return reason;
  }
  return null;
}

async function elasticsearchAvailable(): Promise<boolean> {
  try {
    return await es.ping({}, { requestTimeout: 2_000, maxRetries: 0 });
  } catch {
    return false;
  }
}

async function main(): Promise<number> {
  const startedAt = Date.now();
  await redis.ping();

  const initial = await findDueWork(env.WORKER_ONCE_LOOKAHEAD_MS);
  if (!initial) {
    logger.info('worker-once: nothing due; exiting');
    return 0;
  }
  logger.info({ reason: initial, concurrency: env.WORKER_CONCURRENCY }, 'worker-once: work due; starting workers');

  await prisma.$connect();
  const workers: Worker[] = [createEmailWorker(), createNotificationWorker()];
  if (await elasticsearchAvailable()) workers.push(await createSearchWorker());
  else logger.info('worker-once: Elasticsearch not reachable; search sync skipped (search falls back to Postgres)');

  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  let idleChecks = 0;
  while (!stopping && Date.now() - startedAt < env.WORKER_ONCE_MAX_MS) {
    await sleep(POLL_MS);
    const reason = await findDueWork(env.WORKER_ONCE_LOOKAHEAD_MS);
    idleChecks = reason ? 0 : idleChecks + 1;
    if (idleChecks >= IDLE_CHECKS_TO_EXIT) break;
  }

  const why = stopping ? 'signal' : idleChecks >= IDLE_CHECKS_TO_EXIT ? 'idle' : 'max runtime reached';
  logger.info({ why, ranForMs: Date.now() - startedAt }, 'worker-once: stopping (waiting for in-flight jobs)');
  await Promise.all(workers.map((w) => w.close()));
  return 0;
}

main()
  .catch((err) => {
    logger.fatal({ err }, 'worker-once failed');
    return 1;
  })
  .then(async (code) => {
    await closeQueues().catch(() => undefined);
    closeAllTransporters();
    await prisma.$disconnect().catch(() => undefined);
    redis.disconnect();
    process.exit(code);
  });
