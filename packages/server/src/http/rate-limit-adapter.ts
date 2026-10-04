import { createHmac } from 'node:crypto';
import { RateLimit } from '../db/models';
import { getEnv } from '../config/env';
import { configureRateLimitAdapter, type RateLimitPolicy } from './rate-limit';

interface PolicyWindow { maximum: number; durationMs: number; }
const windows: Record<RateLimitPolicy, PolicyWindow> = {
  'RL-LOGIN': { maximum: 30, durationMs: 15 * 60_000 },
  'RL-REGISTER': { maximum: 3, durationMs: 60 * 60_000 },
  'RL-RESET': { maximum: 10, durationMs: 60 * 60_000 },
  'RL-PUBLIC-READ': { maximum: 60, durationMs: 60_000 },
  'RL-PUBLIC-BOOK': { maximum: 5, durationMs: 10 * 60_000 },
  'RL-MANAGE': { maximum: 10, durationMs: 10 * 60_000 },
  'RL-API': { maximum: 300, durationMs: 60_000 },
  'RL-JOB': { maximum: 1_000, durationMs: 60_000 },
};

function keyHash(value: string): string {
  return createHmac('sha256', getEnv().TOKEN_PEPPER).update(value).digest('hex');
}

async function increment(key: string, window: PolicyWindow, now: Date): Promise<{ count: number; expiresAt: Date }> {
  const expiresAt = new Date(now.getTime() + window.durationMs);
  const activeWindow = { $gt: [{ $ifNull: ['$expiresAt', new Date(0)] }, now] };
  const update = [{ $set: {
    count: { $cond: [activeWindow, { $add: [{ $ifNull: ['$count', 0] }, 1] }, 1] },
    expiresAt: { $cond: [activeWindow, '$expiresAt', expiresAt] },
  } }];
  try {
    await RateLimit.collection.updateOne({ key }, update, { upsert: true });
  } catch (error: unknown) {
    if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 11000) throw error;
    // A concurrent first request may win the unique-key upsert; retry against its inserted counter.
    await RateLimit.collection.updateOne({ key }, update, { upsert: false });
  }
  const record = await RateLimit.collection.findOne({ key });
  if (!record) throw new Error('Rate limit counter was not returned');
  return { count: record.count, expiresAt: record.expiresAt };
}

async function enforcePolicy(request: Request, policy: RateLimitPolicy) {
  if (policy === 'RL-JOB') return { allowed: true };
  const rule = windows[policy];
  const ip = request.headers.get('x-client-ip') ?? 'unknown';
  const route = new URL(request.url).pathname;
  const identity = policy === 'RL-MANAGE' ? `${ip}:${route}` : ip;
  const key = keyHash(`${policy}:${identity}`);
  const now = new Date();
  const record = await increment(key, rule, now);
  if (record.count <= rule.maximum) return { allowed: true };
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((record.expiresAt.getTime() - now.getTime()) / 1000)) };
}

export function configurePersistentRateLimit(): void {
  configureRateLimitAdapter(enforcePolicy);
}
