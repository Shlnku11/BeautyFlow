import express, { type Express } from 'express';
import { connectToDatabase } from './db/connection';
import { logger } from './http/logger';
import { defineExpressRoute } from './http/define-express-route';
import { AppError } from './http/errors';
import { MVP_ROUTE_CONTRACTS } from './http/route-contracts';
import { PERMISSION_SCOPES, type PermissionKey } from './domain/permissions';
import type { RateLimitPolicy } from './http/rate-limit';
import { configureAuthRouteRuntime } from './auth/route-runtime';
import { IMPLEMENTED_AUTH_ROUTE_IDS, registerAuthRoutes } from './http/auth-routes';
import { configurePersistentRateLimit } from './http/rate-limit-adapter';
import { getEnv } from './config/env';
import { IMPLEMENTED_STAFF_ROUTE_IDS, registerStaffRoutes } from './http/staff-routes';
import { IMPLEMENTED_SERVICE_ROUTE_IDS, registerServiceRoutes } from './http/service-routes';
import { IMPLEMENTED_SCHEDULE_ROUTE_IDS, registerStaffScheduleRoutes } from './http/staff-schedule-routes';
import { IMPLEMENTED_CUSTOMER_ROUTE_IDS, registerCustomerRoutes } from './http/customer-routes';
import { IMPLEMENTED_SETTINGS_ROUTE_IDS, registerSettingsRoutes } from './http/settings-routes';
import { IMPLEMENTED_AVAILABILITY_ROUTE_IDS, registerAvailabilityRoutes } from './http/availability-routes';
import { IMPLEMENTED_APPOINTMENT_ROUTE_IDS, registerAppointmentRoutes } from './http/appointment-routes';
import { IMPLEMENTED_PUBLIC_BOOKING_ROUTE_IDS, registerPublicBookingRoutes } from './http/public-booking-routes';
import { IMPLEMENTED_BLOCKED_PERIOD_ROUTE_IDS, registerBlockedPeriodRoutes } from './http/blocked-period-routes';
import { IMPLEMENTED_MEMBER_ROUTE_IDS, registerMemberRoutes } from './http/member-routes';
import { IMPLEMENTED_CALENDAR_ROUTE_IDS, registerCalendarRoutes } from './http/calendar-routes';
import { IMPLEMENTED_NOTIFICATION_ROUTE_IDS, registerNotificationRoutes } from './http/notification-routes';

export const app: Express = express();
configureAuthRouteRuntime();
configurePersistentRateLimit();
app.set('trust proxy', getEnv().TRUSTED_PROXY_HOPS);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb', strict: true }));
app.use((_, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.get('/api/health', defineExpressRoute({
  id: 'SYS-01',
  method: 'GET',
  path: '/api/health',
  auth: 'none',
  contextSource: 'NONE',
  handler: async ({ requestId }) => {
    try {
      const mongoose = await connectToDatabase();
      if (mongoose.connection.readyState !== 1) throw new Error('MongoDB connection is not ready');
      return Response.json({ status: 'ok', db: 'up' }, { headers: { 'X-Request-Id': requestId } });
    } catch {
      return Response.json({ status: 'unavailable', db: 'down' }, { status: 503, headers: { 'X-Request-Id': requestId } });
    }
  },
}));
registerAuthRoutes(app);
registerStaffRoutes(app);
registerServiceRoutes(app);
registerStaffScheduleRoutes(app);
registerCustomerRoutes(app);
registerSettingsRoutes(app);
registerAvailabilityRoutes(app);
registerAppointmentRoutes(app);
registerPublicBookingRoutes(app);
registerBlockedPeriodRoutes(app);
registerMemberRoutes(app);
registerCalendarRoutes(app);
registerNotificationRoutes(app);

function isPermissionKey(value: string): value is PermissionKey {
  return Object.hasOwn(PERMISSION_SCOPES, value);
}

const rateLimitPolicies: ReadonlySet<string> = new Set([
  'RL-LOGIN', 'RL-REGISTER', 'RL-RESET', 'RL-PUBLIC-READ', 'RL-PUBLIC-BOOK', 'RL-MANAGE', 'RL-API', 'RL-JOB',
]);

function isRateLimitPolicy(value: string): value is RateLimitPolicy {
  return rateLimitPolicies.has(value);
}

function defaultRateLimit(contract: (typeof MVP_ROUTE_CONTRACTS)[number]): RateLimitPolicy | undefined {
  if (contract.contextSource === 'CRON') return undefined;
  if (contract.auth === 'session') return 'RL-API';
  if (contract.path.startsWith('/api/public/manage/')) return 'RL-MANAGE';
  if (contract.path.startsWith('/api/public/')) return contract.method === 'get' ? 'RL-PUBLIC-READ' : 'RL-PUBLIC-BOOK';
  if (contract.id.startsWith('AUTH-') && ['AUTH-07','AUTH-08','AUTH-09'].includes(contract.id)) return 'RL-RESET';
  return undefined;
}

for (const contract of MVP_ROUTE_CONTRACTS) {
  if (IMPLEMENTED_AUTH_ROUTE_IDS.has(contract.id) || IMPLEMENTED_STAFF_ROUTE_IDS.has(contract.id) || IMPLEMENTED_SERVICE_ROUTE_IDS.has(contract.id) || IMPLEMENTED_SCHEDULE_ROUTE_IDS.has(contract.id) || IMPLEMENTED_CUSTOMER_ROUTE_IDS.has(contract.id) || IMPLEMENTED_SETTINGS_ROUTE_IDS.has(contract.id) || IMPLEMENTED_AVAILABILITY_ROUTE_IDS.has(contract.id) || IMPLEMENTED_APPOINTMENT_ROUTE_IDS.has(contract.id) || IMPLEMENTED_PUBLIC_BOOKING_ROUTE_IDS.has(contract.id) || IMPLEMENTED_BLOCKED_PERIOD_ROUTE_IDS.has(contract.id) || IMPLEMENTED_MEMBER_ROUTE_IDS.has(contract.id) || IMPLEMENTED_CALENDAR_ROUTE_IDS.has(contract.id) || IMPLEMENTED_NOTIFICATION_ROUTE_IDS.has(contract.id)) continue;
  const limit = contract.rateLimit && isRateLimitPolicy(contract.rateLimit)
    ? contract.rateLimit
    : defaultRateLimit(contract);
  const handler = defineExpressRoute({
    id: contract.id,
    method: contract.method.toUpperCase(),
    path: contract.path,
    auth: contract.auth,
    contextSource: contract.contextSource,
    ...(contract.permission && isPermissionKey(contract.permission) ? { permission: contract.permission } : {}),
    ...(limit ? { rateLimit: limit } : {}),
    handler: async () => {
      throw new AppError('INTERNAL', 501, `Handler ${contract.id} has not been implemented`);
    },
  });
  const route = app.route(contract.path);
  switch (contract.method) {
    case 'get': route.get(handler); break;
    case 'post': route.post(handler); break;
    case 'patch': route.patch(handler); break;
    case 'put': route.put(handler); break;
    case 'delete': route.delete(handler); break;
  }
}

app.use((_request, response) => response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Не найдено' } }));
app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
  void next;
  logger.error({ err: error }, 'unhandled express error');
  response.status(500).json({ error: { code: 'INTERNAL', message: 'Внутренняя ошибка' } });
});

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => logger.info({ port }, 'api server listening'));
}
