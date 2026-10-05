import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const slug = z.string().min(3).max(40);
export const PublicSlugParamsSchema = z.object({ slug }).strict();
export const ManageTokenParamsSchema = z.object({ token: z.string().min(32).max(256) }).strict();
export const PublicServiceQuerySchema = z.object({ serviceId: id }).strict();
export const PublicAvailabilityQuerySchema = z.object({ serviceId: id, staffId: z.union([id, z.literal('any')]), date: z.iso.date() }).strict();
export const PublicAvailabilityDaysQuerySchema = z.object({ serviceId: id, staffId: z.union([id, z.literal('any')]), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).strict();
export const PublicAppointmentSchema = z.object({ serviceId: id, staffId: z.union([id, z.literal('any')]), startAt: z.iso.datetime().refine((value) => value.endsWith('Z')), customer: z.object({ firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().max(80).optional(), phone: z.string().trim().min(5).max(64), email: z.email().optional() }).strict(), customerNote: z.string().trim().max(500).optional(), acceptPrivacy: z.boolean().optional(), website: z.string().max(200).optional() }).strict();
export const PublicBookingSchema = PublicAppointmentSchema;
export const ManageDateQuerySchema = z.object({ date: z.iso.date() }).strict();
export const PublicCancelSchema = z.object({ reason: z.string().trim().max(300).optional() }).strict();
export const PublicRescheduleSchema = z.object({ startAt: z.iso.datetime().refine((value) => value.endsWith('Z')) }).strict();
