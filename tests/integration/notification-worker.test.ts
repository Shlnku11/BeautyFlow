import { MongoMemoryReplSet } from 'mongodb-memory-server';
import express from 'express';
import mongoose from 'mongoose';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectFromDatabase } from '../../packages/server/src/db/connection';
import { up as createIndexes } from '../../packages/server/migrations/000_init';
import { Appointment, Business, Notification, Service, Staff } from '../../packages/server/src/db/models';
import type { NotificationChannelProvider, NotificationMessage, ProviderSendOutcome } from '../../packages/server/src/notifications/types';
import { TransientProviderError } from '../../packages/server/src/notifications/errors';
import { enqueueNotification } from '../../packages/server/src/notifications/enqueue';
import { configureRateLimitAdapter } from '../../packages/server/src/http/rate-limit';

class MemoryProvider implements NotificationChannelProvider {
  readonly channel = 'email' as const;
  readonly messages: NotificationMessage[] = [];
  calls = 0;
  constructor(private readonly failures = 0, private readonly delayMs = 0) {}
  async send(message: NotificationMessage): Promise<ProviderSendOutcome> {
    this.calls += 1;
    if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    if (this.calls <= this.failures) throw new TransientProviderError('temporary');
    this.messages.push(message);
    return { status: 'sent', providerMessageId: `memory-${this.calls}` };
  }
}

