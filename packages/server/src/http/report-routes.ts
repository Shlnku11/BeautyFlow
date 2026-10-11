import type { Express } from 'express';
import type { TenantContext } from '@/shared/types/tenant-context';
import { FinancialReportQuerySchema } from '@/shared/schemas/shifts';
import { FinancialReportService } from '../services/financial-report-service';
import { defineExpressRoute } from './define-express-route';

const service = new FinancialReportService();
export const IMPLEMENTED_REPORT_ROUTE_IDS = new Set(['RPT-01']);

export function registerReportRoutes(app: Express): void {
  app.get('/api/reports/financial', defineExpressRoute({ id: 'RPT-01', method: 'GET', path: '/api/reports/financial', auth: 'session', permission: 'dashboard:read', contextSource: 'SESSION', querySchema: FinancialReportQuerySchema, handler: ({ context, query }) => service.get(context as TenantContext, query.from, query.to) }));
}
