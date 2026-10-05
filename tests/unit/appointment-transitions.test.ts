import { describe, expect, it } from 'vitest';
import { canTransitionStatus } from '../../packages/server/src/domain/booking-engine/transitions';

describe('appointment status transitions', () => {
  it('enforces the role matrix and rejects same-state transitions', () => {
    expect(canTransitionStatus('pending', 'confirmed', 'master')).toBe(true);
    expect(canTransitionStatus('pending', 'no_show', 'master')).toBe(false);
    expect(canTransitionStatus('confirmed', 'completed', 'master')).toBe(true);
    expect(canTransitionStatus('completed', 'confirmed', 'master')).toBe(false);
    expect(canTransitionStatus('completed', 'confirmed', 'admin')).toBe(true);
    expect(canTransitionStatus('cancelled', 'confirmed', 'owner')).toBe(true);
    expect(canTransitionStatus('confirmed', 'confirmed', 'owner')).toBe(false);
  });
});
