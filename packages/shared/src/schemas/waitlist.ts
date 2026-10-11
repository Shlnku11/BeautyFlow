import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const date = z.iso.date();
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const CreateWaitlistEntrySchema = z.object({ customerId: id, serviceId: id, staffId: id.optional(), fromDate: date, toDate: date, preferredTimeStart: time.optional(), preferredTimeEnd: time.optional(), note: z.string().trim().max(500).optional() }).strict().refine((value) => value.fromDate <= value.toDate, { path: ['toDate'], message: 'Дата окончания раньше даты начала' }).refine((value) => Boolean(value.preferredTimeStart) === Boolean(value.preferredTimeEnd), { path: ['preferredTimeEnd'], message: 'Укажите обе границы желаемого времени' }).refine((value) => !value.preferredTimeStart || value.preferredTimeStart < (value.preferredTimeEnd ?? ''), { path: ['preferredTimeEnd'], message: 'Время окончания должно быть позже времени начала' });
export const UpdateWaitlistEntrySchema = z.object({ status: z.enum(['active', 'contacted', 'booked', 'paused']) }).strict();
export const WaitlistListQuerySchema = z.object({ status: z.enum(['active', 'contacted', 'booked', 'paused']).optional() }).strict();
