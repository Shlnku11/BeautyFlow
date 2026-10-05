import { ConflictError, ValidationError } from '../http/errors';

export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'cancelled';

/** PAYMENTS_SPEC §2: only the documented pending→paid/cancelled and paid→refunded transitions are valid. */
export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  const allowed = (from === 'pending' && (to === 'paid' || to === 'cancelled')) || (from === 'paid' && to === 'refunded');
  if (!allowed) throw new ConflictError('INVALID_PAYMENT_TRANSITION', 'Недопустимый переход статуса платежа');
}

/** PAYMENTS_SPEC §3 / DATA_MODEL_MONGODB §14: all money values stay exact integer minor units. */
export function assertMoneyAmount(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new ValidationError([], 'Сумма должна быть положительным целым числом в минимальных единицах валюты');
}

export function refundableAmount(amountMinor: number, refundedMinor: number): number {
  if (!Number.isSafeInteger(amountMinor) || !Number.isSafeInteger(refundedMinor) || amountMinor < 0 || refundedMinor < 0 || refundedMinor > amountMinor) {
    throw new RangeError('Invalid payment money state');
  }
  return amountMinor - refundedMinor;
}

export function assertRefundAllowed(amountMinor: number, refundedMinor: number, requestedMinor: number): void {
  assertMoneyAmount(requestedMinor);
  if (requestedMinor > refundableAmount(amountMinor, refundedMinor)) {
    throw new ConflictError('REFUND_EXCEEDS_PAID', 'Сумма возврата превышает невозвращённый остаток оплаты');
  }
}
