import { z } from 'zod';
const id = z.string().regex(/^[a-f\d]{24}$/i);
export const CreateAppointmentSchema = z.object({ customerId: id, staffId: id, serviceId: id, startAt: z.iso.datetime(), customerNote: z.string().trim().max(500).optional(), internalNote: z.string().trim().max(2000).optional() }).strict();
export const UpdateAppointmentSchema = z.object({ customerNote: z.string().trim().max(500).optional(), internalNote: z.string().trim().max(2000).optional(), visitNote: z.string().trim().max(2000).optional() }).strict();
export const AppointmentStatusSchema = z.object({ status: z.enum(['confirmed','completed','cancelled','no_show']), cancelReason: z.string().trim().max(300).optional() }).strict();
export const RescheduleAppointmentSchema = z.object({ staffId: id, startAt: z.iso.datetime() }).strict();
export const AppointmentListQuerySchema = z.object({ from: z.iso.datetime().optional(), to: z.iso.datetime().optional(), staffId: id.optional(), status: z.enum(['pending','confirmed','completed','cancelled','no_show']).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).strict();
