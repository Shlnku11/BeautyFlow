import { Types } from 'mongoose';
import { AppError, ConflictError, NotFoundError } from '../http/errors';
import { StaffRepository } from '../repositories/staff-repository';
import type { TenantContext } from '@/shared/types/tenant-context';
import { withTransaction } from '../db/transactions';
import { createSessionToken, hashSessionToken } from '../auth/session-token';
import { getEnv } from '../config/env';
import { assertPermission } from '../domain/permissions';
import { ERROR_CODES } from '@/shared/error-codes';
import type { z } from 'zod';
import { CreateStaffSchema } from '@/shared/schemas/staff';
import { buildDedupeKey } from '../notifications/dedupe-key';
import { AuditLog, Shift } from '../db/models';

const repository = new StaffRepository();

function toDto(staff: Record<string, unknown>) {
  const { _id, displayName, email, phone, bio, color, isActive, acceptsOnlineBooking, displayOrder, serviceIds, hourlyRateMinor } = staff;
  return {
    id: String(_id),
    displayName,
    ...(typeof email === 'string' ? { email } : {}),
    ...(typeof phone === 'string' ? { phone } : {}),
    ...(typeof bio === 'string' ? { bio } : {}),
    color,
    isActive,
    acceptsOnlineBooking,
    displayOrder,
    hourlyRateMinor: typeof hourlyRateMinor === 'number' ? hourlyRateMinor : 0,
    ...(Array.isArray(serviceIds) ? { serviceIds } : {}),
  };
}

type CreateStaffInput = z.input<typeof CreateStaffSchema>;

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

export class StaffService {
  async list(ctx: TenantContext, query: { includeInactive: boolean; page: number; limit: number }) {
    const staff = await repository.list(ctx, query);
    return staff.filter((item) => ctx.role !== 'master' || ctx.staffId === item._id.toString()).map((item) => toDto(item as unknown as Record<string, unknown>));
  }

  async get(ctx: TenantContext, id: string) {
    if (ctx.role === 'master' && ctx.staffId !== id) throw new NotFoundError();
    const staff = await repository.findById(ctx, id);
    if (!staff) throw new NotFoundError();
    return { ...toDto(staff as unknown as Record<string, unknown>), serviceIds: await repository.serviceIds(ctx, id) };
  }

  async create(ctx: TenantContext, input: CreateStaffInput) {
    const normalized = CreateStaffSchema.parse(input);
    if (normalized.email) assertPermission(ctx.role, 'members:invite');
    try {
      return await withTransaction(async (session) => {
        const staff = await repository.createInTransaction(ctx, normalized, session);
        if (!normalized.email) return { staff: toDto(staff.toObject() as unknown as Record<string, unknown>), accessInvite: 'none' as const };

        const emailNormalized = normalized.email.toLowerCase();
        const existingUser = await repository.findUserByEmail(ctx, emailNormalized, session);
        let userId: import('mongoose').Types.ObjectId;
        if (existingUser) {
          if (existingUser.status !== 'invited' || await repository.findMembershipByUserId(ctx, existingUser._id, session)) {
            throw new ConflictError(ERROR_CODES.EMAIL_TAKEN, 'Этот email уже используется');
          }
          userId = existingUser._id;
        } else {
          const user = await repository.createInvitedUser(ctx, {
            email: normalized.email, emailNormalized, name: normalized.displayName, passwordHash: null, locale: 'ru', status: 'invited',
          }, session);
          userId = user._id;
        }

        const inviteToken = createSessionToken();
        const inviteTokenHash = hashSessionToken(inviteToken);
        const inviteExpiresAt = new Date(Date.now() + 7 * 86_400_000);
        const member = await repository.createInvitedMember(ctx, {
          userId, staffId: staff._id, role: 'master', status: 'invited', inviteTokenHash, inviteExpiresAt,
          invitedBy: new Types.ObjectId(ctx.userId),
        }, session);
        const business = await repository.findBusinessName(ctx, session);
        if (!business) throw new NotFoundError();
        const now = new Date();
        const inviteUrl = `${getEnv().APP_BASE_URL}/accept-invite?token=${encodeURIComponent(inviteToken)}`;
        await repository.enqueueInvite(ctx, {
          channel: 'email', kind: 'staff_invite', recipient: { email: normalized.email, name: normalized.displayName }, status: 'scheduled',
          scheduledFor: now, nextAttemptAt: now, attempts: 0, maxAttempts: 5,
          dedupeKey: buildDedupeKey({ channel: 'email', kind: 'staff_invite', memberId: member._id.toString(), tokenHash: inviteTokenHash }),
          templateData: { businessName: business.name, staffName: normalized.displayName, inviteUrl },
        }, session);
        await repository.recordInvite(ctx, member._id, session);
        return { staff: toDto(staff.toObject() as unknown as Record<string, unknown>), accessInvite: 'sent' as const };
      });
    } catch (error: unknown) {
      if (error instanceof ConflictError) throw error;
      if (isDuplicateKey(error)) throw new ConflictError(ERROR_CODES.EMAIL_TAKEN, 'Этот email уже используется');
      throw error;
    }
  }

