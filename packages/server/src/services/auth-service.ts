import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { performance } from 'node:perf_hooks';
import { Types } from 'mongoose';
import { withTransaction } from '../db/transactions';
import { AuthRepository } from '../repositories/auth-repository';
import { createSessionToken, hashSessionToken } from '../auth/session-token';
import { getEnv } from '../config/env';
import { AppError, ConflictError, RateLimitError } from '../http/errors';
import { ERROR_CODES } from '@/shared/error-codes';
import { PERMISSION_SCOPES } from '../domain/permissions';
import { DEV_DEMO_LOGIN_CODE, DEV_DEMO_LOGIN_EMAILS } from '@/shared/constants';
import type { BusinessRole } from '@/shared/constants';
import type { RegisterBusinessRequestDto } from '@/shared/types/dto';
import { buildDedupeKey } from '../notifications/dedupe-key';
import { isGoogleOAuthConfigured, verifyGoogleIdToken } from '../auth/google-token';
import { createLoginChallenge, hashLoginCode, readLoginChallenge } from '../auth/login-verification';
import type { GoogleRegisterBusinessSchema } from '@/shared/schemas/auth';
import type { z } from 'zod';

const repository = new AuthRepository();
const argonOptions = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };
const FORGOT_PASSWORD_MIN_DURATION_MS = 150;
const EMAIL_VERIFICATION_TTL_MS = 15 * 60_000;
const LOGIN_VERIFICATION_TTL_MS = 15 * 60_000;

async function keepMinimumDuration(startedAt: number): Promise<void> {
  const remaining = FORGOT_PASSWORD_MIN_DURATION_MS - (performance.now() - startedAt);
  if (remaining > 0) await new Promise<void>((resolve) => setTimeout(resolve, remaining));
}

export interface AuthResult {
  data: { user: { id: string; name: string; email: string; emailVerified: boolean; locale: 'ru' }; membership: { businessId: string; businessName: string; slug: string; role: 'owner' | 'admin' | 'master'; staffId?: string } };
  cookie: string;
}

export interface LoginChallengeResult {
  data: { requiresEmailCode: true; loginToken: string };
}

function userDto(user: { _id: Types.ObjectId; name: string; email: string; emailVerified?: boolean }) {
  return { id: user._id.toString(), name: user.name, email: user.email, emailVerified: user.emailVerified ?? false, locale: 'ru' as const };
}

function createEmailVerificationCode(): string { return randomInt(0, 1_000_000).toString().padStart(6, '0'); }

function createLoginVerificationCode(email: string): string {
  const env = getEnv();
  if (env.NODE_ENV === 'development' && DEV_DEMO_LOGIN_EMAILS.some((demoEmail) => demoEmail === email.toLowerCase())) return DEV_DEMO_LOGIN_CODE;
  return createEmailVerificationCode();
}

function hashEmailVerificationCode(code: string): string { return createHmac('sha256', getEnv().TOKEN_PEPPER).update(code).digest('hex'); }

function sameHash(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'hex');
  const rightBytes = Buffer.from(right, 'hex');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function membershipDto(businessId: Types.ObjectId, businessName: string, slug: string, role: 'owner' | 'admin' | 'master') {
  return { businessId: businessId.toString(), businessName, slug, role };
}

