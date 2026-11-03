import 'dotenv/config';
import { z } from 'zod';

/** Treat empty strings in .env as "not set". */
const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

const booleanFlag = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(defaultValue)
    .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PORT: z.coerce.number().int().positive().default(4000),
  BACKEND_URL: z.string().url().default('http://localhost:4000'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  ELASTICSEARCH_URL: z.string().url().default('http://localhost:9200'),
  ELASTICSEARCH_INDEX: z.string().min(1).default('emails'),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex characters (32 bytes). Run `npm run keys:generate`.'),

  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_REDIRECT_URI: optionalString,

  SLACK_CLIENT_ID: optionalString,
  SLACK_CLIENT_SECRET: optionalString,
  SLACK_REDIRECT_URI: optionalString,
  SLACK_SCOPES: z.string().default('chat:write,chat:write.public,incoming-webhook'),
  SLACK_DEFAULT_CHANNEL: optionalString,

  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(200).default(5),
  MIN_EMAIL_DELAY_MS: z.coerce.number().int().min(0).default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().min(1).default(200),
  EMAIL_JOB_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  EMAIL_JOB_BACKOFF_MS: z.coerce.number().int().min(100).default(10_000),
  RATE_LIMIT_LOOKAHEAD_HOURS: z.coerce.number().int().min(1).max(24 * 31).default(168),
  MAX_RECIPIENTS_PER_CAMPAIGN: z.coerce.number().int().min(1).default(10_000),
  // Unset -> true in development, false in production (production runs workers separately).
  RUN_WORKERS_IN_API: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  // One-shot worker (src/worker-once.ts, e.g. on a GitHub Actions schedule).
  WORKER_ONCE_MAX_MS: z.coerce.number().int().min(10_000).default(10 * 60_000),
  WORKER_ONCE_LOOKAHEAD_MS: z.coerce.number().int().min(0).default(2 * 60_000),

  ETHEREAL_SMTP_HOST: z.string().default('smtp.ethereal.email'),
  ETHEREAL_SMTP_PORT: z.coerce.number().int().default(587),
  AUTO_PROVISION_ETHEREAL_SENDER: booleanFlag('true'),

  ADMIN_EMAILS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_ATTACHMENT_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = {
  ...parsed.data,
  RUN_WORKERS_IN_API: parsed.data.RUN_WORKERS_IN_API ?? parsed.data.NODE_ENV !== 'production',
};
export type Env = typeof env;

export const isProduction = env.NODE_ENV === 'production';

export const googleConfigured = Boolean(
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI,
);

export const slackConfigured = Boolean(
  env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET && env.SLACK_REDIRECT_URI,
);
