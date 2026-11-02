import { OAuth2Client } from 'google-auth-library';
import type { User } from '@prisma/client';
import { env, googleConfigured } from '../config/env';
import { prisma } from '../db/prisma';
import { badRequest, serviceUnavailable, unauthorized } from '../utils/errors';
import { ensureDefaultSender } from './sender.service';

let client: OAuth2Client | null = null;

function googleClient(): OAuth2Client {
  if (!googleConfigured) {
    throw serviceUnavailable(
      'Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI.',
    );
  }
  client ??= new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
  });
  return client;
}

export function buildGoogleAuthUrl(state: string): string {
  return googleClient().generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
  });
}

/**
 * Exchanges the authorization code, then verifies the ID token's signature, audience, issuer and
 * expiry server-side before trusting any identity claims.
 */
export async function completeGoogleLogin(code: string): Promise<User> {
  const oauth = googleClient();
  const { tokens } = await oauth.getToken(code);
  if (!tokens.id_token) throw unauthorized('Google did not return an ID token');

  const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) throw unauthorized('Google ID token is missing required claims');
  if (!payload.email_verified) throw badRequest('Google account email is not verified');

  const email = payload.email.toLowerCase();
  const user = await prisma.user.upsert({
    where: { googleId: payload.sub },
    create: {
      googleId: payload.sub,
      email,
      name: payload.name ?? email,
      avatarUrl: payload.picture ?? null,
    },
    update: { email, name: payload.name ?? email, avatarUrl: payload.picture ?? null },
  });

  await ensureDefaultSender(user.id);
  return user;
}
