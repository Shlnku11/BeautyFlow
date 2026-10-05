import { Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import type { TenantContext } from '@/shared/types/tenant-context';
import { AuditLog, BusinessMember, Session, User } from '../db/models';
import type { BusinessMemberDocument } from '../db/models/business-members';
import { enqueueNotification } from '../notifications/enqueue';

export class MemberRepository {
  async list(ctx: TenantContext, query: { status?: BusinessMemberDocument['status'] | undefined; role?: BusinessMemberDocument['role'] | undefined; page: number; limit: number }) {
    const filter = { businessId: new Types.ObjectId(ctx.businessId), ...(query.status ? { status: query.status } : {}), ...(query.role ? { role: query.role } : {}) };
    const [members, total] = await Promise.all([
      BusinessMember.find(filter).sort({ createdAt: 1, _id: 1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean().exec(),
      BusinessMember.countDocuments(filter).exec(),
    ]);
    const users = await User.find({ _id: { $in: members.map(({ userId }) => userId) } }).select({ name: 1, email: 1 }).lean().exec();
    const usersById = new Map(users.map((user) => [user._id.toString(), user]));
    return { rows: members.map((member) => ({ member, user: usersById.get(member.userId.toString()) })).filter((row) => row.user), total };
  }

  findById(ctx: TenantContext, id: string, session: ClientSession) {
    return BusinessMember.findOne({ _id: id, businessId: new Types.ObjectId(ctx.businessId) }).session(session).lean().exec();
  }

  findUser(ctx: TenantContext, userId: Types.ObjectId, session: ClientSession) {
    void ctx;
    return User.findOne({ _id: userId }).session(session).lean().exec();
  }

  updateStatus(ctx: TenantContext, id: string, status: 'active' | 'disabled', session: ClientSession) {
    return BusinessMember.findOneAndUpdate(
      { _id: id, businessId: new Types.ObjectId(ctx.businessId) },
      { $set: { status }, ...(status === 'disabled' ? { $unset: { inviteTokenHash: 1, inviteExpiresAt: 1 } } : {}) },
      { session, returnDocument: 'after' },
    ).lean().exec();
  }

  deleteSessions(ctx: TenantContext, userId: Types.ObjectId, session: ClientSession) {
    return Session.deleteMany({ businessId: new Types.ObjectId(ctx.businessId), userId }, { session }).exec();
  }

  async writeAudit(ctx: TenantContext, action: 'member.disabled' | 'member.role_changed', memberId: Types.ObjectId, session: ClientSession) {
    await AuditLog.create([{ businessId: new Types.ObjectId(ctx.businessId), actorUserId: new Types.ObjectId(ctx.userId), actorRole: ctx.role, action, entityType: 'businessMember', entityId: memberId }], { session });
  }

  updateInvitation(ctx: TenantContext, id: string, tokenHash: string, expiresAt: Date, session: ClientSession) {
    return BusinessMember.findOneAndUpdate(
      { _id: id, businessId: new Types.ObjectId(ctx.businessId), status: 'invited' },
      { $set: { inviteTokenHash: tokenHash, inviteExpiresAt: expiresAt, invitedBy: new Types.ObjectId(ctx.userId) } },
      { session, returnDocument: 'after' },
    ).lean().exec();
  }

  enqueueInvite(ctx: TenantContext, data: Record<string, unknown>, session: ClientSession) {
    return enqueueNotification({ businessId: new Types.ObjectId(ctx.businessId), ...data }, session);
  }
}
