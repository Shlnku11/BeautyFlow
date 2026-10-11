import type { NotificationChannelProvider } from '../types';
import webPush from 'web-push';
import { PushSubscription } from '@/server/db/models';
import { decryptPushSubscription } from '../push-crypto';
import { PermanentProviderError, TransientProviderError } from '../errors';
import { getEnv } from '@/server/config/env';

export class PushProvider implements NotificationChannelProvider {
  readonly channel = 'push' as const;
  private readonly configured: boolean;

  constructor(subject?: string, publicKey?: string, privateKey?: string) {
    const env = getEnv();
    const details = { subject: subject ?? env.PUSH_VAPID_SUBJECT, publicKey: publicKey ?? env.PUSH_VAPID_PUBLIC_KEY, privateKey: privateKey ?? env.PUSH_VAPID_PRIVATE_KEY };
    this.configured = Boolean(details.subject && details.publicKey && details.privateKey);
    if (details.subject && details.publicKey && details.privateKey) webPush.setVapidDetails(details.subject, details.publicKey, details.privateKey);
  }

  async send(message?: import('../types').NotificationMessage) {
    if (!this.configured) return { status: 'skipped' as const, reason: 'CHANNEL_NOT_CONFIGURED' };
    if (!message) return { status: 'skipped' as const, reason: 'CHANNEL_NOT_CONFIGURED' };
    if (!message.businessId || !message.userId || !message.title || !message.body || !message.url) {
      throw new PermanentProviderError('PUSH_MESSAGE_INCOMPLETE');
    }
    const businessId = message.businessId;
    const userId = message.userId;
    const subscriptions = await PushSubscription.find({ businessId, userId }).select('_id endpointHash encryptedPayload').lean().exec();
    if (!subscriptions.length) return { status: 'skipped' as const, reason: 'NO_ACTIVE_SUBSCRIPTION' };

    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      url: message.url,
      tag: message.tag ?? message.idempotencyKey,
    });
    const results = await Promise.allSettled(subscriptions.map(async (subscription) => {
      const decoded = decryptPushSubscription(subscription.encryptedPayload);
      try {
        await webPush.sendNotification(decoded, payload, { TTL: 3600, timeout: 8000 });
        await PushSubscription.updateOne({ _id: subscription._id, businessId, userId }, { $set: { lastUsedAt: new Date() } }).exec();
        return 'sent' as const;
      } catch (error: unknown) {
        const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : undefined;
        if (statusCode === 404 || statusCode === 410) {
          await PushSubscription.deleteOne({ _id: subscription._id, businessId, userId }).exec();
          return 'expired' as const;
        }
        if (statusCode && statusCode >= 400 && statusCode < 500) throw new PermanentProviderError('PUSH_PROVIDER_REJECTED', { cause: error });
        throw new TransientProviderError('PUSH_PROVIDER_UNAVAILABLE', { cause: error });
      }
    }));

    const sent = results.filter((result) => result.status === 'fulfilled' && result.value === 'sent').length;
    if (sent > 0) return { status: 'sent' as const, providerMessageId: `webpush-${message.idempotencyKey.slice(0, 180)}-${sent}` };
    const failures = results.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
    if (failures.length > 0) {
      if (failures.every((failure) => failure instanceof PermanentProviderError)) throw failures[0];
      throw new TransientProviderError('PUSH_DELIVERY_FAILED', { cause: failures[0] });
    }
    return { status: 'skipped' as const, reason: 'NO_ACTIVE_SUBSCRIPTION' };
  }
}
