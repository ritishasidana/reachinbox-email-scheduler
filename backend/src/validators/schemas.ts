import { z } from 'zod';

export const scheduleEmailSchema = z.object({
  senderId: z.string().uuid(),
  recipients: z.array(z.string().max(320)).min(1, 'At least one recipient is required').max(50_000),
  subject: z.string().trim().min(1, 'Subject is required').max(998),
  bodyHtml: z.string().min(1, 'Email body is required').max(500_000),
  startAt: z.coerce.date(),
  delayMs: z.coerce.number().int().min(0).max(24 * 3600 * 1000).nullish(),
  hourlyLimit: z.coerce.number().int().min(1).max(100_000).nullish(),
  attachmentIds: z.array(z.string().uuid()).max(10).default([]),
});
export type ScheduleEmailBody = z.infer<typeof scheduleEmailSchema>;

export const idempotencyKeySchema = z
  .string({ required_error: 'Idempotency-Key header is required' })
  .trim()
  .min(8, 'Idempotency-Key must be at least 8 characters')
  .max(128);

export const listEmailsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  starred: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  senderId: z.string().uuid().optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Query is required').max(200),
  view: z.enum(['scheduled', 'sent', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const idParamSchema = z.object({ id: z.string().uuid() });

export const starSchema = z.object({ isStarred: z.boolean() });

export const createSenderSchema = z
  .object({
    name: z.string().trim().max(100).optional(),
    smtpUser: z.string().email().optional(),
    smtpPass: z.string().min(1).optional(),
    hourlyLimit: z.number().int().min(1).optional(),
    minDelayMs: z.number().int().min(0).optional(),
  })
  .refine((v) => Boolean(v.smtpUser) === Boolean(v.smtpPass), {
    message: 'Provide both smtpUser and smtpPass, or neither to create a new Ethereal account',
  });

export const updateSenderSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  hourlyLimit: z.number().int().min(1).optional(),
  minDelayMs: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
