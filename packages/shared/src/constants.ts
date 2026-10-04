export const API_PREFIX = '/api';
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export const SLOT_GRANULARITY_MINUTES = 5;

export const BUSINESS_ROLES = ['owner', 'admin', 'master'] as const;
export type BusinessRole = (typeof BUSINESS_ROLES)[number];

export const BUSINESS_COUNTRY_CODES = ['RU', 'KZ', 'KG', 'US', 'OTHER'] as const;
export type BusinessCountryCode = (typeof BUSINESS_COUNTRY_CODES)[number];

export const BUSINESS_CURRENCIES = ['RUB', 'KZT', 'KGS', 'USD', 'EUR'] as const;
export type BusinessCurrency = (typeof BUSINESS_CURRENCIES)[number];
