import { z } from 'zod';
export const DashboardQuerySchema = z.object({ period: z.enum(['today','week','month','last_month']).optional(), from: z.iso.date().optional(), to: z.iso.date().optional(), staffId: z.string().regex(/^[a-f\d]{24}$/i).optional() }).strict();
