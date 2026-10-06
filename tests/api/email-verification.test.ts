import { createHmac } from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectFromDatabase } from '../../packages/server/src/db/connection';
import { up as createIndexes } from '../../packages/server/migrations/000_init';
import { configureRateLimitAdapter } from '../../packages/server/src/http/rate-limit';
import { Business, BusinessMember, Notification, Settings, User } from '../../packages/server/src/db/models';

describe('AUTH-11/12 email verification', () => {
  let replSet: import('mongodb-memory-server').MongoMemoryReplSet;
  let server: Server;
  let baseUrl: string;
  let businessA: mongoose.Types.ObjectId;
  let businessB: mongoose.Types.ObjectId;
  let userA: mongoose.Types.ObjectId;
  let userB: mongoose.Types.ObjectId;
  const codeA = '123456';
  const codeB = '654321';

  function codeHash(code: string) {
    return createHmac('sha256', process.env.TOKEN_PEPPER ?? '').update(code).digest('hex');
  }

  beforeAll(async () => {
    const { MongoMemoryReplSet } = await import('mongodb-memory-server');
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replSet.getUri('email_verification');
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = uri;
    process.env.MONGODB_DB_NAME = 'email_verification';
    process.env.TEST_MONGODB_URI = uri;
    await connectToDatabase();
    const database = mongoose.connection.db;
    if (!database) throw new Error('Missing email verification test database');
    await createIndexes(database);
    configureRateLimitAdapter(async () => ({ allowed: true }));
    const { registerAuthRoutes } = await import('../../packages/server/src/http/auth-routes');
    const app = express();
    app.use(express.json());
    registerAuthRoutes(app);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing auth test HTTP address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 120_000);

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
    businessA = new mongoose.Types.ObjectId();
    businessB = new mongoose.Types.ObjectId();
    userA = new mongoose.Types.ObjectId();
    userB = new mongoose.Types.ObjectId();
    const expiry = new Date(Date.now() + 15 * 60_000);
    await Business.create([
      { _id: businessA, name: 'Salon A', slug: `verify-a-${businessA}`, timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', status: 'active' },
      { _id: businessB, name: 'Salon B', slug: `verify-b-${businessB}`, timezone: 'Europe/Berlin', currency: 'EUR', countryCode: 'OTHER', status: 'active' },
    ]);
    await Settings.create([{ businessId: businessA }, { businessId: businessB }]);
    await User.create([
      { _id: userA, email: 'owner-a@example.test', emailNormalized: 'owner-a@example.test', name: 'Owner A', passwordHash: null, locale: 'ru', status: 'active', emailVerificationCodeHash: codeHash(codeA), emailVerificationExpiresAt: expiry },
      { _id: userB, email: 'owner-b@example.test', emailNormalized: 'owner-b@example.test', name: 'Owner B', passwordHash: null, locale: 'ru', status: 'active', emailVerificationCodeHash: codeHash(codeB), emailVerificationExpiresAt: expiry },
    ]);
    await BusinessMember.create([
      { businessId: businessA, userId: userA, role: 'owner', status: 'active', joinedAt: new Date() },
      { businessId: businessB, userId: userB, role: 'owner', status: 'active', joinedAt: new Date() },
    ]);
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

  it('confirms a valid code once and clears its stored HMAC and expiry', async () => {
    const confirmed = await post('/api/auth/verify-email', { email: 'owner-a@example.test', code: codeA });
    const replay = await post('/api/auth/verify-email', { email: 'owner-a@example.test', code: codeA });
    expect(confirmed.response.status).toBe(200);
    expect(confirmed.payload.data).toEqual({ emailVerified: true });
    expect(replay.response.status).toBe(400);
    const user = await User.findById(userA).lean().exec();
    expect(user).toMatchObject({ emailVerified: true, emailVerificationAttempts: 0 });
    expect(user?.emailVerificationCodeHash).toBeUndefined();
    expect(user?.emailVerificationExpiresAt).toBeUndefined();
  });

  it('registers an unverified account and queues its code in the registration transaction', async () => {
    const run = Date.now().toString();
    const result = await post('/api/auth/register-business', {
      businessName: `Verify ${run}`, slug: `verify-${run}`, timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG',
      ownerName: 'New Owner', email: `new-${run}@example.test`, password: 'secure registration password', acceptTerms: true, website: '',
    });
    expect(result.response.status).toBe(201);
    const user = await User.collection.findOne({ emailNormalized: `new-${run}@example.test` });
    expect(user).toMatchObject({ status: 'active', emailVerified: false, emailVerificationAttempts: 0 });
    expect(user?.emailVerificationCodeHash).toMatch(/^[a-f\d]{64}$/);
    expect(user?.emailVerificationExpiresAt?.getTime()).toBeGreaterThan(Date.now());
    expect(user?.emailVerificationExpiresAt?.getTime()).toBeLessThanOrEqual(Date.now() + 15 * 60_000);
    const notification = await Notification.collection.findOne({ 'recipient.email': `new-${run}@example.test`, kind: 'email_verification' });
    expect(notification?.status).toBe('scheduled');
    expect((notification?.templateData as { verificationCode?: string } | undefined)?.verificationCode).toMatch(/^\d{6}$/);
  }, 120_000);

  it('rejects expired codes and returns 429 after five incorrect attempts', async () => {
    await User.updateOne({ _id: userA }, { $set: { emailVerificationExpiresAt: new Date(Date.now() - 1) } }).exec();
    const expired = await post('/api/auth/verify-email', { email: 'owner-a@example.test', code: codeA });
    expect(expired.response.status).toBe(400);

    const attempts = await Promise.all(Array.from({ length: 10 }, () => post('/api/auth/verify-email', { email: 'owner-b@example.test', code: '000000' })));
    expect(attempts.every(({ response }) => [400, 429].includes(response.status))).toBe(true);
    const exhausted = await User.findById(userB).lean().exec();
    expect(exhausted?.emailVerificationAttempts).toBe(5);
    expect(exhausted?.emailVerificationCodeHash).toBeUndefined();
    const limited = await post('/api/auth/verify-email', { email: 'owner-b@example.test', code: codeB });
    expect(limited.response.status).toBe(429);
    expect(limited.payload.error?.code).toBe('RATE_LIMITED');
    expect((await User.findById(userB).lean().exec())?.emailVerified).toBe(false);
  });

  it('issues a fresh code on resend and does not accept another account business code', async () => {
    const wrongAccount = await post('/api/auth/verify-email', { email: 'owner-b@example.test', code: codeA });
    expect(wrongAccount.response.status).toBe(400);
    expect((await User.findById(userB).lean().exec())?.emailVerified).toBe(false);

    await Notification.create({ businessId: businessA, channel: 'email', kind: 'email_verification', recipient: { email: 'owner-a@example.test' }, status: 'scheduled', scheduledFor: new Date(), nextAttemptAt: new Date(), attempts: 0, maxAttempts: 5, dedupeKey: 'old-verification-code', templateData: { verificationCode: codeA } });
    const resent = await post('/api/auth/resend-verification', { email: 'owner-a@example.test' });
    expect(resent.response.status).toBe(202);
    const oldNotification = await Notification.findOne({ businessId: businessA, dedupeKey: 'old-verification-code' }).lean().exec();
    expect(oldNotification?.status).toBe('cancelled');
    const freshNotification = await Notification.findOne({ businessId: businessA, kind: 'email_verification', status: 'scheduled' }).lean().exec();
    const data = freshNotification?.templateData as { verificationCode?: string } | undefined;
    expect(data?.verificationCode).toMatch(/^\d{6}$/);
    expect(data?.verificationCode).not.toBe(codeA);
    const newCode = data?.verificationCode;
    expect(newCode).toBeTruthy();
    const result = await post('/api/auth/verify-email', { email: 'owner-a@example.test', code: newCode });
    expect(result.response.status).toBe(200);
    expect((await User.findById(userA).lean().exec())?.emailVerified).toBe(true);
  });
});
