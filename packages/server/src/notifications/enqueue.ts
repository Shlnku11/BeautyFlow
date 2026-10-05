import type { ClientSession } from 'mongoose';
import { Notification } from '@/server/db/models';

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

/** NOTIFICATIONS_SPEC §5: a repeated unique key is an intentional no-op. */
export async function enqueueNotification(data: Record<string, unknown>, session?: ClientSession): Promise<void> {
  const businessId = data.businessId;
  const dedupeKey = data.dedupeKey;
  if (!businessId || typeof dedupeKey !== 'string') throw new TypeError('Notification needs businessId and dedupeKey');
  try {
    await Notification.updateOne({ businessId, dedupeKey }, { $setOnInsert: data }, { upsert: true, ...(session ? { session } : {}) }).exec();
  } catch (error: unknown) {
    if (!isDuplicateKey(error)) throw error;
  }
}
