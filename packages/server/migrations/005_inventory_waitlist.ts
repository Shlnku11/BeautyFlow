import type { Connection } from 'mongoose';

type MongoDatabase = NonNullable<Connection['db']>;
export const migrationId = '005_inventory_waitlist';

export async function up(db: MongoDatabase): Promise<void> {
  await db.collection('inventoryItems').createIndex({ businessId: 1, nameNormalized: 1 }, { unique: true, name: 'business_inventory_name' });
  await db.collection('inventoryMovements').createIndex({ businessId: 1, eventKey: 1 }, { unique: true, name: 'business_inventory_event' });
  await db.collection('inventoryMovements').createIndex({ businessId: 1, inventoryItemId: 1, createdAt: -1 }, { name: 'business_inventory_item_ledger' });
  await db.collection('waitlistEntries').createIndex({ businessId: 1, status: 1, serviceId: 1, fromDate: 1, toDate: 1 }, { name: 'business_waitlist_slot_match' });
}
