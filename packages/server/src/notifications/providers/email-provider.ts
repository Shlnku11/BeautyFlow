import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { getEnv } from '@/server/config/env';
import { logger } from '@/server/http/logger';
import { PermanentProviderError, TransientProviderError } from '../errors';
import type { NotificationChannelProvider, NotificationMessage, ProviderSendOutcome } from '../types';

export interface CapturedEmail extends NotificationMessage { providerMessageId: string; }

export class ConsoleEmailProvider implements NotificationChannelProvider {
  readonly channel = 'email' as const;
  readonly messages: CapturedEmail[] = [];

  async send(message: NotificationMessage): Promise<ProviderSendOutcome> {
    if (getEnv().NODE_ENV === 'production') throw new Error('ConsoleEmailProvider is disabled in production');
    const providerMessageId = `console-${randomUUID()}`;
    this.messages.push({ ...message, providerMessageId });
    logger.info({ providerMessageId }, 'email captured by console provider');
    return { status: 'sent', providerMessageId };
  }
}

export class SmtpEmailProvider implements NotificationChannelProvider {
  readonly channel = 'email' as const;
  private readonly transporter: ReturnType<typeof nodemailer.createTransport>;

  constructor() {
    const env = getEnv();
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    });
  }

  async send(message: NotificationMessage): Promise<ProviderSendOutcome> {
    const env = getEnv();
    try {
      const result = await this.transporter.sendMail({
        from: { address: env.EMAIL_FROM_ADDRESS, name: env.EMAIL_FROM_NAME },
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: { ...message.headers, 'X-Notification-Id': message.idempotencyKey },
        messageId: `<${message.idempotencyKey}@${new URL(env.APP_BASE_URL).hostname}>`,
      });
      return { status: 'sent', providerMessageId: result.messageId };
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'responseCode' in error && typeof error.responseCode === 'number' && error.responseCode >= 500) {
        throw new TransientProviderError('SMTP_TEMPORARY_FAILURE', { cause: error });
      }
      if (typeof error === 'object' && error !== null && 'responseCode' in error && typeof error.responseCode === 'number' && error.responseCode >= 400) {
        throw new PermanentProviderError('SMTP_RECIPIENT_REJECTED', { cause: error });
      }
      throw new TransientProviderError('SMTP_SEND_FAILED', { cause: error });
    }
  }
}
