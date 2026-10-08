import express from 'express';
import mongoose from 'mongoose';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hash } from '@node-rs/argon2';
import { connectToDatabase, disconnectFromDatabase } from '../../packages/server/src/db/connection';
import { up as createIndexes } from '../../packages/server/migrations/000_init';
import { configureRateLimitAdapter } from '../../packages/server/src/http/rate-limit';
import { Business, BusinessMember, Notification, Session, User } from '../../packages/server/src/db/models';

describe('AUTH-02/16/17 password login verification', () => {
  let replSet: import('mongodb-memory-server').MongoMemoryReplSet;
  let server: Server;
  let baseUrl: string;
  let businessId: mongoose.Types.ObjectId;
  let userId: mongoose.Types.ObjectId;
  const password = 'login test password with length';

  beforeAll(async () => {
    const { MongoMemoryReplSet } = await import('mongodb-memory-server');
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    const uri = replSet.getUri('login_verification');
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = uri;
    process.env.MONGODB_DB_NAME = 'login_verification';
    process.env.TEST_MONGODB_URI = uri;
    process.env.APP_BASE_URL = 'http://localhost:3000';
    await connectToDatabase();
    const database = mongoose.connection.db;
    if (!database) throw new Error('Missing login verification database');
    await createIndexes(database);
    configureRateLimitAdapter(async () => ({ allowed: true }));
    const { registerAuthRoutes } = await import('../../packages/server/src/http/auth-routes');
    const app = express();
    app.use(express.json());
    registerAuthRoutes(app);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing login verification HTTP address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 120_000);

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
    businessId = new mongoose.Types.ObjectId();
    userId = new mongoose.Types.ObjectId();
    const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    await Business.create({ _id: businessId, name: 'Login Test Salon', slug: `login-${businessId.toString()}`, timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', status: 'active' });
    await User.create({ _id: userId, email: 'owner@example.test', emailNormalized: 'owner@example.test', emailVerified: true, passwordHash, name: 'Owner', locale: 'ru', status: 'active' });
    await BusinessMember.create({ businessId, userId, role: 'owner', status: 'active', joinedAt: new Date() });
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await disconnectFromDatabase();
    await replSet?.stop();
  });

  async function post(path: string, body: Record<string, unknown>) {
    const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json() as { data?: Record<string, unknown>; error?: { code?: string } };
    return { response, payload };
  }

  async function beginLogin() {
    const result = await post('/api/auth/login', { email: 'owner@example.test', password });
    expect(result.response.status).toBe(200);
    expect(result.response.headers.get('set-cookie')).toBeNull();
    expect(result.payload.data?.requiresEmailCode).toBe(true);
    const loginToken = result.payload.data?.loginToken;
    if (typeof loginToken !== 'string') throw new Error('Login challenge token was not returned');
    const notification = await Notification.findOne({ businessId, kind: 'login_verification', status: 'scheduled' }).lean().exec();
    if (!notification) throw new Error('Login code was not queued');
    const code = (notification.templateData as { loginCode?: string } | undefined)?.loginCode;
    if (!code) throw new Error('Login code was not queued');
    return { loginToken, code, notification };
  }

  it('queues the email code without issuing a session, then verifies once and clears sensitive data', async () => {
    const { loginToken, code, notification } = await beginLogin();
    expect(notification?.dedupeKey).toContain('login_verification');
    expect(await Session.countDocuments({ businessId, userId })).toBe(0);
    const [{ ConsoleEmailProvider }, { ProviderRegistry }, { runNotificationBatch }] = await Promise.all([
      import('../../packages/server/src/notifications/providers/email-provider'),
      import('../../packages/server/src/notifications/providers/registry'),
      import('../../packages/server/src/notifications/run-batch'),
    ]);
    const provider = new ConsoleEmailProvider();
    const summary = await runNotificationBatch({ providers: new ProviderRegistry(provider) });
    expect(summary.sent).toBe(1);
    expect(provider.messages[0]?.text).toContain(code);
    const delivered = await Notification.findOne({ businessId, _id: notification?._id }).lean().exec();
    expect(delivered?.status).toBe('sent');
    expect(delivered?.templateData).toBeUndefined();

    const verified = await post('/api/auth/login/verify', { loginToken, code });
    expect(verified.response.status).toBe(200);
    expect(verified.response.headers.get('set-cookie')).toContain('na_sid=');
    expect(await Session.countDocuments({ businessId, userId })).toBe(1);
    const user = await User.findById(userId).lean().exec();
    expect(user?.loginVerificationCodeHash).toBeUndefined();
    expect(user?.loginVerificationExpiresAt).toBeUndefined();
    const replay = await post('/api/auth/login/verify', { loginToken, code });
    expect(replay.response.status).toBe(401);
    expect(replay.payload.error?.code).toBe('INVALID_CODE');
  }, 120_000);

  it('rejects an unverified account without queueing a login challenge', async () => {
    await User.updateOne({ _id: userId }, { $set: { emailVerified: false } }).exec();
    const response = await post('/api/auth/login', { email: 'owner@example.test', password });
    expect(response.response.status).toBe(403);
    expect(response.payload.error?.code).toBe('EMAIL_NOT_VERIFIED');
    expect(await Notification.countDocuments({ businessId, kind: 'login_verification' })).toBe(0);
    expect(await Session.countDocuments({ businessId, userId })).toBe(0);
  });

  it('enforces challenge expiry and the five-attempt limit', async () => {
    const first = await beginLogin();
    const expiredAt = new Date(Date.now() - 1);
    await User.updateOne({ _id: userId }, { $set: { loginVerificationExpiresAt: expiredAt } }).exec();
    const expired = await post('/api/auth/login/verify', { loginToken: first.loginToken, code: first.code });
    expect(expired.response.status).toBe(410);
    expect(expired.payload.error?.code).toBe('EXPIRED_CODE');

    const next = await beginLogin();
    const wrongCode = next.code === '000000' ? '111111' : '000000';
    const failures = [];
    for (let attempt = 0; attempt < 5; attempt += 1) failures.push(await post('/api/auth/login/verify', { loginToken: next.loginToken, code: wrongCode }));
    expect(failures.map(({ response }) => response.status)).toEqual([401, 401, 401, 401, 429]);
    const limited = await post('/api/auth/login/verify', { loginToken: next.loginToken, code: next.code });
    expect(limited.response.status).toBe(429);
    expect(limited.payload.error?.code).toBe('RATE_LIMITED');
    expect((await User.findById(userId).lean().exec())?.loginVerificationAttempts).toBe(5);
  }, 120_000);

  it('issues only one session when two requests race to consume the same code', async () => {
    const { loginToken, code } = await beginLogin();
    const results = await Promise.all([1, 2].map(() => post('/api/auth/login/verify', { loginToken, code })));
    expect(results.filter(({ response }) => response.status === 200)).toHaveLength(1);
    expect(results.filter(({ response }) => response.status === 401)).toHaveLength(1);
    expect(await Session.countDocuments({ businessId, userId })).toBe(1);
  }, 120_000);

  it('resending rotates the challenge and queues a different code', async () => {
    const first = await beginLogin();
    const result = await post('/api/auth/login/resend', { loginToken: first.loginToken });
    expect(result.response.status).toBe(200);
    const nextToken = result.payload.data?.loginToken;
    expect(typeof nextToken).toBe('string');
    const replay = await post('/api/auth/login/verify', { loginToken: first.loginToken, code: first.code });
    expect(replay.response.status).toBe(401);
    const second = await Notification.findOne({ businessId, kind: 'login_verification', status: 'scheduled' }).lean().exec();
    expect((second?.templateData as { loginCode?: string } | undefined)?.loginCode).toBeTruthy();
    expect((await User.findById(userId).lean().exec())?.loginVerificationExpiresAt?.getTime()).toBeGreaterThan(Date.now());
  }, 120_000);
});
