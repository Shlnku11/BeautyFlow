import express from 'express';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectFromDatabase } from '../../packages/server/src/db/connection';
import { up as createIndexes } from '../../packages/server/migrations/000_init';
import { configureRateLimitAdapter } from '../../packages/server/src/http/rate-limit';
import { MVP_ROUTE_CONTRACTS } from '../../packages/server/src/http/route-contracts';
import { PERMISSION_SCOPES, type PermissionKey } from '../../packages/server/src/domain/permissions';
import type { BusinessRole } from '../../packages/shared/src/constants';
import { Appointment, BlockedPeriod, Business, BusinessMember, Customer, Payment, Service, Staff, Settings } from '../../packages/server/src/db/models';

const roles: BusinessRole[] = ['owner', 'admin', 'master'];
const sessionContracts = MVP_ROUTE_CONTRACTS.filter((route) => route.auth === 'session');
const contextCookie = 'na_sid=phase12-matrix-session';

describe('Stage 12.1 route role × endpoint gate', () => {
  let replSet: import('mongodb-memory-server').MongoMemoryReplSet;
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let baseUrl: string;
  let businessA: mongoose.Types.ObjectId;
  let businessB: mongoose.Types.ObjectId;
  let userId: mongoose.Types.ObjectId;
  let staffB: mongoose.Types.ObjectId;
  let staffA: mongoose.Types.ObjectId;
  let customerB: mongoose.Types.ObjectId;
  let serviceB: mongoose.Types.ObjectId;
  let appointmentB: mongoose.Types.ObjectId;
  let blockedPeriodB: mongoose.Types.ObjectId;
  let memberB: mongoose.Types.ObjectId;
  let paymentB: mongoose.Types.ObjectId;

  beforeAll(async () => {
    const { MongoMemoryReplSet } = await import('mongodb-memory-server');
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = replSet.getUri('stage12_role_matrix');
    process.env.MONGODB_DB_NAME = 'stage12_role_matrix';
    process.env.TEST_MONGODB_URI = process.env.MONGODB_URI;
    await connectToDatabase();
    const database = mongoose.connection.db;
    if (!database) throw new Error('Missing stage 12 test database');
    await createIndexes(database);

    businessA = new mongoose.Types.ObjectId(); businessB = new mongoose.Types.ObjectId(); userId = new mongoose.Types.ObjectId();
    const staff = new Staff({ businessId: businessB, displayName: 'TENANT_B_SECRET_STAFF', color: 'teal' });
    const ownStaff = new Staff({ businessId: businessA, displayName: 'Tenant A staff', color: 'blue' });
    const customer = new Customer({ businessId: businessB, firstName: 'TENANT_B_SECRET_CUSTOMER', phone: '+996700000001', phoneNormalized: '+996700000001', searchTokens: ['tenant-b-secret-customer'], source: 'internal' });
    const service = new Service({ businessId: businessB, name: 'TENANT_B_SECRET_SERVICE', nameNormalized: 'tenant-b-secret-service', durationMinutes: 30, bufferMinutes: 0, priceMinor: 1000, currency: 'KGS', onlineBookingEnabled: true, isActive: true, displayOrder: 0 });
    await Promise.all([
      Business.create([{ _id: businessA, name: 'Business A', slug: 'stage12-a', timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', status: 'active' }, { _id: businessB, name: 'TENANT_B_SECRET_BUSINESS', slug: 'stage12-b', timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', status: 'active' }]),
      Settings.create([{ businessId: businessA }, { businessId: businessB }]),
      staff.save(), customer.save(), service.save(),
      ownStaff.save(),
    ]);
    staffB = staff._id; staffA = ownStaff._id; customerB = customer._id; serviceB = service._id;
    const appointment = await Appointment.create({ businessId: businessB, customerId: customerB, staffId: staffB, serviceId: serviceB, startAt: new Date('2031-01-06T04:00:00Z'), endAt: new Date('2031-01-06T04:30:00Z'), bufferMinutes: 0, blockedUntilAt: new Date('2031-01-06T04:30:00Z'), occupiedKeys: [`${staffB.toString()}:3211488`, `${staffB.toString()}:3211489`, `${staffB.toString()}:3211490`, `${staffB.toString()}:3211491`, `${staffB.toString()}:3211492`, `${staffB.toString()}:3211493`], status: 'confirmed', source: 'internal', serviceSnapshot: { name: 'TENANT_B_SECRET_SERVICE', durationMinutes: 30, priceMinor: 1000, currency: 'KGS' }, rescheduleCount: 0 });
    const blockedPeriod = await BlockedPeriod.create({ businessId: businessB, staffId: staffB, startAt: new Date('2031-01-07T04:00:00Z'), endAt: new Date('2031-01-07T05:00:00Z'), reason: 'TENANT_B_SECRET_BLOCK' });
    const member = await BusinessMember.create({ businessId: businessB, userId: userId, staffId: staffB, role: 'master', status: 'invited' });
    const payment = await Payment.create({ businessId: businessB, appointmentId: appointment._id, customerId: customerB, staffId: staffB, amountMinor: 1000, refundedMinor: 0, currency: 'KGS', method: 'cash', status: 'pending', createdBy: userId });
    appointmentB = appointment._id; blockedPeriodB = blockedPeriod._id; memberB = member._id; paymentB = payment._id;

    const { app } = await import('../../packages/server/src/index');
    const { configureRouteRuntime } = await import('../../packages/server/src/http/define-route');
    configureRouteRuntime({
      resolveTenantContext: async (request) => {
        if (!request.headers.get('cookie')?.split(';').map((value) => value.trim()).includes(contextCookie)) return null;
        const role = request.headers.get('x-matrix-role') as BusinessRole | null;
        const businessId = request.headers.get('x-matrix-business');
        if (!role || !businessId) return null;
        return { businessId, userId: userId.toString(), role, ...(role === 'master' ? { staffId: staffB.toString() } : {}) };
      },
      resolvePublicContext: async () => null,
    });
    configureRateLimitAdapter(async () => ({ allowed: true }));
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing route matrix HTTP address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 120_000);

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await disconnectFromDatabase();
    await replSet?.stop();
  }, 30_000);

  function pathFor(route: (typeof sessionContracts)[number]): string {
    return route.path.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_match, key: string) => {
      if (key === 'id') return staffB.toString();
      if (key === 'date') return '2031-01-02';
      if (key === 'token') return 'x'.repeat(40);
      if (key === 'slug') return 'stage12-missing';
      throw new Error(`No safe path fixture for ${route.id}:${key}`);
    });
  }

  async function request(route: (typeof sessionContracts)[number], role?: BusinessRole) {
    const headers = new Headers({ Origin: 'http://localhost:3000' });
    if (role) {
      headers.set('Cookie', contextCookie);
      headers.set('X-Matrix-Role', role);
      headers.set('X-Matrix-Business', businessA.toString());
    }
    if (!['get', 'head'].includes(route.method)) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(`${baseUrl}${pathFor(route)}`, {
      method: route.method.toUpperCase(),
      headers,
      ...(!['get', 'head'].includes(route.method) ? { body: JSON.stringify({ __matrixProbe: true }) } : {}),
    });
    return { response, text: await response.text() };
  }

  it('exercises every session endpoint for owner/admin/master and unauthenticated access', async () => {
    expect(sessionContracts.length).toBeGreaterThan(45);
    for (const route of sessionContracts) {
      const absent = await request(route);
      expect(absent.response.status, `${route.id} without cookie`).toBe(401);

      // Dashboard routes carry the same permission in the route implementation; the generated
      // contract metadata predates that explicit middleware field, so encode their documented key here.
      const permission = (route.permission ?? (route.id === 'DSH-01' || route.id === 'DSH-05' ? 'dashboard:read' : undefined)) as PermissionKey | undefined;
      expect(permission, `${route.id} must declare an authorization key`).toBeDefined();
      for (const role of roles) {
        const result = await request(route, role);
        // APT-04 deliberately accepts only visitNote for masters in its service-level field allowlist.
        const allowed = (permission !== undefined && PERMISSION_SCOPES[permission][role] !== null) || (route.id === 'APT-04' && role === 'master');
        expect(result.response.status === 403, `${route.id} / ${role}: ${result.response.status} ${result.text}`).toBe(!allowed);
        expect(result.response.status, `${route.id} / ${role} must not fall through to an unimplemented 501`).not.toBe(501);
        expect(result.text).not.toContain('TENANT_B_SECRET');
      }
    }
  }, 120_000);

  it('applies baseline security headers and disables Express fingerprinting', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.headers.get('x-powered-by')).toBeNull();
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    expect(response.headers.get('permissions-policy')).toBe('camera=(), microphone=(), geolocation=()');
  });

  it('keeps foreign tenant identifiers out of create/update request bodies', async () => {
    const forbiddenBody = { businessId: businessB.toString(), staffId: staffB.toString(), customerId: customerB.toString(), serviceId: serviceB.toString() };
    for (const route of sessionContracts.filter((candidate) => ['post', 'put', 'patch'].includes(candidate.method))) {
      const headers = new Headers({ Origin: 'http://localhost:3000', Cookie: contextCookie, 'X-Matrix-Role': 'owner', 'X-Matrix-Business': businessA.toString(), 'Content-Type': 'application/json' });
      const response = await fetch(`${baseUrl}${pathFor(route)}`, { method: route.method.toUpperCase(), headers, body: JSON.stringify(forbiddenBody) });
      // Strict schemas reject tenant IDs instead of allowing mass assignment. Other routes may
      // accept known ID fields, but scope validation still cannot return or mutate tenant B.
      const text = await response.text();
      expect(text).not.toContain('TENANT_B_SECRET');
      expect([400, 403, 404, 409, 422, 501]).toContain(response.status);
    }
  }, 120_000);

  it('returns 404 for foreign object identifiers across customer/staff/service/block/appointment/payment/member routes', async () => {
    const dateFrom = '2031-01-01T00:00:00.000Z';
    const dateTo = '2031-02-01T00:00:00.000Z';
    const cases: Array<{ id: string; method: string; path: string; body?: Record<string, unknown> }> = [
      { id: 'CUS-03', method: 'GET', path: `/api/customers/${customerB}` },
      { id: 'CUS-04', method: 'PATCH', path: `/api/customers/${customerB}`, body: { firstName: 'Injected tenant B edit' } },
      { id: 'CUS-06', method: 'GET', path: `/api/customers/${customerB}/appointments?from=${dateFrom}&to=${dateTo}` },
      { id: 'STF-03', method: 'GET', path: `/api/staff/${staffB}` },
      { id: 'STF-04', method: 'PATCH', path: `/api/staff/${staffB}`, body: { displayName: 'Injected tenant B edit' } },
      { id: 'STF-06', method: 'GET', path: `/api/staff/${staffB}/schedule` },
      { id: 'STF-07', method: 'PUT', path: `/api/staff/${staffB}/schedule`, body: { weekly: [] } },
      { id: 'STF-08', method: 'GET', path: `/api/staff/${staffB}/exceptions?from=2031-01-01&to=2031-01-31` },
      { id: 'STF-09', method: 'POST', path: `/api/staff/${staffB}/exceptions`, body: { date: '2031-01-08', kind: 'day_off', intervals: [], breaks: [] } },
      { id: 'STF-10', method: 'DELETE', path: `/api/staff/${staffB}/exceptions/2031-01-08` },
      { id: 'STF-11', method: 'GET', path: `/api/staff/${staffB}/services` },
      { id: 'STF-12', method: 'PUT', path: `/api/staff/${staffA}/services`, body: { serviceIds: [serviceB.toString()] } },
      { id: 'SVC-04', method: 'PATCH', path: `/api/services/${serviceB}`, body: { name: 'Injected tenant B edit' } },
      { id: 'BLK-03', method: 'DELETE', path: `/api/blocked-periods/${blockedPeriodB}` },
      { id: 'APT-03', method: 'GET', path: `/api/appointments/${appointmentB}` },
      { id: 'APT-04', method: 'PATCH', path: `/api/appointments/${appointmentB}`, body: { customerNote: 'Injected tenant B edit' } },
      { id: 'APT-05', method: 'POST', path: `/api/appointments/${appointmentB}/reschedule`, body: { startAt: '2031-01-08T04:00:00.000Z' } },
      { id: 'APT-06', method: 'POST', path: `/api/appointments/${appointmentB}/status`, body: { status: 'cancelled' } },
      { id: 'PAY-04', method: 'POST', path: `/api/payments/${paymentB}/mark-paid`, body: {} },
      { id: 'PAY-05', method: 'POST', path: `/api/payments/${paymentB}/cancel`, body: {} },
      { id: 'PAY-06', method: 'POST', path: `/api/payments/${paymentB}/refund`, body: { amountMinor: 1, note: 'cross tenant probe' } },
      { id: 'MEM-03', method: 'PATCH', path: `/api/members/${memberB}`, body: { status: 'disabled' } },
      { id: 'MEM-04', method: 'POST', path: `/api/members/${memberB}/resend-invite` },
    ];

    for (const route of cases) {
      const headers = new Headers({ Origin: 'http://localhost:3000', Cookie: contextCookie, 'X-Matrix-Role': 'owner', 'X-Matrix-Business': businessA.toString() });
      if (route.body) headers.set('Content-Type', 'application/json');
      const response = await fetch(`${baseUrl}${route.path}`, { method: route.method, headers, ...(route.body ? { body: JSON.stringify(route.body) } : {}) });
      const payloadText = await response.text();
      expect(response.status, `${route.id}: ${payloadText}`).toBe(404);
      expect(payloadText).not.toContain('TENANT_B_SECRET');
    }

    const [unchangedCustomer, unchangedStaff, unchangedService, unchangedAppointment, unchangedPayment, unchangedMember, unchangedBlock] = await Promise.all([
      Customer.findOne({ _id: customerB, businessId: businessB }).lean().exec(),
      Staff.findOne({ _id: staffB, businessId: businessB }).lean().exec(),
      Service.findOne({ _id: serviceB, businessId: businessB }).lean().exec(),
      Appointment.findOne({ _id: appointmentB, businessId: businessB }).lean().exec(),
      Payment.findOne({ _id: paymentB, businessId: businessB }).lean().exec(),
      BusinessMember.findOne({ _id: memberB, businessId: businessB }).lean().exec(),
      BlockedPeriod.findOne({ _id: blockedPeriodB, businessId: businessB }).lean().exec(),
    ]);
    expect(unchangedCustomer?.firstName).toBe('TENANT_B_SECRET_CUSTOMER');
    expect(unchangedStaff?.displayName).toBe('TENANT_B_SECRET_STAFF');
    expect(unchangedService?.name).toBe('TENANT_B_SECRET_SERVICE');
    expect(unchangedAppointment?.status).toBe('confirmed');
    expect(unchangedPayment?.status).toBe('pending');
    expect(unchangedMember?.status).toBe('invited');
    expect(unchangedBlock?.reason).toBe('TENANT_B_SECRET_BLOCK');
  }, 120_000);

  it('rejects foreign IDs in appointment/payment/service/block creation before persisting anything', async () => {
    const headers = new Headers({ Origin: 'http://localhost:3000', Cookie: contextCookie, 'X-Matrix-Role': 'owner', 'X-Matrix-Business': businessA.toString(), 'Content-Type': 'application/json' });
    const appointmentResponse = await fetch(`${baseUrl}/api/appointments`, { method: 'POST', headers, body: JSON.stringify({ customerId: customerB.toString(), staffId: staffB.toString(), serviceId: serviceB.toString(), startAt: '2031-01-06T04:00:00.000Z' }) });
    expect(appointmentResponse.status).toBe(404);
    const paymentHeaders = new Headers(headers); paymentHeaders.set('Idempotency-Key', 'phase12-tenant-b-payment');
    const paymentResponse = await fetch(`${baseUrl}/api/payments`, { method: 'POST', headers: paymentHeaders, body: JSON.stringify({ appointmentId: appointmentB.toString(), amountMinor: 1000, method: 'cash', status: 'paid' }) });
    expect(paymentResponse.status).toBe(404);
    const serviceResponse = await fetch(`${baseUrl}/api/services`, { method: 'POST', headers, body: JSON.stringify({ name: 'A service must not link B staff', durationMinutes: 30, priceMinor: 1000, staffIds: [staffB.toString()] }) });
    expect(serviceResponse.status).toBe(404);
    const blockResponse = await fetch(`${baseUrl}/api/blocked-periods`, { method: 'POST', headers, body: JSON.stringify({ staffId: staffB.toString(), startAt: '2031-01-08T04:00:00.000Z', endAt: '2031-01-08T05:00:00.000Z' }) });
    expect(blockResponse.status).toBe(404);
    expect(await Appointment.countDocuments({ businessId: businessA })).toBe(0);
    expect(await Payment.countDocuments({ businessId: businessA })).toBe(0);
    expect(await Service.countDocuments({ businessId: businessA })).toBe(0);
    expect(await BlockedPeriod.countDocuments({ businessId: businessA })).toBe(0);
  }, 120_000);
});
