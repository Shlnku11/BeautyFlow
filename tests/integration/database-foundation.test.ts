import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose, { Schema } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  connectToDatabase,
  disconnectFromDatabase,
} from '@/server/db/connection';
import { withTransaction } from '@/server/db/transactions';
import { up as createInitialIndexes } from '../../migrations/000_init';

describe('database foundation', () => {
  let replicaSet: MongoMemoryReplSet | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    Reflect.set(process.env, 'NODE_ENV', 'test');
    const testMongoUri = replicaSet.getUri('nextappointments_test');
    process.env.MONGODB_URI = testMongoUri;
    process.env.TEST_MONGODB_URI = testMongoUri;
    process.env.MONGODB_DB_NAME = 'nextappointments_test';
    await connectToDatabase();
  }, 120_000);

  afterAll(async () => {
    await disconnectFromDatabase?.();
    await mongoose.disconnect();
    await replicaSet?.stop();
  }, 30_000);

  it('commits work and rolls back failed transaction callbacks', async () => {
    const modelName = 'FoundationTransactionProbe';
    const Probe =
      mongoose.models[modelName] ??
      mongoose.model(modelName, new Schema({ value: { type: String, required: true } }));

    await withTransaction(async (session) => {
      await Probe.create([{ value: 'committed' }], { session });
    });

    await expect(
      withTransaction(async (session) => {
        await Probe.create([{ value: 'rolled-back' }], { session });
        throw new Error('force transaction abort');
      }),
    ).rejects.toThrow('force transaction abort');

    await expect(Probe.countDocuments({ value: 'committed' })).resolves.toBe(1);
    await expect(Probe.countDocuments({ value: 'rolled-back' })).resolves.toBe(0);
  }, 30_000);

  it('creates the complete initial index set from the data model', async () => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('MongoDB connection has no database handle');

    await createInitialIndexes(db);
    const appointmentIndexes = await db.collection('appointments').listIndexes().toArray();
    const occupiedKeysIndex = appointmentIndexes.find(
      (index) => index.key.occupiedKeys === 1,
    );

    expect(occupiedKeysIndex?.unique).toBe(true);
    expect(occupiedKeysIndex?.partialFilterExpression).toEqual({ occupiedKeys: { $exists: true } });
  }, 30_000);
});
