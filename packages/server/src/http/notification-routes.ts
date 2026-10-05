import type { Express } from 'express';
import { z } from 'zod';
import { runNotificationBatch } from '../notifications/run-batch';
import { defineExpressRoute } from './define-express-route';

const RunBatchSchema = z.object({ limit: z.number().int().min(1).max(500).optional() }).strict();
export const IMPLEMENTED_NOTIFICATION_ROUTE_IDS = new Set(['SYS-02']);

export function registerNotificationRoutes(app: Express): void {
  app.post('/api/internal/jobs/notifications/run', defineExpressRoute({
    id: 'SYS-02', method: 'POST', path: '/api/internal/jobs/notifications/run', auth: 'cron', contextSource: 'CRON',
    rateLimit: 'RL-JOB', bodySchema: RunBatchSchema,
    handler: ({ body }) => runNotificationBatch(body.limit === undefined ? {} : { limit: body.limit }),
  }));
}
