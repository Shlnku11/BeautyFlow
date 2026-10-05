import { DateTime } from 'luxon';
import type { UtcRange } from './working-intervals';
import { rangesOverlap } from './occupancy';

export interface OccupiedRange { startAt: Date; endAt: Date; }
export interface SlotRules { timezone: string; now: Date; minNoticeMinutes: number; maxAdvanceDays: number; enforceNotice: boolean; }

export function generateSlots(durationMinutes: number, bufferMinutes: number, working: UtcRange[], stepMinutes: number, occupied: OccupiedRange[], rules: SlotRules): Date[] {
  const slots: Date[] = [];
  const emittedLocalStarts = new Set<string>();
  const stepMs = stepMinutes * 60_000;
  for (const interval of working) {
    for (let timestamp = interval.startAt.getTime(); timestamp + durationMinutes * 60_000 <= interval.endAt.getTime(); timestamp += stepMs) {
      const startAt = new Date(timestamp);
      const localStart = DateTime.fromJSDate(startAt, { zone: rules.timezone });
      const localKey = localStart.toFormat('yyyy-MM-dd HH:mm');
      // BOOKING_ENGINE_SPEC §§10–11, 15: an ambiguous wall-clock slot is offered once at its first UTC occurrence.
      if (emittedLocalStarts.has(localKey)) continue;
      emittedLocalStarts.add(localKey);
      const endAt = new Date(timestamp + (durationMinutes + bufferMinutes) * 60_000);
      if (occupied.some((range) => rangesOverlap(startAt, endAt, range.startAt, range.endAt))) continue;
      if (rules.enforceNotice && startAt.getTime() < rules.now.getTime() + rules.minNoticeMinutes * 60_000) continue;
      if (rules.enforceNotice) {
        const localStartDay = localStart.startOf('day');
        const localToday = DateTime.fromJSDate(rules.now, { zone: rules.timezone }).startOf('day');
        if (localStartDay > localToday.plus({ days: rules.maxAdvanceDays })) continue;
      }
      slots.push(startAt);
    }
  }
  return slots;
}
