import type { EmailSender } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { badRequest, notFound } from '../utils/errors';
import { encryptSecret } from '../utils/secrets';
import { logger } from '../utils/logger';
import { createEtherealAccount, verifySmtp } from './mailer.service';
import { rateLimiter } from './rateLimiterInstance';

/** Shape exposed to the frontend — SMTP credentials are never included. */
export interface PublicSender {
  id: string;
  name: string;
  email: string;
  smtpHost: string;
  hourlyLimit: number;
  minDelayMs: number;
  isActive: boolean;
  createdAt: Date;
}

export const toPublicSender = (s: EmailSender): PublicSender => ({
  id: s.id,
  name: s.name,
  email: s.email,
  smtpHost: s.smtpHost,
  hourlyLimit: s.hourlyLimit,
  minDelayMs: s.minDelayMs,
  isActive: s.isActive,
  createdAt: s.createdAt,
});

export async function listSenders(userId: string) {
  const senders = await prisma.emailSender.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  return Promise.all(
    senders.map(async (s) => ({
      ...toPublicSender(s),
      usedThisHour: await rateLimiter.currentHourUsage(s.id).catch(() => null),
    })),
  );
}

export async function getOwnedSender(userId: string, senderId: string): Promise<EmailSender> {
  const sender = await prisma.emailSender.findFirst({ where: { id: senderId, userId } });
  if (!sender) throw notFound('Sender not found');
  return sender;
}

export interface CreateSenderInput {
  name?: string;
  /** Existing Ethereal credentials; when omitted a new Ethereal account is created automatically. */
  smtpUser?: string;
  smtpPass?: string;
  hourlyLimit?: number;
  minDelayMs?: number;
}

export async function createEtherealSender(userId: string, input: CreateSenderInput): Promise<PublicSender> {
  let creds: { user: string; pass: string; host: string; port: number; secure: boolean };

  if (input.smtpUser && input.smtpPass) {
    creds = {
      user: input.smtpUser,
      pass: input.smtpPass,
      host: env.ETHEREAL_SMTP_HOST,
      port: env.ETHEREAL_SMTP_PORT,
      secure: env.ETHEREAL_SMTP_PORT === 465,
    };
    try {
      await verifySmtp(creds);
    } catch (err) {
      throw badRequest(`SMTP verification failed: ${(err as Error).message}`);
    }
  } else {
    creds = await createEtherealAccount();
  }

  const existing = await prisma.emailSender.findUnique({ where: { userId_email: { userId, email: creds.user } } });
  if (existing) throw badRequest(`Sender ${creds.user} already exists`);

  const sender = await prisma.emailSender.create({
    data: {
      userId,
      name: input.name?.trim() || creds.user.split('@')[0],
      email: creds.user,
      smtpHost: creds.host,
      smtpPort: creds.port,
      smtpSecure: creds.secure,
      smtpUser: creds.user,
      smtpPassEncrypted: encryptSecret(creds.pass),
      hourlyLimit: Math.min(input.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER, env.MAX_EMAILS_PER_HOUR_PER_SENDER),
      minDelayMs: Math.max(input.minDelayMs ?? env.MIN_EMAIL_DELAY_MS, env.MIN_EMAIL_DELAY_MS),
    },
  });
  logger.info({ senderId: sender.id, userId }, 'Created email sender');
  return toPublicSender(sender);
}

export async function updateSenderLimits(
  userId: string,
  senderId: string,
  input: { hourlyLimit?: number; minDelayMs?: number; isActive?: boolean; name?: string },
): Promise<PublicSender> {
  await getOwnedSender(userId, senderId);
  const sender = await prisma.emailSender.update({
    where: { id: senderId },
    data: {
      name: input.name,
      isActive: input.isActive,
      hourlyLimit:
        input.hourlyLimit === undefined ? undefined : Math.min(input.hourlyLimit, env.MAX_EMAILS_PER_HOUR_PER_SENDER),
      minDelayMs: input.minDelayMs === undefined ? undefined : Math.max(input.minDelayMs, env.MIN_EMAIL_DELAY_MS),
    },
  });
  return toPublicSender(sender);
}

/** Gives a brand-new user one working Ethereal sender so the app is usable immediately. */
export async function ensureDefaultSender(userId: string): Promise<void> {
  if (!env.AUTO_PROVISION_ETHEREAL_SENDER) return;
  const count = await prisma.emailSender.count({ where: { userId } });
  if (count > 0) return;
  try {
    await createEtherealSender(userId, { name: 'Default Ethereal Sender' });
  } catch (err) {
    logger.warn({ err, userId }, 'Could not auto-provision an Ethereal sender; user can add one manually');
  }
}
