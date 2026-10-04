import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { up as createInitialIndexes } from '../../migrations/000_init';
import { ImmutableDocumentError } from '@/server/db/models/transactions';
import {
  Appointment,
  AuditLog,
  BlockedPeriod,
  Business,
  BusinessMember,
  Customer,
  Notification,
  Payment,
  RateLimit,
  SchemaMigration,
  Service,
  Session,
  Settings,
  Staff,
  StaffException,
  StaffSchedule,
  StaffService,
  Transaction,
  User,
} from '@/server/db/models';

const models = [
  User,
  Session,
  Business,
  Settings,
  BusinessMember,
  Staff,
  StaffSchedule,
  StaffException,
  BlockedPeriod,
  Service,
  StaffService,
  Customer,
  Appointment,
  Payment,
  Transaction,
  Notification,
  AuditLog,
  RateLimit,
  SchemaMigration,
];

interface ExpectedIndex {
  collection: string;
  key: Record<string, 1 | -1>;
  unique?: true;
  partialFilterExpression?: Record<string, unknown>;
  expireAfterSeconds?: number;
}

// Expected indexes transcribed from DATA_MODEL_MONGODB.md sections 1–19.
const expectedIndexes: ExpectedIndex[] = [
  { collection: 'users', key: { emailNormalized: 1 }, unique: true },
  { collection: 'users', key: { passwordResetTokenHash: 1 }, partialFilterExpression: { passwordResetTokenHash: { $exists: true } } },
  { collection: 'sessions', key: { tokenHash: 1 }, unique: true },
  { collection: 'sessions', key: { userId: 1 } },
  { collection: 'sessions', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  { collection: 'businesses', key: { slug: 1 }, unique: true },
  { collection: 'businesses', key: { countryCode: 1 } },
  { collection: 'settings', key: { businessId: 1 }, unique: true },
  { collection: 'businessMembers', key: { businessId: 1, userId: 1 }, unique: true },
  { collection: 'businessMembers', key: { userId: 1 }, unique: true },
  { collection: 'businessMembers', key: { businessId: 1 }, unique: true, partialFilterExpression: { role: 'owner', status: 'active' } },
  { collection: 'businessMembers', key: { businessId: 1, staffId: 1 }, unique: true, partialFilterExpression: { staffId: { $exists: true } } },
  { collection: 'businessMembers', key: { inviteTokenHash: 1 }, unique: true, partialFilterExpression: { inviteTokenHash: { $exists: true } } },
  { collection: 'staff', key: { businessId: 1, isDeleted: 1, isActive: 1, displayOrder: 1 } },
  { collection: 'staffSchedules', key: { businessId: 1, staffId: 1 }, unique: true },
  { collection: 'staffExceptions', key: { businessId: 1, staffId: 1, date: 1 }, unique: true },
  { collection: 'staffExceptions', key: { businessId: 1, date: 1 } },
  { collection: 'blockedPeriods', key: { businessId: 1, staffId: 1, startAt: 1, endAt: 1 } },
  { collection: 'blockedPeriods', key: { businessId: 1, groupId: 1 }, partialFilterExpression: { groupId: { $exists: true } } },
  { collection: 'services', key: { businessId: 1, nameNormalized: 1 }, unique: true, partialFilterExpression: { isDeleted: false } },
  { collection: 'services', key: { businessId: 1, isDeleted: 1, isActive: 1, displayOrder: 1 } },
  { collection: 'staffServices', key: { businessId: 1, staffId: 1, serviceId: 1 }, unique: true },
  { collection: 'staffServices', key: { businessId: 1, serviceId: 1 } },
  { collection: 'customers', key: { businessId: 1, phoneNormalized: 1 }, unique: true, partialFilterExpression: { isDeleted: false } },
  { collection: 'customers', key: { businessId: 1, emailNormalized: 1 }, partialFilterExpression: { emailNormalized: { $exists: true } } },
  { collection: 'customers', key: { businessId: 1, searchTokens: 1 } },
  { collection: 'customers', key: { businessId: 1, createdAt: -1 } },
  { collection: 'appointments', key: { businessId: 1, staffId: 1, startAt: 1 } },
  { collection: 'appointments', key: { businessId: 1, startAt: 1, status: 1 } },
  { collection: 'appointments', key: { businessId: 1, status: 1, startAt: 1 } },
  { collection: 'appointments', key: { businessId: 1, customerId: 1, startAt: -1 } },
  { collection: 'appointments', key: { businessId: 1, serviceId: 1, startAt: 1 } },
  { collection: 'appointments', key: { occupiedKeys: 1 }, unique: true, partialFilterExpression: { occupiedKeys: { $exists: true } } },
  { collection: 'appointments', key: { manageTokenHash: 1 }, unique: true, partialFilterExpression: { manageTokenHash: { $exists: true } } },
  { collection: 'appointments', key: { businessId: 1, idempotencyKey: 1 }, unique: true, partialFilterExpression: { idempotencyKey: { $exists: true } } },
  { collection: 'payments', key: { businessId: 1, appointmentId: 1 } },
  { collection: 'payments', key: { businessId: 1, status: 1, paidAt: -1 } },
  { collection: 'payments', key: { businessId: 1, customerId: 1, paidAt: -1 } },
  { collection: 'payments', key: { businessId: 1, idempotencyKey: 1 }, unique: true, partialFilterExpression: { idempotencyKey: { $exists: true } } },
  { collection: 'transactions', key: { businessId: 1, occurredAt: -1 } },
  { collection: 'transactions', key: { businessId: 1, paymentId: 1 } },
  { collection: 'transactions', key: { businessId: 1, method: 1, occurredAt: -1 } },
  { collection: 'transactions', key: { businessId: 1, customerId: 1, occurredAt: -1 } },
  { collection: 'transactions', key: { businessId: 1, staffId: 1, occurredAt: -1 } },
  { collection: 'notifications', key: { dedupeKey: 1 }, unique: true },
  { collection: 'notifications', key: { status: 1, nextAttemptAt: 1 } },
  { collection: 'notifications', key: { businessId: 1, createdAt: -1 } },
  { collection: 'notifications', key: { businessId: 1, appointmentId: 1 } },
  { collection: 'notifications', key: { businessId: 1, status: 1, createdAt: -1 } },
  { collection: 'notifications', key: { expireAt: 1 }, expireAfterSeconds: 0 },
  { collection: 'auditLogs', key: { businessId: 1, createdAt: -1 } },
  { collection: 'auditLogs', key: { businessId: 1, action: 1, createdAt: -1 } },
  { collection: 'auditLogs', key: { createdAt: 1 }, expireAfterSeconds: 63_072_000 },
  { collection: 'rateLimits', key: { key: 1 }, unique: true },
  { collection: 'rateLimits', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  { collection: 'schemaMigrations', key: { id: 1 }, unique: true },
];

function normalizeIndexes(
  indexes: Array<{
    key: Record<string, number>;
    unique?: boolean;
    partialFilterExpression?: Record<string, unknown>;
    expireAfterSeconds?: number;
  }>,
): Array<Record<string, unknown>> {
  return indexes
    .filter((index) => !(Object.keys(index.key).length === 1 && index.key._id === 1))
    .map((index) => ({
      key: index.key,
      ...(index.unique ? { unique: true } : {}),
      ...(index.partialFilterExpression ? { partialFilterExpression: index.partialFilterExpression } : {}),
      ...(index.expireAfterSeconds !== undefined ? { expireAfterSeconds: index.expireAfterSeconds } : {}),
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

describe('Mongoose models and initial indexes', () => {
  let replicaSet: MongoMemoryReplSet | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const mongoUri = replicaSet.getUri('nextappointments_models_test');
    await mongoose.connect(mongoUri, { autoIndex: false });
    const db = mongoose.connection.db;
    if (!db) throw new Error('MongoDB connection has no database handle');
    await createInitialIndexes(db);
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await replicaSet?.stop();
  }, 30_000);

  it('uses strict, timestamped, migration-indexed schemas and expected concurrency settings', () => {
    for (const model of models) {
      expect(model.schema.options.strict).toBe('throw');
      expect(model.schema.options.timestamps).toBe(true);
      expect(model.schema.options.autoIndex).toBe(false);
      expect(model.schema.indexes()).toEqual([]);
    }

    for (const model of [Settings, StaffSchedule, Appointment, Payment]) {
      expect(model.schema.options.optimisticConcurrency).toBe(true);
    }

    for (const model of [BusinessMember, Staff, StaffSchedule, StaffException, BlockedPeriod, Service, StaffService, Customer, Appointment, Payment, Transaction, Notification, AuditLog]) {
      const tenantPath = model.schema.paths.businessId;
      expect(tenantPath).toBeDefined();
      const tenantPathOptions = tenantPath?.options as unknown as { immutable?: boolean };
      expect(tenantPathOptions.immutable).toBe(true);
    }
  });

  it('matches listIndexes() for all 19 collections to DATA_MODEL_MONGODB.md', async () => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('MongoDB connection has no database handle');

    expect(models.map((model) => model.collection.name).sort()).toEqual(
      [...new Set(expectedIndexes.map((index) => index.collection))].sort(),
    );

    for (const collectionName of models.map((model) => model.collection.name)) {
      const actual = await db.collection(collectionName).listIndexes().toArray();
      const expected = expectedIndexes.filter((index) => index.collection === collectionName);
      expect(normalizeIndexes(actual), `${collectionName} index set`).toEqual(normalizeIndexes(expected));
    }
  });

  it('keeps occupiedKeys optional and rejects transaction mutations', async () => {
    expect(Appointment.schema.paths.occupiedKeys?.instance).toBe('Array');
    expect(Appointment.schema.paths.occupiedKeys?.options.default).toBeUndefined();

    const businessId = new mongoose.Types.ObjectId();
    const transaction = new Transaction({
      businessId,
      paymentId: new mongoose.Types.ObjectId(),
      appointmentId: new mongoose.Types.ObjectId(),
      customerId: new mongoose.Types.ObjectId(),
      staffId: new mongoose.Types.ObjectId(),
      type: 'charge',
      direction: 'in',
      amountMinor: 2500,
      currency: 'KGS',
      method: 'cash',
      occurredAt: new Date(),
      createdBy: new mongoose.Types.ObjectId(),
    });

    await transaction.save();
    await expect(
      Transaction.updateOne({ businessId }, { $set: { note: 'edited' } }).exec(),
    ).rejects.toBeInstanceOf(ImmutableDocumentError);
    await expect(transaction.save()).rejects.toBeInstanceOf(ImmutableDocumentError);
  });
});
