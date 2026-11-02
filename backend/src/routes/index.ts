import { Router } from 'express';
import * as attachments from '../controllers/attachment.controller';
import * as auth from '../controllers/auth.controller';
import * as emails from '../controllers/email.controller';
import * as senders from '../controllers/sender.controller';
import * as slack from '../controllers/slack.controller';
import { requireAuth } from '../middleware/auth';
import { attachmentUpload, recipientListUpload } from '../middleware/upload';
import { validate } from '../middleware/validate';
import { asyncHandler as h } from '../utils/asyncHandler';
import {
  createSenderSchema,
  idParamSchema,
  listEmailsQuerySchema,
  scheduleEmailSchema,
  searchQuerySchema,
  starSchema,
  updateSenderSchema,
} from '../validators/schemas';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ---- Auth -------------------------------------------------------------------------------------
apiRouter.get('/auth/config', auth.authConfig);
apiRouter.get('/auth/google', h(auth.startGoogleLogin));
apiRouter.get('/auth/google/callback', h(auth.googleCallback));
apiRouter.get('/auth/me', requireAuth, auth.me);
apiRouter.post('/auth/logout', h(auth.logout));

// ---- Slack (callback is public; identity comes from the signed state) --------------------------
apiRouter.get('/slack/callback', h(slack.callback));

// Everything below requires an authenticated session.
apiRouter.use(requireAuth);

apiRouter.get('/slack/status', h(slack.status));
apiRouter.get('/slack/install', h(slack.install));
apiRouter.delete('/slack', h(slack.disconnect));
apiRouter.post('/slack/test', h(slack.test));

// ---- Senders ----------------------------------------------------------------------------------
apiRouter.get('/senders', h(senders.list));
apiRouter.post('/senders', validate(createSenderSchema), h(senders.create));
apiRouter.patch('/senders/:id', validate(idParamSchema, 'params'), validate(updateSenderSchema), h(senders.update));

// ---- Emails -----------------------------------------------------------------------------------
apiRouter.post('/emails/schedule', validate(scheduleEmailSchema), h(emails.schedule));
apiRouter.get('/emails/counts', h(emails.counts));
apiRouter.get('/emails/search', validate(searchQuerySchema, 'query'), h(emails.search));
apiRouter.get('/emails/scheduled', validate(listEmailsQuerySchema, 'query'), h(emails.list('scheduled')));
apiRouter.get('/emails/sent', validate(listEmailsQuerySchema, 'query'), h(emails.list('sent')));
apiRouter.get('/emails/failed', validate(listEmailsQuerySchema, 'query'), h(emails.list('failed')));
apiRouter.get('/emails/:id', validate(idParamSchema, 'params'), h(emails.detail));
apiRouter.patch('/emails/:id/star', validate(idParamSchema, 'params'), validate(starSchema), h(emails.star));
apiRouter.post('/emails/:id/cancel', validate(idParamSchema, 'params'), h(emails.cancel));

apiRouter.post('/recipients/parse', recipientListUpload.single('file'), emails.parseRecipientFile);

// ---- Attachments ------------------------------------------------------------------------------
apiRouter.post('/attachments', attachmentUpload.array('files', 10), h(attachments.upload));
apiRouter.get('/attachments/:id', validate(idParamSchema, 'params'), h(attachments.download));
