import type { Request, Response } from 'express';
import { env } from '../config/env';
import {
  buildSlackInstallUrl,
  completeSlackInstall,
  disconnectSlack,
  getSlackStatus,
  postSlackMessage,
} from '../services/slack.service';
import { badRequest } from '../utils/errors';
import { logger } from '../utils/logger';

export async function status(req: Request, res: Response): Promise<void> {
  res.json(await getSlackStatus(req.user!.id));
}

/** Returns the Slack authorize URL; the SPA navigates the browser to it. */
export async function install(req: Request, res: Response): Promise<void> {
  res.json({ url: await buildSlackInstallUrl(req.user!.id) });
}

/** Public endpoint (Slack redirects here); identity comes from the signed, single-use `state`. */
export async function callback(req: Request, res: Response): Promise<void> {
  const { code, state, error } = req.query as Record<string, string | undefined>;
  const back = (q: string) => res.redirect(`${env.FRONTEND_URL}/scheduled?${q}`);
  if (error) return back(`slack=error&reason=${encodeURIComponent(error)}`);
  if (!code || !state) return back('slack=error&reason=missing_code');
  try {
    await completeSlackInstall(code, state);
    return back('slack=connected');
  } catch (err) {
    logger.error({ err }, 'Slack OAuth callback failed');
    return back(`slack=error&reason=${encodeURIComponent((err as Error).message)}`);
  }
}

export async function disconnect(req: Request, res: Response): Promise<void> {
  await disconnectSlack(req.user!.id);
  res.status(204).end();
}

/** Sends a real test message so the integration can be verified from the dashboard. */
export async function test(req: Request, res: Response): Promise<void> {
  const posted = await postSlackMessage(
    req.user!.id,
    `:white_check_mark: ReachInbox test notification for ${req.user!.email}`,
  );
  if (!posted) throw badRequest('Slack is not connected');
  res.json({ ok: true });
}
