import { Types } from 'mongoose';
import type { TenantContext } from '@/shared/types/tenant-context';
import { Appointment, BlockedPeriod, Business, Customer, Service, Settings, Staff, StaffException, StaffSchedule } from '../db/models';

export class CalendarRepository {
  findBusiness(ctx: TenantContext) { return Business.findById(ctx.businessId).select('_id timezone').lean().exec(); }
  findSettings(ctx: TenantContext) { return Settings.findOne({ businessId: ctx.businessId }).select('privacy.masterSeesCustomerPhone').lean().exec(); }
  listStaff(ctx: TenantContext, staffIds?: string[]) {
    return Staff.find({ businessId: ctx.businessId, isActive: true, isDeleted: false, ...(staffIds ? { _id: { $in: staffIds } } : {}) }).sort({ displayOrder: 1, _id: 1 }).select('_id displayName color').lean().exec();
  }
  listAppointments(ctx: TenantContext, staffIds: string[], from: Date, to: Date, includeCancelled: boolean) {
    return Appointment.find({ businessId: ctx.businessId, staffId: { $in: staffIds }, startAt: { $lt: to }, blockedUntilAt: { $gt: from }, ...(includeCancelled ? {} : { status: { $ne: 'cancelled' } }) }).sort({ startAt: 1, _id: 1 }).lean().exec();
  }
  listBlocks(ctx: TenantContext, staffIds: string[], from: Date, to: Date) {
    return BlockedPeriod.find({ businessId: ctx.businessId, staffId: { $in: staffIds }, startAt: { $lt: to }, endAt: { $gt: from } }).sort({ startAt: 1, _id: 1 }).lean().exec();
  }
  listSchedules(ctx: TenantContext, staffIds: string[]) { return StaffSchedule.find({ businessId: ctx.businessId, staffId: { $in: staffIds } }).lean().exec(); }
  listExceptions(ctx: TenantContext, staffIds: string[], fromDate: string, toDate: string) { return StaffException.find({ businessId: ctx.businessId, staffId: { $in: staffIds }, date: { $gte: fromDate, $lt: toDate } }).lean().exec(); }
  async listReferences(ctx: TenantContext, customerIds: Types.ObjectId[], serviceIds: Types.ObjectId[]) {
    const [customers, services] = await Promise.all([
      Customer.find({ businessId: ctx.businessId, _id: { $in: customerIds } }).select('_id firstName lastName phone email').lean().exec(),
      Service.find({ businessId: ctx.businessId, _id: { $in: serviceIds } }).select('_id name').lean().exec(),
    ]);
    return { customers: new Map(customers.map((row) => [row._id.toString(), row])), services: new Map(services.map((row) => [row._id.toString(), row])) };
  }
}
