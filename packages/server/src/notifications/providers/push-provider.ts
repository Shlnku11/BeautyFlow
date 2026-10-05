import type { NotificationChannelProvider } from '../types';
export class PushProvider implements NotificationChannelProvider {
  readonly channel = 'push' as const;
  async send() { return { status: 'skipped' as const, reason: 'CHANNEL_NOT_CONFIGURED' }; }
}
