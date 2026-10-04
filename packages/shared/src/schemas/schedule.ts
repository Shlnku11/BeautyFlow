import { z } from 'zod';
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const IntervalSchema = z.object({ start: time, end: time }).strict().refine((range) => range.start < range.end, 'end must follow start');
export const WeeklyScheduleSchema = z.object({ days: z.array(z.object({ weekday: z.number().int().min(0).max(6), isWorking: z.boolean(), intervals: z.array(IntervalSchema).max(3), breaks: z.array(IntervalSchema).max(5) }).strict()).length(7) }).strict();
export const StaffExceptionSchema = z.object({ date: z.iso.date(), type: z.enum(['day_off','special_hours']), intervals: z.array(IntervalSchema).max(3) }).strict();
export const BlockPeriodSchema = z.object({ staffId: z.string().regex(/^[a-f\d]{24}$/i), startAt: z.iso.datetime(), endAt: z.iso.datetime(), reason: z.string().trim().max(300).optional() }).strict();
