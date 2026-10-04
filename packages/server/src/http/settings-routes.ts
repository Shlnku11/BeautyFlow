import type { Express } from 'express';
import type { TenantContext } from '@/shared/types/tenant-context';
import { BookingSettingsSchema, BusinessSettingsSchema } from '@/shared/schemas/settings';
import { defineExpressRoute } from './define-express-route';
import { SettingsService } from '../services/settings-service';

const service = new SettingsService();
export const IMPLEMENTED_SETTINGS_ROUTE_IDS = new Set(['SET-01', 'SET-02', 'SET-03']);

export function registerSettingsRoutes(app: Express): void {
  app.get('/api/settings', defineExpressRoute({ id: 'SET-01', method: 'GET', path: '/api/settings', auth: 'session', permission: 'settings:business_read', contextSource: 'SESSION', handler: ({ context }) => service.get(context as TenantContext) }));
  app.patch('/api/settings/business', defineExpressRoute({ id: 'SET-02', method: 'PATCH', path: '/api/settings/business', auth: 'session', permission: 'settings:business_write', contextSource: 'SESSION', bodySchema: BusinessSettingsSchema, handler: ({ context, body }) => service.updateBusiness(context as TenantContext, body) }));
  app.patch('/api/settings/booking', defineExpressRoute({ id: 'SET-03', method: 'PATCH', path: '/api/settings/booking', auth: 'session', permission: 'settings:booking_write', contextSource: 'SESSION', bodySchema: BookingSettingsSchema, handler: ({ context, body }) => service.updateBooking(context as TenantContext, body) }));
}
