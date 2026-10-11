import type { Connection } from 'mongoose';

type MongoDatabase = NonNullable<Connection['db']>;

export const migrationId = '003_customer_list';

export async function up(db: MongoDatabase): Promise<void> {
  await db.collection('customers').createIndex(
    { businessId: 1, isDeleted: 1, createdAt: -1 },
    { name: 'business_customer_active_created' },
  );
}
