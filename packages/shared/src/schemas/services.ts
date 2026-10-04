import { z } from 'zod';
import { BUSINESS_CURRENCIES } from '../constants';
export const CreateServiceSchema = z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(2000).optional(), durationMinutes: z.number().int().min(5).max(720).multipleOf(5), bufferMinutes: z.number().int().min(0).max(120), priceMinor: z.number().int().min(0), currency: z.enum(BUSINESS_CURRENCIES), staffIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(100), onlineBookingEnabled: z.boolean(), isActive: z.boolean() }).strict();
export const UpdateServiceSchema = CreateServiceSchema.partial().strict();
