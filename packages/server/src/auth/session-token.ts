import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getEnv } from '../config/env';

export function createSessionToken(): string { return randomBytes(32).toString('base64url'); }
export function hashSessionToken(token: string): string { return createHmac('sha256', getEnv().TOKEN_PEPPER).update(token).digest('hex'); }
export function matchesSessionToken(token: string, tokenHash: string): boolean {
  const supplied = Buffer.from(hashSessionToken(token));
  const stored = Buffer.from(tokenHash);
  return supplied.length === stored.length && timingSafeEqual(supplied, stored);
}