  async update(ctx: TenantContext, id: string, patch: Record<string, unknown>) {
    if (ctx.role === 'master' && ctx.staffId !== id) throw new NotFoundError();
    const { confirm, ...fields } = patch;
    if (fields.isActive === false) {
      assertPermission(ctx.role, 'staff:deactivate');
      return withTransaction(async (session) => {
        const current = await repository.findByIdInTransaction(ctx, id, session);
        if (!current) throw new NotFoundError();
        const upcomingCount = await repository.countUpcomingAppointments(ctx, id, new Date(), session);
        if (upcomingCount > 0 && confirm !== true) {
          throw new AppError(ERROR_CODES.STAFF_HAS_UPCOMING_APPOINTMENTS, 409, 'У сотрудника есть будущие записи', [{ count: upcomingCount }]);
        }
        const staff = await repository.updateInTransaction(ctx, id, fields, session);
        if (!staff) throw new NotFoundError();
        const now = new Date();
        const shift = await Shift.findOneAndUpdate({ businessId: ctx.businessId, staffId: id, closedAt: { $exists: false } }, { $set: { closedAt: now } }, { returnDocument: 'after', session }).lean().exec();
        if (shift) {
          const minutes = Math.max(1, Math.floor((now.getTime() - shift.startedAt.getTime()) / 60_000));
          const wageMinor = Math.round(shift.hourlyRateMinor * (now.getTime() - shift.startedAt.getTime()) / 3_600_000);
          await AuditLog.create([{ businessId: new Types.ObjectId(ctx.businessId), actorUserId: new Types.ObjectId(ctx.userId), actorRole: ctx.role, action: 'shift.closed', entityType: 'shift', entityId: shift._id, metadata: { staffId: id, minutes, wageMinor, closedBy: 'staff_deactivated' } }], { session });
        }
        await repository.disableLinkedMember(ctx, id, session);
        if (current.isActive) await repository.recordDeactivation(ctx, id, session);
        return toDto(staff as unknown as Record<string, unknown>);
      });
    }
    const staff = await repository.update(ctx, id, fields);
    if (!staff) throw new NotFoundError();
    return toDto(staff as unknown as Record<string, unknown>);
  }

  async serviceIds(ctx: TenantContext, staffId: string) {
    if (ctx.role === 'master' && ctx.staffId !== staffId) throw new NotFoundError();
    if (!(await repository.findById(ctx, staffId))) throw new NotFoundError();
    return { serviceIds: await repository.serviceIds(ctx, staffId) };
  }

  async replaceServiceIds(ctx: TenantContext, staffId: string, serviceIds: string[]) {
    if (!(await repository.findById(ctx, staffId))) throw new NotFoundError();
    return withTransaction(async (session) => {
      if (!(await repository.serviceIdsExist(ctx, serviceIds, session))) throw new AppError(ERROR_CODES.SERVICE_NOT_FOUND, 404, 'Услуга не найдена');
      await repository.replaceServices(ctx, staffId, serviceIds, session);
      return { serviceIds };
    });
  }
}
