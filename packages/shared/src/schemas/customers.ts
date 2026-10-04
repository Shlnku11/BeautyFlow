import { z } from 'zod';
export const CreateCustomerSchema = z.object({ firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().max(100).optional(), phone: z.string().trim().min(5).max(32), email: z.string().trim().toLowerCase().pipe(z.email()).optional(), notes: z.string().trim().max(2000).optional() }).strict();
export const UpdateCustomerSchema = CreateCustomerSchema.partial().strict();
export const CustomerListQuerySchema = z.object({ q: z.string().trim().max(120).optional(), hasFutureAppointments: z.coerce.boolean().optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).strict();
