import { z } from 'zod';
export const AvailabilityQuerySchema = z.object({ serviceId: z.string().regex(/^[a-f\d]{24}$/i), staffId: z.union([z.string().regex(/^[a-f\d]{24}$/i), z.literal('any')]).optional(), date: z.iso.date() }).strict();
export const AvailableDaysQuerySchema = z.object({ serviceId: z.string().regex(/^[a-f\d]{24}$/i), staffId: z.union([z.string().regex(/^[a-f\d]{24}$/i), z.literal('any')]).optional(), month: z.string().regex(/^\d{4}-\d{2}$/) }).strict();
