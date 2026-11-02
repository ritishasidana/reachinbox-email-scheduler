import type { Request, Response } from 'express';
import { createEtherealSender, listSenders, updateSenderLimits } from '../services/sender.service';

export async function list(req: Request, res: Response): Promise<void> {
  res.json({ items: await listSenders(req.user!.id) });
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await createEtherealSender(req.user!.id, req.body));
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json(await updateSenderLimits(req.user!.id, req.params.id!, req.body));
}
