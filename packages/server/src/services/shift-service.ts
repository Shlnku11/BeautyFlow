import { Types } from 'mongoose';
import type { TenantContext } from '@/shared/types/tenant-context';
import { AuditLog, Shift, Staff } from '../db/models';
import { withTransaction } from '../db/transactions';
import { ConflictError, ForbiddenError, NotFoundError } from '../http/errors';

function assertShiftMember(ctx: TenantContext): asserts ctx is TenantContext & { staffId: string } {
  if (ctx.role !== 'master' || !ctx.staffId) throw new ForbiddenError();
}

function toDto(shift: { _id: Types.ObjectId; staffId: Types.ObjectId; startedAt: Date; closedAt?: Date; hourlyRateMinor: number }) {
  return { id: shift._id.toString(), staffId: shift.staffId.toString(), startedAt: shift.startedAt.toISOString(), ...(shift.closedAt ? { closedAt: shift.closedAt.toISOString() } : {}), hourlyRateMinor: shift.hourlyRateMinor };
}

export class ShiftService {
  async current(ctx: TenantContext) {
    assertShiftMember(ctx);
    const active = await Shift.findOne({ businessId: ctx.businessId, staffId: ctx.staffId, closedAt: { $exists: false } }).lean().exec();
    return active ? toDto(active) : null;
  }

  async start(ctx: TenantContext) {
    assertShiftMember(ctx);
    return withTransaction(async (session) => {
      const staff = await Staff.findOne({ _id: ctx.staffId, businessId: ctx.businessId, isActive: true, isDeleted: false }).session(session).lean().exec();
      if (!staff) throw new NotFoundError();
      const existing = await Shift.findOne({ businessId: ctx.businessId, staffId: ctx.staffId, closedAt: { $exists: false } }).session(session).lean().exec();
      if (existing) throw new ConflictError('SHIFT_ALREADY_OPEN', 'Смена уже открыта');
      const now = new Date();
      const [shift] = await Shift.create([{ businessId: new Types.ObjectId(ctx.businessId), staffId: new Types.ObjectId(ctx.staffId), userId: new Types.ObjectId(ctx.userId), startedAt: now, hourlyRateMinor: staff.hourlyRateMinor ?? 0 }], { session });
      if (!shift) throw new Error('Shift creation returned no document');
      await AuditLog.create([{ businessId: new Types.ObjectId(ctx.businessId), actorUserId: new Types.ObjectId(ctx.userId), actorRole: ctx.role, action: 'shift.started', entityType: 'shift', entityId: shift._id, metadata: { staffId: ctx.staffId, hourlyRateMinor: shift.hourlyRateMinor } }], { session });
      return toDto(shift);
    }).catch((error: unknown) => {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) throw new ConflictError('SHIFT_ALREADY_OPEN', 'Смена уже открыта');
      throw error;
    });
  }

  async close(ctx: TenantContext) {
    assertShiftMember(ctx);
    return withTransaction(async (session) => {
      const now = new Date();
      const shift = await Shift.findOneAndUpdate({ businessId: ctx.businessId, staffId: ctx.staffId, closedAt: { $exists: false } }, { $set: { closedAt: now } }, { returnDocument: 'after', session }).lean().exec();
      if (!shift) throw new NotFoundError('Открытая смена не найдена');
      const minutes = Math.max(1, Math.floor((now.getTime() - shift.startedAt.getTime()) / 60_000));
      const wageMinor = Math.round(shift.hourlyRateMinor * (now.getTime() - shift.startedAt.getTime()) / 3_600_000);
      await AuditLog.create([{ businessId: new Types.ObjectId(ctx.businessId), actorUserId: new Types.ObjectId(ctx.userId), actorRole: ctx.role, action: 'shift.closed', entityType: 'shift', entityId: shift._id, metadata: { staffId: ctx.staffId, minutes, wageMinor } }], { session });
      return { ...toDto(shift), minutes, wageMinor };
    });
  }
}
