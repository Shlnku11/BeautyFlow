import type { Express } from 'express';
import { z } from 'zod';
import type { TenantContext } from '@/shared/types/tenant-context';
import { ActivityListQuerySchema, AuditListQuerySchema } from '@/shared/schemas/shifts';
import { ActivityService } from '../services/activity-service';
import { defineExpressRoute } from './define-express-route';

const service = new ActivityService();
const empty = z.object({}).strict();
export const IMPLEMENTED_ACTIVITY_ROUTE_IDS = new Set(['ACT-01', 'ACT-02', 'AUD-01']);

export function registerActivityRoutes(app: Express): void {
  app.get('/api/activity', defineExpressRoute({ id: 'ACT-01', method: 'GET', path: '/api/activity', auth: 'session', permission: 'notifications:read', contextSource: 'SESSION', querySchema: ActivityListQuerySchema, handler: ({ context, query }) => service.list(context as TenantContext, query.limit) }));
  app.post('/api/activity/read', defineExpressRoute({ id: 'ACT-02', method: 'POST', path: '/api/activity/read', auth: 'session', permission: 'notifications:read', contextSource: 'SESSION', bodySchema: empty, handler: ({ context }) => service.markRead(context as TenantContext) }));
  app.get('/api/audit', defineExpressRoute({ id: 'AUD-01', method: 'GET', path: '/api/audit', auth: 'session', permission: 'audit:read', contextSource: 'SESSION', querySchema: AuditListQuerySchema, handler: ({ context, query }) => service.audit(context as TenantContext, query) }));
}
