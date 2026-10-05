import type { BusinessRole } from '@/shared/constants';

export interface TenantContext {
  userId: string;
  businessId: string;
  role: BusinessRole;
  staffId?: string;
}

export interface PublicContext {
  businessId: string;
  source: 'slug' | 'token';
}

export interface SystemContext {
  actor: 'system';
  businessId: string;
}
