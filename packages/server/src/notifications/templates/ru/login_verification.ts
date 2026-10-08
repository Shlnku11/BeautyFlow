import type { NotificationTemplateData, RenderedEmail } from '../../types';
import { escapeHtml } from './common';

export function render(data: NotificationTemplateData): RenderedEmail {
  const code = data.loginCode ?? '';
  const safeCode = escapeHtml(code);
  return {
    subject: 'Код входа в BeautyFlow',
    text: `Код входа в BeautyFlow: ${code}. Код действует 15 минут. Если вы не пытались войти, проигнорируйте письмо.`,
    html: `<main><h1>BeautyFlow</h1><p>Введите этот код, чтобы войти в аккаунт:</p><p><strong>${safeCode}</strong></p><p>Код действует 15 минут. Если вы не пытались войти, проигнорируйте письмо.</p></main>`,
  };
}
