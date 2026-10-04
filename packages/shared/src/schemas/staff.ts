import { z } from 'zod';
export const CreateStaffSchema = z.object({ displayName: z.string().trim().min(2).max(120), bio: z.string().trim().max(1000).optional(), color: z.enum(['amber', 'blue', 'green', 'orange', 'rose', 'slate', 'teal', 'violet']).default('violet'), phone: z.string().trim().max(32).optional(), email: z.string().trim().toLowerCase().pipe(z.email()).optional(), acceptsOnlineBooking: z.boolean().default(true) }).strict();
export const UpdateStaffSchema = CreateStaffSchema.partial().strict();
export const StaffListQuerySchema = z.object({ includeInactive: z.coerce.boolean().default(false), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).strict();
