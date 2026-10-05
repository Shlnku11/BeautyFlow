import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectFromDatabase } from '../../packages/server/src/db/connection';
import { up as createIndexes } from '../../packages/server/migrations/000_init';
import { AppointmentService } from '../../packages/server/src/services/appointment-service';
import { Appointment, Business, Customer, Notification, Service, Settings, Staff } from '../../packages/server/src/db/models';
import type { TenantContext } from '../../packages/shared/src/types/tenant-context';

describe('appointment internal lifecycle', () => {
  let replSet: MongoMemoryReplSet;
  let businessA: mongoose.Types.ObjectId;
  let businessB: mongoose.Types.ObjectId;
  let customerA: mongoose.Types.ObjectId;
  let staffA: mongoose.Types.ObjectId;
  let serviceA: mongoose.Types.ObjectId;
  let appointmentId: mongoose.Types.ObjectId;
  const service = new AppointmentService();

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGODB_URI = replSet.getUri('appointment_lifecycle_test');
    process.env.MONGODB_DB_NAME = 'appointment_lifecycle_test';
    process.env.TEST_MONGODB_URI = replSet.getUri('appointment_lifecycle_test');
    await connectToDatabase();
    const database = mongoose.connection.db;
    if (!database) throw new Error('Missing MongoDB database');
    await createIndexes(database);
  }, 120_000);

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
    businessA = new mongoose.Types.ObjectId(); businessB = new mongoose.Types.ObjectId();
    await Business.create([{ _id: businessA, name: 'Business A', slug: 'lifecycle-a', timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', status: 'active' }, { _id: businessB, name: 'Business B', slug: 'lifecycle-b', timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', status: 'active' }]);
    const customer = await Customer.create({ businessId: businessA, firstName: 'Client', phone: '+996555111111', phoneNormalized: '+996555111111', email: 'client@example.test', searchTokens: ['client'], source: 'internal' });
    const staff = await Staff.create({ businessId: businessA, displayName: 'Stylist', color: 'violet' });
    const treatment = await Service.create({ businessId: businessA, name: 'Cut', nameNormalized: 'cut', durationMinutes: 30, bufferMinutes: 0, priceMinor: 1000, currency: 'KGS', onlineBookingEnabled: true, isActive: true, displayOrder: 0 });
    await Settings.create({ businessId: businessA });
    customerA = customer._id; staffA = staff._id; serviceA = treatment._id;
    const appointment = await Appointment.create({ businessId: businessA, customerId: customerA, staffId: staffA, serviceId: serviceA, startAt: new Date('2026-10-02T04:00:00.000Z'), endAt: new Date('2026-10-02T04:30:00.000Z'), bufferMinutes: 0, blockedUntilAt: new Date('2026-10-02T04:30:00.000Z'), occupiedKeys: [`${staffA.toString()}:3133400`], status: 'confirmed', source: 'internal', serviceSnapshot: { name: 'Cut', durationMinutes: 30, priceMinor: 1000, currency: 'KGS' }, rescheduleCount: 0 });
    appointmentId = appointment._id;
  });

  afterAll(async () => { await disconnectFromDatabase(); await replSet.stop(); });

  it('scopes reads to business and master, allows only visitNote for masters, and enqueues completion follow-up', async () => {
    const owner: TenantContext = { businessId: businessA.toString(), userId: new mongoose.Types.ObjectId().toString(), role: 'owner' };
    const master: TenantContext = { ...owner, role: 'master', staffId: staffA.toString() };
    const foreign: TenantContext = { ...owner, businessId: businessB.toString() };
    expect(await service.list(master, { page: 1, limit: 25 })).toHaveLength(1);
    await expect(service.get(foreign, appointmentId.toString())).rejects.toMatchObject({ httpStatus: 404 });
    await expect(service.update(master, appointmentId.toString(), { internalNote: 'private' })).rejects.toMatchObject({ httpStatus: 422 });
    await service.update(master, appointmentId.toString(), { visitNote: 'Completed cut' });
    await service.changeStatus(master, appointmentId.toString(), { status: 'completed' });
    expect(await Appointment.findOne({ _id: appointmentId, businessId: businessA }).then((row) => row?.visitNote)).toBe('Completed cut');
    expect(await Notification.countDocuments({ businessId: businessA, appointmentId, kind: 'followup_after_visit', status: 'scheduled' })).toBe(1);
  });

  it('frees occupied keys on cancellation and rejects an invalid same-state transition', async () => {
    const owner: TenantContext = { businessId: businessA.toString(), userId: new mongoose.Types.ObjectId().toString(), role: 'owner' };
    await expect(service.changeStatus(owner, appointmentId.toString(), { status: 'confirmed' })).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
    await service.changeStatus(owner, appointmentId.toString(), { status: 'cancelled', cancelReason: 'Changed plans' });
    expect(await Appointment.findOne({ _id: appointmentId, businessId: businessA }).then((row) => row?.occupiedKeys)).toBeUndefined();
    expect(await Notification.countDocuments({ businessId: businessA, appointmentId, kind: 'appointment_cancelled', status: 'scheduled' })).toBe(1);
  });
});
