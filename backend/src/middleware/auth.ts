import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { forbidden, unauthorized } from '../utils/errors';

async function loadUser(req: Request): Promise<boolean> {
  const userId = req.session.userId;
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, avatarUrl: true },
  });
  if (!user) return false;
  req.user = user;
  return true;
}

/** API guard: 401 JSON when the session is missing or the user no longer exists. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  loadUser(req)
    .then((ok) => (ok ? next() : next(unauthorized())))
    .catch(next);
}

/**
 * Guard for the Bull Board UI (HTML): redirects unauthenticated browsers to the login page and,
 * when ADMIN_EMAILS is set, restricts access to those accounts.
 */
export function requireAdminPage(req: Request, res: Response, next: NextFunction): void {
  loadUser(req)
    .then((ok) => {
      if (!ok) {
        res.redirect(`${env.FRONTEND_URL}/login`);
        return;
      }
      if (env.ADMIN_EMAILS.length > 0 && !env.ADMIN_EMAILS.includes(req.user!.email.toLowerCase())) {
        next(forbidden('Bull Board is restricted to administrators'));
        return;
      }
      next();
    })
    .catch(next);
}
