import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const quantity = z.number().finite().min(0).max(1_000_000).refine((value) => Math.round(value * 10_000) === value * 10_000, 'Допустимо не более четырёх знаков после запятой');
export const CreateInventoryItemSchema = z.object({ name: z.string().trim().min(1).max(120), unit: z.string().trim().min(1).max(20), unitCostMinor: z.number().int().min(0).max(100_000_000).refine(Number.isSafeInteger), initialQuantity: quantity, reorderThreshold: quantity }).strict();
export const UpdateInventoryItemSchema = z.object({ name: z.string().trim().min(1).max(120).optional(), unit: z.string().trim().min(1).max(20).optional(), unitCostMinor: z.number().int().min(0).max(100_000_000).refine(Number.isSafeInteger).optional(), reorderThreshold: quantity.optional(), isActive: z.boolean().optional() }).strict();
export const AdjustInventorySchema = z.object({ quantityDelta: quantity.refine((value) => value > 0).or(z.number().finite().min(-1_000_000).refine((value) => value < 0 && Math.round(value * 10_000) === value * 10_000)), reason: z.string().trim().min(2).max(240) }).strict();
export const ServiceInventoryConsumptionSchema = z.object({ inventoryItemId: id, quantity: z.number().finite().positive().max(100_000).refine((value) => Math.round(value * 10_000) === value * 10_000) }).strict();
