import { OAuth2Client } from 'google-auth-library';
import { getEnv } from '../config/env';
import { AppError } from '../http/errors';
import { ERROR_CODES } from '@/shared/error-codes';

export interface GoogleIdentity {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

export function isGoogleOAuthConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const env = getEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new AppError(ERROR_CODES.GOOGLE_AUTH_UNAVAILABLE, 503, 'Вход через Google временно недоступен');
  }

  const client = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
  let payload;
  try {
    // API_CONTRACTS AUTH-13: trust only Google's signed token for this exact OAuth audience.
    payload = (await client.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID })).getPayload();
  } catch (error: unknown) {
    throw new AppError(ERROR_CODES.GOOGLE_TOKEN_INVALID, 401, 'Токен Google недействителен', undefined, { cause: error });
  }
  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    throw new AppError(ERROR_CODES.GOOGLE_TOKEN_INVALID, 401, 'Токен Google недействителен');
  }
  let avatarUrl: string | undefined;
  if (payload.picture) {
    try {
      const parsedAvatar = new URL(payload.picture);
      if (parsedAvatar.protocol === 'https:') avatarUrl = parsedAvatar.toString();
    } catch {
      avatarUrl = undefined;
    }
  }
  const identity: GoogleIdentity = { googleId: payload.sub, email: payload.email.trim().toLowerCase(), name: payload.name?.trim() || payload.email, ...(avatarUrl ? { avatarUrl } : {}) };
  return identity;
}
