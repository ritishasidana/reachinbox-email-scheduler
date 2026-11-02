import { EmailStatus, Prisma } from '@prisma/client';
import { EMAIL_INDEX, es } from '../db/elasticsearch';
import { prisma } from '../db/prisma';
import { searchQueue } from '../queues';
import { errorMessage } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Elasticsearch synchronisation via a transactional outbox.
 *
 * Every write that changes an Email also inserts a SearchOutbox row *in the same Postgres
 * transaction*. A BullMQ job drains the outbox into Elasticsearch with retries; a periodic sweep
 * (BullMQ job scheduler) recovers anything missed (e.g. ES was down, or the kick job was lost).
 * Postgres stays the source of truth: the index can always be rebuilt from it.
 */

const DRAIN_JOB_ID = 'search-drain';
const BATCH_SIZE = 500;

export const outboxRowsFor = (emailIds: string[]): Prisma.SearchOutboxCreateManyInput[] =>
  emailIds.map((emailId) => ({ emailId, operation: 'UPSERT' as const }));

/** Requests an outbox drain. Deduplicated by job ID; failures are tolerated (the sweep recovers). */
export async function kickSearchSync(reason: string): Promise<void> {
  try {
    await searchQueue.add('drain', { reason }, { jobId: DRAIN_JOB_ID });
  } catch (err) {
    logger.warn({ err, reason }, 'Could not enqueue search sync; periodic sweep will recover');
  }
}

type EmailForIndex = Prisma.EmailGetPayload<{ include: { campaign: true; sender: true } }>;

const toDocument = (e: EmailForIndex) => ({
  id: e.id,
  userId: e.userId,
  campaignId: e.campaignId,
  senderId: e.senderId,
  senderEmail: e.sender.email,
  recipient: e.recipient,
  subject: e.campaign.subject,
  body: e.campaign.bodyText,
  status: e.status,
  scheduledAt: e.scheduledAt.toISOString(),
  sentAt: e.sentAt?.toISOString() ?? null,
  updatedAt: e.updatedAt.toISOString(),
});

/** Drains one batch of the outbox. Returns how many rows were processed. */
export async function drainOutboxBatch(): Promise<number> {
  const rows = await prisma.searchOutbox.findMany({
    where: { processedAt: null },
    orderBy: { id: 'asc' },
    take: BATCH_SIZE,
  });
  if (rows.length === 0) return 0;

  // Several outbox rows may refer to the same email; index each email once with its latest state.
  const emailIds = [...new Set(rows.map((r) => r.emailId))];
  const emails = await prisma.email.findMany({
    where: { id: { in: emailIds } },
    include: { campaign: true, sender: true },
  });
  const found = new Set(emails.map((e) => e.id));

  const operations: object[] = [];
  for (const e of emails) {
    operations.push({ index: { _index: EMAIL_INDEX, _id: e.id } }, toDocument(e));
  }
  for (const id of emailIds) {
    if (!found.has(id)) operations.push({ delete: { _index: EMAIL_INDEX, _id: id } });
  }

  const rowIds = rows.map((r) => r.id);
  try {
    const result = await es.bulk({ operations, refresh: false });
    if (result.errors) {
      const failures = result.items
        .map((item) => Object.values(item)[0])
        .filter((r) => r?.error && !(r.status === 404));
      if (failures.length > 0) throw new Error(`Bulk index had ${failures.length} failures: ${JSON.stringify(failures[0]?.error)}`);
    }
  } catch (err) {
    await prisma.searchOutbox.updateMany({
      where: { id: { in: rowIds } },
      data: { attempts: { increment: 1 }, lastError: errorMessage(err).slice(0, 1000) },
    });
    throw err;
  }

  await prisma.searchOutbox.updateMany({ where: { id: { in: rowIds } }, data: { processedAt: new Date() } });
  return rows.length;
}

export async function drainOutbox(maxBatches = 20): Promise<number> {
  let total = 0;
  for (let i = 0; i < maxBatches; i += 1) {
    const n = await drainOutboxBatch();
    total += n;
    if (n < BATCH_SIZE) break;
  }
  return total;
}

/** Housekeeping: drop outbox rows that were synced more than 7 days ago. */
export async function pruneOutbox(): Promise<void> {
  await prisma.searchOutbox.deleteMany({
    where: { processedAt: { lt: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
  });
}

export type SearchView = 'scheduled' | 'sent' | 'all';

export const statusesForView = (view: SearchView): EmailStatus[] => {
  if (view === 'scheduled') return ['SCHEDULED', 'SENDING'];
  if (view === 'sent') return ['SENT', 'FAILED'];
  return ['SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED'];
};

const escapeWildcard = (s: string) => s.replace(/[\\*?]/g, (c) => `\\${c}`);

/**
 * Full-text search scoped to the user. Returns matching email IDs ranked by relevance.
 * Hydration (and authorisation of the final result) happens against Postgres.
 */
export async function searchEmailIds(userId: string, query: string, view: SearchView, limit: number): Promise<string[]> {
  const q = query.trim();
  const result = await es.search<{ id: string }>({
    index: EMAIL_INDEX,
    size: limit,
    _source: ['id'],
    query: {
      bool: {
        filter: [{ term: { userId } }, { terms: { status: statusesForView(view) } }],
        should: [
          {
            multi_match: {
              query: q,
              type: 'bool_prefix',
              fields: ['subject^3', 'recipient^2', 'senderEmail', 'body'],
            },
          },
          { multi_match: { query: q, fields: ['subject^3', 'body'], fuzziness: 'AUTO' } },
          { wildcard: { 'recipient.keyword': { value: `*${escapeWildcard(q.toLowerCase())}*` } } },
        ],
        minimum_should_match: 1,
      },
    },
  });
  return result.hits.hits.map((h) => h._source?.id ?? h._id).filter((id): id is string => Boolean(id));
}
