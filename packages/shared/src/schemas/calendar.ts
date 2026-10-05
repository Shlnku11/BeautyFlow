import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);

export const CalendarQuerySchema = z.object({
  view: z.enum(['day', 'week']).default('day'),
  date: z.iso.date().optional(),
  staffId: id.optional(),
  staffIds: z.union([id, z.array(id).max(100)]).optional(),
  includeCancelled: z.enum(['true', 'false']).optional(),
}).strict();
