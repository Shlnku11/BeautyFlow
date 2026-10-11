import { z } from 'zod';
import { BUSINESS_CURRENCIES } from '../constants';
import { ServiceInventoryConsumptionSchema } from './inventory';
export const ServiceCostItemSchema = z.object({ name: z.string().trim().min(1).max(120), amountMinor: z.number().int().min(0).max(10_000_000).refine(Number.isSafeInteger) }).strict();
export const CreateServiceSchema = z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(1000).optional(), durationMinutes: z.number().int().min(5).max(720).multipleOf(5), bufferMinutes: z.number().int().min(0).max(120).multipleOf(5).default(0), priceMinor: z.number().int().min(0), costItems: z.array(ServiceCostItemSchema).max(30).default([]), inventoryConsumptions: z.array(ServiceInventoryConsumptionSchema).max(50).default([]), currency: z.enum(BUSINESS_CURRENCIES).optional(), staffIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(100).default([]), onlineBookingEnabled: z.boolean().default(true), isActive: z.boolean().default(true) }).strict();
export const UpdateServiceSchema = CreateServiceSchema.partial().strict();
export const ServiceListQuerySchema = z.object({ isActive: z.coerce.boolean().optional(), staffId: z.string().regex(/^[a-f\d]{24}$/i).optional() }).strict();
