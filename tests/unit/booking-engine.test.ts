import { describe, expect, it } from 'vitest';
import { occupiedKeysFor } from '@/server/domain/booking-engine/occupancy';
import { computeWorkingIntervals } from '@/server/domain/booking-engine/working-intervals';
import { generateSlots } from '@/server/domain/booking-engine/slots';

describe('booking engine primitives', () => {
  it('makes one occupancy key per half-open five-minute cell', () => {
    expect(occupiedKeysFor('staff-1', new Date('2030-01-01T10:00:00.000Z'), new Date('2030-01-01T11:15:00.000Z'))).toHaveLength(15);
  });

  it('subtracts a local break and applies day-off exceptions', () => {
    const weekly = [{ isoWeekday: 1, intervals: [{ start: '09:00', end: '12:00' }], breaks: [{ start: '10:00', end: '10:30' }] }];
    const ranges = computeWorkingIntervals('2026-04-06', 'Asia/Bishkek', weekly);
    expect(ranges.map((range) => [range.startAt.toISOString(), range.endAt.toISOString()])).toEqual([
      ['2026-04-06T03:00:00.000Z', '2026-04-06T04:00:00.000Z'],
      ['2026-04-06T04:30:00.000Z', '2026-04-06T06:00:00.000Z'],
    ]);
    expect(computeWorkingIntervals('2026-04-06', 'Asia/Bishkek', weekly, { kind: 'day_off', intervals: [], breaks: [] })).toEqual([]);
  });

  it('excludes every slot whose occupied duration or buffer overlaps another range', () => {
    const working = [{ startAt: new Date('2030-01-01T09:00:00.000Z'), endAt: new Date('2030-01-01T11:00:00.000Z') }];
    const slots = generateSlots(30, 0, working, 30, [{ startAt: new Date('2030-01-01T09:30:00.000Z'), endAt: new Date('2030-01-01T10:30:00.000Z') }], { timezone: 'UTC', now: new Date('2030-01-01T08:00:00.000Z'), minNoticeMinutes: 0, maxAdvanceDays: 60, enforceNotice: false });
    expect(slots.map((slot) => slot.toISOString())).toEqual(['2030-01-01T09:00:00.000Z', '2030-01-01T10:30:00.000Z']);
  });
});
