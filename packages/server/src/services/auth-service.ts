import { hash, verify } from '@node-rs/argon2';
import { performance } from 'node:perf_hooks';
import { Types } from 'mongoose';
import { withTransaction } from '../db/transactions';
import { AuthRepository } from '../repositories/auth-repository';
import { createSessionToken, hashSessionToken } from '../auth/session-token';
import { getEnv } from '../config/env';
import { AppError, ConflictError } from '../http/errors';
import { ERROR_CODES } from '@/shared/error-codes';
import { PERMISSION_SCOPES } from '../domain/permissions';
import type { BusinessRole } from '@/shared/constants';
import type { RegisterBusinessRequestDto } from '@/shared/types/dto';
import { buildDedupeKey } from '../notifications/dedupe-key';

const repository = new AuthRepository();
const argonOptions = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };
const FORGOT_PASSWORD_MIN_DURATION_MS = 150;

async function keepMinimumDuration(startedAt: number): Promise<void> {
  const remaining = FORGOT_PASSWORD_MIN_DURATION_MS - (performance.now() - startedAt);
  if (remaining > 0) await new Promise<void>((resolve) => setTimeout(resolve, remaining));
}

export interface AuthResult {
  data: { user: { id: string; name: string; email: string; locale: 'ru' }; membership: { businessId: string; businessName: string; slug: string; role: 'owner' | 'admin' | 'master'; staffId?: string } };
  cookie: string;
}

function userDto(user: { _id: Types.ObjectId; name: string; email: string }) {
  return { id: user._id.toString(), name: user.name, email: user.email, locale: 'ru' as const };
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
      const { cookie } = await issueSession(user._id, business._id, request, session);
      return { data: { user: userDto(user), membership: membershipDto(business._id, business.name, business.slug, 'owner') }, cookie };
    });
  }

  async login(email: string, password: string, request: Request): Promise<AuthResult> {
    const user = await repository.findUserByEmail(email.toLowerCase());
    const valid = user?.passwordHash ? await verify(user.passwordHash, password) : await verify(await hash('dummy-password-never-used', argonOptions), password).catch(() => false);
    if (!user || !valid || user.status !== 'active') throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 401, 'Неверный email или пароль');
    const memberships = await repository.findActiveMembershipByUserId(user._id);
    if (!memberships) throw new AppError(ERROR_CODES.NO_ACTIVE_MEMBERSHIP, 403, 'Нет активного доступа к бизнесу');
    const business = await repository.findBusinessById(memberships.businessId);
    if (!business || business.status !== 'active') throw new AppError(ERROR_CODES.NO_ACTIVE_MEMBERSHIP, 403, 'Нет активного доступа к бизнесу');
    const { cookie } = await issueSession(user._id, business._id, request);
    return { data: { user: userDto(user), membership: membershipDto(business._id, business.name, business.slug, memberships.role) }, cookie };
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
