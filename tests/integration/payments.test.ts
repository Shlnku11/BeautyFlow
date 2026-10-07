import { MongoMemoryReplSet } from 'mongodb-memory-server';
import express from 'express';
import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectFromDatabase } from '../../packages/server/src/db/connection';
import { up as createIndexes } from '../../packages/server/migrations/000_init';
import { configureRateLimitAdapter } from '../../packages/server/src/http/rate-limit';
import { Appointment, AuditLog, Business, Customer, Payment, Service, Staff, Transaction, User } from '../../packages/server/src/db/models';

describe('payment API and ledger invariants', () => {
  let replSet: MongoMemoryReplSet;
  let server: Server;
  let baseUrl: string;
  let registerPaymentRoutes: typeof import('../../packages/server/src/http/payment-routes').registerPaymentRoutes;
  let businessA: mongoose.Types.ObjectId;
  let businessB: mongoose.Types.ObjectId;
  let appointmentA: mongoose.Types.ObjectId;
  let cancelledAppointmentA: mongoose.Types.ObjectId;
  let appointmentB: mongoose.Types.ObjectId;
  let customerA: mongoose.Types.ObjectId;
  let staffA: mongoose.Types.ObjectId;
  let userId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    const uri = replSet.getUri();
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = uri;
    process.env.MONGODB_DB_NAME = 'payments_test';
    process.env.TEST_MONGODB_URI = uri;
    const routeRuntime = await import('../../packages/server/src/http/define-route');
    registerPaymentRoutes = (await import('../../packages/server/src/http/payment-routes')).registerPaymentRoutes;
    await connectToDatabase();
    const database = mongoose.connection.db;
    if (!database) throw new Error('Missing MongoDB database');
    await createIndexes(database);
    routeRuntime.configureRouteRuntime({ resolveTenantContext: async (request) => ({ businessId: request.headers.get('x-test-business') ?? businessA.toString(), userId: userId.toString(), role: (request.headers.get('x-test-role') ?? 'owner') as 'owner' | 'admin' | 'master' }), resolvePublicContext: async () => null });
    configureRateLimitAdapter(async () => ({ allowed: true }));
    const app = express(); app.use(express.json()); registerPaymentRoutes(app);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing test HTTP address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 120_000);

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
    businessA = new mongoose.Types.ObjectId(); businessB = new mongoose.Types.ObjectId(); userId = new mongoose.Types.ObjectId();
    await Business.create([
      { _id: businessA, name: 'Business A', slug: 'payments-a', timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', status: 'active' },
      { _id: businessB, name: 'Business B', slug: 'payments-b', timezone: 'Europe/Berlin', currency: 'EUR', countryCode: 'OTHER', status: 'active' },
    ]);
    await User.create({ _id: userId, email: 'owner@example.test', emailNormalized: 'owner@example.test', passwordHash: null, name: 'Owner A', locale: 'ru', status: 'active' });
    const customer = await Customer.create({ businessId: businessA, firstName: 'Client', phone: '+996555111111', phoneNormalized: '+996555111111', searchTokens: ['client', '996555111111'], source: 'internal' });
    const staff = await Staff.create({ businessId: businessA, displayName: 'Stylist' });
    const service = await Service.create({ businessId: businessA, name: 'Cut', nameNormalized: 'cut', durationMinutes: 30, bufferMinutes: 0, priceMinor: 1000, currency: 'KGS', onlineBookingEnabled: true, isActive: true, displayOrder: 0 });
    customerA = customer._id; staffA = staff._id;
    const appointmentInput = { businessId: businessA, customerId: customerA, staffId: staffA, serviceId: service._id, startAt: new Date('2026-10-06T04:00:00.000Z'), endAt: new Date('2026-10-06T04:30:00.000Z'), bufferMinutes: 0, blockedUntilAt: new Date('2026-10-06T04:30:00.000Z'), status: 'confirmed' as const, source: 'internal' as const, serviceSnapshot: { name: 'Cut', durationMinutes: 30, priceMinor: 1000, currency: 'KGS' as const }, rescheduleCount: 0 };
    const appointment = await Appointment.create(appointmentInput);
    const cancelledAppointment = await Appointment.create({ ...appointmentInput, status: 'cancelled' });
    const foreignCustomer = await Customer.create({ businessId: businessB, firstName: 'Client B', phone: '+491234567', phoneNormalized: '+491234567', searchTokens: ['client', '491234567'], source: 'internal' });
    const foreignStaff = await Staff.create({ businessId: businessB, displayName: 'Stylist B' });
    const foreignService = await Service.create({ businessId: businessB, name: 'Cut B', nameNormalized: 'cut b', durationMinutes: 30, bufferMinutes: 0, priceMinor: 1000, currency: 'EUR', onlineBookingEnabled: true, isActive: true, displayOrder: 0 });
    const foreignAppointment = await Appointment.create({ ...appointmentInput, businessId: businessB, customerId: foreignCustomer._id, staffId: foreignStaff._id, serviceId: foreignService._id, serviceSnapshot: { name: 'Cut B', durationMinutes: 30, priceMinor: 1000, currency: 'EUR' } });
    appointmentA = appointment._id; cancelledAppointmentA = cancelledAppointment._id; appointmentB = foreignAppointment._id;
  });

  afterAll(async () => { if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); await disconnectFromDatabase(); await replSet.stop(); });

  async function request(path: string, options: RequestInit = {}, role = 'owner', businessId = businessA.toString()) {
    const headers = new Headers(options.headers);
    headers.set('x-test-role', role); headers.set('x-test-business', businessId); headers.set('origin', 'http://localhost:3000');
    if (options.body !== undefined) headers.set('content-type', 'application/json');
    const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
    return { status: response.status, payload: await response.json() as Record<string, unknown> };
  }

  it('creates one payment and one charge idempotently; derives references from its appointment', async () => {
    const body = JSON.stringify({ appointmentId: appointmentA.toString(), amountMinor: 1000, method: 'cash', status: 'paid' });
    const first = await request('/api/payments', { method: 'POST', headers: { 'idempotency-key': 'pay-once' }, body });
    const second = await request('/api/payments', { method: 'POST', headers: { 'idempotency-key': 'pay-once' }, body });
    expect(first.status).toBe(201); expect(second.status).toBe(201);
    const firstData = first.payload.data as { id: string; customerId: string; staffId: string; currency: string };
    const secondData = second.payload.data as { id: string };
    expect(secondData.id).toBe(firstData.id);
    expect(firstData).toMatchObject({ customerId: customerA.toString(), staffId: staffA.toString(), currency: 'KGS' });
    expect(await Payment.countDocuments({ businessId: businessA })).toBe(1);
    expect(await Transaction.countDocuments({ businessId: businessA, paymentId: firstData.id, type: 'charge' })).toBe(1);
    expect(await AuditLog.countDocuments({ businessId: businessA, action: 'payment.created' })).toBe(1);
  });

  it('makes mark-paid idempotent and emits a single charge', async () => {
    const created = await request('/api/payments', { method: 'POST', headers: { 'idempotency-key': 'pending-pay' }, body: JSON.stringify({ appointmentId: appointmentA.toString(), amountMinor: 900, method: 'transfer', status: 'pending' }) });
    const payment = created.payload.data as { id: string };
    expect(await Transaction.countDocuments({ businessId: businessA, paymentId: payment.id })).toBe(0);
    const paidA = await request(`/api/payments/${payment.id}/mark-paid`, { method: 'POST', body: JSON.stringify({}) });
    const paidB = await request(`/api/payments/${payment.id}/mark-paid`, { method: 'POST', body: JSON.stringify({}) });
    expect(paidA.status).toBe(200); expect(paidB.status).toBe(200);
    expect(await Transaction.countDocuments({ businessId: businessA, paymentId: payment.id, type: 'charge' })).toBe(1);
  });

  it('records partial and full refunds exactly once and rejects an excess refund', async () => {
    const created = await request('/api/payments', { method: 'POST', headers: { 'idempotency-key': 'refund-pay' }, body: JSON.stringify({ appointmentId: appointmentA.toString(), amountMinor: 1000, method: 'card' }) });
    const payment = created.payload.data as { id: string };
    const partial = await request(`/api/payments/${payment.id}/refund`, { method: 'POST', body: JSON.stringify({ amountMinor: 300, note: 'Частичный возврат' }) });
    expect(partial.status).toBe(200);
    const excess = await request(`/api/payments/${payment.id}/refund`, { method: 'POST', body: JSON.stringify({ amountMinor: 701, note: 'Сверх остатка' }) });
    expect(excess).toMatchObject({ status: 409 });
    expect((excess.payload.error as { code: string }).code).toBe('REFUND_EXCEEDS_PAID');
    const full = await request(`/api/payments/${payment.id}/refund`, { method: 'POST', body: JSON.stringify({ amountMinor: 700, note: 'Остаток' }) });
    expect(full.status).toBe(200);
    expect((full.payload.data as { status: string; refundedMinor: number })).toMatchObject({ status: 'refunded', refundedMinor: 1000 });
    expect(await Transaction.countDocuments({ businessId: businessA, paymentId: payment.id, type: 'refund' })).toBe(2);
  });

  it('cancels only pending payments without ledger entries', async () => {
    const created = await request('/api/payments', { method: 'POST', headers: { 'idempotency-key': 'cancel-pay' }, body: JSON.stringify({ appointmentId: appointmentA.toString(), amountMinor: 1000, method: 'cash', status: 'pending' }) });
    const payment = created.payload.data as { id: string };
    expect((await request(`/api/payments/${payment.id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'ошибка' }) })).status).toBe(200);
    expect(await Transaction.countDocuments({ businessId: businessA, paymentId: payment.id })).toBe(0);
    expect(await AuditLog.countDocuments({ businessId: businessA, action: 'payment.cancelled' })).toBe(1);
  });

  it('does not accept a payment for a cancelled appointment or an appointment from business B', async () => {
    const cancelled = await request('/api/payments', { method: 'POST', headers: { 'idempotency-key': 'cancelled-apt' }, body: JSON.stringify({ appointmentId: cancelledAppointmentA.toString(), amountMinor: 1000, method: 'cash' }) });
    expect(cancelled.status).toBe(409); expect((cancelled.payload.error as { code: string }).code).toBe('APPOINTMENT_CANCELLED');
    const foreign = await request('/api/payments', { method: 'POST', headers: { 'idempotency-key': 'foreign-apt' }, body: JSON.stringify({ appointmentId: appointmentB.toString(), amountMinor: 1000, method: 'cash' }) });
    expect(foreign.status).toBe(404);
    expect(await Payment.countDocuments({ businessId: businessA })).toBe(0);
    expect(await Transaction.countDocuments({ businessId: businessA })).toBe(0);
  });

  it('applies local date/role filters and keeps totals scoped; master gets 403 on every PAY route', async () => {
    await request('/api/payments', { method: 'POST', headers: { 'idempotency-key': 'list-pay' }, body: JSON.stringify({ appointmentId: appointmentA.toString(), amountMinor: 875, method: 'cash' }) });
    const today = DateTime.now().setZone('Asia/Bishkek').toISODate();
    if (!today) throw new Error('Expected a local payment test date');
    const list = await request(`/api/payments?method=cash&status=paid&from=${today}&to=${today}&q=Client`);
    expect(list.status).toBe(200);
    expect((list.payload.meta as { totals: { paidMinor: number } }).totals.paidMinor).toBe(875);
    const payment = list.payload.data as { id: string }[];
    const id = payment[0]?.id;
    if (!id) throw new Error('Expected payment fixture row');
    const masterResponses = await Promise.all([
      request('/api/payments', {}, 'master'),
      request('/api/payments', { method: 'POST', headers: { 'idempotency-key': 'master-key' }, body: JSON.stringify({ appointmentId: appointmentA.toString(), amountMinor: 10, method: 'cash' }) }, 'master'),
      request(`/api/payments/${id}/mark-paid`, { method: 'POST', body: JSON.stringify({}) }, 'master'),
      request(`/api/payments/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) }, 'master'),
      request(`/api/payments/${id}/refund`, { method: 'POST', body: JSON.stringify({ amountMinor: 1, note: 'no' }) }, 'master'),
    ]);
    expect(masterResponses.map((response) => response.status)).toEqual([403, 403, 403, 403, 403]);
  });
});
