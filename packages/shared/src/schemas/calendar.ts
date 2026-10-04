import { z } from 'zod';
export const CalendarQuerySchema = z.object({ from: z.iso.datetime(), to: z.iso.datetime(), staffIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(100).optional(), view: z.enum(['day','week']).default('day') }).strict();
