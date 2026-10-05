import { Types } from 'mongoose';
import type { z } from 'zod';
import type { TenantContext } from '@/shared/types/tenant-context';
import type { CreateBlockedPeriodSchema } from '@/shared/schemas/schedule';
import { ERROR_CODES } from '@/shared/error-codes';
import { withTransaction } from '../db/transactions';
import { AppError, NotFoundError } from '../http/errors';
import { BlockedPeriodRepository } from '../repositories/blocked-period-repository';

const repository = new BlockedPeriodRepository();
type CreateInput = z.infer<typeof CreateBlockedPeriodSchema>;

function toDto(value: Record<string, unknown>) {
  return {
    id: String(value._id),
    staffId: String(value.staffId),
    startAt: (value.startAt as Date).toISOString(),
    endAt: (value.endAt as Date).toISOString(),
    ...(typeof value.reason === 'string' ? { reason: value.reason } : {}),
    ...(value.groupId instanceof Types.ObjectId ? { groupId: value.groupId.toString() } : {}),
  };
}

export class BlockedPeriodService {
  async list(ctx: TenantContext, query: { from: string; to: string; staffId?: string | undefined }) {
    if (query.staffId && !(await repository.findStaff(ctx, query.staffId))) throw new NotFoundError();
    if (ctx.role === 'master') {
      if (query.staffId && query.staffId !== ctx.staffId) throw new NotFoundError();
      if (!ctx.staffId) return [];
    }
    const rows = await repository.list(ctx, new Date(query.from), new Date(query.to), ctx.role === 'master' ? ctx.staffId : query.staffId);
    return rows.map((row) => toDto(row as unknown as Record<string, unknown>));
  }

  async create(ctx: TenantContext, input: CreateInput) {
    return withTransaction(async (session) => {
      const staff = input.allStaff
        ? await repository.listActiveStaff(ctx, session)
        : await repository.staffByIds(ctx, input.staffId ? [input.staffId] : input.staffIds ?? [], session);
      const requestedIds = input.staffId ? [input.staffId] : input.staffIds;
      if (requestedIds && staff.length !== new Set(requestedIds).size) throw new NotFoundError('Сотрудник не найден');
      const startAt = new Date(input.startAt);
      const endAt = new Date(input.endAt);
      const staffIds = staff.map(({ _id }) => _id);
      if (staffIds.length === 0) return [];

      // BOOKING_ENGINE_SPEC §5: both booking and blocking write bookingVersion in the same transaction, so a concurrent slot claim must retry against the new availability.
      for (const member of staff) {
        const bumped = await repository.bumpBookingVersion(ctx, member._id, member.bookingVersion, session);
        if (bumped.modifiedCount !== 1) throw new AppError(ERROR_CODES.CONFLICT, 409, 'Расписание изменилось, повторите запрос');
      }
      const conflicts = await repository.conflictingAppointments(ctx, staffIds, startAt, endAt, session);
      if (conflicts.length > 0) {
        throw new AppError(ERROR_CODES.BLOCK_CONFLICTS_WITH_APPOINTMENTS, 409, 'В это время уже есть записи', [
          { appointmentIds: conflicts.map(({ _id }) => _id.toString()) },
        ]);
      }
      const groupId = input.allStaff ? new Types.ObjectId() : undefined;
      const rows = staff.map(({ _id }) => ({
        staffId: _id,
        startAt,
        endAt,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
        ...(groupId ? { groupId } : {}),
        createdBy: new Types.ObjectId(ctx.userId),
      }));
      const created = await repository.createMany(ctx, rows, session);
      return created.map((row) => toDto(row.toObject() as unknown as Record<string, unknown>));
    });
  }

  async delete(ctx: TenantContext, id: string, group: boolean): Promise<void> {
    await withTransaction(async (session) => {
      const row = await repository.findById(ctx, id, session);
      if (!row) throw new NotFoundError();
      const ids = group && row.groupId
        ? await repository.findGroupIds(ctx, row.groupId, session)
        : [row._id];
      const staffIds = await repository.findStaffIds(ctx, ids, session);
      await repository.delete(ctx, ids, staffIds, session);
    });
  }
}
