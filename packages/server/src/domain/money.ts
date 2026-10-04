export type Minor = number & { readonly __brand: 'Minor' };

export function toMinor(value: number): Minor {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Сумма в минимальных единицах должна быть целым неотрицательным числом');
  }
  return value as Minor; // Brand after integer and range validation.
}

export function addMinor(left: Minor, right: Minor): Minor {
  return toMinor(left + right);
}

export function subtractMinor(left: Minor, right: Minor): Minor {
  if (right > left) throw new RangeError('Сумма операции превышает доступный остаток');
  return toMinor(left - right);
}

export function netMinor(charged: Minor, refunded: Minor): Minor {
  return subtractMinor(charged, refunded);
}
