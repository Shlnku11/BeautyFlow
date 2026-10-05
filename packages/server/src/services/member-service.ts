import { Types } from 'mongoose';
import type { z } from 'zod';
import type { TenantContext } from '@/shared/types/tenant-context';
import type { MemberListQuerySchema, MemberStatusSchema } from '@/shared/schemas/members';
import { createSessionToken, hashSessionToken } from '../auth/session-token';
import { getEnv } from '../config/env';
import { withTransaction } from '../db/transactions';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../http/errors';
import { ERROR_CODES } from '@/shared/error-codes';
import { MemberRepository } from '../repositories/member-repository';

const repository = new MemberRepository();
type ListQuery = z.infer<typeof MemberListQuerySchema>;
type StatusInput = z.infer<typeof MemberStatusSchema>;

function toDto(member: Record<string, unknown>, user: Record<string, unknown>) {
  return {
    id: String(member._id),
    user: { id: String(user._id), name: user.name, email: user.email },
    role: member.role,
    status: member.status,
    ...(member.staffId instanceof Types.ObjectId ? { staffId: member.staffId.toString() } : {}),
    ...(member.joinedAt instanceof Date ? { joinedAt: member.joinedAt.toISOString() } : {}),
  };
}

export class MemberService {
  async list(ctx: TenantContext, query: ListQuery) {
    const result = await repository.list(ctx, query);
    return {
      data: result.rows.map(({ member, user }) => toDto(member as unknown as Record<string, unknown>, user as unknown as Record<string, unknown>)),
      meta: { page: query.page, limit: query.limit, total: result.total },
    };
  }

  async updateStatus(ctx: TenantContext, id: string, input: StatusInput) {
    return withTransaction(async (session) => {
      const member = await repository.findById(ctx, id, session);
      if (!member) throw new NotFoundError();
      if (member.role !== 'master') {
        if (member.role === 'owner') throw new ConflictError(ERROR_CODES.LAST_OWNER, 'Владельца нельзя отключить');
        throw new ForbiddenError();
      }
      if (member.userId.toString() === ctx.userId && input.status === 'disabled') {
        throw new ConflictError(ERROR_CODES.LAST_OWNER, 'Нельзя отключить собственный доступ владельца');
      }
      const updated = await repository.updateStatus(ctx, id, input.status, session);
      if (!updated) throw new NotFoundError();
      if (input.status === 'disabled') await repository.deleteSessions(ctx, member.userId, session);
      const user = await repository.findUser(ctx, member.userId, session);
      if (!user) throw new NotFoundError();
      if (member.status !== input.status) {
        await repository.writeAudit(ctx, input.status === 'disabled' ? 'member.disabled' : 'member.role_changed', member._id, session);
      }
      return toDto(updated as unknown as Record<string, unknown>, user as unknown as Record<string, unknown>);
    });
  }

  async resendInvite(ctx: TenantContext, id: string) {
    return withTransaction(async (session) => {
      const member = await repository.findById(ctx, id, session);
      if (!member || member.status !== 'invited' || member.role !== 'master') throw new NotFoundError();
      const user = await repository.findUser(ctx, member.userId, session);
      if (!user) throw new NotFoundError();
      const token = createSessionToken();
      const tokenHash = hashSessionToken(token);
      const expiresAt = new Date(Date.now() + 7 * 86_400_000);
      const updated = await repository.updateInvitation(ctx, id, tokenHash, expiresAt, session);
      if (!updated) throw new NotFoundError();
      const now = new Date();
      const inviteUrl = `${getEnv().APP_BASE_URL}/accept-invite?token=${encodeURIComponent(token)}`;
      await repository.enqueueInvite(ctx, {
        kind: 'staff_invite', channel: 'email', recipient: { email: user.email, name: user.name }, status: 'scheduled',
        scheduledFor: now, nextAttemptAt: now, attempts: 0, maxAttempts: 5,
        dedupeKey: `email:staff_invite:${member._id.toString()}:${tokenHash.slice(0, 8)}`,
        templateData: { staffName: user.name, inviteUrl },
      }, session);
      return { accepted: true };
    }).catch((error: unknown) => {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        throw new AppError(ERROR_CODES.CONFLICT, 409, 'Приглашение не удалось отправить повторно');
      }
      throw error;
    });
  }
}
