import type { Express } from 'express';
import { z } from 'zod';
import type { TenantContext } from '@/shared/types/tenant-context';
import { CreateWaitlistEntrySchema, UpdateWaitlistEntrySchema, WaitlistListQuerySchema } from '@/shared/schemas/waitlist';
import { defineExpressRoute } from './define-express-route';
import { WaitlistService } from '../services/waitlist-service';

const service = new WaitlistService();
const idParams = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }).strict();
export const IMPLEMENTED_WAITLIST_ROUTE_IDS = new Set(['WAI-01', 'WAI-02', 'WAI-03']);

export function registerWaitlistRoutes(app: Express): void {
  app.get('/api/waitlist', defineExpressRoute({ id: 'WAI-01', method: 'GET', path: '/api/waitlist', auth: 'session', permission: 'waitlist:read', contextSource: 'SESSION', querySchema: WaitlistListQuerySchema, handler: ({ context, query }) => service.list(context as TenantContext, query.status) }));
  app.post('/api/waitlist', defineExpressRoute({ id: 'WAI-02', method: 'POST', path: '/api/waitlist', auth: 'session', permission: 'waitlist:write', contextSource: 'SESSION', bodySchema: CreateWaitlistEntrySchema, handler: async ({ context, body }) => Response.json({ data: await service.create(context as TenantContext, body) }, { status: 201 }) }));
  app.patch('/api/waitlist/:id', defineExpressRoute({ id: 'WAI-03', method: 'PATCH', path: '/api/waitlist/:id', auth: 'session', permission: 'waitlist:write', contextSource: 'SESSION', paramsSchema: idParams, bodySchema: UpdateWaitlistEntrySchema, handler: ({ context, params, body }) => service.update(context as TenantContext, params.id, body.status) }));
}
