import type { Express } from 'express';
import { z } from 'zod';
import type { TenantContext } from '@/shared/types/tenant-context';
import { CreateStaffSchema, StaffListQuerySchema, UpdateStaffSchema } from '@/shared/schemas/staff';
import { defineExpressRoute } from './define-express-route';
import { AppError } from './errors';
import { StaffService } from '../services/staff-service';

const service = new StaffService();
const idParams = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }).strict();
const implemented = new Set(['STF-01', 'STF-02', 'STF-03', 'STF-04']);

export function registerStaffRoutes(app: Express): void {
  app.get('/api/staff', defineExpressRoute({ id: 'STF-01', method: 'GET', path: '/api/staff', auth: 'session', permission: 'staff:read', contextSource: 'SESSION', querySchema: StaffListQuerySchema, handler: ({ context, query }) => service.list(context as TenantContext, query) }));
  app.post('/api/staff', defineExpressRoute({ id: 'STF-02', method: 'POST', path: '/api/staff', auth: 'session', permission: 'staff:write', contextSource: 'SESSION', bodySchema: CreateStaffSchema, handler: async ({ context, body }) => {
    if ('email' in body && body.email) throw new AppError('INTERNAL', 501, 'Team invitation support is pending.');
    const staff = await service.create(context as TenantContext, body);
    return Response.json({ data: staff, meta: { staffSchedules: [] } }, { status: 201 });
  } }));
  app.get('/api/staff/:id', defineExpressRoute({ id: 'STF-03', method: 'GET', path: '/api/staff/:id', auth: 'session', permission: 'staff:read', contextSource: 'SESSION', paramsSchema: idParams, handler: ({ context, params }) => service.get(context as TenantContext, params.id) }));
  app.patch('/api/staff/:id', defineExpressRoute({ id: 'STF-04', method: 'PATCH', path: '/api/staff/:id', auth: 'session', permission: 'staff:write', contextSource: 'SESSION', paramsSchema: idParams, bodySchema: UpdateStaffSchema, handler: ({ context, params, body }) => {
    if ('isActive' in body) throw new AppError('INTERNAL', 501, 'Staff deactivation requires the appointment and membership safeguards.');
    return service.update(context as TenantContext, params.id, body);
  } }));
}

export { implemented as IMPLEMENTED_STAFF_ROUTE_IDS };
