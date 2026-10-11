import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import type { TenantContext } from '@/shared/types/tenant-context';
import { NotificationPreferencesSchema } from '@/shared/schemas/settings';
import type { BrowserPushSubscription } from '../notifications/push-crypto';
import { encryptPushSubscription, hashPushEndpoint, isSupportedPushEndpoint } from '../notifications/push-crypto';
import { Business, BusinessMember, InboxNotification, PushSubscription } from '../db/models';
import { AppError, NotFoundError } from '../http/errors';
import { ERROR_CODES } from '@/shared/error-codes';
import { getEnv } from '../config/env';
import { enqueueNotification } from '../notifications/enqueue';

const defaultPreferences = {
  appointmentAlerts: true,
  paymentAlerts: true,
  pushEnabled: false,
  soundEnabled: false,
  soundVolume: 0.45,
  quietHoursStart: '',
  quietHoursEnd: '',
};

function memberQuery(ctx: TenantContext) {
  return { businessId: ctx.businessId, userId: ctx.userId, status: 'active' as const };
}

function pushIsConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.PUSH_VAPID_PUBLIC_KEY && env.PUSH_VAPID_PRIVATE_KEY && env.PUSH_VAPID_SUBJECT);
}

export class NotificationService {
  async inbox(ctx: TenantContext, limit: number) {
    const filter = { businessId: ctx.businessId, userId: ctx.userId };
    const [rows, unreadCount] = await Promise.all([
      InboxNotification.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean().exec(),
      InboxNotification.countDocuments({ ...filter, readAt: { $exists: false } }).exec(),
    ]);
    return {
      items: rows.map((row) => ({ id: row._id.toString(), kind: row.kind, title: row.title, body: row.body, route: row.route, createdAt: row.createdAt.toISOString(), read: Boolean(row.readAt) })),
      unreadCount,
    };
  }

  async markRead(ctx: TenantContext, ids?: string[]) {
    const filter: Record<string, unknown> = { businessId: ctx.businessId, userId: ctx.userId, readAt: { $exists: false } };
    if (ids?.length) filter._id = { $in: ids.map((id) => new Types.ObjectId(id)) };
    const result = await InboxNotification.updateMany(filter, { $set: { readAt: new Date() } }).exec();
    return { updated: result.modifiedCount };
  }

  async preferences(ctx: TenantContext) {
    const member = await BusinessMember.findOne(memberQuery(ctx)).select('notificationPreferences').lean().exec();
    if (!member) throw new NotFoundError('Участник салона не найден');
    const [subscriptions, business] = await Promise.all([
      PushSubscription.find({ businessId: ctx.businessId, userId: ctx.userId }).select('_id userAgent createdAt lastUsedAt').sort({ lastUsedAt: -1, _id: -1 }).lean().exec(),
      // The active tenant's timezone keeps quiet-hours behavior consistent with salon operations.
      Business.findById(ctx.businessId).select('timezone').lean().exec(),
    ]);
    const values = { ...defaultPreferences, ...(member.notificationPreferences ?? {}) };
    return {
      preferences: {
        ...values,
        quietHoursStart: values.quietHoursStart ?? '',
        quietHoursEnd: values.quietHoursEnd ?? '',
      },
      pushConfigured: pushIsConfigured(),
      activeDevices: subscriptions.length,
      devices: subscriptions.map((subscription) => ({ id: subscription._id.toString(), browser: browserLabel(subscription.userAgent), createdAt: subscription.createdAt.toISOString(), lastUsedAt: subscription.lastUsedAt?.toISOString() ?? null })),
      timezone: business?.timezone ?? 'UTC',
      ...(pushIsConfigured() ? { publicKey: getEnv().PUSH_VAPID_PUBLIC_KEY } : {}),
    };
  }

