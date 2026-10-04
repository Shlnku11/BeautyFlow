import type { Express } from 'express';
import { z } from 'zod';
import type { TenantContext } from '@/shared/types/tenant-context';
import { CreateServiceSchema, ServiceListQuerySchema, UpdateServiceSchema } from '@/shared/schemas/services';
import { defineExpressRoute } from './define-express-route';
import { ServiceCatalogService } from '../services/service-catalog-service';

const service = new ServiceCatalogService();
const idParams = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }).strict();
export const IMPLEMENTED_SERVICE_ROUTE_IDS = new Set(['SVC-01', 'SVC-02', 'SVC-04']);

export function registerServiceRoutes(app: Express): void {
  app.get('/api/services', defineExpressRoute({ id: 'SVC-01', method: 'GET', path: '/api/services', auth: 'session', permission: 'services:read', contextSource: 'SESSION', querySchema: ServiceListQuerySchema, handler: ({ context, query }) => service.list(context as TenantContext, query) }));
  app.post('/api/services', defineExpressRoute({ id: 'SVC-02', method: 'POST', path: '/api/services', auth: 'session', permission: 'services:write', contextSource: 'SESSION', bodySchema: CreateServiceSchema, handler: async ({ context, body }) => Response.json({ data: await service.create(context as TenantContext, body) }, { status: 201 }) }));
  app.patch('/api/services/:id', defineExpressRoute({ id: 'SVC-04', method: 'PATCH', path: '/api/services/:id', auth: 'session', permission: 'services:write', contextSource: 'SESSION', paramsSchema: idParams, bodySchema: UpdateServiceSchema, handler: ({ context, params, body }) => service.update(context as TenantContext, params.id, body) }));
}
