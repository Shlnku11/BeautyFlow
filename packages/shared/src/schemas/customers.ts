import { z } from 'zod';
const CustomerContactSchema = z.object({ type: z.enum(['telegram', 'whatsapp', 'instagram', 'other']), value: z.string().trim().min(1).max(120) }).strict();
export const CreateCustomerSchema = z.object({ firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().max(80).optional(), phone: z.string().trim().min(5).max(64), email: z.string().trim().toLowerCase().pipe(z.email()).optional(), contacts: z.array(CustomerContactSchema).max(10).optional(), notes: z.string().trim().max(4000).optional() }).strict();
export const UpdateCustomerSchema = CreateCustomerSchema.partial().strict();
export const CustomerListQuerySchema = z.object({ q: z.string().trim().min(2).max(120).optional(), hasUpcoming: z.coerce.boolean().optional(), source: z.enum(['internal', 'public']).optional(), sort: z.enum(['createdAt', 'lastName', 'lastVisitAt']).default('createdAt'), order: z.enum(['asc', 'desc']).default('desc'), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).strict();
const appointmentStatus = z.enum(['pending', 'confirmed', 'completed', 'cancelled', 'no_show']);
export const CustomerAppointmentsQuerySchema = z.object({
  status: z.union([appointmentStatus, z.array(appointmentStatus)]).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, 'to must not precede from');
