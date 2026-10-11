import type { BusinessRole } from '@/shared/constants';

export const APP_PATH_PERMISSION: Readonly<Record<string, string>> = {
  '/app/dashboard': 'dashboard:read',
  '/app/calendar': 'calendar:read',
  '/app/appointments': 'calendar:read',
  '/app/customers': 'customers:read',
  '/app/staff': 'staff:read',
  '/app/services': 'services:read',
  '/app/payments': 'payments:read',
  '/app/settings': 'settings:business_read',
  '/app/my-day': 'dashboard:read_own',
  '/app/reports': 'dashboard:read',
  '/app/audit': 'audit:read',
  '/app/inventory': 'inventory:read',
  '/app/waitlist': 'waitlist:read',
};

const workerVisiblePaths = new Set(['/app/calendar', '/app/appointments', '/app/my-day']);

export function canRoleOpenAppPath(role: BusinessRole, path: string, permissions: readonly string[]): boolean {
  const requiredPermission = APP_PATH_PERMISSION[path];
  return Boolean(requiredPermission && permissions.includes(requiredPermission) && (role !== 'master' || workerVisiblePaths.has(path)));
}
