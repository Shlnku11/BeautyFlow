import { describe, expect, it } from 'vitest';

import { addMinor, netMinor, subtractMinor, toMinor } from '@/server/domain/money';

describe('money helpers', () => {
  it('uses integer minor units and calculates net amounts', () => {
    expect(netMinor(toMinor(12_500), toMinor(2_500))).toBe(10_000);
    expect(addMinor(toMinor(100), toMinor(25))).toBe(125);
  });

  it('rejects fractional, unsafe, or negative amounts', () => {
    expect(() => toMinor(1.5)).toThrow(RangeError);
    expect(() => toMinor(-1)).toThrow(RangeError);
    expect(() => toMinor(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
    expect(() => subtractMinor(toMinor(1), toMinor(2))).toThrow(RangeError);
  });
});
