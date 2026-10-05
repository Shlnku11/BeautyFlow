import { Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import type { TenantContext } from '@/shared/types/tenant-context';
import { Appointment, AuditLog, Business, BusinessMember, Service, Session, Staff, StaffService, User } from '../db/models';
import type { StaffDocument } from '../db/models/staff';
import { enqueueNotification } from '../notifications/enqueue';

export class StaffRepository {
  list(ctx: TenantContext, query: { includeInactive: boolean; page: number; limit: number }) {
    const filter = { businessId: new Types.ObjectId(ctx.businessId), isDeleted: false, ...(query.includeInactive ? {} : { isActive: true }) };
    return Staff.find(filter).sort({ displayOrder: 1, displayName: 1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean().exec();
  }

  findById(ctx: TenantContext, id: string) {
    return Staff.findOne({ _id: id, businessId: ctx.businessId, isDeleted: false }).lean().exec();
  }

  findByIdInTransaction(ctx: TenantContext, id: string, session: ClientSession) {
    return Staff.findOne({ _id: id, businessId: ctx.businessId, isDeleted: false }).session(session).lean().exec();
  }

  createInTransaction(ctx: TenantContext, input: { displayName: string; bio?: string | undefined; color: StaffDocument['color']; phone?: string | undefined; email?: string | undefined; acceptsOnlineBooking: boolean; displayOrder?: number | undefined }, session: ClientSession) {
    const data: Record<string, unknown> = { businessId: new Types.ObjectId(ctx.businessId), displayName: input.displayName, color: input.color, acceptsOnlineBooking: input.acceptsOnlineBooking };
    if (input.bio !== undefined) data.bio = input.bio;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.email !== undefined) data.email = input.email;
    if (input.displayOrder !== undefined) data.displayOrder = input.displayOrder;
    return new Staff(data).save({ session });
  }

  findBusinessName(ctx: TenantContext, session: ClientSession) {
    return Business.findById(ctx.businessId).select({ name: 1 }).session(session).lean().exec();
  }

  update(ctx: TenantContext, id: string, patch: Record<string, unknown>) {
    return Staff.findOneAndUpdate({ _id: id, businessId: ctx.businessId, isDeleted: false }, { $set: patch }, { returnDocument: 'after', runValidators: true }).lean().exec();
  }

  updateInTransaction(ctx: TenantContext, id: string, patch: Record<string, unknown>, session: ClientSession) {
    return Staff.findOneAndUpdate({ _id: id, businessId: ctx.businessId, isDeleted: false }, { $set: patch, ...(patch.isActive === false ? { $inc: { bookingVersion: 1 } } : {}) }, { returnDocument: 'after', runValidators: true, session }).lean().exec();
  }

  countUpcomingAppointments(ctx: TenantContext, staffId: string, now: Date, session: ClientSession) {
    return Appointment.countDocuments({ businessId: ctx.businessId, staffId, startAt: { $gt: now }, status: { $in: ['pending', 'confirmed'] } }).session(session).exec();
  }

  async disableLinkedMember(ctx: TenantContext, staffId: string, session: ClientSession) {
    const member = await BusinessMember.findOne({ businessId: ctx.businessId, staffId, role: 'master', status: { $in: ['active', 'invited'] } }).session(session).lean().exec();
    if (!member) return;
    await BusinessMember.updateOne({ _id: member._id, businessId: ctx.businessId }, { $set: { status: 'disabled' }, $unset: { inviteTokenHash: 1, inviteExpiresAt: 1 } }, { session }).exec();
    await Session.deleteMany({ businessId: ctx.businessId, userId: member.userId }, { session }).exec();
    await User.updateOne({ _id: member.userId, status: 'invited' }, { $set: { status: 'disabled' } }, { session }).exec();
  }

  async recordDeactivation(ctx: TenantContext, id: string, session: ClientSession) {
    await AuditLog.create([{ businessId: new Types.ObjectId(ctx.businessId), actorUserId: new Types.ObjectId(ctx.userId), actorRole: ctx.role, action: 'staff.deactivated', entityType: 'staff', entityId: new Types.ObjectId(id) }], { session });
  }

  async serviceIds(ctx: TenantContext, staffId: string) {
    const links = await StaffService.find({ businessId: ctx.businessId, staffId }).select({ serviceId: 1 }).lean().exec();
    return links.map(({ serviceId }) => serviceId.toString());
  }

  async serviceIdsExist(ctx: TenantContext, serviceIds: string[], session: ClientSession): Promise<boolean> {
    const count = await Service.countDocuments({ _id: { $in: serviceIds }, businessId: ctx.businessId, isDeleted: false }).session(session).exec();
    return count === new Set(serviceIds).size;
  }

  async replaceServices(ctx: TenantContext, staffId: string, serviceIds: string[], session: ClientSession) {
    await StaffService.deleteMany({ businessId: ctx.businessId, staffId }, { session }).exec();
    if (serviceIds.length > 0) {
      await StaffService.insertMany(serviceIds.map((serviceId) => ({ businessId: new Types.ObjectId(ctx.businessId), staffId: new Types.ObjectId(staffId), serviceId: new Types.ObjectId(serviceId) })), { session, ordered: true });
    }
    await Staff.updateOne({ _id: staffId, businessId: ctx.businessId, isDeleted: false }, { $inc: { bookingVersion: 1 } }, { session }).exec();
  }

  findUserByEmail(ctx: TenantContext, emailNormalized: string, session: ClientSession) {
    void ctx;
    return User.findOne({ emailNormalized }).session(session).lean().exec();
  }

  findMembershipByUserId(ctx: TenantContext, userId: Types.ObjectId, session: ClientSession) {
    void ctx;
    // DATA_MODEL_MONGODB.md §5 defines userId as globally unique in MVP, so the duplicate-account guard runs before TenantContext can be inferred.
    return BusinessMember.collection.findOne({ userId }, { session });
  }

  createInvitedUser(ctx: TenantContext, data: Record<string, unknown>, session: ClientSession) {
    void ctx;
    return new User(data).save({ session });
  }

  createInvitedMember(ctx: TenantContext, data: Record<string, unknown>, session: ClientSession) {
    return new BusinessMember({ businessId: new Types.ObjectId(ctx.businessId), ...data }).save({ session });
  }

  enqueueInvite(ctx: TenantContext, data: Record<string, unknown>, session: ClientSession) {
    return enqueueNotification({ businessId: new Types.ObjectId(ctx.businessId), ...data }, session);
  }

  async recordInvite(ctx: TenantContext, memberId: Types.ObjectId, session: ClientSession) {
    await AuditLog.create([{ businessId: new Types.ObjectId(ctx.businessId), actorUserId: new Types.ObjectId(ctx.userId), actorRole: ctx.role, action: 'member.invited', entityType: 'businessMember', entityId: memberId }], { session });
  }
}
