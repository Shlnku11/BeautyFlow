import { getEnv } from '@/server/config/env';
import { ConsoleEmailProvider, SmtpEmailProvider } from './email-provider';
import { PushProvider } from './push-provider';
import type { NotificationChannel, NotificationChannelProvider } from '../types';

export class ProviderRegistry {
  private readonly providers = new Map<NotificationChannel, NotificationChannelProvider>();

  constructor(emailProvider?: NotificationChannelProvider) {
    const email = emailProvider ?? (getEnv().EMAIL_PROVIDER === 'smtp' ? new SmtpEmailProvider() : new ConsoleEmailProvider());
    this.providers.set('email', email);
    const env = getEnv();
    if (env.PUSH_VAPID_PUBLIC_KEY && env.PUSH_VAPID_PRIVATE_KEY && env.PUSH_VAPID_SUBJECT) {
      this.providers.set('push', new PushProvider(env.PUSH_VAPID_SUBJECT, env.PUSH_VAPID_PUBLIC_KEY, env.PUSH_VAPID_PRIVATE_KEY));
    }
  }

  register(provider: NotificationChannelProvider): void { this.providers.set(provider.channel, provider); }
  get(channel: NotificationChannel): NotificationChannelProvider | undefined { return this.providers.get(channel); }
}

let defaultRegistry: ProviderRegistry | undefined;

/** Keep dev/test captures available across worker batches within this process. */
export function getDefaultProviderRegistry(): ProviderRegistry {
  defaultRegistry ??= new ProviderRegistry();
  return defaultRegistry;
}
