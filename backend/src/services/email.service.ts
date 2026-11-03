import crypto from 'crypto';
import { Prisma, type EmailStatus } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { emailJobId, emailQueue } from '../queues';
import { badRequest, conflict, notFound } from '../utils/errors';
import { htmlToPlainText, previewOf, sanitizeEmailHtml } from '../utils/html';
import { logger } from '../utils/logger';
import { summarizeRecipients } from '../utils/recipients';
import { kickSearchSync, outboxRowsFor, searchEmailIds, statusesForView, type SearchView } from './search.service';
import { getOwnedSender } from './sender.service';

export const messageIdFor = (emailId: string): string => `<${emailId}@reachinbox.scheduler>`;

const ENQUEUE_CHUNK = 500;

// ---------------------------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------------------------

export interface ScheduleInput {
  senderId: string;
  recipients: string[];
  subject: string;
  bodyHtml: string;
  startAt: Date;
  delayMs?: number | null;
  hourlyLimit?: number | null;
  attachmentIds: string[];
}

export interface ScheduleResult {
  campaignId: string;
  duplicate: boolean;
  scheduled: number;
  invalid: string[];
  duplicatesRemoved: number;
  startAt: Date;
}

/**
 * Creates a campaign and one Email row per unique valid recipient in a single transaction, then
 * enqueues one delayed BullMQ job per email.
 *
 * Idempotency: (userId, idempotencyKey) is unique. A repeated request with the same key returns the
 * original campaign and (re-)enqueues its jobs, which is a no-op for jobs that already exist because
 * job IDs are stable. This also heals the case where the DB commit succeeded but enqueueing failed.
 */
export async function scheduleCampaign(
  userId: string,
  idempotencyKey: string,
  input: ScheduleInput,
): Promise<ScheduleResult> {
  const existing = await prisma.emailCampaign.findUnique({
    where: { userId_idempotencyKey: { userId, idempotencyKey } },
  });
  if (existing) return replayExisting(existing.id, existing.startAt);

  const sender = await getOwnedSender(userId, input.senderId);
  if (!sender.isActive) throw badRequest('Selected sender is disabled');

  const summary = summarizeRecipients(input.recipients);
  if (summary.valid.length === 0) throw badRequest('No valid recipient email addresses', { invalid: summary.invalid });
  if (summary.valid.length > env.MAX_RECIPIENTS_PER_CAMPAIGN) {
    throw badRequest(`A campaign may contain at most ${env.MAX_RECIPIENTS_PER_CAMPAIGN} recipients`);
  }

  const now = Date.now();
  if (input.startAt.getTime() < now - 60_000) throw badRequest('Start time is in the past');
  const startMs = Math.max(input.startAt.getTime(), now);

  const bodyHtml = sanitizeEmailHtml(input.bodyHtml);
  const bodyText = htmlToPlainText(bodyHtml);
  // Effective spacing used to pre-compute display times; the worker enforces the real spacing.
  const spacing = Math.max(input.delayMs ?? 0, sender.minDelayMs, env.MIN_EMAIL_DELAY_MS);

  const campaignId = crypto.randomUUID();
  const emails = summary.valid.map((recipient, index) => {
    const id = crypto.randomUUID();
    return {
      id,
      campaignId,
      userId,
      senderId: sender.id,
      recipient,
      scheduledAt: new Date(startMs + index * spacing),
      messageId: messageIdFor(id),
    };
  });

  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.emailCampaign.create({
          data: {
            id: campaignId,
            userId,
            senderId: sender.id,
            subject: input.subject.trim(),
            bodyHtml,
            bodyText,
            startAt: new Date(startMs),
            delayMs: input.delayMs ?? null,
            hourlyLimit: input.hourlyLimit ?? null,
            totalRecipients: emails.length,
            idempotencyKey,
          },
        });
        for (let i = 0; i < emails.length; i += 1000) {
          await tx.email.createMany({ data: emails.slice(i, i + 1000) });
        }
        if (input.attachmentIds.length > 0) {
          const linked = await tx.attachment.updateMany({
            where: { id: { in: input.attachmentIds }, userId, campaignId: null },
            data: { campaignId },
          });
          if (linked.count !== input.attachmentIds.length) {
            throw badRequest('One or more attachments are invalid or already used');
          }
        }
        await tx.searchOutbox.createMany({ data: outboxRowsFor(emails.map((e) => e.id)) });
      },
      { timeout: 60_000 },
    );
  } catch (err) {
    // Concurrent duplicate request with the same idempotency key won the race.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.emailCampaign.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey } },
      });
      if (winner) return replayExisting(winner.id, winner.startAt);
    }
    throw err;
  }

  await enqueueEmailJobs(emails.map((e) => ({ id: e.id, scheduledAt: e.scheduledAt })));
  await kickSearchSync('campaign-created');

  logger.info({ campaignId, userId, count: emails.length }, 'Campaign scheduled');
  return {
    campaignId,
    duplicate: false,
    scheduled: emails.length,
    invalid: summary.invalid,
    duplicatesRemoved: summary.duplicates,
    startAt: new Date(startMs),
  };
}

