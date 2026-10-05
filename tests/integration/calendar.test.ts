import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectFromDatabase } from '../../packages/server/src/db/connection';
import { up as createIndexes } from '../../packages/server/migrations/000_init';
import { CalendarService } from '../../packages/server/src/services/calendar-service';
import { Appointment, BlockedPeriod, Business, Customer, Service, Settings, Staff, StaffException, StaffSchedule } from '../../packages/server/src/db/models';
import type { TenantContext } from '../../packages/shared/src/types/tenant-context';

describe('CAL-01 calendar', () => {
  let replSet: MongoMemoryReplSet;
  let businessA: mongoose.Types.ObjectId;
  let businessB: mongoose.Types.ObjectId;
  let staffA: mongoose.Types.ObjectId;
  let staffB: mongoose.Types.ObjectId;
  const calendar = new CalendarService();

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGODB_URI = replSet.getUri('calendar_test');
    process.env.MONGODB_DB_NAME = 'calendar_test';
    process.env.TEST_MONGODB_URI = replSet.getUri('calendar_test');
    await connectToDatabase();
    const database = mongoose.connection.db;
    if (!database) throw new Error('Missing MongoDB database');
    await createIndexes(database);
  }, 120_000);

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
    businessA = new mongoose.Types.ObjectId(); businessB = new mongoose.Types.ObjectId();
    await Business.create([
      { _id: businessA, name: 'Business A', slug: 'calendar-a', timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', status: 'active' },
      { _id: businessB, name: 'Business B', slug: 'calendar-b', timezone: 'Europe/Berlin', currency: 'EUR', countryCode: 'OTHER', status: 'active' },
    ]);
    await Settings.create([{ businessId: businessA, privacy: { masterSeesCustomerPhone: false } }, { businessId: businessB }]);
    const [a, b] = await Staff.create([
      { businessId: businessA, displayName: 'Stylist A', color: 'violet' },
      { businessId: businessB, displayName: 'Stylist B', color: 'teal' },
    ]);
    if (!a || !b) throw new Error('Missing staff fixture');
    staffA = a._id; staffB = b._id;
    const [customerA, customerB] = await Customer.create([
      { businessId: businessA, firstName: 'Client A', phone: '+996555111111', phoneNormalized: '+996555111111', searchTokens: ['client'], source: 'internal' },
      { businessId: businessB, firstName: 'Client B', phone: '+4915112345678', phoneNormalized: '+4915112345678', searchTokens: ['client'], source: 'internal' },
    ]);
    const [serviceA, serviceB] = await Service.create([
      { businessId: businessA, name: 'Cut A', nameNormalized: 'cut a', durationMinutes: 60, bufferMinutes: 10, priceMinor: 3000, currency: 'KGS', onlineBookingEnabled: true, isActive: true, displayOrder: 0 },
      { businessId: businessB, name: 'Cut B', nameNormalized: 'cut b', durationMinutes: 45, bufferMinutes: 0, priceMinor: 2000, currency: 'EUR', onlineBookingEnabled: true, isActive: true, displayOrder: 0 },
    ]);
    if (!customerA || !customerB || !serviceA || !serviceB) throw new Error('Missing appointment fixture');
    await Appointment.create([
      { businessId: businessA, customerId: customerA._id, staffId: staffA, serviceId: serviceA._id, startAt: new Date('2026-03-27T04:00:00Z'), endAt: new Date('2026-03-27T05:00:00Z'), bufferMinutes: 10, blockedUntilAt: new Date('2026-03-27T05:10:00Z'), occupiedKeys: [`${staffA.toString()}:2960000`], status: 'confirmed', source: 'internal', serviceSnapshot: { name: 'Cut A', durationMinutes: 60, priceMinor: 3000, currency: 'KGS' }, rescheduleCount: 0 },
      { businessId: businessB, customerId: customerB._id, staffId: staffB, serviceId: serviceB._id, startAt: new Date('2026-03-27T04:00:00Z'), endAt: new Date('2026-03-27T04:45:00Z'), bufferMinutes: 0, blockedUntilAt: new Date('2026-03-27T04:45:00Z'), occupiedKeys: [`${staffB.toString()}:2960000`], status: 'confirmed', source: 'internal', serviceSnapshot: { name: 'Cut B', durationMinutes: 45, priceMinor: 2000, currency: 'EUR' }, rescheduleCount: 0 },
    ]);
    await StaffSchedule.create({ businessId: businessA, staffId: staffA, weekly: [{ isoWeekday: 5, intervals: [{ start: '09:00', end: '17:00' }], breaks: [{ start: '12:00', end: '13:00' }] }] });
    await StaffException.create({ businessId: businessA, staffId: staffA, date: '2026-03-27', kind: 'custom', intervals: [{ start: '10:00', end: '16:00' }], breaks: [] });
    await BlockedPeriod.create({ businessId: businessA, staffId: staffA, startAt: new Date('2026-03-27T06:00:00Z'), endAt: new Date('2026-03-27T06:30:00Z'), reason: 'Break' });
  });

  afterAll(async () => { await disconnectFromDatabase(); await replSet.stop(); });

  it('covers authorized roles, A/B isolation, schedule exceptions, blocks, and load metrics', async () => {
    const owner: TenantContext = { businessId: businessA.toString(), userId: new mongoose.Types.ObjectId().toString(), role: 'owner' };
    const admin: TenantContext = { ...owner, role: 'admin' };
    const master: TenantContext = { ...owner, role: 'master', staffId: staffA.toString() };
    for (const ctx of [owner, admin, master]) {
      const data = await calendar.get(ctx, { view: 'day', date: '2026-03-27' });
      expect(data.staff.map((row) => row.id)).toEqual([staffA.toString()]);
      expect(data.appointments).toHaveLength(1);
      expect(data.appointments[0]?.customer.firstName).toBe('Client A');
      expect(data.workingIntervals[0]?.intervals).toEqual([{ start: '2026-03-27T04:00:00.000Z', end: '2026-03-27T06:00:00.000Z' }, { start: '2026-03-27T06:30:00.000Z', end: '2026-03-27T10:00:00.000Z' }]);
      expect(data.load[0]).toMatchObject({ bookedMinutes: 60, availableMinutes: 330, loadPercent: 18 });
    }
    const masterData = await calendar.get(master, { view: 'day', date: '2026-03-27' });
    expect(masterData.appointments[0]?.customer).not.toHaveProperty('phone');
    await expect(calendar.get(master, { view: 'day', date: '2026-03-27', staffId: staffB.toString() })).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('uses local business boundaries for a week crossing the Berlin DST transition', async () => {
    const otherBusiness: TenantContext = { businessId: businessB.toString(), userId: new mongoose.Types.ObjectId().toString(), role: 'owner' };
    const data = await calendar.get(otherBusiness, { view: 'week', date: '2026-03-29' });
    expect(data.range).toEqual({ from: '2026-03-22T23:00:00.000Z', to: '2026-03-29T22:00:00.000Z', timezone: 'Europe/Berlin' });
    expect(new Date(data.range.to).getTime() - new Date(data.range.from).getTime()).toBe(167 * 60 * 60 * 1000);
  });

  it('defaults to active appointments and supports includeCancelled', async () => {
    const ctx: TenantContext = { businessId: businessA.toString(), userId: new mongoose.Types.ObjectId().toString(), role: 'owner' };
    const cancelled = await Appointment.findOne({ businessId: businessA }).lean().exec();
    if (!cancelled) throw new Error('Missing appointment fixture');
    await Appointment.updateOne({ _id: cancelled._id, businessId: businessA }, { $set: { status: 'cancelled' }, $unset: { occupiedKeys: '' } }).exec();
    expect((await calendar.get(ctx, { view: 'day', date: '2026-03-27' })).appointments).toHaveLength(0);
    expect((await calendar.get(ctx, { view: 'day', date: '2026-03-27', includeCancelled: 'true' })).appointments).toHaveLength(1);
  });
});
