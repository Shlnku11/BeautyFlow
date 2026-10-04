import type { BusinessRole } from '@/shared/constants';

/** Tenant identity is resolved by the server from a session or public route context. */
export interface TenantContext {
  userId: string;
  businessId: string;
  role: BusinessRole;
  staffId?: string;
}

/** Public tenant context is resolved from a business slug or an opaque manage token. */
export interface PublicContext {
  businessId: string;
  source: 'slug' | 'token';
}

export interface SystemContext {
  actor: 'system';
  businessId: string;
}
