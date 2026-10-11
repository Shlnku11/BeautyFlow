import type { Connection } from 'mongoose';

type MongoDatabase = NonNullable<Connection['db']>;

export const migrationId = '002_shifts';

export async function up(db: MongoDatabase): Promise<void> {
  await db.collection('shifts').createIndex(
    { businessId: 1, staffId: 1 },
    { unique: true, partialFilterExpression: { closedAt: { $exists: false } } },
  );
  await db.collection('shifts').createIndex({ businessId: 1, startedAt: -1 });
}
