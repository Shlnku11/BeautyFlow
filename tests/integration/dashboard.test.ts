import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectFromDatabase } from '../../packages/server/src/db/connection';
import { up as createIndexes } from '../../packages/server/migrations/000_init';
import { Appointment, Business, Customer, Payment, Service, Staff, StaffSchedule, Transaction } from '../../packages/server/src/db/models';
import { DashboardService } from '../../packages/server/src/services/dashboard-service';
import type { TenantContext } from '../../packages/shared/src/types/tenant-context';

describe('dashboard DSH-01/05 and MST-01', () => {
  let replSet: MongoMemoryReplSet;
  let businessA: mongoose.Types.ObjectId;
  let businessB: mongoose.Types.ObjectId;
  let staffA: mongoose.Types.ObjectId;
  let staffA2: mongoose.Types.ObjectId;
  let staffB: mongoose.Types.ObjectId;
  const dashboard = new DashboardService();

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGODB_URI = replSet.getUri('dashboard_test'); process.env.MONGODB_DB_NAME = 'dashboard_test'; process.env.TEST_MONGODB_URI = replSet.getUri('dashboard_test');
    await connectToDatabase();
    if (!mongoose.connection.db) throw new Error('Missing MongoDB database');
    await createIndexes(mongoose.connection.db);
  }, 120_000);
  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
    businessA = new mongoose.Types.ObjectId(); businessB = new mongoose.Types.ObjectId();
    await Business.create([{ _id: businessA, name: 'Business A', slug: `dash-a-${businessA}`, timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', status: 'active' }, { _id: businessB, name: 'Business B', slug: `dash-b-${businessB}`, timezone: 'Europe/Berlin', currency: 'EUR', countryCode: 'OTHER', status: 'active' }]);
    const [a, a2, b] = await Staff.create([{ businessId: businessA, displayName: 'Master A' }, { businessId: businessA, displayName: 'Other A' }, { businessId: businessB, displayName: 'Master B' }]);
    if (!a || !a2 || !b) throw new Error('Missing staff fixtures'); staffA = a._id; staffA2 = a2._id; staffB = b._id;
    const [customerA, customerA2, customerB] = await Customer.create([
      { businessId: businessA, firstName: 'Client A', phone: '+996555111111', phoneNormalized: '+996555111111', searchTokens: [], source: 'internal' },
      { businessId: businessA, firstName: 'Client A2', phone: '+996555111112', phoneNormalized: '+996555111112', searchTokens: [], source: 'internal' },
      { businessId: businessB, firstName: 'Client B', phone: '+4915112345678', phoneNormalized: '+4915112345678', searchTokens: [], source: 'internal' },
    ]);
    const [serviceA, serviceB] = await Service.create([
      { businessId: businessA, name: 'Cut A', nameNormalized: 'cut a', durationMinutes: 60, bufferMinutes: 0, priceMinor: 3000, currency: 'KGS', onlineBookingEnabled: true, isActive: true, displayOrder: 0 },
      { businessId: businessB, name: 'Cut B', nameNormalized: 'cut b', durationMinutes: 60, bufferMinutes: 0, priceMinor: 2000, currency: 'EUR', onlineBookingEnabled: true, isActive: true, displayOrder: 0 },
    ]);
    if (!customerA || !customerA2 || !customerB || !serviceA || !serviceB) throw new Error('Missing customer/service fixtures');
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000); tomorrow.setUTCMinutes(0, 0, 0);
    const rows = await Appointment.create([
      { businessId: businessA, customerId: customerA._id, staffId: staffA, serviceId: serviceA._id, startAt: tomorrow, endAt: new Date(tomorrow.getTime() + 3_600_000), bufferMinutes: 0, blockedUntilAt: new Date(tomorrow.getTime() + 3_600_000), status: 'confirmed', source: 'internal', serviceSnapshot: { name: 'Cut A', durationMinutes: 60, priceMinor: 3000, currency: 'KGS' }, rescheduleCount: 0 },
      { businessId: businessA, customerId: customerA2._id, staffId: staffA2, serviceId: serviceA._id, startAt: new Date(tomorrow.getTime() + 7_200_000), endAt: new Date(tomorrow.getTime() + 10_800_000), bufferMinutes: 0, blockedUntilAt: new Date(tomorrow.getTime() + 10_800_000), status: 'pending', source: 'internal', serviceSnapshot: { name: 'Cut A', durationMinutes: 60, priceMinor: 3000, currency: 'KGS' }, rescheduleCount: 0 },
      { businessId: businessB, customerId: customerB._id, staffId: staffB, serviceId: serviceB._id, startAt: tomorrow, endAt: new Date(tomorrow.getTime() + 3_600_000), bufferMinutes: 0, blockedUntilAt: new Date(tomorrow.getTime() + 3_600_000), status: 'confirmed', source: 'internal', serviceSnapshot: { name: 'Cut B', durationMinutes: 60, priceMinor: 2000, currency: 'EUR' }, rescheduleCount: 0 },
    ]);
    const [chargeAppointment] = rows;
    const foreignAppointment = rows[2];
    if (!chargeAppointment || !foreignAppointment) throw new Error('Missing appointment fixture');
    const payment = await Payment.create({ businessId: businessA, appointmentId: chargeAppointment._id, customerId: customerA._id, staffId: staffA, amountMinor: 2500, refundedMinor: 500, currency: 'KGS', method: 'cash', status: 'paid', paidAt: now, idempotencyKey: `dashboard-${businessA}`, createdBy: new mongoose.Types.ObjectId() });
    await Transaction.create([
      { businessId: businessA, paymentId: payment._id, appointmentId: chargeAppointment._id, customerId: customerA._id, staffId: staffA, type: 'charge', direction: 'in', amountMinor: 2500, currency: 'KGS', method: 'cash', occurredAt: now, createdBy: payment.createdBy },
      { businessId: businessA, paymentId: payment._id, appointmentId: chargeAppointment._id, customerId: customerA._id, staffId: staffA, type: 'refund', direction: 'out', amountMinor: 500, currency: 'KGS', method: 'cash', occurredAt: now, createdBy: payment.createdBy },
      { businessId: businessB, paymentId: new mongoose.Types.ObjectId(), appointmentId: foreignAppointment._id, customerId: customerB._id, staffId: staffB, type: 'charge', direction: 'in', amountMinor: 999_999, currency: 'EUR', method: 'cash', occurredAt: now, createdBy: new mongoose.Types.ObjectId() },
    ]);
    await StaffSchedule.create({ businessId: businessA, staffId: staffA, weekly: [{ isoWeekday: new Date().getUTCDay() || 7, intervals: [{ start: '00:00', end: '23:59' }], breaks: [] }] });
  });
  afterAll(async () => { await disconnectFromDatabase(); await replSet.stop(); });

  it('isolates summary and upcoming data by business, includes previous, limits upcoming', async () => {
    const owner: TenantContext = { businessId: businessA.toString(), userId: new mongoose.Types.ObjectId().toString(), role: 'owner' };
    const result = await dashboard.summary(owner, { preset: 'today', compare: 'true' });
    expect(result.revenue).toMatchObject({ grossMinor: 2500, refundedMinor: 500, netMinor: 2000, currency: 'KGS' });
    expect(result.previous).toBeDefined();
    expect((await dashboard.upcoming(owner, { limit: 1 })).length).toBeLessThanOrEqual(1);
    const other: TenantContext = { ...owner, businessId: businessB.toString() };
    expect((await dashboard.summary(other, { preset: 'today' })).revenue.netMinor).toBe(999_999);
    expect((await dashboard.upcoming(other, { limit: 20 })).every((row) => row.service.name === 'Cut B')).toBe(true);
  });

  it('master dashboard contains only its own appointments and no money fields', async () => {
    const master: TenantContext = { businessId: businessA.toString(), userId: new mongoose.Types.ObjectId().toString(), role: 'master', staffId: staffA.toString() };
    const result = await dashboard.master(master, {});
    expect(result.today.every((row) => row.staff.id === staffA.toString())).toBe(true);
    expect(result.upcoming.every((row) => row.staff.id === staffA.toString())).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/amountMinor|revenue|payment/i);
    expect(result).toHaveProperty('load');
    await expect(dashboard.summary(master, { preset: 'today' })).rejects.toMatchObject({ httpStatus: 403 });
    await expect(dashboard.upcoming(master, { limit: 10 })).rejects.toMatchObject({ httpStatus: 403 });
  });
});
