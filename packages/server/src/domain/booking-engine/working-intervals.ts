import { DateTime } from 'luxon';
import type { ScheduleInterval, ScheduleDay } from '../../db/models/staff-schedules';

export interface UtcRange { startAt: Date; endAt: Date; }
export interface ScheduleException { kind: 'day_off' | 'custom'; intervals: ScheduleInterval[]; breaks: ScheduleInterval[]; }

function localInstant(date: string, time: string, zone: string): Date | null {
  const [hourText, minuteText] = time.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const value = DateTime.fromISO(date, { zone }).set({ hour, minute, second: 0, millisecond: 0 });
  if (!value.isValid || value.toISODate() !== date || value.hour !== hour || value.minute !== minute) return null;
  return value.toUTC().toJSDate();
}

function toRanges(date: string, intervals: ScheduleInterval[], zone: string): UtcRange[] {
  return intervals.flatMap(({ start, end }) => {
    const startAt = localInstant(date, start, zone);
    const endAt = localInstant(date, end, zone);
    return startAt && endAt && startAt < endAt ? [{ startAt, endAt }] : [];
  });
}

export function computeWorkingIntervals(date: string, timezone: string, weekly: ScheduleDay[], exception?: ScheduleException): UtcRange[] {
  const localDate = DateTime.fromISO(date, { zone: timezone });
  if (!localDate.isValid || localDate.toISODate() !== date) throw new RangeError('Invalid local schedule date or timezone');
  if (exception?.kind === 'day_off') return [];
  const day = weekly.find((item) => item.isoWeekday === localDate.weekday);
  const intervals = exception?.kind === 'custom' ? exception.intervals : day?.intervals ?? [];
  const breaks = exception?.kind === 'custom' ? exception.breaks : day?.breaks ?? [];
  let working = toRanges(date, intervals, timezone);
  for (const pause of toRanges(date, breaks, timezone)) {
    working = working.flatMap((range) => {
      if (pause.endAt <= range.startAt || pause.startAt >= range.endAt) return [range];
      const pieces: UtcRange[] = [];
      if (pause.startAt > range.startAt) pieces.push({ startAt: range.startAt, endAt: pause.startAt });
      if (pause.endAt < range.endAt) pieces.push({ startAt: pause.endAt, endAt: range.endAt });
      return pieces;
    });
  }
  return working;
}
