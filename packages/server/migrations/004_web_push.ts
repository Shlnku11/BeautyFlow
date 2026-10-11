import type { Connection } from 'mongoose';

type MongoDatabase = NonNullable<Connection['db']>;

export const migrationId = '004_web_push';

export async function up(db: MongoDatabase): Promise<void> {
  await db.collection('pushSubscriptions').createIndex({ businessId: 1, endpointHash: 1 }, { unique: true, name: 'business_push_endpoint' });
  await db.collection('pushSubscriptions').createIndex({ businessId: 1, userId: 1, lastUsedAt: -1 }, { name: 'business_push_user_active' });
  await db.collection('inboxNotifications').createIndex({ businessId: 1, userId: 1, dedupeKey: 1 }, { unique: true, name: 'business_user_inbox_dedupe' });
  await db.collection('inboxNotifications').createIndex({ businessId: 1, userId: 1, createdAt: -1 }, { name: 'business_user_inbox_recent' });
  await db.collection('inboxNotifications').createIndex({ expireAt: 1 }, { expireAfterSeconds: 0, name: 'inbox_expiry' });
}
