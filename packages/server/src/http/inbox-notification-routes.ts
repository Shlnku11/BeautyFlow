import type { Express } from 'express';
import { z } from 'zod';
import type { TenantContext } from '@/shared/types/tenant-context';
import { BrowserPushSubscriptionSchema, NotificationInboxQuerySchema, NotificationPreferencesSchema, NotificationReadSchema } from '@/shared/schemas/settings';
import { defineExpressRoute } from './define-express-route';
import { NotificationService } from '../services/notification-service';

const service = new NotificationService();
const deleteSubscriptionSchema = z.object({ endpoint: z.url().max(2048) }).strict();
export const IMPLEMENTED_INBOX_NOTIFICATION_ROUTE_IDS = new Set(['NTF-01', 'NTF-02', 'NTF-03', 'NTF-04', 'NTF-05', 'NTF-06', 'NTF-07', 'NTF-08']);

export function registerInboxNotificationRoutes(app: Express): void {
  app.get('/api/notifications/inbox', defineExpressRoute({ id: 'NTF-01', method: 'GET', path: '/api/notifications/inbox', auth: 'session', permission: 'notifications:read', contextSource: 'SESSION', querySchema: NotificationInboxQuerySchema, handler: ({ context, query }) => service.inbox(context as TenantContext, query.limit) }));
  app.post('/api/notifications/inbox/read', defineExpressRoute({ id: 'NTF-02', method: 'POST', path: '/api/notifications/inbox/read', auth: 'session', permission: 'notifications:read', contextSource: 'SESSION', bodySchema: NotificationReadSchema, handler: ({ context, body }) => service.markRead(context as TenantContext, body.ids) }));
  app.get('/api/notifications/preferences', defineExpressRoute({ id: 'NTF-03', method: 'GET', path: '/api/notifications/preferences', auth: 'session', permission: 'account:self', contextSource: 'SESSION', handler: ({ context }) => service.preferences(context as TenantContext) }));
  app.patch('/api/notifications/preferences', defineExpressRoute({ id: 'NTF-04', method: 'PATCH', path: '/api/notifications/preferences', auth: 'session', permission: 'account:self', contextSource: 'SESSION', bodySchema: NotificationPreferencesSchema, handler: ({ context, body }) => service.updatePreferences(context as TenantContext, body) }));
  app.put('/api/notifications/push-subscription', defineExpressRoute({ id: 'NTF-05', method: 'PUT', path: '/api/notifications/push-subscription', auth: 'session', permission: 'account:self', contextSource: 'SESSION', bodySchema: BrowserPushSubscriptionSchema, handler: ({ context, body, request }) => service.subscribe(context as TenantContext, { endpoint: body.endpoint, keys: body.keys, ...(body.expirationTime === undefined ? {} : { expirationTime: body.expirationTime }) }, request.headers.get('user-agent') ?? undefined) }));
  app.delete('/api/notifications/push-subscription', defineExpressRoute({ id: 'NTF-06', method: 'DELETE', path: '/api/notifications/push-subscription', auth: 'session', permission: 'account:self', contextSource: 'SESSION', bodySchema: deleteSubscriptionSchema, handler: ({ context, body }) => service.unsubscribe(context as TenantContext, body.endpoint) }));
  app.post('/api/notifications/push-test', defineExpressRoute({ id: 'NTF-07', method: 'POST', path: '/api/notifications/push-test', auth: 'session', permission: 'account:self', contextSource: 'SESSION', bodySchema: z.object({}).strict(), handler: ({ context }) => service.testPush(context as TenantContext) }));
  app.delete('/api/notifications/push-subscriptions/:id', defineExpressRoute({ id: 'NTF-08', method: 'DELETE', path: '/api/notifications/push-subscriptions/:id', auth: 'session', permission: 'account:self', contextSource: 'SESSION', paramsSchema: z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }).strict(), handler: ({ context, params }) => service.revokeDevice(context as TenantContext, params.id) }));
}
