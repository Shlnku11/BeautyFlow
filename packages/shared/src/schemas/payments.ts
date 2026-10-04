import { z } from 'zod';
import { BUSINESS_CURRENCIES } from '../constants';
export const CreatePaymentSchema = z.object({ appointmentId: z.string().regex(/^[a-f\d]{24}$/i), amountMinor: z.number().int().positive(), currency: z.enum(BUSINESS_CURRENCIES), method: z.enum(['cash','card','transfer','online']), note: z.string().trim().max(500).optional() }).strict();
export const RefundPaymentSchema = z.object({ amountMinor: z.number().int().positive(), reason: z.string().trim().min(1).max(300) }).strict();
export const PaymentListQuerySchema = z.object({ from: z.iso.datetime().optional(), to: z.iso.datetime().optional(), customerId: z.string().regex(/^[a-f\d]{24}$/i).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).strict();