async function replayExisting(campaignId: string, startAt: Date): Promise<ScheduleResult> {
  const pending = await prisma.email.findMany({
    where: { campaignId, status: 'SCHEDULED' },
    select: { id: true, scheduledAt: true, deferredUntil: true },
  });
  await enqueueEmailJobs(pending.map((e) => ({ id: e.id, scheduledAt: e.deferredUntil ?? e.scheduledAt })));
  const scheduled = await prisma.email.count({ where: { campaignId } });
  return { campaignId, duplicate: true, scheduled, invalid: [], duplicatesRemoved: 0, startAt };
}

/** Adds delayed jobs in chunks. Existing job IDs are ignored by BullMQ, so this is idempotent. */
export async function enqueueEmailJobs(emails: { id: string; scheduledAt: Date }[]): Promise<void> {
  const now = Date.now();
  for (let i = 0; i < emails.length; i += ENQUEUE_CHUNK) {
    const chunk = emails.slice(i, i + ENQUEUE_CHUNK);
    await emailQueue.addBulk(
      chunk.map((e) => ({
        name: 'send',
        data: { emailId: e.id },
        opts: { jobId: emailJobId(e.id), delay: Math.max(0, e.scheduledAt.getTime() - now) },
      })),
    );
  }
}

/**
 * Startup safety net: makes sure every SCHEDULED/SENDING email has a BullMQ job. Normally a no-op
 * (Redis AOF keeps delayed jobs across restarts); it recovers from Redis data loss or a crash
 * between the DB commit and the enqueue.
 */
