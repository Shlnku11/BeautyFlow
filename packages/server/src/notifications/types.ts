export type NotificationChannel = 'email' | 'sms' | 'push';

export interface NotificationMessage {
  to: string;
  subject?: string;
  text: string;
  html?: string;
  idempotencyKey: string;
  headers?: Record<string, string>;
}

export interface SendResult { providerMessageId: string; }
export type ProviderSendOutcome = { status: 'sent'; providerMessageId: string } | { status: 'skipped'; reason: string };

export interface NotificationChannelProvider {
  readonly channel: NotificationChannel;
  send(message: NotificationMessage): Promise<ProviderSendOutcome>;
}

export interface RenderedEmail { subject: string; text: string; html: string; }

export interface NotificationTemplateData {
  businessName?: string;
  businessAddress?: string;
  businessPhone?: string;
  timezone?: string;
  customerName?: string;
  staffName?: string;
  serviceName?: string;
  startAt?: string;
  manageUrl?: string;
  inviteUrl?: string;
  resetUrl?: string;
  verificationCode?: string;
  loginCode?: string;
}
