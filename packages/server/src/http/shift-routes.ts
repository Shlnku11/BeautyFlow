import type { Express } from 'express';
import { z } from 'zod';
import type { TenantContext } from '@/shared/types/tenant-context';
import { ShiftService } from '../services/shift-service';
import { defineExpressRoute } from './define-express-route';

const service = new ShiftService();
const empty = z.object({}).strict();
export const IMPLEMENTED_SHIFT_ROUTE_IDS = new Set(['SHF-01', 'SHF-02', 'SHF-03']);

export function registerShiftRoutes(app: Express): void {
  app.get('/api/shifts/current', defineExpressRoute({ id: 'SHF-01', method: 'GET', path: '/api/shifts/current', auth: 'session', permission: 'account:self', contextSource: 'SESSION', handler: ({ context }) => service.current(context as TenantContext) }));
  app.post('/api/shifts/start', defineExpressRoute({ id: 'SHF-02', method: 'POST', path: '/api/shifts/start', auth: 'session', permission: 'account:self', contextSource: 'SESSION', bodySchema: empty, handler: ({ context }) => service.start(context as TenantContext) }));
  app.post('/api/shifts/end', defineExpressRoute({ id: 'SHF-03', method: 'POST', path: '/api/shifts/end', auth: 'session', permission: 'account:self', contextSource: 'SESSION', bodySchema: empty, handler: ({ context }) => service.close(context as TenantContext) }));
}
