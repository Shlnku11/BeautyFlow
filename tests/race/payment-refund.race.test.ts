import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectFromDatabase } from '../../packages/server/src/db/connection';
import { up as createIndexes } from '../../packages/server/migrations/000_init';
import { PaymentService } from '../../packages/server/src/services/payment-service';
import { Appointment, Business, Customer, Payment, Service, Staff, Transaction, User } from '../../packages/server/src/db/models';
import type { TenantContext } from '../../packages/shared/src/types/tenant-context';

describe('payment refund race', () => {
  let replSet: MongoMemoryReplSet;
  let businessId: mongoose.Types.ObjectId;
  let appointmentId: mongoose.Types.ObjectId;
  let userId: mongoose.Types.ObjectId;
  const service = new PaymentService();

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGODB_URI = replSet.getUri('payment_race_test'); process.env.MONGODB_DB_NAME = 'payment_race_test'; process.env.TEST_MONGODB_URI = replSet.getUri('payment_race_test');
    await connectToDatabase();
    const database = mongoose.connection.db; if (!database) throw new Error('Missing MongoDB database');
    await createIndexes(database);
  }, 120_000);

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
    businessId = new mongoose.Types.ObjectId(); userId = new mongoose.Types.ObjectId();
    await Business.create({ _id: businessId, name: 'Race Salon', slug: 'payment-race', timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', status: 'active' });
    await User.create({ _id: userId, email: 'owner@race.test', emailNormalized: 'owner@race.test', passwordHash: null, name: 'Owner', locale: 'ru', status: 'active' });
    const customer = await Customer.create({ businessId, firstName: 'Client', phone: '+996555111111', phoneNormalized: '+996555111111', searchTokens: ['client'], source: 'internal' });
    const staff = await Staff.create({ businessId, displayName: 'Stylist' });
    const catalogService = await Service.create({ businessId, name: 'Cut', nameNormalized: 'cut', durationMinutes: 30, bufferMinutes: 0, priceMinor: 1000, currency: 'KGS', onlineBookingEnabled: true, isActive: true, displayOrder: 0 });
    const appointment = await Appointment.create({ businessId, customerId: customer._id, staffId: staff._id, serviceId: catalogService._id, startAt: new Date('2026-10-06T04:00:00.000Z'), endAt: new Date('2026-10-06T04:30:00.000Z'), bufferMinutes: 0, blockedUntilAt: new Date('2026-10-06T04:30:00.000Z'), status: 'confirmed', source: 'internal', serviceSnapshot: { name: 'Cut', durationMinutes: 30, priceMinor: 1000, currency: 'KGS' }, rescheduleCount: 0 });
    appointmentId = appointment._id;
  });

  afterAll(async () => { await disconnectFromDatabase(); await replSet.stop(); });

  it('allows exactly one of twenty competing full refunds and never exceeds the charge', async () => {
    const ctx: TenantContext = { businessId: businessId.toString(), userId: userId.toString(), role: 'owner' };
    const { payment } = await service.create(ctx, { appointmentId: appointmentId.toString(), amountMinor: 1000, method: 'cash', status: 'paid' }, 'race-key');
    const outcomes = await Promise.allSettled(Array.from({ length: 20 }, () => service.refund(ctx, payment.id, { amountMinor: 1000, note: 'race refund' })));
    const successes = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const failures = outcomes.filter((outcome) => outcome.status === 'rejected');
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(19);
    expect(failures.every((outcome) => outcome.status === 'rejected' && typeof outcome.reason === 'object' && outcome.reason !== null && 'httpStatus' in outcome.reason && outcome.reason.httpStatus === 409)).toBe(true);
    const saved = await Payment.findOne({ _id: payment.id, businessId }).lean().exec();
    expect(saved?.refundedMinor).toBe(1000);
    expect(saved?.refundedMinor).toBeLessThanOrEqual(saved?.amountMinor ?? 0);
    expect(await Transaction.countDocuments({ businessId, paymentId: payment.id, type: 'charge' })).toBe(1);
    expect(await Transaction.countDocuments({ businessId, paymentId: payment.id, type: 'refund' })).toBe(1);
  }, 120_000);
});
