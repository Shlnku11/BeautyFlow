import { DateTime, IANAZone } from 'luxon';

export function isValidTimeZone(timeZone: string): boolean {
  return IANAZone.isValidZone(timeZone);
}

export function parseIsoUtc(value: string): Date | null {
  const dateTime = DateTime.fromISO(value, { setZone: true });
  if (!dateTime.isValid || !/Z$/i.test(value)) return null;
  return dateTime.toUTC().toJSDate();
}

export function localDayBounds(date: string, timeZone: string): { from: Date; to: Date } {
  if (!isValidTimeZone(timeZone)) throw new RangeError('Некорректный часовой пояс IANA');
  const start = DateTime.fromISO(date, { zone: timeZone }).startOf('day');
  if (!start.isValid || start.toISODate() !== date) throw new RangeError('Некорректная локальная дата');

  const end = start.plus({ days: 1 });
  return { from: start.toUTC().toJSDate(), to: end.toUTC().toJSDate() };
}

export function isoWeekdayInZone(instant: Date, timeZone: string): number {
  if (!isValidTimeZone(timeZone)) throw new RangeError('Некорректный часовой пояс IANA');
  const dateTime = DateTime.fromJSDate(instant, { zone: timeZone });
  if (!dateTime.isValid) throw new RangeError('Некорректный момент времени');
  return dateTime.weekday;
}
