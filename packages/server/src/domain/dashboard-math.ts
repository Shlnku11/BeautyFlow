import { DateTime } from 'luxon';

export interface DatePeriod { from: DateTime; to: DateTime; }

export function resolvePeriod(timezone: string, options: { preset?: 'today' | 'week' | 'month' | 'last_month'; from?: string; to?: string }, now = DateTime.now().setZone(timezone)): DatePeriod {
  if (options.from || options.to) {
    if (!options.from || !options.to) throw new RangeError('from и to должны быть указаны вместе');
    const from = DateTime.fromISO(options.from, { zone: timezone }).startOf('day');
    const to = DateTime.fromISO(options.to, { zone: timezone }).startOf('day');
    if (!from.isValid || !to.isValid || from.toISODate() !== options.from || to.toISODate() !== options.to || to < from || to.diff(from, 'days').days > 365) throw new RangeError('Недопустимый диапазон дат');
    return { from, to: to.plus({ days: 1 }) };
  }
  const preset = options.preset ?? 'month';
  if (preset === 'today') return { from: now.startOf('day'), to: now.startOf('day').plus({ days: 1 }) };
  if (preset === 'week') return { from: now.startOf('week'), to: now.startOf('week').plus({ days: 7 }) };
  if (preset === 'last_month') { const month = now.startOf('month').minus({ months: 1 }); return { from: month, to: month.plus({ months: 1 }) }; }
  return { from: now.startOf('month'), to: now.startOf('month').plus({ months: 1 }) };
}

export function previousPeriod(period: DatePeriod): DatePeriod {
  const days = Math.round(period.to.diff(period.from, 'days').days);
  return { from: period.from.minus({ days }), to: period.from };
}

export function delta(current: number, previous: number): number | null {
  return previous === 0 ? null : (current - previous) / previous;
}

export function utcBounds(period: DatePeriod): { from: Date; to: Date } {
  return { from: period.from.toUTC().toJSDate(), to: period.to.toUTC().toJSDate() };
}
