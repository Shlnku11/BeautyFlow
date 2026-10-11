import type { Express } from 'express';
import { z } from 'zod';
import type { TenantContext } from '@/shared/types/tenant-context';
import { AdjustInventorySchema, CreateInventoryItemSchema, UpdateInventoryItemSchema } from '@/shared/schemas/inventory';
import { defineExpressRoute } from './define-express-route';
import { InventoryService } from '../services/inventory-service';

const service = new InventoryService();
const idParams = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }).strict();
export const IMPLEMENTED_INVENTORY_ROUTE_IDS = new Set(['INV-01', 'INV-02', 'INV-03', 'INV-04', 'INV-05']);

export function registerInventoryRoutes(app: Express): void {
  app.get('/api/inventory', defineExpressRoute({ id: 'INV-01', method: 'GET', path: '/api/inventory', auth: 'session', permission: 'inventory:read', contextSource: 'SESSION', handler: ({ context }) => service.list(context as TenantContext) }));
  app.post('/api/inventory', defineExpressRoute({ id: 'INV-02', method: 'POST', path: '/api/inventory', auth: 'session', permission: 'inventory:write', contextSource: 'SESSION', bodySchema: CreateInventoryItemSchema, handler: async ({ context, body }) => Response.json({ data: await service.create(context as TenantContext, body) }, { status: 201 }) }));
  app.patch('/api/inventory/:id', defineExpressRoute({ id: 'INV-03', method: 'PATCH', path: '/api/inventory/:id', auth: 'session', permission: 'inventory:write', contextSource: 'SESSION', paramsSchema: idParams, bodySchema: UpdateInventoryItemSchema, handler: ({ context, params, body }) => service.update(context as TenantContext, params.id, body) }));
  app.post('/api/inventory/:id/adjust', defineExpressRoute({ id: 'INV-04', method: 'POST', path: '/api/inventory/:id/adjust', auth: 'session', permission: 'inventory:write', contextSource: 'SESSION', paramsSchema: idParams, bodySchema: AdjustInventorySchema, handler: ({ context, params, body }) => service.adjust(context as TenantContext, params.id, body) }));
  app.get('/api/inventory/:id/movements', defineExpressRoute({ id: 'INV-05', method: 'GET', path: '/api/inventory/:id/movements', auth: 'session', permission: 'inventory:read', contextSource: 'SESSION', paramsSchema: idParams, handler: ({ context, params }) => service.movements(context as TenantContext, params.id) }));
}
