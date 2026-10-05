import type { Express } from 'express';
import { z } from 'zod';
import type { TenantContext } from '@/shared/types/tenant-context';
import { CreateCustomerSchema, CustomerAppointmentsQuerySchema, CustomerListQuerySchema, UpdateCustomerSchema } from '@/shared/schemas/customers';
import { defineExpressRoute } from './define-express-route';
import { CustomerService } from '../services/customer-service';

const service = new CustomerService();
const idParams = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }).strict();
export const IMPLEMENTED_CUSTOMER_ROUTE_IDS = new Set(['CUS-01', 'CUS-02', 'CUS-03', 'CUS-04', 'CUS-06']);

export function registerCustomerRoutes(app: Express): void {
  app.get('/api/customers', defineExpressRoute({ id: 'CUS-01', method: 'GET', path: '/api/customers', auth: 'session', permission: 'customers:read', contextSource: 'SESSION', querySchema: CustomerListQuerySchema, handler: async ({ context, query }) => {
    const result = await service.list(context as TenantContext, query);
    return Response.json({ data: result.data, meta: result.meta });
  } }));
  app.post('/api/customers', defineExpressRoute({ id: 'CUS-02', method: 'POST', path: '/api/customers', auth: 'session', permission: 'customers:write', contextSource: 'SESSION', bodySchema: CreateCustomerSchema, handler: async ({ context, body }) => Response.json({ data: await service.create(context as TenantContext, body) }, { status: 201 }) }));
  app.get('/api/customers/:id', defineExpressRoute({ id: 'CUS-03', method: 'GET', path: '/api/customers/:id', auth: 'session', permission: 'customers:read', contextSource: 'SESSION', paramsSchema: idParams, handler: ({ context, params }) => service.get(context as TenantContext, params.id) }));
  app.patch('/api/customers/:id', defineExpressRoute({ id: 'CUS-04', method: 'PATCH', path: '/api/customers/:id', auth: 'session', permission: 'customers:write', contextSource: 'SESSION', paramsSchema: idParams, bodySchema: UpdateCustomerSchema, handler: ({ context, params, body }) => service.update(context as TenantContext, params.id, body) }));
  app.get('/api/customers/:id/appointments', defineExpressRoute({ id: 'CUS-06', method: 'GET', path: '/api/customers/:id/appointments', auth: 'session', permission: 'customers:read', contextSource: 'SESSION', paramsSchema: idParams, querySchema: CustomerAppointmentsQuerySchema, handler: async ({ context, params, query }) => {
    const result = await service.appointments(context as TenantContext, params.id, query);
    return Response.json({ data: result.data, meta: result.meta });
  } }));
}
