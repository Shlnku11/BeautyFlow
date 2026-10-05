import { Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import type { TenantContext } from '@/shared/types/tenant-context';
import { Appointment, BlockedPeriod, Staff } from '../db/models';

export class BlockedPeriodRepository {
  findStaff(ctx: TenantContext, staffId: string) {
    return Staff.findOne({ _id: staffId, businessId: new Types.ObjectId(ctx.businessId), isDeleted: false }).select({ _id: 1 }).lean().exec();
  }

  list(ctx: TenantContext, from: Date, to: Date, staffId?: string) {
    return BlockedPeriod.find({
      businessId: new Types.ObjectId(ctx.businessId),
      startAt: { $lt: to },
      endAt: { $gt: from },
      ...(staffId ? { staffId: new Types.ObjectId(staffId) } : {}),
    }).sort({ startAt: 1, staffId: 1 }).lean().exec();
  }

  async listActiveStaff(ctx: TenantContext, session: ClientSession) {
    return Staff.find({ businessId: new Types.ObjectId(ctx.businessId), isActive: true, isDeleted: false })
      .select({ _id: 1, bookingVersion: 1 })
      .sort({ _id: 1 })
      .session(session)
      .lean()
      .exec();
  }

  async staffByIds(ctx: TenantContext, ids: string[], session: ClientSession) {
    return Staff.find({ _id: { $in: ids }, businessId: new Types.ObjectId(ctx.businessId), isActive: true, isDeleted: false })
      .select({ _id: 1, bookingVersion: 1 })
      .session(session)
      .lean()
      .exec();
  }

  bumpBookingVersion(ctx: TenantContext, staffId: Types.ObjectId, expectedVersion: number, session: ClientSession) {
    return Staff.updateOne(
      { _id: staffId, businessId: new Types.ObjectId(ctx.businessId), isActive: true, isDeleted: false, bookingVersion: expectedVersion },
      { $inc: { bookingVersion: 1 } },
      { session },
    ).exec();
  }

  conflictingAppointments(ctx: TenantContext, staffIds: Types.ObjectId[], startAt: Date, endAt: Date, session: ClientSession) {
    return Appointment.find({
      businessId: new Types.ObjectId(ctx.businessId),
      staffId: { $in: staffIds },
      status: { $in: ['pending', 'confirmed', 'completed'] },
      startAt: { $lt: endAt },
      blockedUntilAt: { $gt: startAt },
    }).select({ _id: 1 }).session(session).lean().exec();
  }

  createMany(ctx: TenantContext, rows: Array<Record<string, unknown>>, session: ClientSession) {
    return BlockedPeriod.insertMany(rows.map((row) => ({ businessId: new Types.ObjectId(ctx.businessId), ...row })), { session, ordered: true });
  }

  findById(ctx: TenantContext, id: string, session: ClientSession) {
    return BlockedPeriod.findOne({ _id: id, businessId: new Types.ObjectId(ctx.businessId) }).session(session).lean().exec();
  }

  async findGroupIds(ctx: TenantContext, groupId: Types.ObjectId, session: ClientSession) {
    const rows = await BlockedPeriod.find({ businessId: new Types.ObjectId(ctx.businessId), groupId })
      .select({ _id: 1 }).session(session).lean().exec();
    return rows.map(({ _id }) => _id);
  }

  async findStaffIds(ctx: TenantContext, ids: Types.ObjectId[], session: ClientSession) {
    const rows = await BlockedPeriod.find({ _id: { $in: ids }, businessId: new Types.ObjectId(ctx.businessId) })
      .select({ staffId: 1 }).session(session).lean().exec();
    return [...new Map(rows.map(({ staffId }) => [staffId.toString(), staffId])).values()];
  }

  async delete(ctx: TenantContext, ids: Types.ObjectId[], staffIds: Types.ObjectId[], session: ClientSession) {
    await BlockedPeriod.deleteMany({ _id: { $in: ids }, businessId: new Types.ObjectId(ctx.businessId) }).session(session).exec();
    await Staff.updateMany({ _id: { $in: staffIds }, businessId: new Types.ObjectId(ctx.businessId), isDeleted: false }, { $inc: { bookingVersion: 1 } }, { session }).exec();
  }
}
