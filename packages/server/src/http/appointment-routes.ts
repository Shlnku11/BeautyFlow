import type { Express } from 'express';
import type { TenantContext } from '@/shared/types/tenant-context';
import { AppointmentListQuerySchema, AppointmentStatusSchema, CreateAppointmentSchema, RescheduleAppointmentSchema, UpdateAppointmentSchema } from '@/shared/schemas/appointments';
import { defineExpressRoute } from './define-express-route';
import { AppointmentService } from '../services/appointment-service';
import { assertPermission } from '../domain/permissions';
import { z } from 'zod';
import { NotFoundError } from './errors';

const service = new AppointmentService();
const idSchema = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }).strict();
export const IMPLEMENTED_APPOINTMENT_ROUTE_IDS = new Set(['APT-01', 'APT-02', 'APT-03', 'APT-04', 'APT-05', 'APT-06']);

export function registerAppointmentRoutes(app: Express): void {
  app.get('/api/appointments', defineExpressRoute({ id: 'APT-01', method: 'GET', path: '/api/appointments', auth: 'session', contextSource: 'SESSION', querySchema: AppointmentListQuerySchema, handler: ({ context, query }) => { const ctx = context as TenantContext; assertPermission(ctx.role, 'appointments:read'); if (ctx.role === 'master' && query.staffId && query.staffId !== ctx.staffId) throw new NotFoundError(); return service.list(ctx, query as unknown as Record<string, unknown>); } }));
  app.post('/api/appointments', defineExpressRoute({ id: 'APT-02', method: 'POST', path: '/api/appointments', auth: 'session', permission: 'appointments:create', contextSource: 'SESSION', bodySchema: CreateAppointmentSchema, handler: async ({ context, body, request }) => {
    const key = request.headers.get('idempotency-key') ?? undefined;
    const result = await service.create(context as TenantContext, body, key);
    return Response.json({ data: result.appointment }, { status: result.statusCode });
  } }));
  app.get('/api/appointments/:id', defineExpressRoute({ id: 'APT-03', method: 'GET', path: '/api/appointments/:id', auth: 'session', contextSource: 'SESSION', paramsSchema: idSchema, handler: ({ context, params }) => { assertPermission((context as TenantContext).role, 'appointments:read'); return service.get(context as TenantContext, params.id); } }));
  app.patch('/api/appointments/:id', defineExpressRoute({ id: 'APT-04', method: 'PATCH', path: '/api/appointments/:id', auth: 'session', contextSource: 'SESSION', paramsSchema: idSchema, bodySchema: UpdateAppointmentSchema, handler: ({ context, params, body }) => service.update(context as TenantContext, params.id, body as unknown as Record<string, unknown>) }));
  app.post('/api/appointments/:id/reschedule', defineExpressRoute({ id: 'APT-05', method: 'POST', path: '/api/appointments/:id/reschedule', auth: 'session', permission: 'appointments:reschedule', contextSource: 'SESSION', paramsSchema: idSchema, bodySchema: RescheduleAppointmentSchema, handler: ({ context, params, body }) => service.reschedule(context as TenantContext, params.id, body as unknown as Record<string, unknown>) }));
  app.post('/api/appointments/:id/status', defineExpressRoute({ id: 'APT-06', method: 'POST', path: '/api/appointments/:id/status', auth: 'session', contextSource: 'SESSION', paramsSchema: idSchema, bodySchema: AppointmentStatusSchema, handler: ({ context, params, body }) => { assertPermission((context as TenantContext).role, 'appointments:status'); return service.changeStatus(context as TenantContext, params.id, body as unknown as Record<string, unknown>); } }));
}
