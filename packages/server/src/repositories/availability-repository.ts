import { Types } from 'mongoose';
import type { TenantContext } from '@/shared/types/tenant-context';
import { Appointment, BlockedPeriod, Business, Service, Settings, Staff, StaffException, StaffSchedule, StaffService } from '../db/models';
import { OCCUPYING_APPOINTMENT_STATUSES } from '../domain/booking-engine/occupancy';

export class AvailabilityRepository {
  findBusiness(ctx: TenantContext) { return Business.findById(ctx.businessId).lean().exec(); }
  findSettings(ctx: TenantContext) { return Settings.findOne({ businessId: ctx.businessId }).lean().exec(); }
  findService(ctx: TenantContext, serviceId: string) { return Service.findOne({ _id: serviceId, businessId: ctx.businessId, isDeleted: false, isActive: true }).lean().exec(); }
  findStaff(ctx: TenantContext, staffId: string) { return Staff.findOne({ _id: staffId, businessId: ctx.businessId, isDeleted: false, isActive: true }).lean().exec(); }
  staffProvidesService(ctx: TenantContext, staffId: string, serviceId: string) { return StaffService.exists({ businessId: ctx.businessId, staffId, serviceId }).exec(); }
  findSchedule(ctx: TenantContext, staffId: string) { return StaffSchedule.findOne({ businessId: ctx.businessId, staffId }).lean().exec(); }
  findException(ctx: TenantContext, staffId: string, date: string) { return StaffException.findOne({ businessId: ctx.businessId, staffId, date }).lean().exec(); }

  async listBookableStaff(ctx: TenantContext, serviceId: string) {
    const links = await StaffService.find({ businessId: ctx.businessId, serviceId }).select({ staffId: 1 }).lean().exec();
    const staffIds = links.map(({ staffId }) => staffId);
    return Staff.find({ _id: { $in: staffIds }, businessId: ctx.businessId, isDeleted: false, isActive: true, acceptsOnlineBooking: true }).sort({ displayOrder: 1, _id: 1 }).lean().exec();
  }

  async occupancies(ctx: TenantContext, staffId: string, startAt: Date, endAt: Date, excludeAppointmentId?: string) {
    const appointmentFilter: Record<string, unknown> = { businessId: ctx.businessId, staffId, status: { $in: OCCUPYING_APPOINTMENT_STATUSES }, startAt: { $lt: endAt }, blockedUntilAt: { $gt: startAt } };
    if (excludeAppointmentId) appointmentFilter._id = { $ne: new Types.ObjectId(excludeAppointmentId) };
    const [appointments, blocks] = await Promise.all([
      Appointment.find(appointmentFilter).select({ startAt: 1, blockedUntilAt: 1 }).lean().exec(),
      BlockedPeriod.find({ businessId: ctx.businessId, staffId, startAt: { $lt: endAt }, endAt: { $gt: startAt } }).select({ startAt: 1, endAt: 1 }).lean().exec(),
    ]);
    return [...appointments.map(({ startAt: start, blockedUntilAt }) => ({ startAt: start, endAt: blockedUntilAt })), ...blocks.map(({ startAt: start, endAt: end }) => ({ startAt: start, endAt: end }))];
  }

  countStaffAppointmentsForDay(ctx: TenantContext, staffId: string, startAt: Date, endAt: Date) {
    return Appointment.countDocuments({ businessId: ctx.businessId, staffId, status: { $in: OCCUPYING_APPOINTMENT_STATUSES }, startAt: { $gte: startAt, $lt: endAt } }).exec();
  }
}
