import { z } from 'zod';
export const BusinessSettingsSchema = z.object({ name: z.string().trim().min(2).max(120), timezone: z.string().trim().min(1).max(64), address: z.string().trim().max(300).optional(), phone: z.string().trim().max(32).optional(), publicDescription: z.string().trim().max(2000).optional() }).strict();
export const BookingSettingsSchema = z.object({ autoConfirm: z.boolean(), minNoticeMinutes: z.number().int().min(0).max(525600), maxAdvanceDays: z.number().int().min(1).max(730), slotStepMinutes: z.number().int().min(5).max(60).multipleOf(5) }).strict();
export const PrivacySettingsSchema = z.object({ requireConsent: z.boolean(), consentText: z.string().trim().max(2000).optional(), masterSeesCustomerPhone: z.boolean() }).strict();
