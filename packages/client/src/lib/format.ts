export function formatMoney(
  amountMinor: number,
  currency: string,
  locale = 'ru-RU',
): string {
  if (!Number.isSafeInteger(amountMinor)) throw new RangeError('Сумма должна быть целым числом');
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export function formatMoneySafe(amountMinor: unknown, currency: unknown, locale = 'ru-RU'): string {
  if (typeof amountMinor !== 'number' || !Number.isSafeInteger(amountMinor) || typeof currency !== 'string') return '—';
  try {
    return formatMoney(amountMinor, currency, locale);
  } catch {
    return '—';
  }
}

export function formatDateTime(
  value: string | Date,
  timeZone: string,
  locale = 'ru-RU',
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError('Некорректная дата');
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(date);
}

export function formatDateSafe(value: unknown, timeZone: string, locale = 'ru-RU'): string {
  if (typeof value !== 'string' && !(value instanceof Date)) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone }).format(date);
  } catch {
    return '—';
  }
}

export function formatDateTimeSafe(value: unknown, timeZone: string, locale = 'ru-RU'): string {
  if (typeof value !== 'string' && !(value instanceof Date)) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(date);
  } catch {
    return '—';
  }
}

export function formatLocalDate(value: string | Date, timeZone: string, locale = 'ru-RU'): string {
  const date = value instanceof Date ? value : new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new RangeError('Некорректная дата');
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone }).format(date);
}