describe('notification worker', () => {
  let replSet: MongoMemoryReplSet;
  let businessA: mongoose.Types.ObjectId;
  let businessB: mongoose.Types.ObjectId;
  let server: Server;
  let baseUrl: string;
  let ProviderRegistry: typeof import('../../packages/server/src/notifications/providers/registry').ProviderRegistry;
  let runNotificationBatch: typeof import('../../packages/server/src/notifications/run-batch').runNotificationBatch;
  let registerNotificationRoutes: typeof import('../../packages/server/src/http/notification-routes').registerNotificationRoutes;
  const now = new Date(Date.now() - 60_000);

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGODB_URI = replSet.getUri('notification_worker_test');
    process.env.MONGODB_DB_NAME = 'notification_worker_test';
    process.env.TEST_MONGODB_URI = replSet.getUri('notification_worker_test');
    ProviderRegistry = (await import('../../packages/server/src/notifications/providers/registry')).ProviderRegistry;
    runNotificationBatch = (await import('../../packages/server/src/notifications/run-batch')).runNotificationBatch;
    registerNotificationRoutes = (await import('../../packages/server/src/http/notification-routes')).registerNotificationRoutes;
    await connectToDatabase();
    const database = mongoose.connection.db;
    if (!database) throw new Error('Missing MongoDB database');
    await createIndexes(database);
    const app = express();
    app.use(express.json());
    configureRateLimitAdapter(async () => ({ allowed: true }));
    registerNotificationRoutes(app);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 120_000);

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
    businessA = new mongoose.Types.ObjectId();
    businessB = new mongoose.Types.ObjectId();
    await Business.create([
      { _id: businessA, name: 'Salon A', slug: 'notify-a', timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', status: 'active' },
      { _id: businessB, name: 'Salon B', slug: 'notify-b', timezone: 'Europe/Berlin', currency: 'EUR', countryCode: 'OTHER', status: 'active' },
    ]);
  });

  afterAll(async () => { if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); await disconnectFromDatabase(); await replSet.stop(); });

  async function queued(businessId: mongoose.Types.ObjectId, overrides: Record<string, unknown> = {}) {
    return Notification.create({
      businessId, channel: 'email', kind: 'appointment_confirmed', recipient: { email: 'client@example.test', name: 'Client' },
      status: 'scheduled', scheduledFor: now, nextAttemptAt: now, attempts: 0, maxAttempts: 5,
      dedupeKey: `email:appointment_confirmed:${new mongoose.Types.ObjectId()}:0`,
      templateData: { businessName: 'Salon A', serviceName: 'Cut', timezone: 'Asia/Bishkek', startAt: '2026-10-06T04:00:00.000Z' },
      ...overrides,
    });
  }

  it('treats duplicate enqueue calls as a no-op', async () => {
    const data = { businessId: businessA, channel: 'email', kind: 'appointment_confirmed', recipient: { email: 'client@example.test' }, status: 'scheduled', scheduledFor: now, nextAttemptAt: now, attempts: 0, maxAttempts: 5, dedupeKey: 'email:appointment_confirmed:same:0' };
    await enqueueNotification(data);
    await enqueueNotification(data);
    expect(await Notification.countDocuments({ businessId: businessA, dedupeKey: data.dedupeKey })).toBe(1);
  });

  it('retries transient failures with backoff and marks sent after success', async () => {
    const row = await queued(businessA);
    const provider = new MemoryProvider(2);
    const providers = new ProviderRegistry(provider);
    const first = await runNotificationBatch({ now, workerId: 'retry-1', providers });
    expect(first).toMatchObject({ claimed: 1, sent: 0, failed: 0 });
    const afterFirst = await Notification.findOne({ _id: row._id, businessId: businessA }).lean().exec();
    expect(afterFirst).toMatchObject({ status: 'scheduled', attempts: 1, nextAttemptAt: new Date(now.getTime() + 60_000) });
    await runNotificationBatch({ now: new Date(now.getTime() + 60_000), workerId: 'retry-2', providers });
    const afterSecond = await Notification.findOne({ _id: row._id, businessId: businessA }).lean().exec();
    expect(afterSecond).toMatchObject({ status: 'scheduled', attempts: 2, nextAttemptAt: new Date(now.getTime() + 360_000) });
    const final = await runNotificationBatch({ now: new Date(now.getTime() + 360_000), workerId: 'retry-3', providers });
    expect(final).toMatchObject({ claimed: 1, sent: 1, failed: 0 });
    expect(await Notification.findOne({ _id: row._id, businessId: businessA }).lean().exec()).toMatchObject({ status: 'sent', attempts: 3, providerMessageId: 'memory-3' });
  });

  it('recovers an expired processing lease after a simulated worker crash', async () => {
    const row = await queued(businessA, { status: 'processing', lockedBy: 'crashed-worker', lockedUntil: new Date(now.getTime() - 1) });
    const provider = new MemoryProvider();
    const result = await runNotificationBatch({ now, workerId: 'recovery-worker', providers: new ProviderRegistry(provider) });
    expect(result).toMatchObject({ claimed: 1, sent: 1 });
    expect(provider.calls).toBe(1);
    const recovered = await Notification.findOne({ _id: row._id, businessId: businessA }).lean().exec();
    expect(recovered).toMatchObject({ status: 'sent' });
    expect(recovered?.lockedBy).toBeUndefined();
  });

  it('claims one row once when workers run concurrently', async () => {
    await queued(businessA);
    const provider = new MemoryProvider(0, 30);
    const providers = new ProviderRegistry(provider);
    const results = await Promise.all([
      runNotificationBatch({ now, workerId: 'parallel-a', providers }),
      runNotificationBatch({ now, workerId: 'parallel-b', providers }),
    ]);
    expect(results.reduce((sum, result) => sum + result.claimed, 0)).toBe(1);
    expect(provider.calls).toBe(1);
    expect(provider.messages).toHaveLength(1);
  });

  it('removes password reset template data after successful delivery', async () => {
    const rawToken = 'reset-token-that-must-not-remain-after-send';
    const row = await queued(businessA, { kind: 'password_reset', dedupeKey: 'email:password_reset:user:abcdef01', templateData: { resetUrl: `https://example.test/reset?token=${rawToken}` } });
    await runNotificationBatch({ now, providers: new ProviderRegistry(new MemoryProvider()) });
    const stored = await Notification.findOne({ _id: row._id, businessId: businessA }).lean().exec();
    expect(stored?.templateData).toBeUndefined();
    expect(JSON.stringify(stored)).not.toContain(rawToken);
  });

  it('renders each business from its own snapshot without cross-tenant content', async () => {
    await queued(businessA, { recipient: { email: 'a@example.test', name: 'Client A' }, templateData: { businessName: 'Private Salon A', serviceName: 'Cut A', timezone: 'Asia/Bishkek', startAt: '2026-10-06T04:00:00.000Z' } });
    await queued(businessB, { recipient: { email: 'b@example.test', name: 'Client B' }, templateData: { businessName: 'Private Salon B', serviceName: 'Cut B', timezone: 'Europe/Berlin', startAt: '2026-10-06T04:00:00.000Z' } });
    const provider = new MemoryProvider();
    await runNotificationBatch({ now, limit: 2, providers: new ProviderRegistry(provider) });
    const emailA = provider.messages.find((message) => message.to === 'a@example.test');
    const emailB = provider.messages.find((message) => message.to === 'b@example.test');
    expect(emailA?.text).toContain('Private Salon A');
    expect(emailA?.text).not.toContain('Private Salon B');
    expect(emailB?.text).toContain('Private Salon B');
    expect(emailB?.text).not.toContain('Private Salon A');
  });

  it('reloads reminder data within the notification business boundary', async () => {
    const [staffA, staffB] = await Staff.create([
      { businessId: businessA, displayName: 'Stylist A', color: 'violet' },
      { businessId: businessB, displayName: 'Stylist B', color: 'teal' },
    ]);
    const [serviceA, serviceB] = await Service.create([
      { businessId: businessA, name: 'Cut A', nameNormalized: 'cut a', durationMinutes: 30, bufferMinutes: 0, priceMinor: 1000, currency: 'KGS', onlineBookingEnabled: true, isActive: true, displayOrder: 0 },
      { businessId: businessB, name: 'Cut B', nameNormalized: 'cut b', durationMinutes: 30, bufferMinutes: 0, priceMinor: 1000, currency: 'EUR', onlineBookingEnabled: true, isActive: true, displayOrder: 0 },
    ]);
    if (!staffA || !staffB || !serviceA || !serviceB) throw new Error('Missing reminder fixtures');
    const startAt = new Date(now.getTime() + 24 * 60 * 60_000);
    const [appointmentA, appointmentB] = await Appointment.create([
      { businessId: businessA, customerId: new mongoose.Types.ObjectId(), staffId: staffA._id, serviceId: serviceA._id, startAt, endAt: new Date(startAt.getTime() + 30 * 60_000), bufferMinutes: 0, blockedUntilAt: new Date(startAt.getTime() + 30 * 60_000), status: 'confirmed', source: 'public', serviceSnapshot: { name: 'Cut A', durationMinutes: 30, priceMinor: 1000, currency: 'KGS' }, rescheduleCount: 0 },
      { businessId: businessB, customerId: new mongoose.Types.ObjectId(), staffId: staffB._id, serviceId: serviceB._id, startAt, endAt: new Date(startAt.getTime() + 30 * 60_000), bufferMinutes: 0, blockedUntilAt: new Date(startAt.getTime() + 30 * 60_000), status: 'confirmed', source: 'public', serviceSnapshot: { name: 'Cut B', durationMinutes: 30, priceMinor: 1000, currency: 'EUR' }, rescheduleCount: 0 },
    ]);
    if (!appointmentA || !appointmentB) throw new Error('Missing appointment fixtures');
    await Promise.all([
      queued(businessA, { kind: 'reminder_24h', appointmentId: appointmentA._id, scheduledFor: now, nextAttemptAt: now, recipient: { email: 'reminder-a@example.test', name: 'Client A' }, templateData: { manageUrl: 'https://a.example.test/manage' } }),
      queued(businessB, { kind: 'reminder_24h', appointmentId: appointmentB._id, scheduledFor: now, nextAttemptAt: now, recipient: { email: 'reminder-b@example.test', name: 'Client B' }, templateData: { manageUrl: 'https://b.example.test/manage' } }),
    ]);
    const provider = new MemoryProvider();
    const result = await runNotificationBatch({ now, limit: 2, providers: new ProviderRegistry(provider) });
    expect(result).toMatchObject({ claimed: 2, sent: 2 });
    const emailA = provider.messages.find((message) => message.to === 'reminder-a@example.test');
    const emailB = provider.messages.find((message) => message.to === 'reminder-b@example.test');
    expect(emailA?.text).toContain('Salon A');
    expect(emailA?.text).toContain('Stylist A');
    expect(emailA?.text).toContain('Cut A');
    expect(emailA?.text).not.toContain('Salon B');
    expect(emailA?.text).not.toContain('Stylist B');
    expect(emailB?.text).toContain('Salon B');
    expect(emailB?.text).toContain('Stylist B');
    expect(emailB?.text).toContain('Cut B');
    expect(emailB?.text).not.toContain('Salon A');
    expect(emailB?.text).not.toContain('Stylist A');
  });

  it('protects SYS-02 with CRON_SECRET and runs the same queue batch', async () => {
    const row = await queued(businessA);
    const endpoint = `${baseUrl}/api/internal/jobs/notifications/run`;
    const headers = { 'Content-Type': 'application/json' };
    const denied = await fetch(endpoint, { method: 'POST', headers, body: '{}' });
    expect(denied.status).toBe(401);
    const accepted = await fetch(endpoint, { method: 'POST', headers: { ...headers, Authorization: `Bearer ${process.env.CRON_SECRET}` }, body: JSON.stringify({ limit: 1 }) });
    expect(accepted.status).toBe(200);
    const payload = await accepted.json() as { data: { claimed: number; sent: number } };
    expect(payload.data).toMatchObject({ claimed: 1, sent: 1 });
    expect(await Notification.findOne({ _id: row._id, businessId: businessA }).lean().exec()).toMatchObject({ status: 'sent', providerMessageId: expect.stringMatching(/^console-/) });
  });
});
