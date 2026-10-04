import { describe, expect, it } from 'vitest';
import { LoginSchema, RegisterBusinessSchema, CreateServiceSchema, AppointmentStatusSchema } from '@/shared/schemas';

describe('shared Zod contracts', () => {
  it('normalizes login email and rejects unknown tenant fields', () => {
    expect(LoginSchema.parse({ email: '  Owner@Example.com ', password: 'test-password' }).email).toBe('owner@example.com');
    expect(LoginSchema.safeParse({ email: 'owner@example.com', password: 'test-password', businessId: 'foreign' }).success).toBe(false);
  });

  it('checks registration boundaries and requires privacy-safe defaults', () => {
    const valid = { businessName: ' Мастерская ', timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', ownerName: 'Абдул', email: 'owner@example.com', password: 'long-enough-password', acceptTerms: true, website: '' };
    expect(RegisterBusinessSchema.parse(valid).businessName).toBe('Мастерская');
    expect(RegisterBusinessSchema.safeParse({ ...valid, businessId: 'forbidden' }).success).toBe(false);
    expect(RegisterBusinessSchema.safeParse({ ...valid, businessName: 'x' }).success).toBe(false);
  });

  it('enforces five-minute service duration and appointment status enums', () => {
    const service = { name: 'Стрижка', durationMinutes: 30, bufferMinutes: 5, priceMinor: 15000, currency: 'KGS', staffIds: ['0123456789abcdef01234567'], onlineBookingEnabled: true, isActive: true };
    expect(CreateServiceSchema.safeParse(service).success).toBe(true);
    expect(CreateServiceSchema.safeParse({ ...service, durationMinutes: 31 }).success).toBe(false);
    expect(AppointmentStatusSchema.safeParse({ status: 'cancelled', businessId: 'x' }).success).toBe(false);
  });
});
