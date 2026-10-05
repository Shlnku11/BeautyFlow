import { describe, expect, it } from 'vitest';
import { assertMoneyAmount, assertPaymentTransition, assertRefundAllowed, refundableAmount } from '../../packages/server/src/domain/payments';

describe('payment money and state rules', () => {
  it('accepts only exact positive minor-unit integers', () => {
    expect(() => assertMoneyAmount(1250)).not.toThrow();
    for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(() => assertMoneyAmount(value)).toThrow();
    expect(refundableAmount(1000, 250)).toBe(750);
    try { assertRefundAllowed(1000, 250, 751); throw new Error('Expected an over-refund to fail'); }
    catch (error) { expect(error).toMatchObject({ code: 'REFUND_EXCEEDS_PAID', httpStatus: 409 }); }
  });

  it('allows only the documented payment state transitions', () => {
    expect(() => assertPaymentTransition('pending', 'paid')).not.toThrow();
    expect(() => assertPaymentTransition('pending', 'cancelled')).not.toThrow();
    expect(() => assertPaymentTransition('paid', 'refunded')).not.toThrow();
    for (const [from, to] of [['paid', 'cancelled'], ['cancelled', 'paid'], ['refunded', 'paid'], ['pending', 'refunded']] as const) {
      try { assertPaymentTransition(from, to); throw new Error('Expected an invalid transition to fail'); }
      catch (error) { expect(error).toMatchObject({ code: 'INVALID_PAYMENT_TRANSITION', httpStatus: 409 }); }
    }
  });
});
