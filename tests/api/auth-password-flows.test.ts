import express from 'express';
import mongoose from 'mongoose';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hash } from '@node-rs/argon2';
import { connectToDatabase, disconnectFromDatabase } from '../../packages/server/src/db/connection';
import { up as createIndexes } from '../../packages/server/migrations/000_init';
import { configureRateLimitAdapter } from '../../packages/server/src/http/rate-limit';
import { createSessionToken, hashSessionToken } from '../../packages/server/src/auth/session-token';
import { AuditLog, Business, BusinessMember, Notification, Session, User } from '../../packages/server/src/db/models';

describe('AUTH-07/08/09 password recovery and rotation', () => {
  let replSet: import('mongodb-memory-server').MongoMemoryReplSet;
  let server: Server;
  let baseUrl: string;
  let businessId: mongoose.Types.ObjectId;
  let userId: mongoose.Types.ObjectId;
  let currentSessionId: mongoose.Types.ObjectId;
  let sessionCookie: string;
  const testPassword = 'correct horse battery staple';

  beforeAll(async () => {
    const { MongoMemoryReplSet } = await import('mongodb-memory-server');
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    const uri = replSet.getUri('auth_password_flows');
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = uri;
    process.env.MONGODB_DB_NAME = 'auth_password_flows';
    process.env.TEST_MONGODB_URI = uri;
    process.env.APP_BASE_URL = 'http://localhost:3000';
    await connectToDatabase();
    const database = mongoose.connection.db;
    if (!database) throw new Error('Missing auth password test database');
    await createIndexes(database);

    const { configureRouteRuntime } = await import('../../packages/server/src/http/define-route');
    configureRouteRuntime({
      resolveTenantContext: async (request) => request.headers.get('cookie')?.includes(sessionCookie)
        ? { businessId: businessId.toString(), userId: userId.toString(), role: 'owner' }
        : null,
      resolvePublicContext: async () => null,
    });
    configureRateLimitAdapter(async () => ({ allowed: true }));
    const { registerAuthRoutes } = await import('../../packages/server/src/http/auth-routes');
    const app = express();
    app.use(express.json());
    registerAuthRoutes(app);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing auth password HTTP address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 120_000);

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
    businessId = new mongoose.Types.ObjectId();
    userId = new mongoose.Types.ObjectId();
    sessionCookie = `na_sid=${createSessionToken()}`;
    const passwordHash = await hash(testPassword, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    await Business.create({ _id: businessId, name: 'Auth Test Business', slug: `auth-${businessId.toString()}`, timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', status: 'active' });
    await User.create({ _id: userId, email: 'owner@example.test', emailNormalized: 'owner@example.test', passwordHash, name: 'Owner', locale: 'ru', status: 'active' });
    await BusinessMember.create({ businessId, userId, role: 'owner', status: 'active', joinedAt: new Date() });
    const now = new Date();
    const [current] = await Session.create([{ businessId, userId, tokenHash: hashSessionToken(sessionCookie.slice('na_sid='.length)), lastSeenAt: now, expiresAt: new Date(now.getTime() + 86_400_000), absoluteExpiresAt: new Date(now.getTime() + 86_400_000) }]);
    if (!current) throw new Error('Current session fixture was not created');
    currentSessionId = current._id;
    const anotherToken = createSessionToken();
    await Session.create({ businessId, userId, tokenHash: hashSessionToken(anotherToken), lastSeenAt: now, expiresAt: new Date(now.getTime() + 86_400_000), absoluteExpiresAt: new Date(now.getTime() + 86_400_000) });
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await disconnectFromDatabase();
    await replSet?.stop();
  });

  async function post(path: string, body: Record<string, unknown>, cookie?: string) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });
    const payload = response.status === 204 ? {} : await response.json() as { data?: unknown; error?: { code?: string } };
    return { response, payload };
  }

  it('gives existing and unknown emails the same forgot response and a bounded timing difference', async () => {
    const known = await post('/api/auth/forgot-password', { email: 'owner@example.test' });
    const unknown = await post('/api/auth/forgot-password', { email: 'missing@example.test' });
    expect(known.response.status).toBe(202);
    expect(unknown.response.status).toBe(202);
    expect(known.payload).toEqual(unknown.payload);
    const elapsedByEmail = new Map<string, number[]>();
    for (const email of ['owner@example.test', 'missing@example.test', 'owner@example.test', 'missing@example.test', 'owner@example.test', 'missing@example.test']) {
      const started = performance.now();
      const result = await post('/api/auth/forgot-password', { email });
      const timings = elapsedByEmail.get(email) ?? [];
      expect(result.response.status).toBe(202);
      timings.push(performance.now() - started);
      elapsedByEmail.set(email, timings);
    }
    const median = (values: number[]) => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)] ?? 0;
    const knownTimings = elapsedByEmail.get('owner@example.test') ?? [];
    const unknownTimings = elapsedByEmail.get('missing@example.test') ?? [];
    expect([...knownTimings, ...unknownTimings].every((elapsed) => elapsed >= 140)).toBe(true);
    expect(Math.abs(median(knownTimings) - median(unknownTimings))).toBeLessThan(100);
    expect(await Notification.countDocuments({ businessId, kind: 'password_reset' })).toBe(4);
  });

  it('accepts a reset token once, invalidates every session and records the audit event', async () => {
    await post('/api/auth/forgot-password', { email: 'owner@example.test' });
    const notification = await Notification.findOne({ businessId, kind: 'password_reset' }).lean().exec();
    const resetUrl = (notification?.templateData as { resetUrl?: string } | undefined)?.resetUrl;
    const token = resetUrl ? new URL(resetUrl).searchParams.get('token') : null;
    const userBeforeReset = await User.findById(userId).lean().exec();
    expect(token).toBeTruthy();
    expect(userBeforeReset?.passwordResetTokenHash).not.toBe(token);
    expect(userBeforeReset?.passwordResetExpiresAt?.getTime()).toBeGreaterThan(Date.now());
    expect(userBeforeReset?.passwordResetExpiresAt?.getTime()).toBeLessThanOrEqual(Date.now() + 60 * 60_000);
    const reset = await post('/api/auth/reset-password', { token, password: 'new password safely long' });
    const replay = await post('/api/auth/reset-password', { token, password: 'another password safely long' });
    expect(reset.response.status).toBe(200);
    expect(replay.response.status).toBe(404);
    expect(replay.payload.error?.code).toBe('RESET_INVALID');
    expect(await Session.countDocuments({ businessId, userId })).toBe(0);
    expect(await AuditLog.countDocuments({ businessId, action: 'auth.password_changed' })).toBe(1);
    const user = await User.findById(userId).lean().exec();
    expect(user?.passwordResetTokenHash).toBeUndefined();
    expect(user?.passwordResetExpiresAt).toBeUndefined();
  });

  it('rejects expired reset tokens and allows only one winner in a reset race', async () => {
    const expiredToken = createSessionToken();
    await User.updateOne({ _id: userId }, { $set: { passwordResetTokenHash: hashSessionToken(expiredToken), passwordResetExpiresAt: new Date(Date.now() - 1) } }).exec();
    const expired = await post('/api/auth/reset-password', { token: expiredToken, password: 'new password safely long' });
    expect(expired.response.status).toBe(404);

    await post('/api/auth/forgot-password', { email: 'owner@example.test' });
    const notification = await Notification.findOne({ businessId, kind: 'password_reset' }).lean().exec();
    const resetUrl = (notification?.templateData as { resetUrl?: string } | undefined)?.resetUrl;
    const token = resetUrl ? new URL(resetUrl).searchParams.get('token') : null;
    expect(token).toBeTruthy();
    const results = await Promise.all([1, 2].map(() => post('/api/auth/reset-password', { token, password: 'new password safely long' })));
    expect(results.filter((result) => result.response.status === 200)).toHaveLength(1);
    expect(results.filter((result) => result.response.status === 404)).toHaveLength(1);
    expect(await AuditLog.countDocuments({ businessId, action: 'auth.password_changed' })).toBe(1);
  }, 120_000);

  it('changes password, keeps the current session and deletes all other sessions', async () => {
    const changed = await post('/api/auth/change-password', { currentPassword: testPassword, newPassword: 'changed password safely long' }, sessionCookie);
    expect(changed.response.status).toBe(204);
    const sessions = await Session.find({ businessId, userId }).lean().exec();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?._id.toString()).toBe(currentSessionId.toString());
    expect(await AuditLog.countDocuments({ businessId, action: 'auth.password_changed' })).toBe(1);
  });

  it('rejects an incorrect current password without invalidating sessions', async () => {
    const changed = await post('/api/auth/change-password', { currentPassword: 'incorrect password', newPassword: 'changed password safely long' }, sessionCookie);
    expect(changed.response.status).toBe(403);
    expect(changed.payload.error?.code).toBe('WRONG_PASSWORD');
    expect(await Session.countDocuments({ businessId, userId })).toBe(2);
    expect(await AuditLog.countDocuments({ businessId, action: 'auth.password_changed' })).toBe(0);
  });
});
