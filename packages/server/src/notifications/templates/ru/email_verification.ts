import type { NotificationTemplateData, RenderedEmail } from '../../types';
import { escapeHtml } from './common';

export function render(data: NotificationTemplateData): RenderedEmail {
  const code = data.verificationCode ?? '';
  const safeCode = escapeHtml(code);
  return {
    subject: 'Подтверждение email',
    text: `Код подтверждения BeautyFlow: ${code}. Код действует 15 минут. Если вы не создавали аккаунт, проигнорируйте письмо.`,
    html: `<main><h1>BeautyFlow</h1><p>Введите этот код, чтобы подтвердить email:</p><p><strong>${safeCode}</strong></p><p>Код действует 15 минут. Если вы не создавали аккаунт, проигнорируйте письмо.</p></main>`,
  };
}
