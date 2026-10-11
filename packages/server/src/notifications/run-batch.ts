import { randomUUID } from 'node:crypto';
import { Appointment, Business, Notification, Service, Staff } from '@/server/db/models';
import type { NotificationDocument } from '@/server/db/models/notifications';
import { getEnv } from '@/server/config/env';
import { logger } from '@/server/http/logger';
import { retryDelayMs } from './backoff';
import { PermanentProviderError, TransientProviderError } from './errors';
import { getDefaultProviderRegistry, ProviderRegistry } from './providers/registry';
import { isEmailKind, renderRuTemplate } from './templates/ru';
import type { NotificationChannel, NotificationTemplateData } from './types';

const LEASE_MS = 5 * 60_000;
const RETENTION_MS = 400 * 86_400_000;
type BatchOptions = { limit?: number; now?: Date; workerId?: string; providers?: ProviderRegistry };
type BatchSummary = { claimed: number; sent: number; failed: number; skipped: number };
type PlainRecord = Record<string, unknown>;

function isRecord(value: unknown): value is PlainRecord { return typeof value === 'object' && value !== null && !Array.isArray(value); }

function plainTemplateData(value: unknown): NotificationTemplateData {
  if (!isRecord(value)) return {};
  const result: NotificationTemplateData = {};
  for (const key of ['businessName', 'businessAddress', 'businessPhone', 'timezone', 'customerName', 'staffName', 'serviceName', 'startAt', 'manageUrl', 'inviteUrl', 'resetUrl', 'verificationCode', 'loginCode'] as const) {
    if (typeof value[key] === 'string') result[key] = value[key];
  }
  return result;
}

async function currentAppointmentData(notification: NotificationDocument): Promise<NotificationTemplateData | null> {
  if (!notification.appointmentId) return null;
  const [appointment, business] = await Promise.all([
    Appointment.findOne({ _id: notification.appointmentId, businessId: notification.businessId }).lean().exec(),
    Business.findById(notification.businessId).select('name address phone timezone').lean().exec(),
  ]);
  if (!appointment || !business) return null;
  const [staff, service] = await Promise.all([
    Staff.findOne({ _id: appointment.staffId, businessId: notification.businessId }).select('displayName').lean().exec(),
    Service.findOne({ _id: appointment.serviceId, businessId: notification.businessId }).select('name').lean().exec(),
  ]);
  if (!staff || !service) return null;
  const customerName = notification.recipient.name;
  const snapshot = plainTemplateData(notification.templateData);
  return {
    ...snapshot,
    businessName: business.name,
    ...(business.address ? { businessAddress: business.address } : {}),
    ...(business.phone ? { businessPhone: business.phone } : {}),
    timezone: business.timezone,
    ...(customerName ? { customerName } : {}),
    staffName: staff.displayName,
    serviceName: appointment.serviceSnapshot.name || service.name,
    startAt: appointment.startAt.toISOString(),
  };
}

async function guard(notification: NotificationDocument, now: Date): Promise<string | null> {
  if (notification.kind !== 'reminder_24h' && notification.kind !== 'reminder_1h' && notification.kind !== 'followup_after_visit') return null;
  if (!notification.appointmentId) return 'STALE';
  const appointment = await Appointment.findOne({ _id: notification.appointmentId, businessId: notification.businessId }).select('status startAt').lean().exec();
  if (!appointment) return 'STALE';
  if (notification.kind === 'followup_after_visit') return appointment.status === 'completed' ? null : 'STALE';
  const lateWindow = notification.kind === 'reminder_1h' ? 30 * 60_000 : 2 * 60 * 60_000;
  if (now.getTime() > notification.scheduledFor.getTime() + lateWindow) return 'LATE';
  if (appointment.status !== 'confirmed' || now >= appointment.startAt) return 'STALE';
  return null;
}

async function setOutcome(notification: NotificationDocument, workerId: string, fields: PlainRecord, clearTemplate = false): Promise<void> {
  const update: PlainRecord = { $set: fields, $unset: { lockedUntil: '', lockedBy: '' } };
  if (clearTemplate) (update.$unset as PlainRecord).templateData = '';
  await Notification.updateOne({ _id: notification._id, businessId: notification.businessId, status: 'processing', lockedBy: workerId }, update).exec();
}

async function skip(notification: NotificationDocument, workerId: string, reason: string, now: Date): Promise<void> {
  await setOutcome(notification, workerId, { status: 'skipped', lastError: reason, expireAt: new Date(now.getTime() + RETENTION_MS) }, notification.kind === 'password_reset' || notification.kind === 'email_verification' || notification.kind === 'login_verification');
}

