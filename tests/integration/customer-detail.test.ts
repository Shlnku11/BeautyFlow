import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectFromDatabase } from '../../packages/server/src/db/connection';
import { up as createIndexes } from '../../packages/server/migrations/000_init';
import { CustomerService } from '../../packages/server/src/services/customer-service';
import { Appointment, Business, Customer, Service, Settings, Staff, Transaction } from '../../packages/server/src/db/models';
import type { TenantContext } from '../../packages/shared/src/types/tenant-context';

describe('customer detail and appointment history', () => {
  let replSet: MongoMemoryReplSet;
  let businessA: mongoose.Types.ObjectId;
  let businessB: mongoose.Types.ObjectId;
  let customerA: mongoose.Types.ObjectId;
  let customerB: mongoose.Types.ObjectId;
  let staffA: mongoose.Types.ObjectId;
  let staffA2: mongoose.Types.ObjectId;
  let serviceA: mongoose.Types.ObjectId;
  const customerService = new CustomerService();

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGODB_URI = replSet.getUri('customer_detail_test');
    process.env.MONGODB_DB_NAME = 'customer_detail_test';
    process.env.TEST_MONGODB_URI = replSet.getUri('customer_detail_test');
    await connectToDatabase();
    const database = mongoose.connection.db;
    if (!database) throw new Error('MongoDB connection has no database handle');
    await createIndexes(database);
  }, 120_000);

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
    businessA = new mongoose.Types.ObjectId();
    businessB = new mongoose.Types.ObjectId();
    const [bizA, bizB] = await Business.create([
      { _id: businessA, name: 'A salon', slug: 'a-salon', timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', status: 'active' },
      { _id: businessB, name: 'B salon', slug: 'b-salon', timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', status: 'active' },
    ]);
    if (!bizA || !bizB) throw new Error('Expected two businesses');
    await Settings.create([{ businessId: businessA, privacy: { masterSeesCustomerPhone: false } }, { businessId: businessB }]);
    const [a, b] = await Customer.create([
      { businessId: businessA, firstName: 'Alex', lastName: 'A', phone: '+996555111111', phoneNormalized: '+996555111111', email: 'a@example.test', searchTokens: ['alex'], source: 'internal' },
      { businessId: businessB, firstName: 'Alex', lastName: 'B', phone: '+996555111111', phoneNormalized: '+996555111111', email: 'b@example.test', searchTokens: ['alex'], source: 'internal' },
    ]);
    if (!a || !b) throw new Error('Expected two customers');
    customerA = a._id;
    customerB = b._id;
    const staff = await Staff.create([
      { businessId: businessA, displayName: 'Master A', color: 'violet' },
      { businessId: businessA, displayName: 'Master A2', color: 'rose' },
    ]);
    const stylist = staff[0];
    const secondStylist = staff[1];
    if (!stylist || !secondStylist) throw new Error('Expected two staff members');
    staffA = stylist._id;
    staffA2 = secondStylist._id;
    const service = await Service.create({ businessId: businessA, name: 'Cut', nameNormalized: 'cut', durationMinutes: 30, bufferMinutes: 0, priceMinor: 2500, currency: 'KGS', onlineBookingEnabled: true, isActive: true, displayOrder: 0 });
    serviceA = service._id;
    await Appointment.create([
      { businessId: businessA, customerId: customerA, staffId: staffA, serviceId: serviceA, startAt: new Date('2026-10-02T04:00:00.000Z'), endAt: new Date('2026-10-02T04:30:00.000Z'), blockedUntilAt: new Date('2026-10-02T04:30:00.000Z'), bufferMinutes: 0, status: 'completed', source: 'internal', serviceSnapshot: { name: 'Cut', durationMinutes: 30, priceMinor: 2500, currency: 'KGS' }, internalNote: 'private', rescheduleCount: 0 },
      { businessId: businessA, customerId: customerA, staffId: staffA2, serviceId: serviceA, startAt: new Date('2026-10-11T04:00:00.000Z'), endAt: new Date('2026-10-11T04:30:00.000Z'), blockedUntilAt: new Date('2026-10-11T04:30:00.000Z'), bufferMinutes: 0, status: 'confirmed', source: 'public', serviceSnapshot: { name: 'Cut', durationMinutes: 30, priceMinor: 2500, currency: 'KGS' }, rescheduleCount: 0 },
    ]);
    const paymentId = new mongoose.Types.ObjectId();
    const appointmentId = await Appointment.findOne({ businessId: businessA, status: 'completed' }).then((row) => row?._id);
    if (!appointmentId) throw new Error('Expected completed appointment');
    await Transaction.create([
      { businessId: businessA, paymentId, appointmentId, customerId: customerA, staffId: staffA, type: 'charge', direction: 'in', amountMinor: 2000, currency: 'KGS', method: 'cash', occurredAt: new Date('2026-10-02T04:30:00.000Z'), createdBy: new mongoose.Types.ObjectId() },
      { businessId: businessA, paymentId, appointmentId, customerId: customerA, staffId: staffA, type: 'refund', direction: 'out', amountMinor: 500, currency: 'KGS', method: 'cash', occurredAt: new Date('2026-10-03T04:30:00.000Z'), createdBy: new mongoose.Types.ObjectId() },
    ]);
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await replSet.stop();
  });

  it('returns owner summary with completed count, next visit, and net transaction total', async () => {
    const ctx: TenantContext = { businessId: businessA.toString(), userId: new mongoose.Types.ObjectId().toString(), role: 'owner' };
    const result = await customerService.get(ctx, customerA.toString());
    expect(result).toMatchObject({
      customer: { id: customerA.toString(), email: 'a@example.test' },
      summary: { visitsCount: 1, lastVisitAt: '2026-10-02T04:00:00.000Z', nextVisitAt: '2026-10-11T04:00:00.000Z', totalPaidMinor: 1500, currency: 'KGS' },
    });
  });

  it('masks a foreign business customer and scopes history to the master’s own appointments', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const ctx: TenantContext = { businessId: businessA.toString(), userId, role: 'owner' };
    await expect(customerService.get(ctx, customerB.toString())).rejects.toMatchObject({ httpStatus: 404 });
    const master: TenantContext = { businessId: businessA.toString(), userId, role: 'master', staffId: staffA.toString() };
    const detail = await customerService.get(master, customerA.toString());
    expect(detail).toEqual({ customer: { id: customerA.toString(), firstName: 'Alex', lastName: 'A' } });
    const history = await customerService.appointments(master, customerA.toString(), { page: 1, limit: 25 });
    expect(history.data).toHaveLength(1);
    expect(history.data[0]).not.toHaveProperty('internalNote');
    expect(history.data[0]).not.toHaveProperty('payment');
    expect(history.data[0]?.customer).not.toHaveProperty('email');
    expect(history.data[0]?.customer).not.toHaveProperty('phone');
  });

  it('returns appointment history with date, status, and pagination filters', async () => {
    const ctx: TenantContext = { businessId: businessA.toString(), userId: new mongoose.Types.ObjectId().toString(), role: 'owner' };
    const result = await customerService.appointments(ctx, customerA.toString(), { status: 'completed', from: '2026-10-01T00:00:00.000Z', to: '2026-10-05T00:00:00.000Z', page: 1, limit: 10 });
    expect(result.meta.total).toBe(1);
    expect(result.data[0]).toMatchObject({ id: expect.any(String), status: 'completed', staff: { id: staffA.toString() }, service: { id: serviceA.toString() } });
  });

  it('keeps customer search, upcoming filters, and last-visit ordering inside tenant and master scope', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const owner: TenantContext = { businessId: businessA.toString(), userId, role: 'owner' };
    const search = await customerService.list(owner, { q: 'alex', sort: 'createdAt', order: 'desc', page: 1, limit: 25 });
    expect(search.meta.total).toBe(1);
    expect(search.data).toHaveLength(1);
    expect(search.data[0]).toMatchObject({ id: customerA.toString(), visitsCount: 1, lastVisitAt: '2026-10-02T04:00:00.000Z' });
    const upcoming = await customerService.list(owner, { hasUpcoming: true, sort: 'lastVisitAt', order: 'desc', page: 1, limit: 25 });
    expect(upcoming.meta.total).toBe(1);
    expect(upcoming.data).toHaveLength(1);
    expect(upcoming.data[0]).toMatchObject({ id: customerA.toString() });
    const master: TenantContext = { ...owner, role: 'master', staffId: staffA.toString() };
    const masterUpcoming = await customerService.list(master, { hasUpcoming: true, sort: 'createdAt', order: 'desc', page: 1, limit: 25 });
    expect(masterUpcoming.data).toHaveLength(0);
    const masterCustomers = await customerService.list(master, { hasUpcoming: false, sort: 'lastVisitAt', order: 'desc', page: 1, limit: 25 });
    expect(masterCustomers.data).toHaveLength(1);
    expect(masterCustomers.data[0]).not.toHaveProperty('email');
  });
});
