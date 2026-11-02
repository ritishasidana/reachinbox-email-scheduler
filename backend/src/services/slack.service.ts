import crypto from 'crypto';
import { WebClient } from '@slack/web-api';
import type { SlackIntegration } from '@prisma/client';
import { env, slackConfigured } from '../config/env';
import { prisma } from '../db/prisma';
import { redis } from '../db/redis';
import { signToken, verifyToken } from '../utils/crypto';
import { badRequest, errorMessage, serviceUnavailable } from '../utils/errors';
import { logger } from '../utils/logger';
import { decryptSecret, encryptSecret } from '../utils/secrets';

const STATE_TTL_MS = 10 * 60 * 1000;
const nonceKey = (nonce: string) => `slack:oauth-nonce:${nonce}`;

function assertConfigured(): void {
  if (!slackConfigured) {
    throw serviceUnavailable(
      'Slack OAuth is not configured. Set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET and SLACK_REDIRECT_URI.',
    );
  }
}

/**
 * Builds the Slack "Add to Slack" URL. `state` is HMAC-signed, expiring and single-use (nonce in
 * Redis) so the callback is CSRF-protected and does not depend on the session cookie — useful when
 * the redirect URI is an HTTPS tunnel on a different host than the dashboard.
 */
export async function buildSlackInstallUrl(userId: string): Promise<string> {
  assertConfigured();
  const nonce = crypto.randomBytes(16).toString('hex');
  await redis.set(nonceKey(nonce), userId, 'PX', STATE_TTL_MS);
  const state = signToken(env.SESSION_SECRET, { userId, nonce }, STATE_TTL_MS);
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID!,
    scope: env.SLACK_SCOPES,
    redirect_uri: env.SLACK_REDIRECT_URI!,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

export async function completeSlackInstall(code: string, state: string): Promise<SlackIntegration> {
  assertConfigured();
  const payload = verifyToken<{ userId: string; nonce: string }>(env.SESSION_SECRET, state);
  if (!payload) throw badRequest('Invalid or expired Slack OAuth state');
  // Single use: GETDEL fails a replayed state.
  const storedUser = await redis.getdel(nonceKey(payload.nonce));
  if (storedUser !== payload.userId) throw badRequest('Slack OAuth state was already used or is invalid');

  const response = await new WebClient().oauth.v2.access({
    client_id: env.SLACK_CLIENT_ID!,
    client_secret: env.SLACK_CLIENT_SECRET!,
    code,
    redirect_uri: env.SLACK_REDIRECT_URI!,
  });
  if (!response.ok || !response.access_token || !response.team?.id) {
    throw badRequest(`Slack OAuth failed: ${response.error ?? 'unknown error'}`);
  }

  const webhook = response.incoming_webhook;
  const data = {
    teamId: response.team.id,
    teamName: response.team.name ?? null,
    channelId: webhook?.channel_id ?? env.SLACK_DEFAULT_CHANNEL ?? null,
    channelName: webhook?.channel ?? env.SLACK_DEFAULT_CHANNEL ?? null,
    botUserId: response.bot_user_id ?? null,
    scope: response.scope ?? env.SLACK_SCOPES,
    accessTokenEncrypted: encryptSecret(response.access_token),
    webhookUrlEncrypted: webhook?.url ? encryptSecret(webhook.url) : null,
  };

  const integration = await prisma.slackIntegration.upsert({
    where: { userId: payload.userId },
    create: { userId: payload.userId, ...data },
    update: data,
  });
  logger.info({ userId: payload.userId, teamId: data.teamId }, 'Slack connected');
  return integration;
}

export async function getSlackStatus(userId: string) {
  const integration = await prisma.slackIntegration.findUnique({ where: { userId } });
  return {
    configured: slackConfigured,
    connected: Boolean(integration),
    teamName: integration?.teamName ?? null,
    channelName: integration?.channelName ?? null,
    connectedAt: integration?.createdAt ?? null,
  };
}

export async function disconnectSlack(userId: string): Promise<void> {
  const integration = await prisma.slackIntegration.findUnique({ where: { userId } });
  if (!integration) return;
  try {
    await new WebClient(decryptSecret(integration.accessTokenEncrypted)).auth.revoke();
  } catch (err) {
    // Token may already be revoked/uninstalled on Slack's side — still remove it locally.
    logger.warn({ err: errorMessage(err), userId }, 'Slack token revoke failed; removing integration anyway');
  }
  await prisma.slackIntegration.delete({ where: { userId } });
  logger.info({ userId }, 'Slack disconnected');
}

/** Errors that mean the integration is no longer usable; retrying will not help. */
const FATAL_SLACK_ERRORS = new Set(['invalid_auth', 'token_revoked', 'account_inactive', 'not_authed', 'channel_not_found']);

export class SlackSkipError extends Error {}

/**
 * Posts a message for the user. Returns false (without throwing) if Slack is not connected.
 * Uses chat.postMessage with the bot token; falls back to the incoming webhook chosen during install.
 */
export async function postSlackMessage(userId: string, text: string, blocks?: object[]): Promise<boolean> {
  const integration = await prisma.slackIntegration.findUnique({ where: { userId } });
  if (!integration) return false;

  const token = decryptSecret(integration.accessTokenEncrypted);
  if (integration.channelId) {
    try {
      await new WebClient(token).chat.postMessage({ channel: integration.channelId, text, blocks: blocks as never });
      return true;
    } catch (err) {
      const code = (err as { data?: { error?: string } }).data?.error;
      if (!integration.webhookUrlEncrypted) {
        if (code && FATAL_SLACK_ERRORS.has(code)) throw new SlackSkipError(`Slack error: ${code}`);
        throw err;
      }
      logger.warn({ code, userId }, 'chat.postMessage failed; falling back to incoming webhook');
    }
  }

  if (integration.webhookUrlEncrypted) {
    const res = await fetch(decryptSecret(integration.webhookUrlEncrypted), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, blocks }),
    });
    if (res.status === 403 || res.status === 404 || res.status === 410) {
      throw new SlackSkipError(`Slack webhook rejected (${res.status}): ${await res.text()}`);
    }
    if (!res.ok) throw new Error(`Slack webhook failed (${res.status}): ${await res.text()}`);
    return true;
  }

  throw new SlackSkipError('Slack integration has no channel to post to');
}
