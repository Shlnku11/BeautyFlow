import type { BusinessCurrency, BusinessRole } from '@/shared/constants';

export interface ApiSuccess<T> {
  data: T;
  meta?: Record<string, number | string | boolean>;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown[];
    requestId: string;
  };
}

export interface UserDto {
  id: string;
  name: string;
  email: string;
  locale: 'ru';
}

export interface MembershipDto {
  businessId: string;
  businessName: string;
  slug: string;
  role: BusinessRole;
  staffId?: string;
}

export interface MoneyDto {
  amountMinor: number;
  currency: BusinessCurrency;
}
