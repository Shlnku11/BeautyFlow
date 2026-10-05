import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { delta, previousPeriod, resolvePeriod, utcBounds } from '../../packages/server/src/domain/dashboard-math';

describe('dashboard period math', () => {
  it('uses local inclusive dates and previous period across a DST change', () => {
    const period = resolvePeriod('Europe/Berlin', { from: '2026-03-28', to: '2026-03-29' });
    expect(utcBounds(period)).toEqual({ from: new Date('2026-03-27T23:00:00.000Z'), to: new Date('2026-03-29T22:00:00.000Z') });
    const previous = previousPeriod(period);
    expect(previous.from.toISODate()).toBe('2026-03-26');
    expect(previous.to.toISODate()).toBe('2026-03-28');
  });

  it('resolves preset boundaries in the business timezone and computes deltas safely', () => {
    const now = DateTime.fromISO('2026-10-05T12:00:00', { zone: 'Asia/Bishkek' });
    expect(resolvePeriod('Asia/Bishkek', { preset: 'week' }, now).from.toISODate()).toBe('2026-10-05');
    expect(delta(12, 10)).toBe(0.2);
    expect(delta(12, 0)).toBeNull();
  });
});
