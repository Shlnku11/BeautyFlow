const BACKOFF_MINUTES = [1, 5, 30, 120, 720] as const;

/** NOTIFICATIONS_SPEC §6: attempt count is incremented at claim, then selects this delay. */
export function retryDelayMs(attempt: number): number {
  if (!Number.isInteger(attempt) || attempt < 1) throw new RangeError('attempt must be a positive integer');
  const minutes = BACKOFF_MINUTES[Math.min(attempt, BACKOFF_MINUTES.length) - 1] ?? 720;
  return minutes * 60_000;
}
