import type { NotificationChannelProvider } from '../types';
export class SmsProvider implements NotificationChannelProvider {
  readonly channel = 'sms' as const;
  async send() { return { status: 'skipped' as const, reason: 'CHANNEL_NOT_CONFIGURED' }; }
}
