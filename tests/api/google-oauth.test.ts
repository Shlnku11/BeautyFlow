import express from 'express';
import mongoose from 'mongoose';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectToDatabase, disconnectFromDatabase } from '../../packages/server/src/db/connection';
import { up as createIndexes } from '../../packages/server/migrations/000_init';
import { up as createGoogleIdentityIndex } from '../../packages/server/migrations/001_google_identity';
import { configureRateLimitAdapter } from '../../packages/server/src/http/rate-limit';
import { Business, BusinessMember, Session, Settings, User } from '../../packages/server/src/db/models';
import { AppError } from '../../packages/server/src/http/errors';
import { ERROR_CODES } from '../../packages/shared/src/error-codes';

const { mockVerifyGoogleIdToken, mockIsGoogleOAuthConfigured } = vi.hoisted(() => ({
  mockVerifyGoogleIdToken: vi.fn(),
  mockIsGoogleOAuthConfigured: vi.fn(),
}));

vi.mock('../../packages/server/src/auth/google-token', () => ({
  verifyGoogleIdToken: mockVerifyGoogleIdToken,
  isGoogleOAuthConfigured: mockIsGoogleOAuthConfigured,
}));

describe('optional Google OAuth routes', () => {
  let replSet: import('mongodb-memory-server').MongoMemoryReplSet;
  let server: Server;
  let baseUrl: string;
  let businessA = new mongoose.Types.ObjectId();
  let businessB = new mongoose.Types.ObjectId();
  let userA = new mongoose.Types.ObjectId();
  let userB = new mongoose.Types.ObjectId();

  const googleA = { googleId: 'google-subject-a', email: 'owner-a@example.test', name: 'Owner A', avatarUrl: 'https://images.example.test/a.png' };
  const googleNew = { googleId: 'google-subject-new', email: 'new-owner@example.test', name: 'New Owner' };

  beforeAll(async () => {
    const { MongoMemoryReplSet } = await import('mongodb-memory-server');
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replSet.getUri('google_oauth');
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = uri;
    process.env.MONGODB_DB_NAME = 'google_oauth';
    process.env.TEST_MONGODB_URI = uri;
    process.env.APP_BASE_URL = 'http://localhost:3000';
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
    await connectToDatabase();
    const database = mongoose.connection.db;
    if (!database) throw new Error('Missing Google OAuth test database');
    await createIndexes(database);
    await createGoogleIdentityIndex(database);
    configureRateLimitAdapter(async () => ({ allowed: true }));
    const { registerAuthRoutes } = await import('../../packages/server/src/http/auth-routes');
    const app = express();
    app.use(express.json());
    registerAuthRoutes(app);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing Google OAuth test HTTP address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 120_000);

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
    businessA = new mongoose.Types.ObjectId();
    businessB = new mongoose.Types.ObjectId();
    userA = new mongoose.Types.ObjectId();
    userB = new mongoose.Types.ObjectId();
    mockIsGoogleOAuthConfigured.mockReturnValue(true);
    mockVerifyGoogleIdToken.mockImplementation(async (idToken: string) => {
      if (idToken === 'valid-a') return googleA;
      if (idToken === 'valid-new') return googleNew;
      throw new AppError(ERROR_CODES.GOOGLE_TOKEN_INVALID, 401, 'Токен Google недействителен');
    });
    await Business.create([
      { _id: businessA, name: 'Salon A', slug: `google-a-${businessA}`, timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', status: 'active' },
      { _id: businessB, name: 'Salon B', slug: `google-b-${businessB}`, timezone: 'Europe/Berlin', currency: 'EUR', countryCode: 'OTHER', status: 'active' },
    ]);
    await Settings.create([{ businessId: businessA }, { businessId: businessB }]);
    await User.create([
      { _id: userA, email: googleA.email, emailNormalized: googleA.email, googleId: googleA.googleId, avatarUrl: googleA.avatarUrl, emailVerified: true, passwordHash: null, name: googleA.name, locale: 'ru', status: 'active' },
      { _id: userB, email: 'owner-b@example.test', emailNormalized: 'owner-b@example.test', emailVerified: true, passwordHash: null, name: 'Owner B', locale: 'ru', status: 'active' },
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

  async function request(path: string, body?: Record<string, unknown>) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Origin: 'http://localhost:5173', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json() as { data?: Record<string, unknown>; error?: { code?: string } };
    return { response, payload };
  }

  it('shows Google as unavailable when credentials are absent', async () => {
    mockIsGoogleOAuthConfigured.mockReturnValue(false);
    const result = await request('/api/auth/google/config');
    expect(result.response.status).toBe(200);
    expect(result.payload.data).toEqual({ enabled: false, clientId: null });
    expect((await request('/api/auth/login', { email: 'owner-b@example.test', password: 'wrong-password' })).response.status).toBe(401);
  });

  it('accepts a verified token and creates a session for only that identity business', async () => {
    const result = await request('/api/auth/google', { idToken: 'valid-a' });
    expect(result.response.status).toBe(200);
    expect(result.payload.data?.membership).toMatchObject({ businessId: businessA.toString(), slug: `google-a-${businessA}` });
    expect(result.response.headers.get('set-cookie')).toContain('na_sid=');
    expect(await Session.countDocuments({ userId: userA, businessId: businessA })).toBe(1);
    expect(await Session.countDocuments({ userId: userA, businessId: businessB })).toBe(0);
    const attemptedSwitch = await request('/api/auth/google', { idToken: 'valid-a', businessId: businessB.toString() });
    expect(attemptedSwitch.response.status).toBe(422);
  });

  it('rejects an invalid Google token with 401', async () => {
    const result = await request('/api/auth/google', { idToken: 'invalid' });
    expect(result.response.status).toBe(401);
    expect(result.payload.error?.code).toBe('GOOGLE_TOKEN_INVALID');
    expect(await Session.countDocuments()).toBe(0);
  });

  it('creates the Google user and business atomically', async () => {
    const result = await request('/api/auth/google/register-business', {
      idToken: 'valid-new', businessName: 'Google Studio', slug: 'google-studio', timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', acceptTerms: true,
    });
    expect(result.response.status).toBe(201);
    const user = await User.findOne({ googleId: googleNew.googleId }).lean().exec();
    expect(user).toMatchObject({ emailVerified: true, emailNormalized: googleNew.email, passwordHash: null });
    const business = await Business.findOne({ slug: 'google-studio' }).lean().exec();
    if (!user || !business) throw new Error('Google registration did not persist its owner or business');
    expect(await Settings.countDocuments({ businessId: business._id })).toBe(1);
    expect(await BusinessMember.countDocuments({ businessId: business._id, userId: user._id, role: 'owner', status: 'active' })).toBe(1);
    expect(await Session.countDocuments({ userId: user._id, businessId: business._id })).toBe(1);
  });

  it('rolls back the Google user when business creation conflicts', async () => {
    const result = await request('/api/auth/google/register-business', {
      idToken: 'valid-new', businessName: 'Other Studio', slug: `google-a-${businessA}`, timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', acceptTerms: true,
    });
    expect(result.response.status).toBe(409);
    expect(result.payload.error?.code).toBe('SLUG_TAKEN');
    expect(await User.findOne({ googleId: googleNew.googleId }).lean().exec()).toBeNull();
    expect(await User.countDocuments()).toBe(2);
    expect(await Business.countDocuments()).toBe(2);
    expect(await Settings.collection.countDocuments()).toBe(2);
    expect(await BusinessMember.collection.countDocuments()).toBe(2);
    expect(await Session.countDocuments()).toBe(0);
  });
});
