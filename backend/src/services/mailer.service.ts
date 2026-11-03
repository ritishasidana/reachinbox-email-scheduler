import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPPool from 'nodemailer/lib/smtp-pool';
import type { EmailSender } from '@prisma/client';
import { env } from '../config/env';
import { decryptSecret } from '../utils/secrets';

type SmtpTransporter = Transporter<SMTPPool.SentMessageInfo>;

/** Pooled transporters cached per sender; rebuilt automatically when the sender record changes. */
const cache = new Map<string, { version: number; transporter: SmtpTransporter }>();

export function getTransporter(sender: EmailSender): SmtpTransporter {
  const version = sender.updatedAt.getTime();
  const cached = cache.get(sender.id);
  if (cached && cached.version === version) return cached.transporter;
  cached?.transporter.close();

  const transporter = nodemailer.createTransport({
    host: sender.smtpHost,
    port: sender.smtpPort,
    secure: sender.smtpSecure,
    auth: { user: sender.smtpUser, pass: decryptSecret(sender.smtpPassEncrypted) },
    pool: true,
    maxConnections: 2,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  cache.set(sender.id, { version, transporter });
  return transporter;
}

export interface OutgoingMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  messageId: string;
  headers?: Record<string, string>;
  /** Either `content` (stored in Postgres) or `path` (legacy file on local disk). */
  attachments?: { filename: string; contentType: string; content?: Buffer; path?: string }[];
}

export interface SendResult {
  messageId: string;
  response: string;
  previewUrl: string | null;
}

export async function sendViaSender(sender: EmailSender, message: OutgoingMessage): Promise<SendResult> {
  const info = await getTransporter(sender).sendMail({
    from: { name: sender.name, address: sender.email },
    ...message,
  });
  // getTestMessageUrl only reads `response`; the pool's info type lacks a field its typing requires.
  const preview = nodemailer.getTestMessageUrl(info as unknown as Parameters<typeof nodemailer.getTestMessageUrl>[0]);
  return { messageId: info.messageId, response: info.response, previewUrl: preview || null };
}

/** Verifies SMTP credentials without sending anything. */
export async function verifySmtp(config: { host: string; port: number; secure: boolean; user: string; pass: string }) {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });
  try {
    await transporter.verify();
  } finally {
    transporter.close();
  }
}

interface EtherealApiResponse {
  status: string;
  error?: string;
  user: string;
  pass: string;
  smtp: { host: string; port: number; secure: boolean };
}

/**
 * Creates a brand-new Ethereal test account via the Ethereal API.
 * We call the API directly instead of `nodemailer.createTestAccount()` because that helper caches the
 * first account process-wide (ETHEREAL_CACHE), which would hand every new sender the same mailbox.
 */
export async function createEtherealAccount() {
  const res = await fetch('https://api.nodemailer.com/user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestor: 'reachinbox-email-scheduler', version: '1.0.0' }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json()) as EtherealApiResponse;
  if (!res.ok || data.status !== 'success' || data.error) {
    throw new Error(`Ethereal account creation failed: ${data.error ?? `HTTP ${res.status}`}`);
  }
  return {
    user: data.user,
    pass: data.pass,
    host: data.smtp?.host || env.ETHEREAL_SMTP_HOST,
    port: data.smtp?.port || env.ETHEREAL_SMTP_PORT,
    secure: Boolean(data.smtp?.secure),
  };
}

/**
 * SMTP 5xx replies and auth failures will not succeed on retry; everything else (timeouts,
 * connection resets, 4xx greylisting) is treated as transient.
 */
export function isPermanentSmtpError(err: unknown): boolean {
  const e = err as { responseCode?: number; code?: string };
  if (e?.code === 'EAUTH' || e?.code === 'EENVELOPE' || e?.code === 'EMESSAGE') return true;
  return typeof e?.responseCode === 'number' && e.responseCode >= 500 && e.responseCode < 600;
}

export function closeAllTransporters(): void {
  for (const { transporter } of cache.values()) transporter.close();
  cache.clear();
}
