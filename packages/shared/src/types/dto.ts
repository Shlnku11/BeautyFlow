import type { BusinessCurrency, BusinessRole } from '@/shared/constants';
import type { z } from 'zod';
import type { AcceptInviteSchema, ChangePasswordSchema, CreateAppointmentSchema, CreateCustomerSchema, CreateServiceSchema, CreateStaffSchema, LoginSchema, PublicBookingSchema, RegisterBusinessSchema } from '@/shared/schemas';

export type LoginRequestDto = z.infer<typeof LoginSchema>;
export type RegisterBusinessRequestDto = z.infer<typeof RegisterBusinessSchema>;
export type AcceptInviteRequestDto = z.infer<typeof AcceptInviteSchema>;
export type ChangePasswordRequestDto = z.infer<typeof ChangePasswordSchema>;
export type CreateAppointmentRequestDto = z.infer<typeof CreateAppointmentSchema>;
export type CreateCustomerRequestDto = z.infer<typeof CreateCustomerSchema>;
export type CreateServiceRequestDto = z.infer<typeof CreateServiceSchema>;
export type CreateStaffRequestDto = z.infer<typeof CreateStaffSchema>;
export type PublicBookingRequestDto = z.infer<typeof PublicBookingSchema>;

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
  emailVerified: boolean;
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
