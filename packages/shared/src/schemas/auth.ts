import { z } from 'zod';
import { BUSINESS_COUNTRY_CODES, BUSINESS_CURRENCIES } from '../constants';

const password = z.string().min(10).max(128);
const normalizedEmail = z.string().trim().toLowerCase().pipe(z.email());
export const RegisterBusinessSchema = z.object({ businessName: z.string().trim().min(2).max(120), slug: z.string().trim().min(3).max(60).optional(), timezone: z.string().trim().min(1).max(64), currency: z.enum(BUSINESS_CURRENCIES), countryCode: z.enum(BUSINESS_COUNTRY_CODES), ownerName: z.string().trim().min(2).max(120), email: normalizedEmail, password, acceptTerms: z.literal(true), website: z.literal('') }).strict();
export const LoginSchema = z.object({ email: normalizedEmail, password: z.string().min(1).max(128) }).strict();
export const AcceptInviteSchema = z.object({ token: z.string().min(32).max(512), name: z.string().trim().min(2).max(120), password }).strict();
export const EmailSchema = z.object({ email: normalizedEmail }).strict();
export const ResetPasswordSchema = z.object({ token: z.string().min(32).max(512), password }).strict();
export const ChangePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }).strict();
export const EmptyBodySchema = z.object({}).strict();
