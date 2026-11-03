import { DelayedError, UnrecoverableError, Worker, type Job } from 'bullmq';
import path from 'path';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { createRedisConnection } from '../db/redis';
import { QUEUE_NAMES, type EmailJobData } from '../queues';
import { isPermanentSmtpError, sendViaSender } from '../services/mailer.service';
import { requestRateLimitAlert } from '../services/notification.service';
import { rateLimiter } from '../services/rateLimiterInstance';
import { kickSearchSync } from '../services/search.service';
import { errorMessage } from '../utils/errors';
import { logger } from '../utils/logger';
import { bucketStartMs, HOUR_MS } from '../utils/time';

/** Waits up to this long in-process for a spacing slot; longer waits go back to the delayed set. */
const INLINE_WAIT_MAX_MS = 1_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type EmailJobResult =
  | { outcome: 'sent'; messageId: string; previewUrl: string | null }
  | { outcome: 'skipped'; reason: string };

/**
 * Email job lifecycle (one job per Email row, job ID = email-<emailId>):
 *
 *  1. Load row. Anything not SCHEDULED/SENDING (sent, failed, cancelled) is skipped -> no re-send.
 *  2. Reserve an hourly slot for the sender (atomic Lua). If the current hour is full, the job is
 *     moved back to the delayed set for the start of the reserved hour (NOT failed), and a Slack
 *     alert is requested once per sender+hour.
 *  3. Reserve a spacing slot (atomic Lua). If it's in the future, the job is delayed until then
 *     instead of sleeping, so a worker slot is never blocked waiting.
 *  4. Claim the row: SCHEDULED|SENDING -> SENDING via a conditional UPDATE.
 *  5. Send via SMTP. Success -> SENT (+ outbox row) in one transaction.
 *     Failure -> back to SCHEDULED (retry with exponential backoff) or FAILED (permanent/exhausted).
 */