  async updatePreferences(ctx: TenantContext, rawPatch: unknown) {
    const patch = NotificationPreferencesSchema.parse(rawPatch);
    if (patch.pushEnabled) {
      if (!pushIsConfigured()) throw new AppError(ERROR_CODES.CHANNEL_NOT_CONFIGURED, 503, 'Браузерные уведомления пока не настроены на сервере');
      const hasSubscription = await PushSubscription.exists({ businessId: ctx.businessId, userId: ctx.userId }).exec();
      if (!hasSubscription) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 422, 'Сначала разрешите уведомления для этого браузера');
    }
    const fields = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== '' && value !== undefined).map(([key, value]) => [`notificationPreferences.${key}`, value]));
    const unset = Object.fromEntries(Object.entries(patch).filter(([key, value]) => value === '' && (key === 'quietHoursStart' || key === 'quietHoursEnd')).map(([key]) => [`notificationPreferences.${key}`, 1]));
    const result = await BusinessMember.updateOne(memberQuery(ctx), { ...(Object.keys(fields).length ? { $set: fields } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) }).exec();
    if (result.matchedCount !== 1) throw new NotFoundError('Участник салона не найден');
    return this.preferences(ctx);
  }

  async subscribe(ctx: TenantContext, subscription: BrowserPushSubscription, userAgent?: string) {
    if (!pushIsConfigured()) throw new AppError(ERROR_CODES.CHANNEL_NOT_CONFIGURED, 503, 'Браузерные уведомления пока не настроены на сервере');
    if (!isSupportedPushEndpoint(subscription.endpoint)) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 422, 'Браузер вернул неподдерживаемый push endpoint');
    const member = await BusinessMember.findOne(memberQuery(ctx)).select('_id').lean().exec();
    if (!member) throw new NotFoundError('Участник салона не найден');
    const now = new Date();
    await PushSubscription.updateOne(
      { businessId: ctx.businessId, endpointHash: hashPushEndpoint(subscription.endpoint) },
      { $set: { userId: new Types.ObjectId(ctx.userId), encryptedPayload: encryptPushSubscription(subscription), ...(userAgent ? { userAgent: userAgent.slice(0, 500) } : {}), lastUsedAt: now } },
      { upsert: true, runValidators: true },
    ).exec();
    await BusinessMember.updateOne(memberQuery(ctx), { $set: { 'notificationPreferences.pushEnabled': true } }).exec();
    return this.preferences(ctx);
  }

  async unsubscribe(ctx: TenantContext, endpoint: string) {
    if (!isSupportedPushEndpoint(endpoint)) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 422, 'Некорректный push endpoint');
    await PushSubscription.deleteOne({ businessId: ctx.businessId, userId: ctx.userId, endpointHash: hashPushEndpoint(endpoint) }).exec();
    const devicesLeft = await PushSubscription.countDocuments({ businessId: ctx.businessId, userId: ctx.userId }).exec();
    if (!devicesLeft) await BusinessMember.updateOne(memberQuery(ctx), { $set: { 'notificationPreferences.pushEnabled': false } }).exec();
    return this.preferences(ctx);
  }

  async testPush(ctx: TenantContext) {
    const [member, devices] = await Promise.all([
      BusinessMember.findOne(memberQuery(ctx)).select('notificationPreferences').lean().exec(),
      PushSubscription.countDocuments({ businessId: ctx.businessId, userId: ctx.userId }).exec(),
    ]);
    if (!member) throw new NotFoundError('Участник салона не найден');
    if (!pushIsConfigured() || !devices || member.notificationPreferences?.pushEnabled !== true) {
      throw new AppError(ERROR_CODES.CHANNEL_NOT_CONFIGURED, 503, 'Сначала включите push-уведомления для этого браузера');
    }
    const idempotencyKey = randomUUID();
    await enqueueNotification({
      businessId: new Types.ObjectId(ctx.businessId),
      channel: 'push',
      kind: 'staff_test',
      recipient: { userId: new Types.ObjectId(ctx.userId) },
      status: 'scheduled',
      scheduledFor: new Date(),
      nextAttemptAt: new Date(),
      attempts: 0,
      maxAttempts: 2,
      dedupeKey: `push-test:${ctx.businessId}:${ctx.userId}:${idempotencyKey}`,
      templateData: { title: 'Тестовое уведомление', body: 'Уведомления BeautyFlow настроены.', url: '/app/account', tag: `test:${idempotencyKey}` },
    });
    return { queued: true };
  }

  async revokeDevice(ctx: TenantContext, id: string) {
    const result = await PushSubscription.deleteOne({ _id: id, businessId: ctx.businessId, userId: ctx.userId }).exec();
    if (!result.deletedCount) throw new NotFoundError('Устройство уже отключено');
    const remaining = await PushSubscription.countDocuments({ businessId: ctx.businessId, userId: ctx.userId }).exec();
    if (!remaining) await BusinessMember.updateOne(memberQuery(ctx), { $set: { 'notificationPreferences.pushEnabled': false } }).exec();
    return this.preferences(ctx);
  }
}

function browserLabel(userAgent?: string): string {
  if (!userAgent) return 'Браузер';
  if (/Edg\//i.test(userAgent)) return 'Microsoft Edge';
  if (/Firefox\//i.test(userAgent)) return 'Firefox';
  if (/CriOS\//i.test(userAgent)) return 'Chrome на iPhone/iPad';
  if (/Chrome\//i.test(userAgent)) return 'Google Chrome';
  if (/Safari\//i.test(userAgent)) return 'Safari';
  return 'Браузер';
}
