import type { PermissionKey } from '../domain/permissions';
import type { RateLimitPolicy } from './rate-limit';

export interface RouteContract { readonly id: string; readonly method: string; readonly path: string; readonly auth: 'none' | 'session' | 'cron'; readonly contextSource: 'NONE' | 'SESSION' | 'SLUG' | 'TOKEN' | 'CRON'; readonly permission: PermissionKey | null; readonly rateLimit: RateLimitPolicy | null; }

export const MVP_ROUTE_CONTRACTS = [
  {
    "id": "AUTH-01",
    "method": "post",
    "path": "/api/auth/register-business",
    "auth": "none",
    "contextSource": "NONE",
    "permission": null,
    "rateLimit": "RL-REGISTER"
  },
  {
    "id": "AUTH-02",
    "method": "post",
    "path": "/api/auth/login",
    "auth": "none",
    "contextSource": "NONE",
    "permission": null,
    "rateLimit": "RL-LOGIN"
  },
  {
    "id": "AUTH-03",
    "method": "post",
    "path": "/api/auth/logout",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "account:self",
    "rateLimit": "RL-API"
  },
  {
    "id": "AUTH-04",
    "method": "get",
    "path": "/api/auth/me",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "account:self",
    "rateLimit": null
  },
  {
    "id": "AUTH-06",
    "method": "post",
    "path": "/api/auth/accept-invite",
    "auth": "none",
    "contextSource": "NONE",
    "permission": null,
    "rateLimit": "RL-RESET"
  },
  {
    "id": "AUTH-07",
    "method": "post",
    "path": "/api/auth/forgot-password",
    "auth": "none",
    "contextSource": "NONE",
    "permission": null,
    "rateLimit": "RL-RESET"
  },
  {
    "id": "AUTH-08",
    "method": "post",
    "path": "/api/auth/reset-password",
    "auth": "none",
    "contextSource": "NONE",
    "permission": null,
    "rateLimit": null
  },
  {
    "id": "AUTH-09",
    "method": "post",
    "path": "/api/auth/change-password",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "account:self",
    "rateLimit": "RL-API"
  },
  {
    "id": "AUTH-11",
    "method": "post",
    "path": "/api/auth/verify-email",
    "auth": "none",
    "contextSource": "NONE",
    "permission": null,
    "rateLimit": "RL-RESET"
  },
  {
    "id": "AUTH-12",
    "method": "post",
    "path": "/api/auth/resend-verification",
    "auth": "none",
    "contextSource": "NONE",
    "permission": null,
    "rateLimit": "RL-RESET"
  },
  {
    "id": "MEM-01",
    "method": "get",
    "path": "/api/members",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "members:read",
    "rateLimit": null
  },
  {
    "id": "MEM-03",
    "method": "patch",
    "path": "/api/members/:id",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "members:manage_role",
    "rateLimit": null
  },
  {
    "id": "MEM-04",
    "method": "post",
    "path": "/api/members/:id/resend-invite",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "members:invite",
    "rateLimit": null
  },
  {
    "id": "MST-01",
    "method": "get",
    "path": "/api/master/dashboard",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "dashboard:read_own",
    "rateLimit": null
  },
  {
    "id": "CUS-01",
    "method": "get",
    "path": "/api/customers",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "customers:read",
    "rateLimit": "RL-API"
  },
  {
    "id": "CUS-02",
    "method": "post",
    "path": "/api/customers",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "customers:write",
    "rateLimit": null
  },
  {
    "id": "CUS-03",
    "method": "get",
    "path": "/api/customers/:id",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "customers:read",
    "rateLimit": null
  },
  {
    "id": "CUS-04",
    "method": "patch",
    "path": "/api/customers/:id",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "customers:write",
    "rateLimit": null
  },
  {
    "id": "CUS-06",
    "method": "get",
    "path": "/api/customers/:id/appointments",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "customers:read",
    "rateLimit": null
  },
  {
    "id": "STF-01",
    "method": "get",
    "path": "/api/staff",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "staff:read",
    "rateLimit": null
  },
  {
    "id": "STF-02",
    "method": "post",
    "path": "/api/staff",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "staff:write",
    "rateLimit": null
  },
  {
    "id": "STF-03",
    "method": "get",
    "path": "/api/staff/:id",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "staff:read",
    "rateLimit": null
  },
  {
    "id": "STF-04",
    "method": "patch",
    "path": "/api/staff/:id",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "staff:write",
    "rateLimit": null
  },
  {
    "id": "STF-06",
    "method": "get",
    "path": "/api/staff/:id/schedule",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "staff:read",
    "rateLimit": null
  },
  {
    "id": "STF-07",
    "method": "put",
    "path": "/api/staff/:id/schedule",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "staff:schedule_write",
    "rateLimit": null
  },
  {
    "id": "STF-08",
    "method": "get",
    "path": "/api/staff/:id/exceptions",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "staff:read",
    "rateLimit": null
  },
  {
    "id": "STF-09",
    "method": "post",
    "path": "/api/staff/:id/exceptions",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "staff:schedule_write",
    "rateLimit": null
  },
  {
    "id": "STF-10",
    "method": "delete",
    "path": "/api/staff/:id/exceptions/:date",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "staff:schedule_write",
    "rateLimit": null
  },
  {
    "id": "STF-11",
    "method": "get",
    "path": "/api/staff/:id/services",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "staff:read",
    "rateLimit": null
  },
  {
    "id": "STF-12",
    "method": "put",
    "path": "/api/staff/:id/services",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "staff:write",
    "rateLimit": null
  },
  {
    "id": "BLK-01",
    "method": "get",
    "path": "/api/blocked-periods",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "calendar:read",
    "rateLimit": null
  },
  {
    "id": "BLK-02",
    "method": "post",
    "path": "/api/blocked-periods",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "blocks:write",
    "rateLimit": null
  },
  {
    "id": "BLK-03",
    "method": "delete",
    "path": "/api/blocked-periods/:id",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "blocks:write",
    "rateLimit": null
  },
  {
    "id": "SVC-01",
    "method": "get",
    "path": "/api/services",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "services:read",
    "rateLimit": null
  },
  {
    "id": "SVC-02",
    "method": "post",
    "path": "/api/services",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "services:write",
    "rateLimit": null
  },
  {
    "id": "SVC-04",
    "method": "patch",
    "path": "/api/services/:id",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "services:write",
    "rateLimit": null
  },
  {
    "id": "AVL-01",
    "method": "get",
    "path": "/api/availability",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "appointments:create",
    "rateLimit": "RL-API"
  },
  {
    "id": "PUB-01",
    "method": "get",
    "path": "/api/public/b/:slug",
    "auth": "none",
    "contextSource": "SLUG",
    "permission": null,
    "rateLimit": "RL-PUBLIC-READ"
  },
  {
    "id": "PUB-02",
    "method": "get",
    "path": "/api/public/b/:slug/services",
    "auth": "none",
    "contextSource": "SLUG",
    "permission": null,
    "rateLimit": null
  },
  {
    "id": "PUB-03",
    "method": "get",
    "path": "/api/public/b/:slug/staff",
    "auth": "none",
    "contextSource": "SLUG",
    "permission": null,
    "rateLimit": null
  },
  {
    "id": "PUB-04",
    "method": "get",
    "path": "/api/public/b/:slug/availability",
    "auth": "none",
    "contextSource": "SLUG",
    "permission": null,
    "rateLimit": "RL-PUBLIC-READ"
  },
  {
    "id": "PUB-05",
    "method": "get",
    "path": "/api/public/b/:slug/availability/days",
    "auth": "none",
    "contextSource": "SLUG",
    "permission": null,
    "rateLimit": "RL-PUBLIC-READ"
  },
  {
    "id": "PUB-06",
    "method": "post",
    "path": "/api/public/b/:slug/appointments",
    "auth": "none",
    "contextSource": "SLUG",
    "permission": null,
    "rateLimit": "RL-PUBLIC-BOOK"
  },
  {
    "id": "PUB-07",
    "method": "get",
    "path": "/api/public/manage/:token",
    "auth": "none",
    "contextSource": "TOKEN",
    "permission": null,
    "rateLimit": "RL-MANAGE"
  },
  {
    "id": "PUB-08",
    "method": "get",
    "path": "/api/public/manage/:token/availability",
    "auth": "none",
    "contextSource": "TOKEN",
    "permission": null,
    "rateLimit": null
  },
  {
    "id": "PUB-09",
    "method": "post",
    "path": "/api/public/manage/:token/cancel",
    "auth": "none",
    "contextSource": "TOKEN",
    "permission": null,
    "rateLimit": "RL-MANAGE"
  },
  {
    "id": "PUB-10",
    "method": "post",
    "path": "/api/public/manage/:token/reschedule",
    "auth": "none",
    "contextSource": "TOKEN",
    "permission": null,
    "rateLimit": "RL-MANAGE"
  },
  {
    "id": "APT-01",
    "method": "get",
    "path": "/api/appointments",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "appointments:read",
    "rateLimit": null
  },
  {
    "id": "APT-02",
    "method": "post",
    "path": "/api/appointments",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "appointments:create",
    "rateLimit": null
  },
  {
    "id": "APT-03",
    "method": "get",
    "path": "/api/appointments/:id",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "appointments:read",
    "rateLimit": null
  },
  {
    "id": "APT-04",
    "method": "patch",
    "path": "/api/appointments/:id",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "appointments:update",
    "rateLimit": null
  },
  {
    "id": "APT-05",
    "method": "post",
    "path": "/api/appointments/:id/reschedule",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "appointments:reschedule",
    "rateLimit": null
  },
  {
    "id": "APT-06",
    "method": "post",
    "path": "/api/appointments/:id/status",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "appointments:status",
    "rateLimit": null
  },
  {
    "id": "CAL-01",
    "method": "get",
    "path": "/api/calendar",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "calendar:read",
    "rateLimit": "RL-API"
  },
  {
    "id": "PAY-01",
    "method": "get",
    "path": "/api/payments",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "payments:read",
    "rateLimit": null
  },
  {
    "id": "PAY-02",
    "method": "post",
    "path": "/api/payments",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "payments:create",
    "rateLimit": null
  },
  {
    "id": "PAY-04",
    "method": "post",
    "path": "/api/payments/:id/mark-paid",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "payments:create",
    "rateLimit": null
  },
  {
    "id": "PAY-05",
    "method": "post",
    "path": "/api/payments/:id/cancel",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "payments:cancel",
    "rateLimit": null
  },
  {
    "id": "PAY-06",
    "method": "post",
    "path": "/api/payments/:id/refund",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "payments:refund",
    "rateLimit": null
  },
  {
    "id": "SYS-02",
    "method": "post",
    "path": "/api/internal/jobs/notifications/run",
    "auth": "cron",
    "contextSource": "CRON",
    "permission": null,
    "rateLimit": "RL-JOB"
  },
  {
    "id": "SYS-01",
    "method": "get",
    "path": "/api/health",
    "auth": "none",
    "contextSource": "SESSION",
    "permission": "dashboard:read",
    "rateLimit": null
  },
  {
    "id": "DSH-01",
    "method": "get",
    "path": "/api/dashboard/summary",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": null,
    "rateLimit": null
  },
  {
    "id": "DSH-05",
    "method": "get",
    "path": "/api/dashboard/upcoming",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": null,
    "rateLimit": null
  },
  {
    "id": "SET-01",
    "method": "get",
    "path": "/api/settings",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "settings:business_read",
    "rateLimit": null
  },
  {
    "id": "SET-02",
    "method": "patch",
    "path": "/api/settings/business",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "settings:business_write",
    "rateLimit": null
  },
  {
    "id": "SET-03",
    "method": "patch",
    "path": "/api/settings/booking",
    "auth": "session",
    "contextSource": "SESSION",
    "permission": "settings:booking_write",
    "rateLimit": null
  }
] satisfies readonly RouteContract[];
export const MVP_ROUTE_IDS = new Set(MVP_ROUTE_CONTRACTS.map((route) => route.id));

export const OPTIONAL_AUTH_ROUTE_CONTRACTS: readonly RouteContract[] = [
  { id: 'AUTH-13', method: 'post', path: '/api/auth/google', auth: 'none', contextSource: 'NONE', permission: null, rateLimit: 'RL-LOGIN' },
  { id: 'AUTH-14', method: 'get', path: '/api/auth/google/config', auth: 'none', contextSource: 'NONE', permission: null, rateLimit: null },
  { id: 'AUTH-15', method: 'post', path: '/api/auth/google/register-business', auth: 'none', contextSource: 'NONE', permission: null, rateLimit: 'RL-REGISTER' },
];
