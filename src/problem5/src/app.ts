import express from 'express';
import type { Express } from 'express';

import { errorHandler, notFoundHandler } from './http/error-handler';
import { requestIdMiddleware } from './http/request-id';
import { campaignRouter } from './routes/campaigns';

/**
 * Factory rather than a module-level app: supertest needs an app that has not
 * bound a port, and `src/index.ts` owns listening.
 */
export function createApp(): Express {
  const app = express();

  // Before the body parser, deliberately: `express.json()` rejects malformed
  // JSON, oversized bodies and unsupported encodings, and anything mounted
  // after it never runs for those requests.
  app.use(requestIdMiddleware);
  app.use(express.json());

  // Liveness only - no database round trip, so it stays useful when the
  // database is the thing that is down.
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/campaigns', campaignRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
