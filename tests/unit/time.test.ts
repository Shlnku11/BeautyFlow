import { describe, expect, it } from 'vitest';

import { isValidTimeZone, localDayBounds, parseIsoUtc } from '@/server/domain/time';

describe('time helpers', () => {
  it('validates IANA zones and accepts UTC ISO timestamps only', () => {
    expect(isValidTimeZone('Asia/Bishkek')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(parseIsoUtc('2026-10-04T10:00:00.000Z')).toBeInstanceOf(Date);
    expect(parseIsoUtc('2026-10-04T10:00:00+06:00')).toBeNull();
  });

  it('calculates local day bounds across daylight-saving transitions', () => {
    const springDay = localDayBounds('2026-03-08', 'America/New_York');
    const autumnDay = localDayBounds('2026-11-01', 'America/New_York');

    expect((springDay.to.getTime() - springDay.from.getTime()) / 3_600_000).toBe(23);
    expect((autumnDay.to.getTime() - autumnDay.from.getTime()) / 3_600_000).toBe(25);
  });
});
