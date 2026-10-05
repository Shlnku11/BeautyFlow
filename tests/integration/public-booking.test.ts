import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectFromDatabase } from '../../packages/server/src/db/connection';
import { up as createIndexes } from '../../packages/server/migrations/000_init';
import { PublicBookingService } from '../../packages/server/src/services/public-booking-service';
import { Appointment, Business, Customer, Service, Settings, Staff, StaffSchedule, StaffService } from '../../packages/server/src/db/models';
import type { PublicContext } from '../../packages/shared/src/types/tenant-context';

describe('public booking and manage links', () => {
  let replSet: MongoMemoryReplSet;
  let businessA: mongoose.Types.ObjectId;
  let businessB: mongoose.Types.ObjectId;
  let staffA: mongoose.Types.ObjectId;
  let serviceA: mongoose.Types.ObjectId;
  let serviceB: mongoose.Types.ObjectId;
  const service = new PublicBookingService();
  const context = (): PublicContext => ({ businessId: businessA.toString(), source: 'slug' });
  const startAt = '2026-10-10T04:00:00.000Z';
  const bookingInput = { serviceId: '', staffId: '', startAt, customer: { firstName: 'Public Client', phone: '+996555222333', email: 'public@example.test' }, acceptPrivacy: true, website: '' };

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGODB_URI = replSet.getUri('public_booking_test');
    process.env.MONGODB_DB_NAME = 'public_booking_test';
    process.env.TEST_MONGODB_URI = replSet.getUri('public_booking_test');
    await connectToDatabase();
    const database = mongoose.connection.db;
    if (!database) throw new Error('Missing MongoDB database');
    await createIndexes(database);
  }, 120_000);

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
    businessA = new mongoose.Types.ObjectId(); businessB = new mongoose.Types.ObjectId();
    await Business.create([{ _id: businessA, name: 'Business A', slug: 'public-a', timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', status: 'active', phone: '+996312111111', address: 'A street' }, { _id: businessB, name: 'Business B', slug: 'public-b', timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', status: 'active' }]);
    await Settings.create([{ businessId: businessA }, { businessId: businessB }]);
    const staff = await Staff.create({ businessId: businessA, displayName: 'Stylist A', color: 'violet', acceptsOnlineBooking: true, bio: 'Stylist' });
    const treatment = await Service.create({ businessId: businessA, name: 'Cut', nameNormalized: 'cut', description: 'Haircut', durationMinutes: 30, bufferMinutes: 0, priceMinor: 2500, currency: 'KGS', onlineBookingEnabled: true, isActive: true, displayOrder: 0 });
    const foreignTreatment = await Service.create({ businessId: businessB, name: 'Foreign Cut', nameNormalized: 'foreign cut', durationMinutes: 30, bufferMinutes: 0, priceMinor: 3000, currency: 'KGS', onlineBookingEnabled: true, isActive: true, displayOrder: 0 });
    staffA = staff._id; serviceA = treatment._id; serviceB = foreignTreatment._id;
    await StaffService.create({ businessId: businessA, staffId: staffA, serviceId: serviceA });
    await StaffSchedule.create({ businessId: businessA, staffId: staffA, weekly: [{ isoWeekday: 6, intervals: [{ start: '10:00', end: '12:00' }], breaks: [] }] });
    Object.assign(bookingInput, { serviceId: serviceA.toString(), staffId: staffA.toString() });
  });

  afterAll(async () => { await disconnectFromDatabase(); await replSet.stop(); });

  it('returns scoped public data, creates once idempotently, and allows token cancel', async () => {
    expect(await service.profile(context())).toMatchObject({ slug: 'public-a', timezone: 'Asia/Bishkek', consent: { required: true } });
    expect(await service.services(context())).toHaveLength(1);
    expect(await service.staff(context(), serviceA.toString())).toHaveLength(1);
    expect((await service.slots(context(), { serviceId: serviceA.toString(), staffId: staffA.toString(), date: '2026-10-10' })).slots).toContainEqual({ startAt });
    const foreignCustomer = await Customer.create({ businessId: businessB, firstName: 'Business B Client', phone: '+996555222333', phoneNormalized: '+996555222333', searchTokens: ['business b client'], source: 'internal' });
    const first = await service.book(context(), bookingInput, 'public-idempotency-01');
    const repeated = await service.book(context(), bookingInput, 'public-idempotency-01');
    expect(first.statusCode).toBe(201);
    expect(repeated.statusCode).toBe(200);
    expect(repeated.data.manageToken).toBe(first.data.manageToken);
    expect(first.data.appointment).toMatchObject({ business: { name: 'Business A' }, service: { name: 'Cut' }, staff: { displayName: 'Stylist A' }, status: 'confirmed' });
    expect(first.data.appointment).not.toHaveProperty('customer');
    expect(await Appointment.countDocuments({ businessId: businessA, source: 'public' })).toBe(1);
    expect(await Customer.countDocuments({ businessId: businessA, source: 'public' })).toBe(1);
    expect(await Customer.findOne({ _id: foreignCustomer._id, businessId: businessB }).then((row) => row?.firstName)).toBe('Business B Client');
    const row = await Appointment.findOne({ businessId: businessA, source: 'public' }).lean().exec();
    expect(row?.privacyAcceptedAt).toBeInstanceOf(Date);
    expect(row?.manageTokenHash).not.toBe(first.data.manageToken);
    expect(await service.manage(context(), first.data.manageToken)).toMatchObject({ id: row?._id.toString(), status: 'confirmed' });
    await expect(service.manage({ businessId: businessB.toString(), source: 'token' }, first.data.manageToken)).rejects.toMatchObject({ httpStatus: 404 });
    await service.cancel(context(), first.data.manageToken, 'Plans changed');
    expect(await Appointment.countDocuments({ businessId: businessA, status: 'cancelled', occupiedKeys: { $exists: true } })).toBe(0);
    await expect(service.cancel(context(), first.data.manageToken)).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
  });

  it('does not write for honeypot, missing consent, or foreign service ids', async () => {
    await expect(service.book(context(), { ...bookingInput, website: 'robot' }, 'trap-key')).rejects.toMatchObject({ httpStatus: 404 });
    await expect(service.book(context(), { ...bookingInput, acceptPrivacy: false }, 'consent-key')).rejects.toMatchObject({ httpStatus: 422 });
    await expect(service.book(context(), { ...bookingInput, serviceId: serviceB.toString() }, 'foreign-service-key')).rejects.toMatchObject({ httpStatus: 404 });
    expect(await Appointment.countDocuments({ businessId: businessA })).toBe(0);
    expect(await Customer.countDocuments({ businessId: businessA })).toBe(0);
  });

  it('allows only one of twenty simultaneous bookings for the same slot', async () => {
    const outcomes = await Promise.allSettled(Array.from({ length: 20 }, (_, index) => service.book(context(), bookingInput, `parallel-public-${index.toString().padStart(2, '0')}`)));
    expect(outcomes.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((value) => value.status === 'rejected')).toHaveLength(19);
    for (const outcome of outcomes) if (outcome.status === 'rejected') expect(outcome.reason).toMatchObject({ httpStatus: 409 });
    expect(await Appointment.countDocuments({ businessId: businessA, startAt: new Date(startAt) })).toBe(1);
  }, 30_000);
});
