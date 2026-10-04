import type { Express } from 'express';
import type { TenantContext } from '@/shared/types/tenant-context';
import { AvailabilityQuerySchema } from '@/shared/schemas/availability';
import { defineExpressRoute } from './define-express-route';
import { AvailabilityService } from '../services/availability-service';

const service = new AvailabilityService();
export const IMPLEMENTED_AVAILABILITY_ROUTE_IDS = new Set(['AVL-01']);

export function registerAvailabilityRoutes(app: Express): void {
  app.get('/api/availability', defineExpressRoute({ id: 'AVL-01', method: 'GET', path: '/api/availability', auth: 'session', permission: 'appointments:create', contextSource: 'SESSION', querySchema: AvailabilityQuerySchema, handler: ({ context, query }) => service.get(context as TenantContext, query) }));
}
