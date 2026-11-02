import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { BULL_BOARD_PATH, createBullBoardRouter } from './admin/bullBoard';
import { env } from './config/env';
import { requireAdminPage } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { sessionMiddleware } from './middleware/session';
import { apiRouter } from './routes';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Bull Board ships inline scripts/styles; it gets a relaxed CSP and is mounted before helmet.
  app.use(BULL_BOARD_PATH, sessionMiddleware, requireAdminPage, createBullBoardRouter());

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(sessionMiddleware);

  app.use('/api', apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
