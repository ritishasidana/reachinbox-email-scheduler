import type { Request, Response } from 'express';
import {
  cancelEmail,
  emailCounts,
  getEmailDetail,
  listEmails,
  scheduleCampaign,
  searchEmails,
  setStarred,
  type ListView,
} from '../services/email.service';
import { badRequest } from '../utils/errors';
import { extractRecipientsFromText } from '../utils/recipients';
import { idempotencyKeySchema, type ScheduleEmailBody } from '../validators/schemas';

export async function schedule(req: Request, res: Response): Promise<void> {
  const idempotencyKey = idempotencyKeySchema.parse(req.header('Idempotency-Key'));
  const body = req.body as ScheduleEmailBody;
  const result = await scheduleCampaign(req.user!.id, idempotencyKey, body);
  res.status(result.duplicate ? 200 : 201).json(result);
}

export const list = (view: ListView) => async (req: Request, res: Response) => {
  const q = req.query as unknown as { page: number; pageSize: number; starred?: boolean; senderId?: string };
  res.json(await listEmails(req.user!.id, { view, ...q }));
};

export async function counts(req: Request, res: Response): Promise<void> {
  res.json(await emailCounts(req.user!.id));
}

export async function search(req: Request, res: Response): Promise<void> {
  const { q, view, limit } = req.query as unknown as { q: string; view: 'scheduled' | 'sent' | 'all'; limit: number };
  res.json(await searchEmails(req.user!.id, q, view, limit));
}

export async function detail(req: Request, res: Response): Promise<void> {
  res.json(await getEmailDetail(req.user!.id, req.params.id!));
}

export async function star(req: Request, res: Response): Promise<void> {
  res.json(await setStarred(req.user!.id, req.params.id!, (req.body as { isStarred: boolean }).isStarred));
}

export async function cancel(req: Request, res: Response): Promise<void> {
  res.json(await cancelEmail(req.user!.id, req.params.id!));
}

/** Parses an uploaded CSV/TXT recipient list and returns valid/invalid/duplicate statistics. */
export function parseRecipientFile(req: Request, res: Response): void {
  if (!req.file) throw badRequest('Upload a .csv or .txt file in the "file" field');
  const summary = extractRecipientsFromText(req.file.buffer.toString('utf8'));
  res.json({
    filename: req.file.originalname,
    total: summary.total,
    validCount: summary.valid.length,
    invalidCount: summary.invalid.length,
    duplicates: summary.duplicates,
    valid: summary.valid,
    invalid: summary.invalid,
  });
}
