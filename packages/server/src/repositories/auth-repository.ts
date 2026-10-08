import type { ClientSession, Types } from 'mongoose';
import { AuditLog, Business, BusinessMember, Notification, Session, Settings, User } from '../db/models';

export class AuthRepository {
  findUserByEmail(emailNormalized: string, session?: ClientSession) {
    const query = User.findOne({ emailNormalized });
    return (session ? query.session(session) : query).lean().exec();
  }
  findUserByGoogleId(googleId: string, session?: ClientSession) {
    const query = User.findOne({ googleId });
    return (session ? query.session(session) : query).lean().exec();
  }
  linkGoogleIdentity(userId: Types.ObjectId, googleId: string, avatarUrl: string | undefined, session: ClientSession) {
    return User.findOneAndUpdate(
      { _id: userId, status: 'active', $or: [{ googleId: { $exists: false } }, { googleId }] },
      { $set: { googleId, emailVerified: true, ...(avatarUrl ? { avatarUrl } : {}) } },
      { session, returnDocument: 'after' },
    ).lean().exec();
  }
  findActiveUserByResetToken(tokenHash: string, now: Date, session: ClientSession) {
    return User.findOne({ status: 'active', passwordResetTokenHash: tokenHash, passwordResetExpiresAt: { $gt: now } }).session(session).lean().exec();
  }
  setPasswordReset(userId: Types.ObjectId, tokenHash: string, expiresAt: Date, session: ClientSession) {
    return User.updateOne({ _id: userId, status: 'active' }, { $set: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt } }, { session }).exec();
  }
  updatePassword(userId: Types.ObjectId, passwordHash: string, now: Date, session: ClientSession) {
    return User.updateOne({ _id: userId }, { $set: { passwordHash, passwordChangedAt: now }, $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 } }, { session }).exec();
  }
  consumeResetToken(userId: Types.ObjectId, tokenHash: string, now: Date, passwordHash: string, session: ClientSession) {
    return User.updateOne({ _id: userId, status: 'active', passwordResetTokenHash: tokenHash, passwordResetExpiresAt: { $gt: now } }, { $set: { passwordHash, passwordChangedAt: now }, $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 } }, { session }).exec();
  }
  deleteUserSessions(userId: Types.ObjectId, session: ClientSession, keepSessionId?: Types.ObjectId) {
    // API_CONTRACTS §2 AUTH-08/09 invalidates one account's sessions across every business; the tenant query guard stays enabled elsewhere.
    return Session.collection.deleteMany({ userId, ...(keepSessionId ? { _id: { $ne: keepSessionId } } : {}) }, { session });
  }
  enqueuePasswordReset(data: Record<string, unknown> & { businessId: Types.ObjectId; dedupeKey: string }, session: ClientSession) {
    return Notification.updateOne({ businessId: data.businessId, dedupeKey: data.dedupeKey }, { $setOnInsert: data }, { upsert: true, session }).exec();
  }
  setEmailVerification(userId: Types.ObjectId, codeHash: string, expiresAt: Date, session: ClientSession) {
    return User.updateOne({ _id: userId, status: 'active', emailVerified: false }, { $set: { emailVerificationCodeHash: codeHash, emailVerificationExpiresAt: expiresAt, emailVerificationAttempts: 0 } }, { session }).exec();
  }
  enqueueEmailVerification(data: Record<string, unknown> & { businessId: Types.ObjectId; dedupeKey: string }, session: ClientSession) {
    return Notification.updateOne({ businessId: data.businessId, dedupeKey: data.dedupeKey }, { $setOnInsert: data }, { upsert: true, session }).exec();
  }
  setLoginVerification(userId: Types.ObjectId, codeHash: string, expiresAt: Date, session: ClientSession, expectedCodeHash?: string) {
    return User.updateOne({ _id: userId, status: 'active', emailVerified: true, ...(expectedCodeHash ? { loginVerificationCodeHash: expectedCodeHash, loginVerificationExpiresAt: { $gt: new Date() } } : {}) }, { $set: { loginVerificationCodeHash: codeHash, loginVerificationExpiresAt: expiresAt, loginVerificationAttempts: 0 } }, { session }).exec();
  }
  enqueueLoginVerification(data: Record<string, unknown> & { businessId: Types.ObjectId; dedupeKey: string }, session: ClientSession) {
    return Notification.updateOne({ businessId: data.businessId, dedupeKey: data.dedupeKey }, { $setOnInsert: data }, { upsert: true, session }).exec();
  }
  consumeLoginVerification(userId: Types.ObjectId, codeHash: string, now: Date, session: ClientSession) {
    return User.updateOne({ _id: userId, status: 'active', emailVerified: true, loginVerificationCodeHash: codeHash, loginVerificationExpiresAt: { $gt: now }, loginVerificationAttempts: { $lt: 5 } }, { $unset: { loginVerificationCodeHash: 1, loginVerificationExpiresAt: 1 }, $set: { loginVerificationAttempts: 0 } }, { session }).exec();
  }
  incrementLoginVerificationAttempt(userId: Types.ObjectId, codeHash: string, now: Date) {
    return User.collection.findOneAndUpdate(
      { _id: userId, status: 'active', emailVerified: true, loginVerificationCodeHash: codeHash, loginVerificationExpiresAt: { $gt: now }, loginVerificationAttempts: { $lt: 5 } },
      [{ $set: {
        loginVerificationAttempts: { $add: [{ $ifNull: ['$loginVerificationAttempts', 0] }, 1] },
        loginVerificationCodeHash: { $cond: [{ $gte: [{ $add: [{ $ifNull: ['$loginVerificationAttempts', 0] }, 1] }, 5] }, '$$REMOVE', '$loginVerificationCodeHash'] },
        loginVerificationExpiresAt: { $cond: [{ $gte: [{ $add: [{ $ifNull: ['$loginVerificationAttempts', 0] }, 1] }, 5] }, '$$REMOVE', '$loginVerificationExpiresAt'] },
      } }],
      { returnDocument: 'after' },
    );
  }
  findLoginVerificationState(userId: Types.ObjectId) {
    return User.findOne({ _id: userId, status: 'active' }).select('emailVerified loginVerificationCodeHash loginVerificationExpiresAt loginVerificationAttempts').lean().exec();
  }
  cancelPendingLoginVerifications(businessId: Types.ObjectId, email: string, session: ClientSession) {
    return Notification.updateMany({ businessId, kind: 'login_verification', 'recipient.email': email, status: 'scheduled' }, { $set: { status: 'cancelled' }, $unset: { templateData: 1 } }, { session }).exec();
  }
  consumeEmailVerification(emailNormalized: string, codeHash: string, now: Date, session: ClientSession) {
    return User.updateOne({ emailNormalized, status: 'active', emailVerified: false, emailVerificationCodeHash: codeHash, emailVerificationExpiresAt: { $gt: now }, emailVerificationAttempts: { $lt: 5 } }, { $set: { emailVerified: true, emailVerificationAttempts: 0 }, $unset: { emailVerificationCodeHash: 1, emailVerificationExpiresAt: 1 } }, { session }).exec();
  }
  incrementEmailVerificationAttempt(emailNormalized: string, now: Date) {
    return User.collection.findOneAndUpdate(
      { emailNormalized, status: 'active', emailVerified: false, emailVerificationExpiresAt: { $gt: now }, emailVerificationAttempts: { $lt: 5 } },
      [{ $set: {
        emailVerificationAttempts: { $add: [{ $ifNull: ['$emailVerificationAttempts', 0] }, 1] },
        emailVerificationCodeHash: { $cond: [{ $gte: [{ $add: [{ $ifNull: ['$emailVerificationAttempts', 0] }, 1] }, 5] }, '$$REMOVE', '$emailVerificationCodeHash'] },
        emailVerificationExpiresAt: { $cond: [{ $gte: [{ $add: [{ $ifNull: ['$emailVerificationAttempts', 0] }, 1] }, 5] }, '$$REMOVE', '$emailVerificationExpiresAt'] },
      } }],
      { returnDocument: 'after' },
    );
  }
  findEmailVerificationState(emailNormalized: string) { return User.findOne({ emailNormalized, status: 'active' }).select('emailVerified emailVerificationAttempts emailVerificationExpiresAt').lean().exec(); }
  clearEmailVerification(emailNormalized: string) {
    return User.updateOne({ emailNormalized, emailVerified: false }, { $unset: { emailVerificationCodeHash: 1, emailVerificationExpiresAt: 1 } }).exec();
  }
  cancelPendingEmailVerifications(businessId: Types.ObjectId, email: string, session: ClientSession) {
    return Notification.updateMany({ businessId, kind: 'email_verification', 'recipient.email': email, status: 'scheduled' }, { $set: { status: 'cancelled' } }, { session }).exec();
  }
  writePasswordAudit(businessId: Types.ObjectId, userId: Types.ObjectId, session: ClientSession) {
    return AuditLog.create([{ businessId, actorUserId: userId, actorRole: 'system', action: 'auth.password_changed', entityType: 'user', entityId: userId }], { session });
  }
  findUserById(userId: Types.ObjectId, session?: ClientSession) { const query = User.findOne({ _id: userId }); return (session ? query.session(session) : query).lean().exec(); }
  findSessionByTokenHash(tokenHash: string, session?: ClientSession) { return Session.collection.findOne({ tokenHash }, { ...(session ? { session } : {}) }); }
  findInvitationByTokenHash(tokenHash: string, now: Date, session: ClientSession) {
    // API_CONTRACTS §2 resolves AUTH-06 from the one-time token; DATA_MODEL §5's global unique token index makes this exact lookup safe before TenantContext exists.
    return BusinessMember.collection.findOne({ inviteTokenHash: tokenHash, status: 'invited', inviteExpiresAt: { $gt: now } }, { session });
  }
  acceptInvitation(userId: Types.ObjectId, businessId: Types.ObjectId, memberId: Types.ObjectId, name: string, passwordHash: string, session: ClientSession) {
    // API_CONTRACTS §2 AUTH-06: accepting a one-time invitation delivered to this mailbox verifies its control.
    return Promise.all([
      BusinessMember.findOneAndUpdate({ _id: memberId, userId, businessId, status: 'invited' }, { $set: { status: 'active', joinedAt: new Date() }, $unset: { inviteTokenHash: 1, inviteExpiresAt: 1 } }, { session, returnDocument: 'after' }).lean().exec(),
      User.updateOne({ _id: userId, status: 'invited' }, { $set: { name, passwordHash, status: 'active', emailVerified: true } }, { session }).exec(),
    ]).then(([member]) => member);
  }
  findMembership(userId: Types.ObjectId, businessId: Types.ObjectId) {
    return BusinessMember.findOne({ userId, businessId, status: 'active' }).lean().exec();
  }
  findActiveMembershipByUserId(userId: Types.ObjectId, session?: ClientSession) {
    return BusinessMember.collection.findOne({ userId, status: 'active' }, { ...(session ? { session } : {}) });
  }
  findBusinessById(businessId: Types.ObjectId, session?: ClientSession) { const query = Business.findOne({ _id: businessId }); return (session ? query.session(session) : query).lean().exec(); }
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
