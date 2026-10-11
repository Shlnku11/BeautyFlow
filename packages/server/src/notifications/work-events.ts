import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import { Business, BusinessMember, InboxNotification, PushSubscription } from '@/server/db/models';
import { enqueueNotification } from './enqueue';

type WorkEventKind = 'appointment_new' | 'appointment_changed' | 'appointment_cancelled' | 'payment_received' | 'payment_refunded' | 'waitlist_offer';
type WorkEventCategory = 'appointment' | 'payment';

interface WorkEventInput {
  businessId: string;
  kind: WorkEventKind;
  category: WorkEventCategory;
  staffIds?: string[];
  actorUserId?: string;
  entityId?: string;
  dedupeKey: string;
  title: string;
  body: string;
  route: string;
  occurredAt?: Date;
  session?: ClientSession;
}

const pushKinds: Record<WorkEventKind, 'staff_appointment_new' | 'staff_appointment_changed' | 'staff_appointment_cancelled' | 'staff_payment_received' | 'staff_payment_refunded' | 'staff_waitlist_offer'> = {
  appointment_new: 'staff_appointment_new',
  appointment_changed: 'staff_appointment_changed',
  appointment_cancelled: 'staff_appointment_cancelled',
  payment_received: 'staff_payment_received',
  payment_refunded: 'staff_payment_refunded',
  waitlist_offer: 'staff_waitlist_offer',
};

const inboxRetentionDays = 400;

function nextAllowedPushAt(date: Date, quietStart: string | undefined, quietEnd: string | undefined, timezone: string): Date {
  if (!quietStart || !quietEnd || quietStart === quietEnd) return date;
  const current = DateTime.fromJSDate(date, { zone: timezone });
  const currentTime = current.toFormat('HH:mm');
  const overnight = quietStart > quietEnd;
  const inQuietHours = overnight
    ? currentTime >= quietStart || currentTime < quietEnd
    : currentTime >= quietStart && currentTime < quietEnd;
  if (!inQuietHours) return date;
  const endIsTomorrow = overnight && currentTime >= quietStart;
  const [hour, minute] = quietEnd.split(':').map(Number);
  const end = current.plus({ days: endIsTomorrow ? 1 : 0 }).set({ hour, minute, second: 0, millisecond: 0 });
  return end.isValid ? end.toJSDate() : date;
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

export async function enqueueWorkEvent(input: WorkEventInput): Promise<void> {
  const businessId = new Types.ObjectId(input.businessId);
  const staffIds = new Set((input.staffIds ?? []).filter((id) => Types.ObjectId.isValid(id)));
  const session = input.session;
  const members = await BusinessMember.find({ businessId, status: 'active' }).select('userId role staffId notificationPreferences').session(session ?? null).lean().exec();
  const managerEvent = input.category === 'payment';
  const relevantMembers = members.filter((member) => {
    const isManager = member.role === 'owner' || member.role === 'admin';
    const isAssignedStaff = member.role === 'master' && Boolean(member.staffId && staffIds.has(member.staffId.toString()));
    if (!isManager && !isAssignedStaff) return false;
    if (input.actorUserId && member.userId.toString() === input.actorUserId) return false;
    if (managerEvent && member.role === 'master') return false;
    const preferences = member.notificationPreferences;
    return input.category === 'payment' ? preferences?.paymentAlerts !== false : preferences?.appointmentAlerts !== false;
  });
  if (!relevantMembers.length) return;

  const occurredAt = input.occurredAt ?? new Date();
  const userIds = relevantMembers.map((member) => member.userId);
  const subscriptions = await PushSubscription.find({ businessId, userId: { $in: userIds } }).select('userId').session(session ?? null).lean().exec();
  const subscribedUserIds = new Set(subscriptions.map((subscription) => subscription.userId.toString()));
  const business = await Business.findById(businessId).select('timezone').session(session ?? null).lean().exec();
  const timezone = business?.timezone ?? 'UTC';

  for (const member of relevantMembers) {
    const userId = member.userId.toString();
    const userKey = `${input.dedupeKey}:${userId}`;
    try {
      await InboxNotification.updateOne(
        { businessId, userId: member.userId, dedupeKey: userKey },
        { $setOnInsert: {
          businessId,
          userId: member.userId,
          kind: input.kind,
          title: input.title,
          body: input.body,
          route: input.route,
          ...(input.entityId && Types.ObjectId.isValid(input.entityId) ? { entityId: new Types.ObjectId(input.entityId) } : {}),
          dedupeKey: userKey,
          expireAt: new Date(occurredAt.getTime() + inboxRetentionDays * 86_400_000),
          createdAt: occurredAt,
          updatedAt: occurredAt,
        } },
        { upsert: true, ...(session ? { session } : {}) },
      ).exec();
    } catch (error: unknown) {
      if (!isDuplicateKey(error)) throw error;
    }

    const preferences = member.notificationPreferences;
    if (preferences?.pushEnabled !== true || !subscribedUserIds.has(userId)) continue;
    const scheduledFor = nextAllowedPushAt(occurredAt, preferences.quietHoursStart, preferences.quietHoursEnd, timezone);
    const pushDedupeKey = `push:${businessId.toString()}:${userKey}`;
    const pushNotification: Record<string, unknown> = {
      businessId,
      channel: 'push',
      kind: pushKinds[input.kind],
      recipient: { userId: member.userId },
      status: 'scheduled',
      scheduledFor,
      nextAttemptAt: scheduledFor,
      attempts: 0,
      maxAttempts: 5,
      dedupeKey: pushDedupeKey,
      templateData: { title: 'BeautyFlow', body: input.kind === 'waitlist_offer' ? 'Освободилось подходящее время.' : input.category === 'payment' ? 'Есть новое событие об оплате.' : 'Есть новое событие о записи.', url: input.route, tag: userKey },
    };
    if (input.kind.startsWith('appointment_') && input.entityId && Types.ObjectId.isValid(input.entityId)) pushNotification.appointmentId = new Types.ObjectId(input.entityId);
    await enqueueNotification(pushNotification, session);
  }
}
