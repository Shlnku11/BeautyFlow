import { describe, expect, it } from 'vitest';

import { formatDateSafe, formatDateTimeSafe, formatMoneySafe } from '@/lib/format';

describe('safe customer date formatting', () => {
  it('renders a fallback for missing or invalid dates instead of throwing during React render', () => {
    expect(formatDateSafe(undefined, 'Asia/Bishkek')).toBe('—');
    expect(formatDateSafe('not-a-date', 'Asia/Bishkek')).toBe('—');
    expect(formatDateTimeSafe('not-a-date', 'Asia/Bishkek')).toBe('—');
  });

  it('formats valid dates in the selected timezone', () => {
    expect(formatDateSafe('2026-10-11T00:00:00.000Z', 'Asia/Bishkek')).toContain('2026');
    expect(formatDateTimeSafe('2026-10-11T00:00:00.000Z', 'Asia/Bishkek')).toContain('2026');
  });
});

describe('safe appointment amount formatting', () => {
  it('handles prices omitted by role-based serialization and invalid currencies', () => {
    expect(formatMoneySafe(undefined, undefined)).toBe('—');
    expect(formatMoneySafe(125_000, 'not-a-currency')).toBe('—');
    expect(formatMoneySafe(125_000, 'KGS')).toContain('1');
  });
});
