import { Types } from 'mongoose';
import type { PublicContext, TenantContext } from '@/shared/types/tenant-context';
import { getEnv } from '../config/env';
import { Session } from '../db/models';
import { configureRouteRuntime, type RouteRuntime } from '../http/define-route';
import { AuthRepository } from '../repositories/auth-repository';
import { hashSessionToken } from './session-token';

const repository = new AuthRepository();

function cookieToken(request: Request): string | undefined {
  const prefix = `${getEnv().SESSION_COOKIE_NAME}=`;
  const pair = request.headers.get('cookie')?.split(';').map((value) => value.trim()).find((value) => value.startsWith(prefix));
  return pair?.slice(prefix.length);
}

export const routeRuntime: RouteRuntime = {
  async resolveTenantContext(request): Promise<TenantContext | null> {
    const token = cookieToken(request);
    if (!token) return null;
    const session = await repository.findSessionByTokenHash(hashSessionToken(token));
    if (!session || session.expiresAt <= new Date() || session.absoluteExpiresAt <= new Date()) return null;
    const [user, membership] = await Promise.all([
      repository.findUserById(session.userId),
      repository.findMembership(session.userId, session.businessId),
    ]);
    if (!user || user.status !== 'active' || !membership) return null;
    const now = new Date();
    const nextExpiry = new Date(Math.min(now.getTime() + getEnv().SESSION_TTL_DAYS * 86_400_000, session.absoluteExpiresAt.getTime()));
    await repository.touchSession(session._id, now, nextExpiry);
    return { userId: user._id.toString(), businessId: session.businessId.toString(), role: membership.role, ...(membership.staffId ? { staffId: membership.staffId.toString() } : {}) };
  },
  async resolvePublicContext(request, source, params): Promise<PublicContext | null> {
    void request;
    void source;
    void params;
    return null;
  },
};

export function configureAuthRouteRuntime(): void {
  configureRouteRuntime(routeRuntime);
}

export function sessionObjectId(value: string): Types.ObjectId { return new Types.ObjectId(value); }

export async function removeCurrentSession(request: Request): Promise<void> {
  const token = cookieToken(request);
  if (token) await Session.deleteOne({ tokenHash: hashSessionToken(token) }).exec();
}
