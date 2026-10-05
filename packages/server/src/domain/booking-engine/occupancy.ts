/** BOOKING_ENGINE_SPEC §7; keys represent half-open five-minute cells occupied by the appointment. */
export const OCCUPYING_APPOINTMENT_STATUSES = ['pending', 'confirmed', 'completed'] as const;

export function occupiesSlot(status: string): boolean {
  return OCCUPYING_APPOINTMENT_STATUSES.some((occupyingStatus) => occupyingStatus === status);
}

export function occupiedKeysFor(staffId: string, startAt: Date, blockedUntilAt: Date): string[] {
  const start = startAt.getTime();
  const end = blockedUntilAt.getTime();
  if (start % 300_000 !== 0 || end <= start) throw new RangeError('Appointment range must align to five-minute cells');
  const keys: string[] = [];
  for (let cell = start / 300_000; cell < end / 300_000; cell += 1) keys.push(`${staffId}:${cell}`);
  return keys;
}

export function rangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && endA > startB;
}
