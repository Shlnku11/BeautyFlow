import { z } from 'zod';
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).refine((value) => Number(value.slice(-2)) % 5 === 0, 'time must be on a five-minute boundary');
export const IntervalSchema = z.object({ start: time, end: time }).strict().refine((range) => range.start < range.end, 'end must follow start');
const ScheduleDaySchema = z.object({ isoWeekday: z.number().int().min(1).max(7), intervals: z.array(IntervalSchema).max(3), breaks: z.array(IntervalSchema).max(5) }).strict().superRefine((day, context) => {
  if (new Set(day.intervals.map(({ start }) => start)).size !== day.intervals.length) context.addIssue({ code: 'custom', message: 'interval start times must be unique' });
  const intervals = [...day.intervals].sort((a, b) => a.start.localeCompare(b.start));
  for (let index = 1; index < intervals.length; index += 1) {
    const previous = intervals[index - 1];
    const current = intervals[index];
    if (previous && current && previous.end > current.start) context.addIssue({ code: 'custom', message: 'intervals may not overlap' });
  }
  for (const breakRange of day.breaks) {
    if (!day.intervals.some((interval) => interval.start <= breakRange.start && breakRange.end <= interval.end)) context.addIssue({ code: 'custom', message: 'break must be inside a working interval' });
  }
});
export const WeeklyScheduleSchema = z.object({ weekly: z.array(ScheduleDaySchema).max(7) }).strict().superRefine((schedule, context) => {
  if (new Set(schedule.weekly.map(({ isoWeekday }) => isoWeekday)).size !== schedule.weekly.length) context.addIssue({ code: 'custom', message: 'isoWeekday values must be unique' });
});
export const StaffExceptionSchema = z.object({ date: z.iso.date(), kind: z.enum(['day_off', 'custom']), intervals: z.array(IntervalSchema).max(3), breaks: z.array(IntervalSchema).max(5), reason: z.string().trim().max(200).optional() }).strict().superRefine((exception, context) => {
  if (exception.kind === 'custom' && exception.intervals.length === 0) context.addIssue({ code: 'custom', message: 'custom exception requires intervals' });
  if (exception.kind === 'day_off' && (exception.intervals.length > 0 || exception.breaks.length > 0)) context.addIssue({ code: 'custom', message: 'day off cannot include intervals or breaks' });
});
export const BlockPeriodSchema = z.object({ staffId: z.string().regex(/^[a-f\d]{24}$/i), startAt: z.iso.datetime(), endAt: z.iso.datetime(), reason: z.string().trim().max(300).optional() }).strict();
const BlockedPeriodFields = {
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  reason: z.string().trim().max(200).optional(),
};
export const CreateBlockedPeriodSchema = z.object({
  ...BlockedPeriodFields,
  staffId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  staffIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(100).optional(),
  allStaff: z.literal(true).optional(),
}).strict().superRefine((value, context) => {
  const selectorCount = Number(value.staffId !== undefined) + Number(value.staffIds !== undefined) + Number(value.allStaff === true);
  if (selectorCount !== 1) context.addIssue({ code: 'custom', message: 'exactly one staff selector is required' });
  const startAt = new Date(value.startAt).getTime();
  const endAt = new Date(value.endAt).getTime();
  if (endAt <= startAt) context.addIssue({ code: 'custom', path: ['endAt'], message: 'endAt must follow startAt' });
  if (startAt % 300_000 !== 0) context.addIssue({ code: 'custom', path: ['startAt'], message: 'startAt must be on a five-minute boundary' });
  if (endAt % 300_000 !== 0) context.addIssue({ code: 'custom', path: ['endAt'], message: 'endAt must be on a five-minute boundary' });
  if (endAt - startAt > 31 * 86_400_000) context.addIssue({ code: 'custom', path: ['endAt'], message: 'blocked duration cannot exceed 31 days' });
  if (value.staffIds && new Set(value.staffIds).size !== value.staffIds.length) context.addIssue({ code: 'custom', path: ['staffIds'], message: 'staffIds must be unique' });
});
export const BlockedPeriodListQuerySchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  staffId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
}).strict().refine((value) => value.from < value.to, 'to must follow from');
export const DeleteBlockedPeriodQuerySchema = z.object({ group: z.coerce.boolean().default(false) }).strict();
