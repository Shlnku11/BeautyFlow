import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Types } from 'mongoose';
import { getEnv } from '../config/env';

export interface LoginChallengeClaims {
  userId: string;
  nonce: string;
}

export function createLoginChallenge(userId: string): { loginToken: string; nonce: string } {
  const nonce = randomBytes(24).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ userId, nonce })).toString('base64url');
  const signature = createHmac('sha256', getEnv().TOKEN_PEPPER).update(payload).digest('base64url');
  return { loginToken: `${payload}.${signature}`, nonce };
}

export function readLoginChallenge(loginToken: string): LoginChallengeClaims | null {
  const [payload, signature, extra] = loginToken.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const expected = createHmac('sha256', getEnv().TOKEN_PEPPER).update(payload).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (received.toString('base64url') !== signature) return null;
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof value !== 'object' || value === null || !('userId' in value) || !('nonce' in value)) return null;
    const claims = value as Record<string, unknown>;
    if (typeof claims.userId !== 'string' || !Types.ObjectId.isValid(claims.userId) || typeof claims.nonce !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(claims.nonce)) return null;
    return { userId: claims.userId, nonce: claims.nonce };
  } catch {
    return null;
  }
}

export function hashLoginCode(nonce: string, code: string): string {
  return createHmac('sha256', getEnv().TOKEN_PEPPER).update(`${nonce}:${code}`).digest('hex');
}