function sessionCookie(token: string): string {
  const env = getEnv();
  const maxAge = env.SESSION_TTL_DAYS * 24 * 60 * 60;
  return `${env.SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

async function issueSession(userId: Types.ObjectId, businessId: Types.ObjectId, request: Request, session?: import('mongoose').ClientSession) {
  const token = createSessionToken();
  const env = getEnv();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.SESSION_TTL_DAYS * 86_400_000);
  const absoluteExpiresAt = new Date(now.getTime() + env.SESSION_ABSOLUTE_TTL_DAYS * 86_400_000);
  await repository.createSession({ tokenHash: hashSessionToken(token), userId, businessId, ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(), userAgent: request.headers.get('user-agent')?.slice(0, 256), lastSeenAt: now, expiresAt, absoluteExpiresAt }, session);
  return { cookie: sessionCookie(token), token };
}

export class AuthService {
  googleOAuthConfig() {
    const env = getEnv();
    return { enabled: isGoogleOAuthConfigured(), clientId: isGoogleOAuthConfigured() ? env.GOOGLE_CLIENT_ID : null };
  }

  async loginWithGoogle(idToken: string, request: Request): Promise<AuthResult> {
    const identity = await verifyGoogleIdToken(idToken);
    return withTransaction(async (session) => {
      let user = await repository.findUserByGoogleId(identity.googleId, session);
      if (!user) {
        const emailUser = await repository.findUserByEmail(identity.email, session);
        if (!emailUser || emailUser.status !== 'active') throw new AppError(ERROR_CODES.GOOGLE_ACCOUNT_NOT_FOUND, 404, 'Сначала создайте аккаунт');
        user = await repository.linkGoogleIdentity(emailUser._id, identity.googleId, identity.avatarUrl, session);
        if (!user) throw new ConflictError(ERROR_CODES.GOOGLE_EMAIL_TAKEN, 'Этот Google аккаунт уже привязан к другому профилю');
      }
      if (user.status !== 'active') throw new AppError(ERROR_CODES.GOOGLE_ACCOUNT_NOT_FOUND, 404, 'Сначала создайте аккаунт');
      const membership = await repository.findActiveMembershipByUserId(user._id, session);
      if (!membership) throw new AppError(ERROR_CODES.NO_ACTIVE_MEMBERSHIP, 403, 'Нет активного доступа к бизнесу');
      const business = await repository.findBusinessById(membership.businessId, session);
      if (!business || business.status !== 'active') throw new AppError(ERROR_CODES.NO_ACTIVE_MEMBERSHIP, 403, 'Нет активного доступа к бизнесу');
      const { cookie } = await issueSession(user._id, business._id, request, session);
      return { data: { user: userDto(user), membership: membershipDto(business._id, business.name, business.slug, membership.role) }, cookie };
    });
  }

  async registerBusinessWithGoogle(input: z.infer<typeof GoogleRegisterBusinessSchema>, request: Request): Promise<AuthResult> {
    const identity = await verifyGoogleIdToken(input.idToken);
    const slugCandidate = input.slug ?? input.businessName.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const slugBase = slugCandidate.slice(0, 40).replace(/-+$/g, '');
    const slug = slugBase.length >= 3 ? slugBase : `salon-${identity.googleId.slice(-8).toLowerCase()}`;
    try {
      // API_CONTRACTS AUTH-15: account, tenant, owner membership, and first session commit as one unit.
      return await withTransaction(async (session) => {
        const linked = await repository.findUserByGoogleId(identity.googleId, session);
        if (linked) throw new ConflictError(ERROR_CODES.ALREADY_MEMBER, 'Этот Google аккаунт уже зарегистрирован');
        const existing = await repository.findUserByEmail(identity.email, session);
        if (existing) throw new ConflictError(ERROR_CODES.GOOGLE_EMAIL_TAKEN, 'Аккаунт с этим email уже существует. Войдите через Google или пароль.');
        const user = await repository.createUser({ email: identity.email, emailNormalized: identity.email, googleId: identity.googleId, ...(identity.avatarUrl ? { avatarUrl: identity.avatarUrl } : {}), emailVerified: true, passwordHash: null, name: identity.name, locale: 'ru', status: 'active' }, session);
        const business = await repository.createBusiness({ name: input.businessName, slug, timezone: input.timezone, currency: input.currency, countryCode: input.countryCode, status: 'active' }, session);
        await repository.createSettings({ businessId: business._id }, session);
        await repository.createMembership({ businessId: business._id, userId: user._id, role: 'owner', status: 'active', joinedAt: new Date() }, session);
        const { cookie } = await issueSession(user._id, business._id, request, session);
        return { data: { user: userDto(user), membership: membershipDto(business._id, business.name, business.slug, 'owner') }, cookie };
      });
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        const keyPattern = 'keyPattern' in error && typeof error.keyPattern === 'object' ? error.keyPattern as Record<string, unknown> : {};
        throw new ConflictError(keyPattern.slug ? ERROR_CODES.SLUG_TAKEN : ERROR_CODES.GOOGLE_EMAIL_TAKEN, keyPattern.slug ? 'Адрес бизнеса уже занят' : 'Google аккаунт уже зарегистрирован');
      }
      throw error;
    }
  }

  private async queueEmailVerification(user: { _id: Types.ObjectId; email: string; name: string }, businessId: Types.ObjectId, businessName: string, code: string, session: import('mongoose').ClientSession): Promise<void> {
    const codeHash = hashEmailVerificationCode(code);
    const now = new Date();
    const updated = await repository.setEmailVerification(user._id, codeHash, new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS), session);
    if (updated.matchedCount !== 1) throw new AppError(ERROR_CODES.INTERNAL, 500, 'Не удалось поставить подтверждение email');
    const dedupeKey = buildDedupeKey({ channel: 'email', kind: 'email_verification', userId: user._id.toString(), tokenHash: codeHash });
    await repository.enqueueEmailVerification({
      businessId,
      channel: 'email',
      kind: 'email_verification',
      recipient: { email: user.email, name: user.name },
      status: 'scheduled',
      scheduledFor: now,
      nextAttemptAt: now,
      attempts: 0,
      maxAttempts: 5,
      dedupeKey,
      templateData: { businessName, verificationCode: code },
    }, session);
  }

  private async queueLoginVerification(user: { _id: Types.ObjectId; email: string; name: string }, businessId: Types.ObjectId, challenge: { loginToken: string; nonce: string }, code: string, session: import('mongoose').ClientSession, expectedCodeHash?: string): Promise<void> {
    // API_CONTRACTS §2 AUTH-02/16 and DATA_MODEL_MONGODB §1: persist only a nonce-bound HMAC; raw codes live only in the delivery queue until outcome.
    const codeHash = hashLoginCode(challenge.nonce, code);
    const now = new Date();
    const updated = await repository.setLoginVerification(user._id, codeHash, new Date(now.getTime() + LOGIN_VERIFICATION_TTL_MS), session, expectedCodeHash);
    if (updated.matchedCount !== 1) throw new AppError(expectedCodeHash ? ERROR_CODES.INVALID_CODE : ERROR_CODES.INVALID_CREDENTIALS, 401, 'Код неверен');
    await repository.cancelPendingLoginVerifications(businessId, user.email, session);
    const dedupeKey = buildDedupeKey({ channel: 'email', kind: 'login_verification', userId: user._id.toString(), tokenHash: codeHash });
    await repository.enqueueLoginVerification({
      businessId,
      channel: 'email',
      kind: 'login_verification',
      recipient: { email: user.email, name: user.name },
      status: 'scheduled',
      scheduledFor: now,
      nextAttemptAt: now,
      attempts: 0,
      maxAttempts: 5,
      dedupeKey,
      templateData: { loginCode: code },
    }, session);
  }

  async verifyEmail(email: string, code: string): Promise<void> {
    const normalized = email.toLowerCase();
    const now = new Date();
    const user = await repository.findUserByEmail(normalized);
    if (user?.emailVerified) throw new AppError(ERROR_CODES.EMAIL_VERIFICATION_INVALID, 400, 'Код подтверждения неверен или истёк');
    const storedHash = user?.emailVerificationCodeHash;
    const codeHash = hashEmailVerificationCode(code);
    if (storedHash && user.emailVerificationExpiresAt && user.emailVerificationExpiresAt > now && user.emailVerificationAttempts < 5 && sameHash(storedHash, codeHash)) {
      const consumed = await withTransaction((session) => repository.consumeEmailVerification(normalized, codeHash, now, session));
      if (consumed.modifiedCount === 1) return;
    }
    const state = await repository.findEmailVerificationState(normalized);
    if (state && !state.emailVerified && state.emailVerificationAttempts >= 5) throw new RateLimitError(900);
    if (state && !state.emailVerified && state.emailVerificationExpiresAt && state.emailVerificationExpiresAt > now) {
      await repository.incrementEmailVerificationAttempt(normalized, now);
      const afterAttempt = await repository.findEmailVerificationState(normalized);
      if (afterAttempt?.emailVerificationAttempts !== undefined && afterAttempt.emailVerificationAttempts >= 5) {
        await repository.clearEmailVerification(normalized);
      }
    }
    throw new AppError(ERROR_CODES.EMAIL_VERIFICATION_INVALID, 400, 'Код подтверждения неверен или истёк');
  }

  async resendEmailVerification(email: string): Promise<void> {
    const user = await repository.findUserByEmail(email.toLowerCase());
    if (!user || user.status !== 'active' || user.emailVerified) return;
    const membership = await repository.findActiveMembershipByUserId(user._id);
    if (!membership) return;
    const business = await repository.findBusinessById(membership.businessId);
    if (!business || business.status !== 'active') return;
    const code = createEmailVerificationCode();
    await withTransaction(async (session) => {
      await repository.cancelPendingEmailVerifications(membership.businessId, user.email, session);
      await this.queueEmailVerification(user, membership.businessId, business.name, code, session);
    });
  }

  async requestPasswordReset(email: string): Promise<void> {
    const startedAt = performance.now();
    try {
      const user = await repository.findUserByEmail(email.toLowerCase());
      if (!user || user.status !== 'active') return;
      const membership = await repository.findActiveMembershipByUserId(user._id);
      if (!membership) return;
      const business = await repository.findBusinessById(membership.businessId);
      if (!business || business.status !== 'active') return;
      const token = createSessionToken();
      const tokenHash = hashSessionToken(token);
      const now = new Date();
      const dedupeKey = buildDedupeKey({ channel: 'email', kind: 'password_reset', userId: user._id.toString(), tokenHash });
      // API_CONTRACTS §2 AUTH-07 and NOTIFICATIONS_SPEC §5: only the keyed token is stored; the raw token is delivered through the email queue.
      await withTransaction(async (session) => {
        const activeMembership = await repository.findActiveMembershipByUserId(user._id, session);
        if (!activeMembership || !activeMembership.businessId.equals(membership.businessId)) return;
        const resetUpdate = await repository.setPasswordReset(user._id, tokenHash, new Date(now.getTime() + 60 * 60_000), session);
        if (resetUpdate.matchedCount !== 1) return;
        await repository.enqueuePasswordReset({
          businessId: membership.businessId,
          channel: 'email',
          kind: 'password_reset',
          recipient: { email: user.email, name: user.name },
          status: 'scheduled',
          scheduledFor: now,
          nextAttemptAt: now,
          attempts: 0,
          maxAttempts: 5,
          dedupeKey,
          templateData: { businessName: business.name, resetUrl: `${getEnv().APP_BASE_URL}/reset-password?token=${encodeURIComponent(token)}` },
        }, session);
      });
    } finally {
      await keepMinimumDuration(startedAt);
    }
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const passwordHash = await hash(password, argonOptions);
    const tokenHash = hashSessionToken(token);
    const now = new Date();
    await withTransaction(async (session) => {
      const user = await repository.findActiveUserByResetToken(tokenHash, now, session);
      if (!user) throw new AppError(ERROR_CODES.RESET_INVALID, 404, 'Ссылка сброса не найдена');
      const membership = await repository.findActiveMembershipByUserId(user._id);
      if (!membership) throw new AppError(ERROR_CODES.RESET_INVALID, 404, 'Ссылка сброса не найдена');
      const consumed = await repository.consumeResetToken(user._id, tokenHash, now, passwordHash, session);
      if (consumed.modifiedCount !== 1) throw new AppError(ERROR_CODES.RESET_INVALID, 404, 'Ссылка сброса не найдена');
      await repository.deleteUserSessions(user._id, session);
      await repository.writePasswordAudit(membership.businessId, user._id, session);
    });
  }

  async changePassword(userId: string, businessId: string, request: Request, currentPassword: string, newPassword: string): Promise<void> {
    const id = new Types.ObjectId(userId);
    const user = await repository.findUserById(id);
    if (!user?.passwordHash || !(await verify(user.passwordHash, currentPassword))) {
      throw new AppError(ERROR_CODES.WRONG_PASSWORD, 403, 'Текущий пароль неверен');
    }
    const passwordHash = await hash(newPassword, argonOptions);
    const token = request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${getEnv().SESSION_COOKIE_NAME}=`))?.split('=').slice(1).join('=');
    const currentSessionHash = token ? hashSessionToken(token) : undefined;
    const now = new Date();
    await withTransaction(async (session) => {
      const passwordUpdate = await repository.updatePassword(id, passwordHash, now, session);
      if (passwordUpdate.matchedCount !== 1) throw new AppError(ERROR_CODES.UNAUTHENTICATED, 401, 'Требуется вход в систему');
      const currentSession = currentSessionHash ? await repository.findSessionByTokenHash(currentSessionHash, session) : null;
      if (!currentSession || !currentSession.userId.equals(id)) throw new AppError(ERROR_CODES.UNAUTHENTICATED, 401, 'Требуется вход в систему');
      await repository.deleteUserSessions(id, session, currentSession?._id);
      await repository.writePasswordAudit(new Types.ObjectId(businessId), id, session);
    });
  }

  async acceptInvite(input: { token: string; name: string; password: string }, request: Request): Promise<AuthResult> {
    const passwordHash = await hash(input.password, argonOptions);
    return withTransaction(async (session) => {
      const invited = await repository.findInvitationByTokenHash(hashSessionToken(input.token), new Date(), session);
      if (!invited) throw new AppError(ERROR_CODES.INVITE_INVALID, 404, 'Приглашение не найдено');
      const member = await repository.acceptInvitation(invited.userId, invited.businessId, invited._id, input.name, passwordHash, session);
      if (!member) throw new AppError(ERROR_CODES.INVITE_INVALID, 404, 'Приглашение не найдено');
      const [user, business] = await Promise.all([
        repository.findUserById(invited.userId, session),
        repository.findBusinessById(invited.businessId, session),
      ]);
      if (!user || !business || business.status !== 'active') throw new AppError(ERROR_CODES.INVITE_INVALID, 404, 'Приглашение не найдено');
      const { cookie } = await issueSession(user._id, business._id, request, session);
      return {
        data: {
          user: userDto({ _id: user._id, name: user.name, email: user.email }),
          membership: { ...membershipDto(business._id, business.name, business.slug, member.role), ...(member.staffId ? { staffId: member.staffId.toString() } : {}) },
        },
        cookie,
      };
    });
  }

  async registerBusiness(input: RegisterBusinessRequestDto, request: Request): Promise<AuthResult> {
    const slug = (input.slug ?? input.businessName).normalize('NFKC').trim().toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40);
    const emailNormalized = input.email.toLowerCase();
    if (await repository.findUserByEmail(emailNormalized)) throw new ConflictError('EMAIL_TAKEN');
    const passwordHash = await hash(input.password, argonOptions);
    return withTransaction(async (session) => {
      const user = await repository.createUser({ email: input.email, emailNormalized, passwordHash, name: input.ownerName, locale: 'ru', status: 'active' }, session);
      const business = await repository.createBusiness({ name: input.businessName, slug, timezone: input.timezone, currency: input.currency, countryCode: input.countryCode, status: 'active' }, session);
      await repository.createSettings({ businessId: business._id }, session);
      await repository.createMembership({ businessId: business._id, userId: user._id, role: 'owner', status: 'active', joinedAt: new Date() }, session);
      await this.queueEmailVerification(user, business._id, business.name, createEmailVerificationCode(), session);
      const { cookie } = await issueSession(user._id, business._id, request, session);
      return { data: { user: userDto(user), membership: membershipDto(business._id, business.name, business.slug, 'owner') }, cookie };
    });
  }

  async login(email: string, password: string): Promise<LoginChallengeResult> {
    const user = await repository.findUserByEmail(email.toLowerCase());
    const valid = user?.passwordHash ? await verify(user.passwordHash, password) : await verify(await hash('dummy-password-never-used', argonOptions), password).catch(() => false);
    if (!user || !valid || user.status !== 'active') throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 401, 'Неверный email или пароль');
    if (!user.emailVerified) throw new AppError(ERROR_CODES.EMAIL_NOT_VERIFIED, 403, 'Сначала подтвердите email');
    const memberships = await repository.findActiveMembershipByUserId(user._id);
    if (!memberships) throw new AppError(ERROR_CODES.NO_ACTIVE_MEMBERSHIP, 403, 'Нет активного доступа к бизнесу');
    const business = await repository.findBusinessById(memberships.businessId);
    if (!business || business.status !== 'active') throw new AppError(ERROR_CODES.NO_ACTIVE_MEMBERSHIP, 403, 'Нет активного доступа к бизнесу');
    const challenge = createLoginChallenge(user._id.toString());
    const code = createLoginVerificationCode(user.email);
    await withTransaction((session) => this.queueLoginVerification(user, business._id, challenge, code, session));
    return { data: { requiresEmailCode: true, loginToken: challenge.loginToken } };
  }

  async verifyLogin(loginToken: string, code: string, request: Request): Promise<AuthResult> {
    const challenge = readLoginChallenge(loginToken);
    if (!challenge) throw new AppError(ERROR_CODES.INVALID_CODE, 401, 'Код неверен');
    const userId = new Types.ObjectId(challenge.userId);
    const codeHash = hashLoginCode(challenge.nonce, code);
    const now = new Date();
    const state = await repository.findLoginVerificationState(userId);
    if (!state) throw new AppError(ERROR_CODES.INVALID_CODE, 401, 'Код неверен');
    if (state.loginVerificationAttempts >= 5) throw new RateLimitError(900);
    if (state.loginVerificationExpiresAt && state.loginVerificationExpiresAt <= now) {
      throw new AppError(ERROR_CODES.EXPIRED_CODE, 410, 'Срок действия кода истёк');
    }
    if (!state.loginVerificationCodeHash) throw new AppError(ERROR_CODES.INVALID_CODE, 401, 'Код неверен');
    if (!sameHash(state.loginVerificationCodeHash, codeHash)) {
      await repository.incrementLoginVerificationAttempt(userId, state.loginVerificationCodeHash, now);
      const afterAttempt = await repository.findLoginVerificationState(userId);
      if (afterAttempt?.loginVerificationAttempts !== undefined && afterAttempt.loginVerificationAttempts >= 5) {
        throw new RateLimitError(900);
      }
      throw new AppError(ERROR_CODES.INVALID_CODE, 401, 'Код неверен');
    }
    let result: AuthResult | null = null;
    await withTransaction(async (session) => {
      // API_CONTRACTS §2 AUTH-16: conditional consumption makes the code single-use before a session can be created.
      const consumed = await repository.consumeLoginVerification(userId, codeHash, now, session);
      if (consumed.modifiedCount !== 1) return;
      const membership = await repository.findActiveMembershipByUserId(userId, session);
      if (!membership) throw new AppError(ERROR_CODES.NO_ACTIVE_MEMBERSHIP, 403, 'Нет активного доступа к бизнесу');
      const businessId = membership.businessId as Types.ObjectId;
      const business = await repository.findBusinessById(businessId, session);
      if (!business || business.status !== 'active') throw new AppError(ERROR_CODES.NO_ACTIVE_MEMBERSHIP, 403, 'Нет активного доступа к бизнесу');
      const user = await repository.findUserById(userId, session);
      if (!user || !user.emailVerified || user.status !== 'active') throw new AppError(ERROR_CODES.INVALID_CODE, 401, 'Код неверен');
      const { cookie } = await issueSession(user._id, business._id, request, session);
      result = { data: { user: userDto(user), membership: membershipDto(business._id, business.name, business.slug, membership.role) }, cookie };
    });
    if (!result) {
      const latest = await repository.findLoginVerificationState(userId);
      if (latest?.loginVerificationAttempts !== undefined && latest.loginVerificationAttempts >= 5) throw new RateLimitError(900);
      if (latest?.loginVerificationExpiresAt && latest.loginVerificationExpiresAt <= new Date()) throw new AppError(ERROR_CODES.EXPIRED_CODE, 410, 'Срок действия кода истёк');
      throw new AppError(ERROR_CODES.INVALID_CODE, 401, 'Код неверен');
    }
    return result;
  }

  async resendLoginVerification(loginToken: string): Promise<{ loginToken: string }> {
    const previousChallenge = readLoginChallenge(loginToken);
    if (!previousChallenge) throw new AppError(ERROR_CODES.INVALID_CODE, 401, 'Код неверен');
    const userId = new Types.ObjectId(previousChallenge.userId);
    const now = new Date();
    const state = await repository.findLoginVerificationState(userId);
    if (!state) throw new AppError(ERROR_CODES.INVALID_CODE, 401, 'Код неверен');
    if (state.loginVerificationAttempts >= 5) throw new RateLimitError(900);
    if (!state.loginVerificationExpiresAt || state.loginVerificationExpiresAt <= now || !state.loginVerificationCodeHash) {
      throw new AppError(ERROR_CODES.EXPIRED_CODE, 410, 'Срок действия кода истёк');
    }
    const user = await repository.findUserById(userId);
    const membership = await repository.findActiveMembershipByUserId(userId);
    if (!user || !user.emailVerified || user.status !== 'active' || !membership) throw new AppError(ERROR_CODES.INVALID_CODE, 401, 'Код неверен');
    const businessId = membership.businessId as Types.ObjectId;
    const business = await repository.findBusinessById(businessId);
    if (!business || business.status !== 'active') throw new AppError(ERROR_CODES.NO_ACTIVE_MEMBERSHIP, 403, 'Нет активного доступа к бизнесу');
    const challenge = createLoginChallenge(userId.toString());
    await withTransaction((session) => this.queueLoginVerification(user, businessId, challenge, createLoginVerificationCode(user.email), session, state.loginVerificationCodeHash));
    return { loginToken: challenge.loginToken };
  }


  permissionsFor(role: BusinessRole): string[] {
    return Object.entries(PERMISSION_SCOPES).filter(([, scopes]) => scopes[role] !== null).map(([permission]) => permission);
  }

  async getCurrentUser(userId: string, businessId: string, role: BusinessRole, staffId?: string) {
    const user = await repository.findUserById(new Types.ObjectId(userId));
    const tenantBusinessId = new Types.ObjectId(businessId);
    const membership = await repository.findMembership(new Types.ObjectId(userId), tenantBusinessId);
    const business = await repository.findBusinessById(tenantBusinessId);
    if (!user || !membership || !business || business.status !== 'active') {
      throw new AppError(ERROR_CODES.UNAUTHENTICATED, 401, 'Требуется вход в систему');
    }
    return {
      user: userDto(user),
      membership: membershipDto(business._id, business.name, business.slug, membership.role),
      active: { businessId: business._id.toString(), role, ...(staffId ? { staffId } : {}), business: { name: business.name, slug: business.slug, timezone: business.timezone, currency: business.currency, countryCode: business.countryCode } },
      permissions: this.permissionsFor(role),
    };
  }

  async logout(request: Request): Promise<void> {
    const token = request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${getEnv().SESSION_COOKIE_NAME}=`))?.split('=').slice(1).join('=');
    if (token) await repository.deleteSession(hashSessionToken(token));
  }
}
