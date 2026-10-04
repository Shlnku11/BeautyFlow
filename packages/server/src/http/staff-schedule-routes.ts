import type { Express } from 'express';
import { z } from 'zod';
import type { TenantContext } from '@/shared/types/tenant-context';
import { StaffExceptionSchema, WeeklyScheduleSchema } from '@/shared/schemas/schedule';
import { defineExpressRoute } from './define-express-route';
import { noContent } from './responses';
import { StaffScheduleService } from '../services/staff-schedule-service';

const service = new StaffScheduleService();
const staffParams = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }).strict();
const exceptionParams = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i), date: z.iso.date() }).strict();
const exceptionQuery = z.object({ from: z.iso.date(), to: z.iso.date() }).strict().refine((range) => range.from <= range.to);
export const IMPLEMENTED_SCHEDULE_ROUTE_IDS = new Set(['STF-06', 'STF-07', 'STF-08', 'STF-09', 'STF-10']);

export function registerStaffScheduleRoutes(app: Express): void {
  app.get('/api/staff/:id/schedule', defineExpressRoute({ id: 'STF-06', method: 'GET', path: '/api/staff/:id/schedule', auth: 'session', permission: 'staff:read', contextSource: 'SESSION', paramsSchema: staffParams, handler: ({ context, params }) => service.getWeekly(context as TenantContext, params.id) }));
  app.put('/api/staff/:id/schedule', defineExpressRoute({ id: 'STF-07', method: 'PUT', path: '/api/staff/:id/schedule', auth: 'session', permission: 'staff:schedule_write', contextSource: 'SESSION', paramsSchema: staffParams, bodySchema: WeeklyScheduleSchema, handler: ({ context, params, body }) => service.replaceWeekly(context as TenantContext, params.id, body.weekly) }));
  app.get('/api/staff/:id/exceptions', defineExpressRoute({ id: 'STF-08', method: 'GET', path: '/api/staff/:id/exceptions', auth: 'session', permission: 'staff:read', contextSource: 'SESSION', paramsSchema: staffParams, querySchema: exceptionQuery, handler: ({ context, params, query }) => service.listExceptions(context as TenantContext, params.id, query.from, query.to) }));
  app.post('/api/staff/:id/exceptions', defineExpressRoute({ id: 'STF-09', method: 'POST', path: '/api/staff/:id/exceptions', auth: 'session', permission: 'staff:schedule_write', contextSource: 'SESSION', paramsSchema: staffParams, bodySchema: StaffExceptionSchema, handler: ({ context, params, body }) => service.upsertException(context as TenantContext, params.id, body) }));
  app.delete('/api/staff/:id/exceptions/:date', defineExpressRoute({ id: 'STF-10', method: 'DELETE', path: '/api/staff/:id/exceptions/:date', auth: 'session', permission: 'staff:schedule_write', contextSource: 'SESSION', paramsSchema: exceptionParams, handler: async ({ context, params, requestId }) => { await service.deleteException(context as TenantContext, params.id, params.date); return noContent(requestId); } }));
}
