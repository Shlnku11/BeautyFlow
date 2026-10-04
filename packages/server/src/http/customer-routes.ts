import type { Express } from 'express';
import { z } from 'zod';
import type { TenantContext } from '@/shared/types/tenant-context';
import { CreateCustomerSchema, CustomerListQuerySchema, UpdateCustomerSchema } from '@/shared/schemas/customers';
import { defineExpressRoute } from './define-express-route';
import { CustomerService } from '../services/customer-service';

const service = new CustomerService();
const idParams = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }).strict();
export const IMPLEMENTED_CUSTOMER_ROUTE_IDS = new Set(['CUS-01', 'CUS-02', 'CUS-04']);

export function registerCustomerRoutes(app: Express): void {
  app.get('/api/customers', defineExpressRoute({ id: 'CUS-01', method: 'GET', path: '/api/customers', auth: 'session', permission: 'customers:read', contextSource: 'SESSION', querySchema: CustomerListQuerySchema, handler: ({ context, query }) => service.list(context as TenantContext, query) }));
  app.post('/api/customers', defineExpressRoute({ id: 'CUS-02', method: 'POST', path: '/api/customers', auth: 'session', permission: 'customers:write', contextSource: 'SESSION', bodySchema: CreateCustomerSchema, handler: async ({ context, body }) => Response.json({ data: await service.create(context as TenantContext, body) }, { status: 201 }) }));
  app.patch('/api/customers/:id', defineExpressRoute({ id: 'CUS-04', method: 'PATCH', path: '/api/customers/:id', auth: 'session', permission: 'customers:write', contextSource: 'SESSION', paramsSchema: idParams, bodySchema: UpdateCustomerSchema, handler: ({ context, params, body }) => service.update(context as TenantContext, params.id, body) }));
}
