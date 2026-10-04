import type { Connection } from 'mongoose';

type MongoDatabase = NonNullable<Connection['db']>;
type MongoCollection = ReturnType<MongoDatabase['collection']>;
type CreateIndexesOptions = Parameters<MongoCollection['createIndex']>[1];
type IndexSpecification = Parameters<MongoCollection['createIndex']>[0];

interface IndexDefinition {
  collection: string;
  keys: IndexSpecification;
  options?: CreateIndexesOptions;
}

export const migrationId = '000_init';

const indexes: IndexDefinition[] = [
  { collection: 'users', keys: { emailNormalized: 1 }, options: { unique: true } },
  {
    collection: 'users',
    keys: { passwordResetTokenHash: 1 },
    options: { partialFilterExpression: { passwordResetTokenHash: { $exists: true } } },
  },
  { collection: 'sessions', keys: { tokenHash: 1 }, options: { unique: true } },
  { collection: 'sessions', keys: { userId: 1 } },
  { collection: 'sessions', keys: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
  { collection: 'businesses', keys: { slug: 1 }, options: { unique: true } },
  { collection: 'businesses', keys: { countryCode: 1 } },
  { collection: 'settings', keys: { businessId: 1 }, options: { unique: true } },
  { collection: 'businessMembers', keys: { businessId: 1, userId: 1 }, options: { unique: true } },
  { collection: 'businessMembers', keys: { userId: 1 }, options: { unique: true } },
  {
    collection: 'businessMembers',
    keys: { businessId: 1 },
    options: { unique: true, partialFilterExpression: { role: 'owner', status: 'active' } },
  },
  {
    collection: 'businessMembers',
    keys: { businessId: 1, staffId: 1 },
    options: { unique: true, partialFilterExpression: { staffId: { $exists: true } } },
  },
  {
    collection: 'businessMembers',
    keys: { inviteTokenHash: 1 },
    options: { unique: true, partialFilterExpression: { inviteTokenHash: { $exists: true } } },
  },
  { collection: 'staff', keys: { businessId: 1, isDeleted: 1, isActive: 1, displayOrder: 1 } },
  { collection: 'staffSchedules', keys: { businessId: 1, staffId: 1 }, options: { unique: true } },
  {
    collection: 'staffExceptions',
    keys: { businessId: 1, staffId: 1, date: 1 },
    options: { unique: true },
  },
  { collection: 'staffExceptions', keys: { businessId: 1, date: 1 } },
  { collection: 'blockedPeriods', keys: { businessId: 1, staffId: 1, startAt: 1, endAt: 1 } },
  {
    collection: 'blockedPeriods',
    keys: { businessId: 1, groupId: 1 },
    options: { partialFilterExpression: { groupId: { $exists: true } } },
  },
  {
    collection: 'services',
    keys: { businessId: 1, nameNormalized: 1 },
    options: { unique: true, partialFilterExpression: { isDeleted: false } },
  },
  { collection: 'services', keys: { businessId: 1, isDeleted: 1, isActive: 1, displayOrder: 1 } },
  {
    collection: 'staffServices',
    keys: { businessId: 1, staffId: 1, serviceId: 1 },
    options: { unique: true },
  },
  { collection: 'staffServices', keys: { businessId: 1, serviceId: 1 } },
  {
    collection: 'customers',
    keys: { businessId: 1, phoneNormalized: 1 },
    options: { unique: true, partialFilterExpression: { isDeleted: false } },
  },
  {
    collection: 'customers',
    keys: { businessId: 1, emailNormalized: 1 },
    options: { partialFilterExpression: { emailNormalized: { $exists: true } } },
  },
  { collection: 'customers', keys: { businessId: 1, searchTokens: 1 } },
  { collection: 'customers', keys: { businessId: 1, createdAt: -1 } },
  { collection: 'appointments', keys: { businessId: 1, staffId: 1, startAt: 1 } },
  { collection: 'appointments', keys: { businessId: 1, startAt: 1, status: 1 } },
  { collection: 'appointments', keys: { businessId: 1, status: 1, startAt: 1 } },
  { collection: 'appointments', keys: { businessId: 1, customerId: 1, startAt: -1 } },
  { collection: 'appointments', keys: { businessId: 1, serviceId: 1, startAt: 1 } },
  {
    collection: 'appointments',
    keys: { occupiedKeys: 1 },
    options: { unique: true, partialFilterExpression: { occupiedKeys: { $exists: true } } },
  },
  {
    collection: 'appointments',
    keys: { manageTokenHash: 1 },
    options: { unique: true, partialFilterExpression: { manageTokenHash: { $exists: true } } },
  },
  {
    collection: 'appointments',
    keys: { businessId: 1, idempotencyKey: 1 },
    options: { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true } } },
  },
  { collection: 'payments', keys: { businessId: 1, appointmentId: 1 } },
  { collection: 'payments', keys: { businessId: 1, status: 1, paidAt: -1 } },
  { collection: 'payments', keys: { businessId: 1, customerId: 1, paidAt: -1 } },
  {
    collection: 'payments',
    keys: { businessId: 1, idempotencyKey: 1 },
    options: { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true } } },
  },
  { collection: 'transactions', keys: { businessId: 1, occurredAt: -1 } },
  { collection: 'transactions', keys: { businessId: 1, paymentId: 1 } },
  { collection: 'transactions', keys: { businessId: 1, method: 1, occurredAt: -1 } },
  { collection: 'transactions', keys: { businessId: 1, customerId: 1, occurredAt: -1 } },
  { collection: 'transactions', keys: { businessId: 1, staffId: 1, occurredAt: -1 } },
  { collection: 'notifications', keys: { dedupeKey: 1 }, options: { unique: true } },
  { collection: 'notifications', keys: { status: 1, nextAttemptAt: 1 } },
  { collection: 'notifications', keys: { businessId: 1, createdAt: -1 } },
  { collection: 'notifications', keys: { businessId: 1, appointmentId: 1 } },
  { collection: 'notifications', keys: { businessId: 1, status: 1, createdAt: -1 } },
  { collection: 'notifications', keys: { expireAt: 1 }, options: { expireAfterSeconds: 0 } },
  { collection: 'auditLogs', keys: { businessId: 1, createdAt: -1 } },
  { collection: 'auditLogs', keys: { businessId: 1, action: 1, createdAt: -1 } },
  { collection: 'auditLogs', keys: { createdAt: 1 }, options: { expireAfterSeconds: 63_072_000 } },
  { collection: 'rateLimits', keys: { key: 1 }, options: { unique: true } },
  { collection: 'rateLimits', keys: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
  { collection: 'schemaMigrations', keys: { id: 1 }, options: { unique: true } },
];

export async function up(db: MongoDatabase): Promise<void> {
  for (const index of indexes) {
    await db.collection(index.collection).createIndex(index.keys, index.options);
  }
}

export const indexCount = indexes.length;
