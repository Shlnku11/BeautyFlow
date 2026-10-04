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
