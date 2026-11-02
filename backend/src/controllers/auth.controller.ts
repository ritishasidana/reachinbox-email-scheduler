import crypto from 'crypto';
import type { Request, Response } from 'express';
import { env, googleConfigured } from '../config/env';
import { SESSION_COOKIE } from '../middleware/session';
import { buildGoogleAuthUrl, completeGoogleLogin } from '../services/auth.service';
import { logger } from '../utils/logger';

const loginRedirect = (reason: string) => `${env.FRONTEND_URL}/login?error=${encodeURIComponent(reason)}`;

export async function startGoogleLogin(req: Request, res: Response): Promise<void> {
  if (!googleConfigured) {
    res.redirect(loginRedirect('google_not_configured'));
    return;
  }
  const state = crypto.randomBytes(24).toString('hex');
  req.session.oauthState = state; // CSRF protection for the OAuth round-trip
  await new Promise<void>((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
  res.redirect(buildGoogleAuthUrl(state));
}

export async function googleCallback(req: Request, res: Response): Promise<void> {
  const { code, state, error } = req.query as Record<string, string | undefined>;
  if (error) {
    res.redirect(loginRedirect(error));
    return;
  }
  const expected = req.session.oauthState;
  if (!code || !state || !expected || state !== expected) {
    res.redirect(loginRedirect('invalid_state'));
    return;
  }

  try {
    const user = await completeGoogleLogin(code);
    // Regenerate to prevent session fixation, then bind the user.
    await new Promise<void>((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
    res.redirect(`${env.FRONTEND_URL}/scheduled`);
  } catch (err) {
    // Log only the error code/message: Google client errors carry the token request (incl. client_secret).
    const e = err as { message?: string; response?: { data?: { error?: string; error_description?: string } } };
    logger.error(
      { googleError: e.response?.data?.error, description: e.response?.data?.error_description, message: e.message },
      'Google login failed',
    );
    res.redirect(loginRedirect('google_login_failed'));
  }
}

export function me(req: Request, res: Response): void {
  res.json({ user: req.user });
}

export async function logout(req: Request, res: Response): Promise<void> {
  await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
  res.clearCookie(SESSION_COOKIE);
  res.status(204).end();
}

export function authConfig(_req: Request, res: Response): void {
  res.json({ googleConfigured });
}
