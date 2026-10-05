import type { Express } from 'express';
import type { TenantContext } from '@/shared/types/tenant-context';
import { DashboardQuerySchema, DashboardUpcomingQuerySchema, MasterDashboardQuerySchema } from '@/shared/schemas/dashboard';
import { DashboardService } from '../services/dashboard-service';
import { defineExpressRoute } from './define-express-route';

const service = new DashboardService();
export const IMPLEMENTED_DASHBOARD_ROUTE_IDS = new Set(['DSH-01', 'DSH-05', 'MST-01']);

export function registerDashboardRoutes(app: Express): void {
  app.get('/api/dashboard/summary', defineExpressRoute({ id: 'DSH-01', method: 'GET', path: '/api/dashboard/summary', auth: 'session', permission: 'dashboard:read', contextSource: 'SESSION', querySchema: DashboardQuerySchema, handler: ({ context, query }) => service.summary(context as TenantContext, query) }));
  app.get('/api/dashboard/upcoming', defineExpressRoute({ id: 'DSH-05', method: 'GET', path: '/api/dashboard/upcoming', auth: 'session', permission: 'dashboard:read', contextSource: 'SESSION', querySchema: DashboardUpcomingQuerySchema, handler: ({ context, query }) => service.upcoming(context as TenantContext, query) }));
  app.get('/api/master/dashboard', defineExpressRoute({ id: 'MST-01', method: 'GET', path: '/api/master/dashboard', auth: 'session', permission: 'dashboard:read_own', contextSource: 'SESSION', querySchema: MasterDashboardQuerySchema, handler: ({ context, query }) => service.master(context as TenantContext, query) }));
}
