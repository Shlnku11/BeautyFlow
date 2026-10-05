import type { Express } from 'express';
import type { TenantContext } from '@/shared/types/tenant-context';
import { CalendarQuerySchema } from '@/shared/schemas/calendar';
import { CalendarService } from '../services/calendar-service';
import { defineExpressRoute } from './define-express-route';

const service = new CalendarService();
export const IMPLEMENTED_CALENDAR_ROUTE_IDS = new Set(['CAL-01']);

export function registerCalendarRoutes(app: Express): void {
  app.get('/api/calendar', defineExpressRoute({
    id: 'CAL-01', method: 'GET', path: '/api/calendar', auth: 'session', permission: 'calendar:read', contextSource: 'SESSION', rateLimit: 'RL-API',
    querySchema: CalendarQuerySchema,
    handler: ({ context, query }) => service.get(context as TenantContext, query),
  }));
}
