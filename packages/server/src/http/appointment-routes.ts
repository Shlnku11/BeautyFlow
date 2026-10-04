import type { Express } from 'express';
import type { TenantContext } from '@/shared/types/tenant-context';
import { CreateAppointmentSchema } from '@/shared/schemas/appointments';
import { defineExpressRoute } from './define-express-route';
import { AppointmentService } from '../services/appointment-service';

const service = new AppointmentService();
export const IMPLEMENTED_APPOINTMENT_ROUTE_IDS = new Set(['APT-02']);

export function registerAppointmentRoutes(app: Express): void {
  app.post('/api/appointments', defineExpressRoute({ id: 'APT-02', method: 'POST', path: '/api/appointments', auth: 'session', permission: 'appointments:create', contextSource: 'SESSION', bodySchema: CreateAppointmentSchema, handler: async ({ context, body, request }) => {
    const key = request.headers.get('idempotency-key') ?? undefined;
    const result = await service.create(context as TenantContext, body, key);
    return Response.json({ data: result.appointment }, { status: result.statusCode });
  } }));
}
