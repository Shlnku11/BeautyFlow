import type { NotificationTemplateData, RenderedEmail } from '../../types';
import { escapeHtml, safeHttpUrl } from './common';
export function render(data: NotificationTemplateData): RenderedEmail {
  const business = data.businessName ?? 'NextAppointments';
  const reset = data.resetUrl ?? '';
  const resetHref = safeHttpUrl(reset);
  return {
    subject: 'Сброс пароля',
    text: `Здравствуйте! Для смены пароля перейдите по ссылке: ${reset}\nЕсли вы не запрашивали сброс, проигнорируйте письмо.`,
    html: `<main><h1>${escapeHtml(business)}</h1><p>Для смены пароля перейдите по ссылке.</p>${resetHref ? `<p><a href="${resetHref}">Сбросить пароль</a></p>` : ''}<p>Если вы не запрашивали сброс, проигнорируйте письмо.</p></main>`,
  };
}