export async function processEmailJob(job: Job<EmailJobData>, token?: string): Promise<EmailJobResult> {
  const { emailId } = job.data;
  const email = await prisma.email.findUnique({
    where: { id: emailId },
    include: { sender: true, campaign: { include: { attachments: true } } },
  });

  if (!email) return { outcome: 'skipped', reason: 'email-not-found' };
  if (email.status !== 'SCHEDULED' && email.status !== 'SENDING') {
    return { outcome: 'skipped', reason: `status-${email.status.toLowerCase()}` };
  }
  if (!email.sender.isActive) {
    await markFailed(emailId, 'Sender is disabled');
    throw new UnrecoverableError('Sender is disabled');
  }

  const { sender, campaign } = email;
  const hourlyLimit = Math.min(
    sender.hourlyLimit,
    env.MAX_EMAILS_PER_HOUR_PER_SENDER,
    campaign.hourlyLimit && campaign.hourlyLimit > 0 ? campaign.hourlyLimit : Number.MAX_SAFE_INTEGER,
  );
  const minDelayMs = Math.max(sender.minDelayMs, env.MIN_EMAIL_DELAY_MS, campaign.delayMs ?? 0);

  // --- 2. Hourly limit -------------------------------------------------------------------------
  const hourly = await rateLimiter.reserveHourlySlot(sender.id, emailId, hourlyLimit);
  if (hourly.bucket === -1 || hourly.bucket > hourly.currentBucket) {
    const resumeAt =
      hourly.bucket === -1
        ? bucketStartMs(hourly.currentBucket) + env.RATE_LIMIT_LOOKAHEAD_HOURS * HOUR_MS
        : bucketStartMs(hourly.bucket);

    await requestRateLimitAlert({
      senderId: sender.id,
      hourBucket: hourly.currentBucket,
      nextAvailableAt: resumeAt,
      limit: hourlyLimit,
    });
    if (!email.deferredUntil || email.deferredUntil.getTime() !== resumeAt) {
      await prisma.$transaction([
        prisma.email.updateMany({
          where: { id: emailId, status: { in: ['SCHEDULED', 'SENDING'] } },
          data: { deferredUntil: new Date(resumeAt), status: 'SCHEDULED' },
        }),
        prisma.searchOutbox.create({ data: { emailId } }),
      ]);
    }
    logger.info({ emailId, senderId: sender.id, resumeAt: new Date(resumeAt).toISOString() }, 'Hourly limit reached; deferred');
    await job.moveToDelayed(resumeAt, token);
    throw new DelayedError();
  }

  // --- 3. Minimum spacing between sends -------------------------------------------------------
  const slot = await rateLimiter.reserveSendSlot(sender.id, emailId, minDelayMs);
  const wait = slot.slotMs - slot.nowMs;
  if (wait > INLINE_WAIT_MAX_MS) {
    // Long wait: release the worker slot and come back exactly at our reserved time.
    await job.moveToDelayed(slot.slotMs, token);
    throw new DelayedError();
  }
  // Short wait (incl. delayed-job promotion jitter): never start before the reserved slot.
  if (wait > 0) await sleep(wait);

  // Attachments come from Postgres (content) or, for older uploads, from the local disk (storagePath).
  const missing = campaign.attachments.find((a) => !a.content && !a.storagePath);
  if (missing) {
    await rateLimiter.releaseSendSlot(sender.id, emailId).catch(() => undefined);
    const reason = `Attachment ${missing.filename} has no stored content`;
    await markFailed(emailId, reason);
    throw new UnrecoverableError(reason);
  }
  const attachments = campaign.attachments.map((a) =>
    a.content
      ? { filename: a.filename, contentType: a.mimeType, content: Buffer.from(a.content) }
      : { filename: a.filename, contentType: a.mimeType, path: path.resolve(a.storagePath!) },
  );

  // --- 4. Claim ---------------------------------------------------------------------------------
  // BullMQ's job lock guarantees a single active processor per job, so re-claiming a row left in
  // SENDING is only possible after a crash/stall of the previous attempt (see README: delivery
  // semantics). The conditional update still protects against cancellation races.
  const claim = await prisma.email.updateMany({
    where: { id: emailId, status: { in: ['SCHEDULED', 'SENDING'] } },
    data: { status: 'SENDING', sendingStartedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claim.count === 0) return { outcome: 'skipped', reason: 'state-changed' };

  // --- 5. Send ---------------------------------------------------------------------------------
  let result;
  try {
    result = await sendViaSender(sender, {
      to: email.recipient,
      subject: campaign.subject,
      html: campaign.bodyHtml,
      text: campaign.bodyText,
      messageId: email.messageId,
      headers: { 'X-ReachInbox-Email-Id': email.id, 'X-ReachInbox-Campaign-Id': campaign.id },
      attachments,
    });
  } catch (err) {
    await rateLimiter.releaseSendSlot(sender.id, emailId).catch(() => undefined);
    const permanent = isPermanentSmtpError(err);
    const exhausted = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    const message = errorMessage(err).slice(0, 1000);

    if (permanent || exhausted) {
      await markFailed(emailId, message);
    } else {
      await prisma.email.updateMany({
        where: { id: emailId, status: 'SENDING' },
        data: { status: 'SCHEDULED', lastError: message },
      });
    }
    logger.warn({ emailId, attempt: job.attemptsMade + 1, permanent, exhausted, err: message }, 'SMTP send failed');
    if (permanent) throw new UnrecoverableError(message);
    throw err;
  }

  await prisma.$transaction([
    prisma.email.update({
      where: { id: emailId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        deferredUntil: null,
        lastError: null,
        smtpResponse: result.response?.slice(0, 500) ?? null,
        previewUrl: result.previewUrl,
      },
    }),
    prisma.searchOutbox.create({ data: { emailId } }),
  ]);
  await kickSearchSync('email-sent');
  logger.info({ emailId, to: email.recipient, previewUrl: result.previewUrl }, 'Email sent');
  return { outcome: 'sent', messageId: result.messageId, previewUrl: result.previewUrl };
}

async function markFailed(emailId: string, reason: string): Promise<void> {
  await prisma.$transaction([
    prisma.email.updateMany({
      where: { id: emailId, status: { in: ['SCHEDULED', 'SENDING'] } },
      data: { status: 'FAILED', failedAt: new Date(), lastError: reason.slice(0, 1000) },
    }),
    prisma.searchOutbox.create({ data: { emailId } }),
  ]);
  await kickSearchSync('email-failed');
}

export function createEmailWorker(): Worker<EmailJobData, EmailJobResult> {
  const worker = new Worker<EmailJobData, EmailJobResult>(QUEUE_NAMES.EMAIL, processEmailJob, {
    connection: createRedisConnection('email-worker'),
    concurrency: env.WORKER_CONCURRENCY,
    lockDuration: 60_000,
    maxStalledCount: 2,
  });

  worker.on('failed', async (job, err) => {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    // Covers non-SMTP failures (e.g. DB outage) on the final attempt so no row stays stuck.
    if (job.attemptsMade >= attempts || err instanceof UnrecoverableError) {
      await markFailed(job.data.emailId, errorMessage(err)).catch((e) =>
        logger.error({ err: e, emailId: job.data.emailId }, 'Could not mark email failed'),
      );
    }
  });
  worker.on('error', (err) => logger.error({ err }, 'Email worker error'));
  logger.info({ concurrency: env.WORKER_CONCURRENCY }, 'Email worker started');
  return worker;
}
