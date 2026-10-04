import { describe, expect, it } from 'vitest';

import { BUSINESS_ROLES } from '@/shared/constants';
import {
  PERMISSION_SCOPES,
  assertPermission,
  can,
  permissionScope,
} from '@/server/domain/permissions';

describe('permission matrix', () => {
  it('defines every role for every permission key', () => {
    for (const scopes of Object.values(PERMISSION_SCOPES)) {
      for (const role of BUSINESS_ROLES) expect(scopes[role]).toBeDefined();
    }
  });

  it('keeps master access limited to own calendar and appointments', () => {
    expect(permissionScope('master', 'calendar:read')).toBe('own');
    expect(can('master', 'payments:read')).toBe(false);
    expect(() => assertPermission('master', 'payments:read')).toThrow();
  });
});
