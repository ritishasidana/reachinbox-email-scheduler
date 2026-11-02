import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { redis } from '../db/redis';
import { notificationQueue, rateLimitAlertJobId, type RateLimitAlertJobData } from '../queues';
import { errorMessage } from '../utils/errors';
import { logger } from '../utils/logger';
import { postSlackMessage, SlackSkipError } from './slack.service';

/**
 * Requests a "sender hit hourly limit" Slack alert. Three layers of de-duplication:
 *  1. Redis SET NX guard  -> cheap fast-path so 1000 deferred jobs don't all call queue.add
 *  2. Stable BullMQ job ID -> at most one alert job per sender+hour while it is retained
 *  3. RateLimitAlert unique(senderId, hourBucket) row -> durable guarantee in the worker
 */
export async function requestRateLimitAlert(data: RateLimitAlertJobData): Promise<void> {
  const guardKey = `alert-guard:{${data.senderId}}:${data.hourBucket}`;
  try {
    const first = await redis.set(guardKey, '1', 'EX', 2 * 3600, 'NX');
    if (first !== 'OK') return;
    await notificationQueue.add('rate-limit', data, { jobId: rateLimitAlertJobId(data.senderId, data.hourBucket) });
  } catch (err) {
    await redis.del(guardKey).catch(() => undefined);
    // Never let notification problems affect email delivery.
    logger.warn({ err: errorMessage(err), ...data }, 'Failed to enqueue rate-limit alert');
  }
}

export async function processRateLimitAlert(data: RateLimitAlertJobData): Promise<string> {
  const sender = await prisma.emailSender.findUnique({ where: { id: data.senderId } });
  if (!sender) return 'sender-missing';

  let alert;
  try {
    alert = await prisma.rateLimitAlert.create({ data: { senderId: data.senderId, hourBucket: data.hourBucket } });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    alert = await prisma.rateLimitAlert.findUniqueOrThrow({
      where: { senderId_hourBucket: { senderId: data.senderId, hourBucket: data.hourBucket } },
    });
    if (alert.status !== 'PENDING' && alert.status !== 'FAILED') return `already-${alert.status.toLowerCase()}`;
  }

  const resumeAt = new Date(data.nextAvailableAt).toISOString();
  const text =
    `:warning: Sender *${sender.email}* reached its hourly limit of ${data.limit ?? sender.hourlyLimit} emails. ` +
    `Remaining emails were rescheduled automatically and will resume at ${resumeAt} (UTC).`;
  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text } },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `ReachInbox scheduler • hour bucket ${data.hourBucket}` }],
    },
  ];

  try {
    const posted = await postSlackMessage(sender.userId, text, blocks);
    await prisma.rateLimitAlert.update({
      where: { id: alert.id },
      data: posted ? { status: 'SENT', sentAt: new Date() } : { status: 'SKIPPED', error: 'Slack not connected' },
    });
    return posted ? 'sent' : 'skipped-not-connected';
  } catch (err) {
    if (err instanceof SlackSkipError) {
      await prisma.rateLimitAlert.update({ where: { id: alert.id }, data: { status: 'SKIPPED', error: err.message } });
      return 'skipped';
    }
    await prisma.rateLimitAlert.update({
      where: { id: alert.id },
      data: { status: 'FAILED', error: errorMessage(err).slice(0, 1000) },
    });
    throw err; // transient: let BullMQ retry with backoff
  }
}
