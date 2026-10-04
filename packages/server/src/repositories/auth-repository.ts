import type { ClientSession, Types } from 'mongoose';
import { Business, BusinessMember, Session, Settings, User } from '../db/models';

export class AuthRepository {
  findUserByEmail(emailNormalized: string) { return User.findOne({ emailNormalized }).lean().exec(); }
  findUserById(userId: Types.ObjectId) { return User.findById(userId).lean().exec(); }
  findSessionByTokenHash(tokenHash: string) { return Session.findOne({ tokenHash }).lean().exec(); }
  findMembership(userId: Types.ObjectId, businessId: Types.ObjectId) {
    return BusinessMember.findOne({ userId, businessId, status: 'active' }).lean().exec();
  }
  findActiveMembershipByUserId(userId: Types.ObjectId) {
    return BusinessMember.collection.findOne({ userId, status: 'active' });
  }
  findBusinessById(businessId: Types.ObjectId) { return Business.findById(businessId).lean().exec(); }
  async createUser(user: Record<string, unknown>, session: ClientSession) { const [created] = await User.create([user], { session }); if (!created) throw new Error('User creation returned no document'); return created; }
  async createBusiness(business: Record<string, unknown>, session: ClientSession) { const [created] = await Business.create([business], { session }); if (!created) throw new Error('Business creation returned no document'); return created; }
  async createSettings(settings: Record<string, unknown>, session: ClientSession) { const [created] = await Settings.create([settings], { session }); if (!created) throw new Error('Settings creation returned no document'); return created; }
  async createMembership(membership: Record<string, unknown>, session: ClientSession) { const [created] = await BusinessMember.create([membership], { session }); if (!created) throw new Error('Membership creation returned no document'); return created; }
  createSession(data: Record<string, unknown>, session?: ClientSession) {
    return Session.create([data], session ? { session } : {}).then(([created]) => {
      if (!created) throw new Error('Session creation returned no document');
      return created;
    });
  }
  deleteSession(tokenHash: string) { return Session.deleteOne({ tokenHash }).exec(); }
  async touchSession(sessionId: Types.ObjectId, lastSeenAt: Date, expiresAt: Date) {
    await Session.updateOne({ _id: sessionId }, { $set: { lastSeenAt, expiresAt } }).exec();
  }
}
