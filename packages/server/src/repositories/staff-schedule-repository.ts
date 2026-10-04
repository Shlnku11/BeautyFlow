import { Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import type { z } from 'zod';
import type { TenantContext } from '@/shared/types/tenant-context';
import type { StaffExceptionSchema } from '@/shared/schemas/schedule';
import { Appointment, Staff, StaffException, StaffSchedule } from '../db/models';

export class StaffScheduleRepository {
  async findWeekly(ctx: TenantContext, staffId: string) {
    return StaffSchedule.findOne({ businessId: ctx.businessId, staffId }).lean().exec();
  }

  async replaceWeekly(ctx: TenantContext, staffId: string, weekly: unknown, session: ClientSession) {
    const staffObjectId = new Types.ObjectId(staffId);
    await Staff.updateOne({ _id: staffObjectId, businessId: ctx.businessId, isDeleted: false }, { $inc: { bookingVersion: 1 } }, { session }).exec();
    return StaffSchedule.findOneAndUpdate({ businessId: ctx.businessId, staffId: staffObjectId }, { $set: { weekly } }, { upsert: true, returnDocument: 'after', runValidators: true, session }).lean().exec();
  }

  countUpcomingAppointments(ctx: TenantContext, staffId: string, session: ClientSession) {
    return Appointment.countDocuments({ businessId: ctx.businessId, staffId, status: { $in: ['pending', 'confirmed'] }, startAt: { $gt: new Date() } }).session(session).exec();
  }

  listExceptions(ctx: TenantContext, staffId: string, from: string, to: string) {
    return StaffException.find({ businessId: ctx.businessId, staffId, date: { $gte: from, $lte: to } }).sort({ date: 1 }).lean().exec();
  }

  async upsertException(ctx: TenantContext, staffId: string, input: z.infer<typeof StaffExceptionSchema>, session: ClientSession) {
    const objectId = new Types.ObjectId(staffId);
    await Staff.updateOne({ _id: objectId, businessId: ctx.businessId, isDeleted: false }, { $inc: { bookingVersion: 1 } }, { session }).exec();
    await StaffException.updateOne({ businessId: ctx.businessId, staffId: objectId, date: input.date }, { $set: input, $setOnInsert: { businessId: new Types.ObjectId(ctx.businessId), staffId: objectId } }, { upsert: true, runValidators: true, session }).exec();
    return StaffException.findOne({ businessId: ctx.businessId, staffId: objectId, date: input.date }).session(session).lean().exec();
  }

  async deleteException(ctx: TenantContext, staffId: string, date: string, session: ClientSession) {
    await Staff.updateOne({ _id: new Types.ObjectId(staffId), businessId: ctx.businessId, isDeleted: false }, { $inc: { bookingVersion: 1 } }, { session }).exec();
    return StaffException.findOneAndDelete({ businessId: ctx.businessId, staffId, date }).session(session).lean().exec();
  }

  findStaff(ctx: TenantContext, staffId: string) {
    return Staff.findOne({ _id: staffId, businessId: ctx.businessId, isDeleted: false }).select({ _id: 1 }).lean().exec();
  }
}