export async function reconcileScheduledEmails(): Promise<number> {
  let cursor: string | undefined;
  let total = 0;
  for (;;) {
    const batch = await prisma.email.findMany({
      where: { status: { in: ['SCHEDULED', 'SENDING'] } },
      select: { id: true, scheduledAt: true, deferredUntil: true },
      orderBy: { id: 'asc' },
      take: 1000,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (batch.length === 0) break;
    await enqueueEmailJobs(batch.map((e) => ({ id: e.id, scheduledAt: e.deferredUntil ?? e.scheduledAt })));
    total += batch.length;
    cursor = batch[batch.length - 1]!.id;
  }
  return total;
}

// ---------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------

const listInclude = {
  campaign: { select: { subject: true, bodyText: true } },
  sender: { select: { id: true, name: true, email: true } },
} satisfies Prisma.EmailInclude;

type EmailWithList = Prisma.EmailGetPayload<{ include: typeof listInclude }>;

export interface EmailListItem {
  id: string;
  campaignId: string;
  recipient: string;
  subject: string;
  preview: string;
  status: EmailStatus;
  scheduledAt: Date;
  deferredUntil: Date | null;
  sentAt: Date | null;
  failedAt: Date | null;
  lastError: string | null;
  isStarred: boolean;
  sender: { id: string; name: string; email: string };
}

const toListItem = (e: EmailWithList): EmailListItem => ({
  id: e.id,
  campaignId: e.campaignId,
  recipient: e.recipient,
  subject: e.campaign.subject,
  preview: previewOf(e.campaign.bodyText),
  status: e.status,
  scheduledAt: e.scheduledAt,
  deferredUntil: e.deferredUntil,
  sentAt: e.sentAt,
  failedAt: e.failedAt,
  lastError: e.lastError,
  isStarred: e.isStarred,
  sender: e.sender,
});

export type ListView = 'scheduled' | 'sent' | 'failed';

export interface ListQuery {
  view: ListView;
  page: number;
  pageSize: number;
  starred?: boolean;
  senderId?: string;
}

export async function listEmails(userId: string, q: ListQuery) {
  const statuses: EmailStatus[] = q.view === 'failed' ? ['FAILED'] : statusesForView(q.view);
  const where: Prisma.EmailWhereInput = {
    userId,
    status: { in: statuses },
    ...(q.starred ? { isStarred: true } : {}),
    ...(q.senderId ? { senderId: q.senderId } : {}),
  };
  const orderBy: Prisma.EmailOrderByWithRelationInput[] =
    q.view === 'scheduled' ? [{ scheduledAt: 'asc' }, { id: 'asc' }] : [{ updatedAt: 'desc' }, { id: 'asc' }];

  const [total, rows] = await prisma.$transaction([
    prisma.email.count({ where }),
    prisma.email.findMany({
      where,
      orderBy,
      include: listInclude,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  return { items: rows.map(toListItem), total, page: q.page, pageSize: q.pageSize };
}

export async function emailCounts(userId: string) {
  const groups = await prisma.email.groupBy({ by: ['status'], where: { userId }, _count: { _all: true } });
  const count = (s: EmailStatus) => groups.find((g) => g.status === s)?._count._all ?? 0;
  return {
    scheduled: count('SCHEDULED') + count('SENDING'),
    sent: count('SENT') + count('FAILED'),
    sentOk: count('SENT'),
    failed: count('FAILED'),
    cancelled: count('CANCELLED'),
  };
}

/**
 * Elasticsearch-backed search. Results are hydrated from Postgres (source of truth). If ES is
 * unavailable the API degrades to a Postgres ILIKE search instead of failing.
 */
export async function searchEmails(userId: string, query: string, view: SearchView, limit = 50) {
  let ids: string[] | null = null;
  let source: 'elasticsearch' | 'database' = 'elasticsearch';
  try {
    ids = await searchEmailIds(userId, query, view, limit);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Elasticsearch search failed; falling back to Postgres');
    source = 'database';
  }

  const statuses = statusesForView(view);
  if (ids) {
    if (ids.length === 0) return { items: [], total: 0, source };
    const rows = await prisma.email.findMany({
      where: { id: { in: ids }, userId, status: { in: statuses } },
      include: listInclude,
    });
    const order = new Map(ids.map((id, i) => [id, i]));
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return { items: rows.map(toListItem), total: rows.length, source };
  }

  const rows = await prisma.email.findMany({
    where: {
      userId,
      status: { in: statuses },
      OR: [
        { recipient: { contains: query, mode: 'insensitive' } },
        { campaign: { subject: { contains: query, mode: 'insensitive' } } },
        { campaign: { bodyText: { contains: query, mode: 'insensitive' } } },
      ],
    },
    include: listInclude,
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });
  return { items: rows.map(toListItem), total: rows.length, source };
}

export async function getEmailDetail(userId: string, emailId: string) {
  const email = await prisma.email.findFirst({
    where: { id: emailId, userId },
    include: {
      // Metadata only: never load attachment contents (stored in Postgres) just to render the page.
      campaign: { include: { attachments: { select: { id: true, filename: true, mimeType: true, size: true } } } },
      sender: { select: { id: true, name: true, email: true } },
    },
  });
  if (!email) throw notFound('Email not found');
  return {
    ...toListItem({ ...email, campaign: email.campaign }),
    bodyHtml: email.campaign.bodyHtml,
    bodyText: email.campaign.bodyText,
    messageId: email.messageId,
    attempts: email.attempts,
    previewUrl: email.previewUrl,
    smtpResponse: email.smtpResponse,
    createdAt: email.createdAt,
    attachments: email.campaign.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      url: `/api/attachments/${a.id}`,
    })),
  };
}

export async function setStarred(userId: string, emailId: string, isStarred: boolean) {
  const updated = await prisma.email.updateMany({ where: { id: emailId, userId }, data: { isStarred } });
  if (updated.count === 0) throw notFound('Email not found');
  return { id: emailId, isStarred };
}

/**
 * Cancels a scheduled email. The DB transition SCHEDULED -> CANCELLED is the authority: even if the
 * job is picked up concurrently, the worker's claim (which requires SCHEDULED) will fail and skip it.
 */
export async function cancelEmail(userId: string, emailId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.email.updateMany({
      where: { id: emailId, userId, status: 'SCHEDULED' },
      data: { status: 'CANCELLED', deferredUntil: null },
    });
    if (updated.count > 0) await tx.searchOutbox.create({ data: { emailId } });
    return updated.count;
  });
  if (result === 0) {
    const exists = await prisma.email.findFirst({ where: { id: emailId, userId }, select: { status: true } });
    if (!exists) throw notFound('Email not found');
    throw conflict(`Email cannot be cancelled while ${exists.status.toLowerCase()}`);
  }
  const job = await emailQueue.getJob(emailJobId(emailId));
  await job?.remove().catch(() => undefined); // active/locked jobs can't be removed; the worker will skip it
  await kickSearchSync('email-cancelled');
  return { id: emailId, status: 'CANCELLED' as const };
}
