import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { up as createInitialIndexes } from '../../packages/server/migrations/000_init';

describe('occupiedKeys unique multikey race guard', () => {
  let replSet: MongoMemoryReplSet | undefined;

  beforeAll(async () => {
    const externalUri = process.env.OCCUPIED_KEYS_RACE_URI;
    if (externalUri) {
      await mongoose.connect(externalUri, { dbName: 'nextappointments_occupied_keys_race', autoIndex: false });
    } else {
      replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
      await mongoose.connect(replSet.getUri(), { dbName: 'occupied_keys_race', autoIndex: false });
    }
    const database = mongoose.connection.db;
    if (!database) throw new Error('Missing test database');
    await createInitialIndexes(database);
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await replSet?.stop();
  });

  it('permits exactly one concurrent insert for each contested 5-minute key', async () => {
    const database = mongoose.connection.db;
    if (!database) throw new Error('Missing test database');
    const appointments = database.collection('appointments');
    const staffId = new mongoose.Types.ObjectId();
    const businessId = new mongoose.Types.ObjectId();
    const slotNumber = Math.floor(new Date('2030-01-01T10:00:00.000Z').getTime() / 300_000);
    const contestedKey = `${staffId.toHexString()}:${slotNumber}`;

    for (let iteration = 0; iteration < 20; iteration += 1) {
      const outcomes = await Promise.allSettled(
        Array.from({ length: 20 }, (_, competitor) =>
          appointments.insertOne({
            businessId,
            staffId,
            startAt: new Date('2030-01-01T10:00:00.000Z'),
            occupiedKeys: [contestedKey],
            competitor,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
      );
      const accepted = outcomes.filter((outcome) => outcome.status === 'fulfilled');
      const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
      expect(accepted).toHaveLength(1);
      expect(rejected).toHaveLength(19);
      expect(await appointments.countDocuments({ occupiedKeys: contestedKey })).toBe(1);
      await appointments.deleteMany({});
    }
  }, 120_000);
});
