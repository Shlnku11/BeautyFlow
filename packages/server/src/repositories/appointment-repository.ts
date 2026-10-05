import { Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import type { TenantContext } from '@/shared/types/tenant-context';
import { Appointment, BlockedPeriod, Business, Customer, Service, Settings, Staff, StaffService } from '../db/models';

export class AppointmentRepository {
  list(ctx: TenantContext, filter: Record<string, unknown>, skip: number, limit: number) { return Appointment.find({ businessId: ctx.businessId, ...filter }).sort({ startAt: 1, _id: 1 }).skip(skip).limit(limit).lean().exec(); }
  findById(ctx: TenantContext, id: string) { return Appointment.findOne({ _id: id, businessId: ctx.businessId }).lean().exec(); }
  updateById(ctx: TenantContext, id: string, update: Record<string, unknown>, session: ClientSession, expectedUpdatedAt?: Date) { return Appointment.findOneAndUpdate({ _id: id, businessId: ctx.businessId, ...(expectedUpdatedAt ? { updatedAt: expectedUpdatedAt } : {}) }, update, { returnDocument: 'after', session, runValidators: true }).lean().exec(); }
  findIdempotent(ctx: TenantContext, key: string) { return Appointment.findOne({ businessId: ctx.businessId, idempotencyKey: key }).lean().exec(); }
  findStaffById(ctx: TenantContext, id: string, session?: ClientSession) { const query = Staff.findOne({ _id: id, businessId: ctx.businessId, isDeleted: false, isActive: true }); return (session ? query.session(session) : query).lean().exec(); }
  findServiceById(ctx: TenantContext, id: string, session?: ClientSession) { const query = Service.findOne({ _id: id, businessId: ctx.businessId, isDeleted: false, isActive: true }); return (session ? query.session(session) : query).lean().exec(); }
  references(ctx: TenantContext, ids: { customerId: Types.ObjectId; staffId: Types.ObjectId; serviceId: Types.ObjectId }) { return Promise.all([Customer.findOne({ _id: ids.customerId, businessId: ctx.businessId }).lean().exec(), Staff.findOne({ _id: ids.staffId, businessId: ctx.businessId }).lean().exec(), Service.findOne({ _id: ids.serviceId, businessId: ctx.businessId }).lean().exec()]); }
  findService(ctx: TenantContext, id: string) { return Service.findOne({ _id: id, businessId: ctx.businessId, isDeleted: false, isActive: true }).lean().exec(); }
  findStaff(ctx: TenantContext, id: string) { return Staff.findOne({ _id: id, businessId: ctx.businessId, isDeleted: false, isActive: true }).lean().exec(); }
  listCandidates(ctx: TenantContext, serviceId: string) { return StaffService.find({ businessId: ctx.businessId, serviceId }).distinct('staffId').then((ids) => Staff.find({ _id: { $in: ids }, businessId: ctx.businessId, isDeleted: false, isActive: true, acceptsOnlineBooking: true }).sort({ displayOrder: 1, _id: 1 }).lean().exec()); }
  findBusiness(ctx: TenantContext) { return Business.findById(ctx.businessId).lean().exec(); }
  findSettings(ctx: TenantContext) { return Settings.findOne({ businessId: ctx.businessId }).lean().exec(); }
  staffProvidesService(ctx: TenantContext, staffId: string, serviceId: string) { return StaffService.exists({ businessId: ctx.businessId, staffId, serviceId }).exec(); }
  findCustomer(ctx: TenantContext, id: string) { return Customer.findOne({ _id: id, businessId: ctx.businessId, isDeleted: false }).lean().exec(); }
  findCustomerByPhone(ctx: TenantContext, phoneNormalized: string, session?: ClientSession) { const query = Customer.findOne({ businessId: ctx.businessId, phoneNormalized, isDeleted: false }); return (session ? query.session(session) : query).lean().exec(); }
  createCustomer(ctx: TenantContext, data: Record<string, unknown>, session: ClientSession, source: 'internal' | 'public' = 'internal') { return new Customer({ businessId: new Types.ObjectId(ctx.businessId), source, ...data }).save({ session }); }
  async findReferences(ctx: TenantContext, appointment: { customerId: Types.ObjectId; staffId: Types.ObjectId; serviceId: Types.ObjectId }) {
    const [customer, staff, service] = await Promise.all([
      Customer.findOne({ _id: appointment.customerId, businessId: ctx.businessId }).lean().exec(),
      Staff.findOne({ _id: appointment.staffId, businessId: ctx.businessId }).lean().exec(),
      Service.findOne({ _id: appointment.serviceId, businessId: ctx.businessId }).lean().exec(),
    ]);
    return customer && staff && service ? { customer, staff, service } : null;
  }
  incrementBookingVersion(ctx: TenantContext, staffId: string, expectedVersion: number, session: ClientSession) { return Staff.updateOne({ _id: staffId, businessId: ctx.businessId, isActive: true, isDeleted: false, bookingVersion: expectedVersion }, { $inc: { bookingVersion: 1 } }, { session }).exec(); }
  countStaffAppointmentsForDay(ctx: TenantContext, staffId: string, startAt: Date, endAt: Date) { return Appointment.countDocuments({ businessId: ctx.businessId, staffId, status: { $in: ['pending', 'confirmed', 'completed'] }, startAt: { $gte: startAt, $lt: endAt } }).exec(); }
  hasOverlap(ctx: TenantContext, staffId: string, startAt: Date, blockedUntilAt: Date, session: ClientSession, excludeId?: string) { return Appointment.exists({ businessId: ctx.businessId, staffId, ...(excludeId ? { _id: { $ne: excludeId } } : {}), status: { $in: ['pending', 'confirmed', 'completed'] }, startAt: { $lt: blockedUntilAt }, blockedUntilAt: { $gt: startAt } }).session(session).exec(); }
  hasBlockOverlap(ctx: TenantContext, staffId: string, startAt: Date, blockedUntilAt: Date, session: ClientSession) { return BlockedPeriod.exists({ businessId: ctx.businessId, staffId, startAt: { $lt: blockedUntilAt }, endAt: { $gt: startAt } }).session(session).exec(); }
  create(ctx: TenantContext, data: Record<string, unknown>, session: ClientSession) { return new Appointment({ businessId: new Types.ObjectId(ctx.businessId), ...data }).save({ session }); }
}
