import type { BusinessRole } from '@/shared/constants';
import { ForbiddenError } from '@/server/http/errors';

export type PermissionScope = 'all' | 'own' | 'limited' | null;

export const PERMISSION_SCOPES = {
  'dashboard:read': { owner: 'all', admin: 'all', master: null },
  'dashboard:read_own': { owner: null, admin: null, master: 'own' },
  'calendar:read': { owner: 'all', admin: 'all', master: 'own' },
  'blocks:write': { owner: 'all', admin: 'all', master: null },
  'appointments:read': { owner: 'all', admin: 'all', master: 'own' },
  'appointments:create': { owner: 'all', admin: 'all', master: null },
  'appointments:update': { owner: 'all', admin: 'all', master: null },
  'appointments:reschedule': { owner: 'all', admin: 'all', master: null },
  'appointments:status': { owner: 'all', admin: 'all', master: 'own' },
  'appointments:visit_note': { owner: 'all', admin: 'all', master: 'own' },
  'customers:read': { owner: 'all', admin: 'all', master: 'limited' },
  'customers:write': { owner: 'all', admin: 'all', master: null },
  'customers:delete': { owner: 'all', admin: 'all', master: null },
  'payments:read': { owner: 'all', admin: 'all', master: null },
  'payments:create': { owner: 'all', admin: 'all', master: null },
  'payments:cancel': { owner: 'all', admin: 'all', master: null },
  'payments:refund': { owner: 'all', admin: 'all', master: null },
  'transactions:read': { owner: 'all', admin: 'all', master: null },
  'staff:read': { owner: 'all', admin: 'all', master: 'own' },
  'staff:write': { owner: 'all', admin: 'all', master: null },
  'staff:schedule_write': { owner: 'all', admin: 'all', master: null },
  'staff:deactivate': { owner: 'all', admin: 'all', master: null },
  'services:read': { owner: 'all', admin: 'all', master: 'limited' },
  'services:write': { owner: 'all', admin: 'all', master: null },
  'services:delete': { owner: 'all', admin: 'all', master: null },
  'inventory:read': { owner: 'all', admin: 'all', master: null },
  'inventory:write': { owner: 'all', admin: 'all', master: null },
  'waitlist:read': { owner: 'all', admin: 'all', master: null },
  'waitlist:write': { owner: 'all', admin: 'all', master: null },
  'settings:business_read': { owner: 'all', admin: 'all', master: null },
  'settings:business_write': { owner: 'all', admin: null, master: null },
  'settings:booking_write': { owner: 'all', admin: 'all', master: null },
  'settings:notifications_read': { owner: 'all', admin: 'all', master: null },
  'settings:notifications_write': { owner: 'all', admin: null, master: null },
  'notifications:read': { owner: 'all', admin: 'all', master: 'own' },
  'notifications:retry': { owner: 'all', admin: 'all', master: null },
  'members:read': { owner: 'all', admin: 'all', master: null },
  'members:invite': { owner: 'all', admin: 'all', master: null },
  'members:invite_admin': { owner: 'all', admin: null, master: null },
  'members:manage_role': { owner: 'all', admin: 'all', master: null },
  'members:transfer_ownership': { owner: 'all', admin: null, master: null },
  'audit:read': { owner: 'all', admin: null, master: null },
  'account:self': { owner: 'all', admin: 'all', master: 'all' },
} as const satisfies Record<
  string,
  Record<BusinessRole, PermissionScope>
>;

export type PermissionKey = keyof typeof PERMISSION_SCOPES;

export function permissionScope(role: BusinessRole, permission: PermissionKey): PermissionScope {
  return PERMISSION_SCOPES[permission][role];
}

export function can(role: BusinessRole, permission: PermissionKey): boolean {
  return permissionScope(role, permission) !== null;
}

export function assertPermission(role: BusinessRole, permission: PermissionKey): void {
  if (!can(role, permission)) throw new ForbiddenError();
}
