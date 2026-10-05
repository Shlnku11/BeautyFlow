import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { compareStaffLoad } from '@/server/domain/booking-engine/candidates';
import { computeWorkingIntervals } from '@/server/domain/booking-engine/working-intervals';
import { canTransitionStatus, type AppointmentStatus } from '@/server/domain/booking-engine/transitions';
import { OCCUPYING_APPOINTMENT_STATUSES, occupiedKeysFor, occupiesSlot } from '@/server/domain/booking-engine/occupancy';
import { generateSlots } from '@/server/domain/booking-engine/slots';

const ranges = (start: string, end: string) => [{ startAt: new Date(start), endAt: new Date(end) }];
const rules = (timezone = 'UTC', now = '2030-01-01T08:00:00.000Z', minNoticeMinutes = 0, maxAdvanceDays = 60, enforceNotice = false) => ({ timezone, now: new Date(now), minNoticeMinutes, maxAdvanceDays, enforceNotice });
const local = (value: Date, timezone: string) => DateTime.fromJSDate(value, { zone: timezone }).toFormat('yyyy-MM-dd HH:mm');

describe('booking engine primitives — BOOKING_ENGINE_SPEC §13 cases 1–15', () => {
  it('1. generates every 30-minute slot for a 09:00–18:00 workday and 60-minute service', () => {
    const slots = generateSlots(60, 0, ranges('2030-01-01T09:00:00Z', '2030-01-01T18:00:00Z'), 30, [], rules());
    expect(slots.map((slot) => slot.toISOString())).toEqual(Array.from({ length: 17 }, (_, index) => new Date(Date.UTC(2030, 0, 1, 9, index * 30)).toISOString()));
  });

  it('2. removes break overlap but permits the last service ending exactly at the break', () => {
    const schedule = [{ isoWeekday: 1, intervals: [{ start: '09:00', end: '18:00' }], breaks: [{ start: '13:00', end: '14:00' }] }];
    const working = computeWorkingIntervals('2030-01-07', 'UTC', schedule);
    const slots = generateSlots(60, 0, working, 30, [], rules());
    const labels = slots.map((slot) => local(slot, 'UTC'));
    expect(labels).toContain('2030-01-07 12:00');
    expect(labels).not.toContain('2030-01-07 12:30');
    expect(labels).toContain('2030-01-07 14:00');
  });

  it('3. applies day_off and replaces the weekly plan with a custom exception', () => {
    const weekly = [{ isoWeekday: 1, intervals: [{ start: '09:00', end: '18:00' }], breaks: [] }];
    expect(computeWorkingIntervals('2030-01-07', 'UTC', weekly, { kind: 'day_off', intervals: [], breaks: [] })).toEqual([]);
    const custom = computeWorkingIntervals('2030-01-07', 'UTC', weekly, { kind: 'custom', intervals: [{ start: '10:00', end: '12:00' }], breaks: [] });
    expect(custom.map((item) => [item.startAt.toISOString(), item.endAt.toISOString()])).toEqual([['2030-01-07T10:00:00.000Z', '2030-01-07T12:00:00.000Z']]);
  });

  it('4. excludes slot candidates overlapping a blocked interval', () => {
    const slots = generateSlots(60, 0, ranges('2030-01-01T09:00:00Z', '2030-01-01T18:00:00Z'), 30, ranges('2030-01-01T15:00:00Z', '2030-01-01T16:00:00Z'), rules());
    const labels = slots.map((slot) => local(slot, 'UTC'));
    for (const blockedStart of ['2030-01-01 14:30', '2030-01-01 15:00', '2030-01-01 15:30']) expect(labels).not.toContain(blockedStart);
  });

  it('5. includes service buffer in occupancy and advances the next slot to buffer end', () => {
    const occupied = ranges('2030-01-01T10:00:00Z', '2030-01-01T11:15:00Z');
    const slots = generateSlots(30, 15, ranges('2030-01-01T09:00:00Z', '2030-01-01T12:00:00Z'), 15, occupied, rules());
    expect(slots.map((slot) => local(slot, 'UTC'))).toContain('2030-01-01 11:15');
    expect(slots.map((slot) => local(slot, 'UTC'))).not.toContain('2030-01-01 11:00');
  });

  it('6. allows a final service to end at shift end while its buffer extends beyond it', () => {
    const slots = generateSlots(60, 15, ranges('2030-01-01T09:00:00Z', '2030-01-01T11:00:00Z'), 15, [], rules());
    expect(slots.map((slot) => slot.toISOString())).toContain('2030-01-01T10:00:00.000Z');
  });

  it('7. returns no slots when the service cannot fit in any work window', () => {
    expect(generateSlots(180, 0, ranges('2030-01-01T09:00:00Z', '2030-01-01T11:00:00Z'), 15, [], rules())).toEqual([]);
  });

  it('8. treats pending/confirmed/completed as occupying, cancelled/no_show as released', () => {
    expect(OCCUPYING_APPOINTMENT_STATUSES).toEqual(['pending', 'confirmed', 'completed']);
    expect(['pending', 'confirmed', 'completed'].every(occupiesSlot)).toBe(true);
    expect(['cancelled', 'no_show'].some(occupiesSlot)).toBe(false);
  });

  it('9. enforces minNotice and inclusive maxAdvanceDays boundaries', () => {
    const today = generateSlots(15, 0, ranges('2030-01-01T09:00:00Z', '2030-01-01T10:00:00Z'), 15, [], rules('UTC', '2030-01-01T09:00:00Z', 30, 1, true));
    expect(today.map((slot) => local(slot, 'UTC'))).toEqual(['2030-01-01 09:30', '2030-01-01 09:45']);
    const boundaryDay = generateSlots(15, 0, ranges('2030-01-02T09:00:00Z', '2030-01-02T10:00:00Z'), 15, [], rules('UTC', '2030-01-01T09:00:00Z', 0, 1, true));
    const beyond = generateSlots(15, 0, ranges('2030-01-03T09:00:00Z', '2030-01-03T10:00:00Z'), 15, [], rules('UTC', '2030-01-01T09:00:00Z', 0, 1, true));
    expect(boundaryDay).toHaveLength(4); expect(beyond).toEqual([]);
  });

  it('10. unions free starts across staff and deterministically orders tie-break candidates', () => {
    const first = generateSlots(30, 0, ranges('2030-01-01T09:00:00Z', '2030-01-01T10:00:00Z'), 30, [], rules());
    const second = generateSlots(30, 0, ranges('2030-01-01T09:00:00Z', '2030-01-01T10:00:00Z'), 30, [], rules());
    expect([...new Set([...first, ...second].map((slot) => slot.toISOString()))]).toHaveLength(2);
    const candidates = [{ load: 1, staff: { displayOrder: 1, _id: { toString: () => 'b' } } }, { load: 0, staff: { displayOrder: 5, _id: { toString: () => 'z' } } }, { load: 0, staff: { displayOrder: 1, _id: { toString: () => 'b' } } }, { load: 0, staff: { displayOrder: 1, _id: { toString: () => 'a' } } }];
    expect(candidates.sort(compareStaffLoad).map((item) => item.staff._id.toString())).toEqual(['a', 'b', 'z', 'b']);
  });

  it('11. skips the New York spring gap and emits the autumn repeated wall-time only once', () => {
    const weekly = [{ isoWeekday: 7, intervals: [{ start: '00:00', end: '04:00' }], breaks: [] }];
    const spring = computeWorkingIntervals('2026-03-08', 'America/New_York', weekly);
    const springSlots = generateSlots(15, 0, spring, 15, [], rules('America/New_York'));
    expect(springSlots.map((slot) => local(slot, 'America/New_York'))).not.toContain('2026-03-08 02:30');
    expect(springSlots).toHaveLength(12);
    const autumn = computeWorkingIntervals('2026-11-01', 'America/New_York', weekly);
    const fallSlots = generateSlots(15, 0, autumn, 15, [], rules('America/New_York'));
    const labels = fallSlots.map((slot) => local(slot, 'America/New_York'));
    expect(labels).toHaveLength(16);
    expect(labels.filter((label) => label === '2026-11-01 01:30')).toHaveLength(1);
  });

  it('12. follows Berlin gap/fold rules and has stable no-DST business schedules', () => {
    const weekly = [{ isoWeekday: 7, intervals: [{ start: '00:00', end: '04:00' }], breaks: [] }];
    const berlinSpring = generateSlots(15, 0, computeWorkingIntervals('2026-03-29', 'Europe/Berlin', weekly), 15, [], rules('Europe/Berlin'));
    const berlinFall = generateSlots(15, 0, computeWorkingIntervals('2026-10-25', 'Europe/Berlin', weekly), 15, [], rules('Europe/Berlin'));
    expect(berlinSpring).toHaveLength(12); expect(berlinFall).toHaveLength(16);
    expect(computeWorkingIntervals('2026-03-29', 'Asia/Bishkek', [{ isoWeekday: 7, intervals: [{ start: '09:00', end: '10:00' }], breaks: [] }])[0]?.startAt.toISOString()).toBe('2026-03-29T03:00:00.000Z');
  });

  it('13. keeps business wall-clock time independent of client/process timezone across the six-zone matrix', () => {
    const matrix = [
      ['Asia/Bishkek','2026-03-08'], ['Europe/Moscow','2026-03-08'], ['America/New_York','2026-03-08'],
      ['Europe/Berlin','2026-03-29'], ['Pacific/Auckland','2026-04-05'], ['Asia/Kolkata','2026-03-08'],
    ] as const;
    for (const [zone, date] of matrix) {
      const weekday = DateTime.fromISO(date, { zone }).weekday;
      const interval = computeWorkingIntervals(date, zone, [{ isoWeekday: weekday, intervals: [{ start: '10:00', end: '11:00' }], breaks: [] }])[0];
      expect(interval).toBeDefined();
      if (interval) expect(local(interval.startAt, zone)).toBe(`${date} 10:00`);
    }
  });

  it('14. creates exactly fifteen five-minute keys for 75 occupied minutes and adjacent sets do not intersect', () => {
    const first = occupiedKeysFor('staff-1', new Date('2030-01-01T10:00:00.000Z'), new Date('2030-01-01T11:15:00.000Z'));
    const adjacent = occupiedKeysFor('staff-1', new Date('2030-01-01T11:15:00.000Z'), new Date('2030-01-01T12:00:00.000Z'));
    expect(first).toHaveLength(15);
    expect(first.at(-1)).toBe(`${first[0]?.split(':')[0]}:${Number(first[0]?.split(':')[1]) + 14}`);
    expect(first.filter((key) => adjacent.includes(key))).toEqual([]);
  });

  it('15. enforces the full role × status transition table', () => {
    const statuses: AppointmentStatus[] = ['pending','confirmed','completed','cancelled','no_show'];
    const allowed: Record<AppointmentStatus, Partial<Record<AppointmentStatus, string[]>>> = {
      pending: { confirmed: ['owner','admin','master'], completed: ['owner','admin'], cancelled: ['owner','admin','master'], no_show: ['owner','admin'] },
      confirmed: { completed: ['owner','admin','master'], cancelled: ['owner','admin','master'], no_show: ['owner','admin','master'] },
      completed: { confirmed: ['owner','admin'] }, cancelled: { confirmed: ['owner','admin'] }, no_show: { confirmed: ['owner','admin'], completed: ['owner','admin'] },
    };
    const roles = ['owner','admin','master'] as const;
    for (const from of statuses) for (const to of statuses) for (const role of roles) expect(canTransitionStatus(from, to, role)).toBe(allowed[from][to]?.includes(role) ?? false);
  });

  it('produces identical instants when the Node process timezone changes', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'UTC';
      const utc = computeWorkingIntervals('2026-10-25', 'Europe/Berlin', [{ isoWeekday: 7, intervals: [{ start: '09:00', end: '11:00' }], breaks: [] }]).map((row) => row.startAt.toISOString());
      process.env.TZ = 'America/Los_Angeles';
      const losAngeles = computeWorkingIntervals('2026-10-25', 'Europe/Berlin', [{ isoWeekday: 7, intervals: [{ start: '09:00', end: '11:00' }], breaks: [] }]).map((row) => row.startAt.toISOString());
      expect(losAngeles).toEqual(utc);
    } finally {
      if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
    }
  });
});
