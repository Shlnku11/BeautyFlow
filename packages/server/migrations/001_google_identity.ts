import type { Connection } from 'mongoose';

type MongoDatabase = NonNullable<Connection['db']>;

export const migrationId = '001_google_identity';

export async function up(db: MongoDatabase): Promise<void> {
  await db.collection('users').createIndex({ googleId: 1 }, { unique: true, sparse: true });
}
