import { DateTime } from 'luxon';
import type { UtcRange } from './working-intervals';
import { rangesOverlap } from './occupancy';

export interface OccupiedRange { startAt: Date; endAt: Date; }
export interface SlotRules { timezone: string; now: Date; minNoticeMinutes: number; maxAdvanceDays: number; enforceNotice: boolean; }

export function generateSlots(durationMinutes: number, bufferMinutes: number, working: UtcRange[], stepMinutes: number, occupied: OccupiedRange[], rules: SlotRules): Date[] {
  const slots: Date[] = [];
  const stepMs = stepMinutes * 60_000;
  for (const interval of working) {
    for (let timestamp = interval.startAt.getTime(); timestamp + durationMinutes * 60_000 <= interval.endAt.getTime(); timestamp += stepMs) {
      const startAt = new Date(timestamp);
      const endAt = new Date(timestamp + (durationMinutes + bufferMinutes) * 60_000);
      if (occupied.some((range) => rangesOverlap(startAt, endAt, range.startAt, range.endAt))) continue;
      if (rules.enforceNotice && startAt.getTime() < rules.now.getTime() + rules.minNoticeMinutes * 60_000) continue;
      if (rules.enforceNotice) {
        const localStart = DateTime.fromJSDate(startAt, { zone: rules.timezone }).startOf('day');
        const localToday = DateTime.fromJSDate(rules.now, { zone: rules.timezone }).startOf('day');
        if (localStart > localToday.plus({ days: rules.maxAdvanceDays })) continue;
      }
      slots.push(startAt);
    }
  }
  return slots;
}
