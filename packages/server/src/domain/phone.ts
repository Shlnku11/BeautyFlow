import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { ValidationError } from '../http/errors';

const phoneRegions = { RU: 'RU', KZ: 'KZ', KG: 'KG', US: 'US' } as const satisfies Record<string, CountryCode>;

export function normalizePhone(phone: string, countryCode: string): string {
  const region = phoneRegions[countryCode as keyof typeof phoneRegions];
  if (!region && !phone.trim().startsWith('+')) throw new ValidationError([{ path: ['phone'], message: 'Для указанной страны требуется международный формат номера' }]);
  const parsed = parsePhoneNumberFromString(phone, region);
  if (!parsed?.isValid()) throw new ValidationError([{ path: ['phone'], message: 'Укажите корректный номер телефона' }]);
  return parsed.number;
}
