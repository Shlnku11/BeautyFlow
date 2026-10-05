import type { NotificationTemplateData, RenderedEmail } from '../../types';
import { renderEmail, safeHttpUrl } from './common';
export function render(data: NotificationTemplateData): RenderedEmail {
  const business = data.businessName ?? 'Салон';
  const invite = data.inviteUrl ?? '';
  const intro = `${data.staffName ?? 'Коллега'}, вас пригласили присоединиться к команде. ${invite}`;
  const email = renderEmail('Приглашение в команду', intro, { ...data, businessName: business });
  const inviteHref = safeHttpUrl(invite);
  return { ...email, html: `${email.html}${inviteHref ? `<p><a href="${inviteHref}">Принять приглашение</a></p>` : ''}` };
}
