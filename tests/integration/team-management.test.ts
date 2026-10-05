import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectFromDatabase } from '../../packages/server/src/db/connection';
import { up as createIndexes } from '../../packages/server/migrations/000_init';
import { AuthService } from '../../packages/server/src/services/auth-service';
import { MemberService } from '../../packages/server/src/services/member-service';
import { StaffService } from '../../packages/server/src/services/staff-service';
import { Appointment, AuditLog, Business, BusinessMember, Notification, Service, Session, Staff, StaffService as StaffServiceModel, User } from '../../packages/server/src/db/models';
import type { TenantContext } from '../../packages/shared/src/types/tenant-context';

describe('team workflows', () => {
  let replSet: MongoMemoryReplSet;
  let businessId: mongoose.Types.ObjectId;
  let businessBId: mongoose.Types.ObjectId;
  let userId: mongoose.Types.ObjectId;
  let owner: TenantContext;
  const staffService = new StaffService();
  const memberService = new MemberService();
  const authService = new AuthService();

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGODB_URI = replSet.getUri('team_workflows_test');
    process.env.MONGODB_DB_NAME = 'team_workflows_test';
    process.env.TEST_MONGODB_URI = replSet.getUri('team_workflows_test');
    await connectToDatabase();
    const database = mongoose.connection.db;
    if (!database) throw new Error('MongoDB connection has no database handle');
    await createIndexes(database);
  }, 120_000);

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
    businessId = new mongoose.Types.ObjectId();
    userId = new mongoose.Types.ObjectId();
    businessBId = new mongoose.Types.ObjectId();
    await Business.create([
      { _id: businessId, name: 'Team salon', slug: 'team-salon', timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', status: 'active' },
      { _id: businessBId, name: 'Other team salon', slug: 'other-team-salon', timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', status: 'active' },
    ]);
    owner = { businessId: businessId.toString(), userId: userId.toString(), role: 'owner' };
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await replSet.stop();
  });

  it('creates an invited master and queues the invite in the same transaction, then accepts it once', async () => {
    const result = await staffService.create(owner, {
      displayName: 'Mira Master', email: 'mira@example.test', color: 'violet', acceptsOnlineBooking: true,
    });
    expect(result.accessInvite).toBe('sent');
    expect(await Staff.countDocuments({ businessId, displayName: 'Mira Master' })).toBe(1);
    const member = await BusinessMember.findOne({ businessId, role: 'master', status: 'invited' }).lean().exec();
    expect(member?.inviteTokenHash).toBeDefined();
    expect(member?.inviteTokenHash).not.toContain('token=');
    const notification = await Notification.findOne({ businessId, kind: 'staff_invite' }).lean().exec();
    expect(notification?.recipient.email).toBe('mira@example.test');
    expect(notification?.dedupeKey).toContain(member?._id.toString());

    const template = notification?.templateData;
    if (typeof template !== 'object' || template === null || !('inviteUrl' in template) || typeof template.inviteUrl !== 'string') {
      throw new Error('Expected the queued invite to carry its delivery URL');
    }
    const token = new URL(template.inviteUrl).searchParams.get('token');
    if (!token) throw new Error('Expected an invite token in the delivery URL');
    const request = new Request('http://localhost/api/auth/accept-invite', { method: 'POST' });
    const accepted = await authService.acceptInvite({ token, name: 'Mira', password: 'test-password-123' }, request);
    expect(accepted.data.membership.role).toBe('master');
    expect(accepted.data.membership.staffId).toBe(member?.staffId?.toString());
    expect(await BusinessMember.countDocuments({ businessId, status: 'active', inviteTokenHash: { $exists: true } })).toBe(0);
    expect(await Session.countDocuments({ businessId })).toBe(1);
    await expect(authService.acceptInvite({ token, name: 'Mira', password: 'test-password-123' }, request)).rejects.toMatchObject({ httpStatus: 404 });
  }, 30_000);

  it('rolls back staff when invitation email is already linked to a member', async () => {
    const user = await User.create({ email: 'used@example.test', emailNormalized: 'used@example.test', name: 'Existing', passwordHash: 'hash', locale: 'ru', status: 'active' });
    await BusinessMember.create({ businessId, userId: user._id, role: 'master', status: 'active', staffId: new mongoose.Types.ObjectId() });
    await expect(staffService.create(owner, {
      displayName: 'Duplicate', email: 'used@example.test', color: 'violet', acceptsOnlineBooking: true,
    })).rejects.toMatchObject({ code: 'EMAIL_TAKEN', httpStatus: 409 });
    expect(await Staff.countDocuments({ businessId })).toBe(0);
    expect(await Notification.countDocuments({ businessId })).toBe(0);
  });

  it('creates only a calendar staff record without email and rejects invitation by master', async () => {
    const result = await staffService.create(owner, { displayName: 'Calendar Only', color: 'teal', acceptsOnlineBooking: true });
    expect(result.accessInvite).toBe('none');
    expect(await BusinessMember.countDocuments({ businessId })).toBe(0);
    expect(await Notification.countDocuments({ businessId })).toBe(0);
    const master: TenantContext = { businessId: businessId.toString(), userId: new mongoose.Types.ObjectId().toString(), role: 'master', staffId: new mongoose.Types.ObjectId().toString() };
    await expect(staffService.create(master, { displayName: 'Not allowed', email: 'not-allowed@example.test', color: 'teal', acceptsOnlineBooking: true })).rejects.toMatchObject({ httpStatus: 403 });
    expect(await Staff.countDocuments({ businessId })).toBe(1);
  });

  it('deactivation requires confirmation for future appointments and revokes membership sessions', async () => {
    const invited = await staffService.create(owner, {
      displayName: 'Mira Master', email: 'mira@example.test', color: 'violet', acceptsOnlineBooking: true,
    });
    const staffRow = await Staff.findOne({ businessId, displayName: 'Mira Master' }).lean().exec();
    if (!staffRow) throw new Error('Expected the staff fixture');
    const membership = await BusinessMember.findOne({ businessId, staffId: staffRow._id }).lean().exec();
    if (!membership) throw new Error('Expected the invited membership');
    await Session.create({ tokenHash: 'a'.repeat(64), businessId, userId: membership.userId, lastSeenAt: new Date(), expiresAt: new Date(Date.now() + 60_000), absoluteExpiresAt: new Date(Date.now() + 120_000) });
    await Appointment.create({
      businessId, customerId: new mongoose.Types.ObjectId(), staffId: staffRow._id, serviceId: new mongoose.Types.ObjectId(),
      startAt: new Date(Date.now() + 86_400_000), endAt: new Date(Date.now() + 87_000_000), blockedUntilAt: new Date(Date.now() + 87_000_000),
      bufferMinutes: 0, status: 'confirmed', source: 'internal', serviceSnapshot: { name: 'Service', durationMinutes: 60, priceMinor: 1000, currency: 'KGS' }, rescheduleCount: 0,
    });
    await expect(staffService.update(owner, staffRow._id.toString(), { isActive: false })).rejects.toMatchObject({ code: 'STAFF_HAS_UPCOMING_APPOINTMENTS', httpStatus: 409 });
    const updated = await staffService.update(owner, staffRow._id.toString(), { isActive: false, confirm: true });
    expect(updated.isActive).toBe(false);
    expect(await BusinessMember.findOne({ businessId, _id: membership._id }).then((row) => row?.status)).toBe('disabled');
    expect(await Session.countDocuments({ businessId, userId: membership.userId })).toBe(0);
    expect(await AuditLog.countDocuments({ businessId, action: 'staff.deactivated' })).toBe(1);
    expect(invited.accessInvite).toBe('sent');
  }, 30_000);

  it('replaces staff services atomically and rejects a foreign service without changing links', async () => {
    const createdStaff = await staffService.create(owner, { displayName: 'Stylist', color: 'teal', acceptsOnlineBooking: true });
    const staffRow = await Staff.findOne({ businessId, displayName: 'Stylist' }).lean().exec();
    if (!staffRow) throw new Error('Expected the staff fixture');
    const service = await Service.create({ businessId, name: 'Cut', nameNormalized: 'cut', durationMinutes: 30, bufferMinutes: 0, priceMinor: 1000, currency: 'KGS', onlineBookingEnabled: true, isActive: true, displayOrder: 0 });
    const foreignBusiness = await Business.create({ name: 'Other salon', slug: 'other-salon', timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', status: 'active' });
    const foreignService = await Service.create({ businessId: foreignBusiness._id, name: 'Cut', nameNormalized: 'cut', durationMinutes: 30, bufferMinutes: 0, priceMinor: 1000, currency: 'KGS', onlineBookingEnabled: true, isActive: true, displayOrder: 0 });
    expect(await staffService.replaceServiceIds(owner, staffRow._id.toString(), [service._id.toString()])).toEqual({ serviceIds: [service._id.toString()] });
    await expect(staffService.replaceServiceIds(owner, staffRow._id.toString(), [foreignService._id.toString()])).rejects.toMatchObject({ httpStatus: 404 });
    expect(await StaffServiceModel.countDocuments({ businessId, staffId: staffRow._id })).toBe(1);
    expect(await staffService.serviceIds(owner, staffRow._id.toString())).toEqual({ serviceIds: [service._id.toString()] });
    expect(createdStaff.accessInvite).toBe('none');
  });

  it('lists members, resends an invite with a rotated token, and disabling removes their sessions', async () => {
    await staffService.create(owner, { displayName: 'Mira Master', email: 'mira@example.test', color: 'violet', acceptsOnlineBooking: true });
    const member = await BusinessMember.findOne({ businessId, role: 'master' }).lean().exec();
    if (!member) throw new Error('Expected invited membership');
    const beforeHash = member.inviteTokenHash;
    const listed = await memberService.list(owner, { page: 1, limit: 25 });
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]?.user.email).toBe('mira@example.test');
    await memberService.resendInvite(owner, member._id.toString());
    const rotated = await BusinessMember.findOne({ businessId, _id: member._id }).lean().exec();
    expect(rotated?.inviteTokenHash).not.toBe(beforeHash);
    await Session.create({ tokenHash: 'b'.repeat(64), businessId, userId: member.userId, lastSeenAt: new Date(), expiresAt: new Date(Date.now() + 60_000), absoluteExpiresAt: new Date(Date.now() + 120_000) });
    await memberService.updateStatus(owner, member._id.toString(), { status: 'disabled' });
    expect(await Session.countDocuments({ businessId, userId: member.userId })).toBe(0);
    expect(await AuditLog.countDocuments({ businessId, action: 'member.disabled' })).toBe(1);
  }, 30_000);

  it('keeps member lists tenant-scoped and masks foreign member identifiers', async () => {
    const invited = await staffService.create(owner, { displayName: 'Mira Master', email: 'mira@example.test', color: 'violet', acceptsOnlineBooking: true });
    const aMember = await BusinessMember.findOne({ businessId, role: 'master' }).lean().exec();
    if (!aMember) throw new Error('Expected A membership');
    const otherUser = await User.create({ email: 'other@example.test', emailNormalized: 'other@example.test', name: 'Other', passwordHash: null, locale: 'ru', status: 'invited' });
    const bMember = await BusinessMember.create({ businessId: businessBId, userId: otherUser._id, role: 'master', status: 'invited', staffId: new mongoose.Types.ObjectId() });
    const listA = await memberService.list(owner, { page: 1, limit: 25 });
    const listB = await memberService.list({ ...owner, businessId: businessBId.toString() }, { page: 1, limit: 25 });
    expect(listA.meta.total).toBe(1);
    expect(listA.data[0]?.user.email).toBe('mira@example.test');
    expect(listB.meta.total).toBe(1);
    expect(listB.data[0]?.user.email).toBe('other@example.test');
    await expect(memberService.resendInvite(owner, bMember._id.toString())).rejects.toMatchObject({ httpStatus: 404 });
    expect(invited.accessInvite).toBe('sent');
  });
});
