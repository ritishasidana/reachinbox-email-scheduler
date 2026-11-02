import { Client, errors } from '@elastic/elasticsearch';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export const es = new Client({ node: env.ELASTICSEARCH_URL, requestTimeout: 10_000, maxRetries: 2 });
export const EMAIL_INDEX = env.ELASTICSEARCH_INDEX;

/** Creates the email index with explicit mappings if it does not exist (idempotent, race-safe). */
export async function ensureEmailIndex(): Promise<void> {
  const exists = await es.indices.exists({ index: EMAIL_INDEX });
  if (exists) return;
  try {
    await es.indices.create({
      index: EMAIL_INDEX,
      settings: { number_of_shards: 1, number_of_replicas: 0 },
      mappings: {
        dynamic: 'strict',
        properties: {
          id: { type: 'keyword' },
          userId: { type: 'keyword' },
          campaignId: { type: 'keyword' },
          senderId: { type: 'keyword' },
          senderEmail: { type: 'text', fields: { keyword: { type: 'keyword' } } },
          recipient: { type: 'text', fields: { keyword: { type: 'keyword' } } },
          subject: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 512 } } },
          body: { type: 'text' },
          status: { type: 'keyword' },
          scheduledAt: { type: 'date' },
          sentAt: { type: 'date' },
          updatedAt: { type: 'date' },
        },
      },
    });
    logger.info({ index: EMAIL_INDEX }, 'Created Elasticsearch index');
  } catch (err) {
    if (err instanceof errors.ResponseError && err.body?.error?.type === 'resource_already_exists_exception') return;
    throw err;
  }
}
