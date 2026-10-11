import { describe, expect, it } from 'vitest';

import { canRoleOpenAppPath } from '@/app/navigation-access';

describe('role navigation access', () => {
  it('keeps employees on their own work pages even when their role has limited read permissions', () => {
    const permissions = ['calendar:read', 'dashboard:read_own', 'customers:read', 'staff:read', 'services:read'];

    expect(canRoleOpenAppPath('master', '/app/my-day', permissions)).toBe(true);
    expect(canRoleOpenAppPath('master', '/app/calendar', permissions)).toBe(true);
    expect(canRoleOpenAppPath('master', '/app/appointments', permissions)).toBe(true);
    expect(canRoleOpenAppPath('master', '/app/customers', permissions)).toBe(false);
    expect(canRoleOpenAppPath('master', '/app/staff', permissions)).toBe(false);
    expect(canRoleOpenAppPath('master', '/app/services', permissions)).toBe(false);
  });

  it('continues to show permitted management pages to owners and managers', () => {
    expect(canRoleOpenAppPath('owner', '/app/customers', ['customers:read'])).toBe(true);
    expect(canRoleOpenAppPath('admin', '/app/staff', ['staff:read'])).toBe(true);
    expect(canRoleOpenAppPath('admin', '/app/audit', [])).toBe(false);
  });
});