export async function runNotificationBatch(options: BatchOptions = {}): Promise<BatchSummary> {
  const env = getEnv();
  const now = options.now ?? new Date();
  const workerId = options.workerId ?? randomUUID();
  const limit = options.limit ?? env.WORKER_BATCH_LIMIT;
  const providers = options.providers ?? getDefaultProviderRegistry();
  const summary: BatchSummary = { claimed: 0, sent: 0, failed: 0, skipped: 0 };

  // NOTIFICATIONS_SPEC §6: a lease-expired processing row is recoverable after a crashed worker.
  await Notification.collection.updateMany({ status: 'processing', lockedUntil: { $lt: now } }, { $set: { status: 'scheduled', nextAttemptAt: now }, $unset: { lockedUntil: '', lockedBy: '' } });

  for (let index = 0; index < limit; index += 1) {
    // NOTIFICATIONS_SPEC §6: one atomic claim owns a row for the lease; all later reads are tenant-scoped.
    const claimed = await Notification.collection.findOneAndUpdate(
      { status: 'scheduled', nextAttemptAt: { $lte: now }, $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }] },
      { $set: { status: 'processing', lockedUntil: new Date(now.getTime() + LEASE_MS), lockedBy: workerId }, $inc: { attempts: 1 } },
      { returnDocument: 'after', sort: { scheduledFor: 1, _id: 1 } },
    );
    const notification = claimed as unknown as NotificationDocument | null;
    if (!notification) break;
    summary.claimed += 1;

    const staleReason = await guard(notification, now);
    if (staleReason) {
      await skip(notification, workerId, staleReason, now);
      summary.skipped += 1;
      continue;
    }

    const provider = providers.get(notification.channel as NotificationChannel);
    if (!provider) {
      await skip(notification, workerId, 'CHANNEL_NOT_CONFIGURED', now);
      summary.skipped += 1;
      continue;
    }
    const recipient = notification.channel === 'email'
      ? notification.recipient.email
      : notification.channel === 'sms'
        ? notification.recipient.phone
        : notification.recipient.userId?.toString();
    if (!recipient) {
      await skip(notification, workerId, 'NO_RECIPIENT', now);
      summary.skipped += 1;
      continue;
    }

    try {
      let data = plainTemplateData(notification.templateData);
      if (notification.kind === 'reminder_24h' || notification.kind === 'reminder_1h' || notification.kind === 'followup_after_visit') {
        const current = await currentAppointmentData(notification);
        if (!current) {
          await skip(notification, workerId, 'STALE', now);
          summary.skipped += 1;
          continue;
        }
        data = current;
        // NOTIFICATIONS_SPEC §3: reminder detail is rendered at delivery, but manage URLs stay out of reminders.
        delete data.manageUrl;
      }
      if (notification.channel !== 'email') {
        const message = notification.channel === 'push'
          ? (() => {
              const data = isRecord(notification.templateData) ? notification.templateData : {};
              return {
                to: recipient,
                userId: recipient,
                businessId: notification.businessId.toString(),
                ...(typeof data.title === 'string' ? { title: data.title } : {}),
                ...(typeof data.body === 'string' ? { body: data.body } : {}),
                url: typeof data.url === 'string' && data.url.startsWith('/app/') ? data.url : '/app',
                tag: typeof data.tag === 'string' ? data.tag : notification._id.toString(),
                text: '',
                idempotencyKey: notification._id.toString(),
              };
            })()
          : { to: recipient, text: '', idempotencyKey: notification._id.toString() };
        const outcome = await provider.send(message);
        if (outcome.status === 'skipped') {
          await skip(notification, workerId, outcome.reason, now);
          summary.skipped += 1;
          continue;
        }
      } else {
        if (!isEmailKind(notification.kind)) {
          await skip(notification, workerId, 'EMAIL_TEMPLATE_NOT_AVAILABLE', now);
          summary.skipped += 1;
          continue;
        }
        const rendered = renderRuTemplate(notification.kind, data);
        const outcome = await provider.send({ to: recipient, ...rendered, idempotencyKey: notification._id.toString() });
        if (outcome.status === 'skipped') {
          await skip(notification, workerId, outcome.reason, now);
          summary.skipped += 1;
          continue;
        }
        await setOutcome(notification, workerId, { status: 'sent', sentAt: now, providerMessageId: outcome.providerMessageId, expireAt: new Date(now.getTime() + RETENTION_MS) }, notification.kind === 'password_reset' || notification.kind === 'email_verification' || notification.kind === 'login_verification');
        summary.sent += 1;
        continue;
      }
      await setOutcome(notification, workerId, { status: 'sent', sentAt: now, expireAt: new Date(now.getTime() + RETENTION_MS) }, notification.kind === 'password_reset' || notification.kind === 'email_verification' || notification.kind === 'login_verification');
      summary.sent += 1;
    } catch (error: unknown) {
      const permanent = error instanceof PermanentProviderError;
      const transient = error instanceof TransientProviderError || !permanent;
      const failed = permanent || !transient || notification.attempts >= notification.maxAttempts;
      const code = permanent ? 'PERMANENT_PROVIDER_ERROR' : 'TRANSIENT_PROVIDER_ERROR';
      if (failed) {
        await setOutcome(notification, workerId, { status: 'failed', lastError: code }, notification.kind === 'password_reset' || notification.kind === 'email_verification' || notification.kind === 'login_verification');
        summary.failed += 1;
      } else {
        await setOutcome(notification, workerId, { status: 'scheduled', nextAttemptAt: new Date(now.getTime() + retryDelayMs(notification.attempts)), lastError: code });
      }
      logger.warn({ notificationId: notification._id.toString(), businessId: notification.businessId.toString(), code, attempts: notification.attempts }, 'notification delivery attempt failed');
    }
  }
  return summary;
}
