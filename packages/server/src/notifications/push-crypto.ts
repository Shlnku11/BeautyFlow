import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { PushSubscription as WebPushSubscription } from 'web-push';
import { getEnv } from '@/server/config/env';

export type BrowserPushSubscription = WebPushSubscription;

export function hashPushEndpoint(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex');
}

function encryptionKey(): Buffer {
  return createHash('sha256').update('beautyflow:push-subscription:v1:').update(getEnv().TOKEN_PEPPER).digest();
}

export function encryptPushSubscription(subscription: BrowserPushSubscription): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(subscription), 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptPushSubscription(payload: string): BrowserPushSubscription {
  const [version, ivValue, tagValue, cipherValue] = payload.split(':');
  if (version !== 'v1' || !ivValue || !tagValue || !cipherValue) throw new Error('Stored push subscription has an invalid format');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  const plain = Buffer.concat([decipher.update(Buffer.from(cipherValue, 'base64url')), decipher.final()]).toString('utf8');
  const value = JSON.parse(plain) as Partial<BrowserPushSubscription>;
  if (typeof value.endpoint !== 'string' || !value.keys || typeof value.keys.p256dh !== 'string' || typeof value.keys.auth !== 'string') {
    throw new Error('Stored push subscription is incomplete');
  }
  return value as BrowserPushSubscription;
}

export function isSupportedPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    const hostname = url.hostname.toLocaleLowerCase('en-US');
    return hostname === 'fcm.googleapis.com'
      || hostname === 'updates.push.services.mozilla.com'
      || hostname.endsWith('.push.services.mozilla.com')
      || hostname === 'web.push.apple.com'
      || hostname.endsWith('.push.apple.com');
  } catch {
    return false;
  }
}
