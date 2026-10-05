import type { Express } from 'express';
import { z } from 'zod';
import type { TenantContext } from '@/shared/types/tenant-context';
import { BlockedPeriodListQuerySchema, CreateBlockedPeriodSchema, DeleteBlockedPeriodQuerySchema } from '@/shared/schemas/schedule';
import { defineExpressRoute } from './define-express-route';
import { noContent } from './responses';
import { BlockedPeriodService } from '../services/blocked-period-service';

const service = new BlockedPeriodService();
const idParams = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }).strict();
export const IMPLEMENTED_BLOCKED_PERIOD_ROUTE_IDS = new Set(['BLK-01', 'BLK-02', 'BLK-03']);

export function registerBlockedPeriodRoutes(app: Express): void {
  app.get('/api/blocked-periods', defineExpressRoute({
    id: 'BLK-01', method: 'GET', path: '/api/blocked-periods', auth: 'session', permission: 'calendar:read', contextSource: 'SESSION', querySchema: BlockedPeriodListQuerySchema,
    handler: ({ context, query }) => service.list(context as TenantContext, query),
  }));
  app.post('/api/blocked-periods', defineExpressRoute({
    id: 'BLK-02', method: 'POST', path: '/api/blocked-periods', auth: 'session', permission: 'blocks:write', contextSource: 'SESSION', bodySchema: CreateBlockedPeriodSchema,
    handler: async ({ context, body }) => Response.json({ data: await service.create(context as TenantContext, body) }, { status: 201 }),
  }));
  app.delete('/api/blocked-periods/:id', defineExpressRoute({
    id: 'BLK-03', method: 'DELETE', path: '/api/blocked-periods/:id', auth: 'session', permission: 'blocks:write', contextSource: 'SESSION', paramsSchema: idParams, querySchema: DeleteBlockedPeriodQuerySchema,
    handler: async ({ context, params, query, requestId }) => {
      await service.delete(context as TenantContext, params.id, query.group);
      return noContent(requestId);
    },
  }));
}
