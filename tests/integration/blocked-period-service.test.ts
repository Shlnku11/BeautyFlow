import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BlockedPeriodService } from '../../packages/server/src/services/blocked-period-service';
import { AppointmentService } from '../../packages/server/src/services/appointment-service';
import { connectToDatabase, disconnectFromDatabase } from '../../packages/server/src/db/connection';
import { up as createIndexes } from '../../packages/server/migrations/000_init';
import { Appointment, Business, BlockedPeriod, Customer, Service, Settings, Staff, StaffSchedule, StaffService } from '../../packages/server/src/db/models';
import type { TenantContext } from '../../packages/shared/src/types/tenant-context';

describe('blocked-period service', () => {
  let replSet: MongoMemoryReplSet;
  let businessA: mongoose.Types.ObjectId;
  let businessB: mongoose.Types.ObjectId;
  let staffA: mongoose.Types.ObjectId;
  let staffA2: mongoose.Types.ObjectId;
  let staffB: mongoose.Types.ObjectId;
  let userA: mongoose.Types.ObjectId;
  const service = new BlockedPeriodService();
  const context = (businessId: mongoose.Types.ObjectId, userId: mongoose.Types.ObjectId): TenantContext => ({
    businessId: businessId.toString(), userId: userId.toString(), role: 'owner',
  });

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGODB_URI = replSet.getUri('blocked_periods_test');
    process.env.MONGODB_DB_NAME = 'blocked_periods_test';
    process.env.TEST_MONGODB_URI = replSet.getUri('blocked_periods_test');
    await connectToDatabase();
    const database = mongoose.connection.db;
    if (!database) throw new Error('MongoDB connection has no database handle');
    await createIndexes(database);
  }, 120_000);

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
    businessA = new mongoose.Types.ObjectId();
    businessB = new mongoose.Types.ObjectId();
    userA = new mongoose.Types.ObjectId();
    await Business.create([
      { _id: businessA, name: 'A business', slug: 'business-a', timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', status: 'active' },
      { _id: businessB, name: 'B business', slug: 'business-b', timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', status: 'active' },
    ]);
    const staff = await Staff.create([
      { businessId: businessA, displayName: 'Staff A1', color: 'violet' },
      { businessId: businessA, displayName: 'Staff A2', color: 'rose' },
      { businessId: businessB, displayName: 'Staff B', color: 'blue' },
    ]);
    const firstStaff = staff[0];
    const secondStaff = staff[1];
    const foreignStaff = staff[2];
    if (!firstStaff || !secondStaff || !foreignStaff) throw new Error('Test staff fixtures were not created');
    staffA = firstStaff._id;
    staffA2 = secondStaff._id;
    staffB = foreignStaff._id;
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await replSet.stop();
  });

  it('creates an all-staff block with a shared group id and removes the entire group', async () => {
    const created = await service.create(context(businessA, userA), {
      allStaff: true,
      startAt: '2026-10-10T04:00:00.000Z',
      endAt: '2026-10-10T05:00:00.000Z',
      reason: 'Team meeting',
    });

    expect(created).toHaveLength(2);
    expect(created[0]?.groupId).toBe(created[1]?.groupId);
    expect((await service.list(context(businessA, userA), { from: '2026-10-10T00:00:00.000Z', to: '2026-10-11T00:00:00.000Z' }))).toHaveLength(2);
    const firstBlock = created[0];
    if (!firstBlock) throw new Error('Expected a block for the first staff member');
    await service.delete(context(businessA, userA), firstBlock.id, true);
    expect(await BlockedPeriod.countDocuments({ businessId: businessA })).toBe(0);
    expect(await Staff.findOne({ _id: staffA, businessId: businessA }).then((row) => row?.bookingVersion)).toBe(2);
    expect(await Staff.findOne({ _id: staffA2, businessId: businessA }).then((row) => row?.bookingVersion)).toBe(2);
  });

  it('rejects a foreign staff id without writing a block', async () => {
    await expect(service.create(context(businessA, userA), {
      staffId: staffB.toString(), startAt: '2026-10-10T04:00:00.000Z', endAt: '2026-10-10T05:00:00.000Z',
    })).rejects.toMatchObject({ httpStatus: 404 });
    expect(await BlockedPeriod.countDocuments({ businessId: businessA })).toBe(0);
  });

  it('does not create a block that collides with an appointment and rolls back the booking version', async () => {
    await Appointment.create({
      businessId: businessA, customerId: new mongoose.Types.ObjectId(), staffId: staffA, serviceId: new mongoose.Types.ObjectId(),
      startAt: new Date('2026-10-10T04:15:00.000Z'), endAt: new Date('2026-10-10T04:45:00.000Z'),
      bufferMinutes: 0, blockedUntilAt: new Date('2026-10-10T04:45:00.000Z'), occupiedKeys: ['conflict'],
      status: 'confirmed', source: 'internal', serviceSnapshot: { name: 'Service', durationMinutes: 30, priceMinor: 1000, currency: 'KGS' },
      rescheduleCount: 0, createdBy: userA,
    });

    await expect(service.create(context(businessA, userA), {
      staffId: staffA.toString(), startAt: '2026-10-10T04:00:00.000Z', endAt: '2026-10-10T05:00:00.000Z',
    })).rejects.toMatchObject({ code: 'BLOCK_CONFLICTS_WITH_APPOINTMENTS', httpStatus: 409 });
    expect(await BlockedPeriod.countDocuments({ businessId: businessA })).toBe(0);
    expect(await Staff.findOne({ _id: staffA, businessId: businessA }).then((row) => row?.bookingVersion)).toBe(0);
  });

  it('limits master reads to their own staff and masks another business staff id as not found', async () => {
    await service.create(context(businessA, userA), {
      staffId: staffA.toString(), startAt: '2026-10-10T04:00:00.000Z', endAt: '2026-10-10T05:00:00.000Z',
    });
    const masterContext: TenantContext = { businessId: businessA.toString(), userId: userA.toString(), role: 'master', staffId: staffA.toString() };
    expect(await service.list(masterContext, { from: '2026-10-10T00:00:00.000Z', to: '2026-10-11T00:00:00.000Z' })).toHaveLength(1);
    await expect(service.list(masterContext, { from: '2026-10-10T00:00:00.000Z', to: '2026-10-11T00:00:00.000Z', staffId: staffB.toString() })).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('serializes a block against a booking for the same time window', async () => {
    await Settings.create({ businessId: businessA });
    const customer = await Customer.create({ businessId: businessA, firstName: 'Client', phone: '+996555123456', phoneNormalized: '+996555123456', searchTokens: ['client', '996555123456'], source: 'internal' });
    const treatment = await Service.create({ businessId: businessA, name: 'Cut', nameNormalized: 'cut', durationMinutes: 30, bufferMinutes: 0, priceMinor: 1000, currency: 'KGS', onlineBookingEnabled: true, isActive: true, displayOrder: 0 });
    await StaffService.create({ businessId: businessA, staffId: staffA, serviceId: treatment._id });
    await StaffSchedule.create({ businessId: businessA, staffId: staffA, weekly: [{ isoWeekday: 6, intervals: [{ start: '10:00', end: '12:00' }], breaks: [] }] });
    const booking = new AppointmentService();
    const ctx = context(businessA, userA);
    const startAt = '2026-10-10T04:00:00.000Z';
    const outcomes = await Promise.allSettled([
      service.create(ctx, { staffId: staffA.toString(), startAt, endAt: '2026-10-10T04:30:00.000Z' }),
      booking.create(ctx, { customerId: customer._id.toString(), staffId: staffA.toString(), serviceId: treatment._id.toString(), startAt, enforceNotice: false }),
    ]);
    const accepted = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const failure = rejected[0];
    if (!failure || failure.status !== 'rejected') throw new Error('Expected one operation to lose the contention race');
    expect(failure.reason).toMatchObject({ httpStatus: 409 });
    expect(await BlockedPeriod.countDocuments({ businessId: businessA }) + await Appointment.countDocuments({ businessId: businessA })).toBe(1);
  }, 30_000);

  it('returns one success and conflicts for the other nineteen simultaneous booking attempts', async () => {
    await Settings.create({ businessId: businessA });
    const customer = await Customer.create({ businessId: businessA, firstName: 'Race Client', phone: '+996555987654', phoneNormalized: '+996555987654', searchTokens: ['race client'], source: 'internal' });
    const treatment = await Service.create({ businessId: businessA, name: 'Race Cut', nameNormalized: 'race cut', durationMinutes: 30, bufferMinutes: 0, priceMinor: 1000, currency: 'KGS', onlineBookingEnabled: true, isActive: true, displayOrder: 0 });
    await StaffService.create({ businessId: businessA, staffId: staffA, serviceId: treatment._id });
    await StaffSchedule.create({ businessId: businessA, staffId: staffA, weekly: [{ isoWeekday: 6, intervals: [{ start: '10:00', end: '12:00' }], breaks: [] }] });
    const booking = new AppointmentService();
    const outcomes = await Promise.allSettled(Array.from({ length: 20 }, (_, index) => booking.create(context(businessA, userA), { customerId: customer._id.toString(), staffId: staffA.toString(), serviceId: treatment._id.toString(), startAt: '2026-10-10T04:00:00.000Z', enforceNotice: false }, `internal-race-${index}`)));
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(19);
    for (const outcome of outcomes) if (outcome.status === 'rejected') expect(outcome.reason).toMatchObject({ httpStatus: 409 });
    expect(await Appointment.countDocuments({ businessId: businessA, staffId: staffA, serviceId: treatment._id })).toBe(1);
  }, 30_000);
});
