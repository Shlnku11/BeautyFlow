import type { NotificationTemplateData, RenderedEmail } from '../../types';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function appointmentTime(data: NotificationTemplateData): string {
  if (!data.startAt) return 'время уточняется';
  const zone = data.timezone ?? 'UTC';
  const value = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short', timeZone: zone }).format(new Date(data.startAt));
  return `${value} (${zone})`;
}

export function renderEmail(subject: string, intro: string, data: NotificationTemplateData): RenderedEmail {
  const business = data.businessName ?? 'Салон';
  const details = [
    data.customerName ? `Здравствуйте, ${data.customerName}!` : 'Здравствуйте!',
    intro,
    data.serviceName ? `Услуга: ${data.serviceName}.` : '',
    data.staffName ? `Специалист: ${data.staffName}.` : '',
    data.startAt ? `Дата и время: ${appointmentTime(data)}.` : '',
    data.businessAddress ? `Адрес: ${data.businessAddress}.` : '',
    data.manageUrl ? `Управление записью: ${data.manageUrl}` : '',
    '',
    business,
  ].filter(Boolean);
  const text = details.join('\n');
  const visibleDetails = details.filter((line) => line !== (data.manageUrl ? `Управление записью: ${data.manageUrl}` : ''));
  const manageHref = safeHttpUrl(data.manageUrl);
  const html = `<main><h1>${escapeHtml(business)}</h1>${visibleDetails.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}${manageHref ? `<p><a href="${manageHref}">Управление записью</a></p>` : ''}</main>`;
  return { subject: `${subject} · ${business}`, text, html };
}

export function renderReminder(subject: string, intro: string, data: NotificationTemplateData): RenderedEmail {
  const reminderData = { ...data };
  delete reminderData.manageUrl;
  const result = renderEmail(subject, intro, reminderData);
  const businessPhone = data.businessPhone ? `Телефон бизнеса: ${data.businessPhone}.` : '';
  const contactHint = 'Если нужно отменить или перенести запись — позвоните по телефону бизнеса.';
  return {
    ...result,
    text: [result.text, businessPhone, contactHint].filter(Boolean).join('\n'),
    html: result.html.replace('</main>', `${businessPhone ? `<p>${escapeHtml(businessPhone)}</p>` : ''}<p>${escapeHtml(contactHint)}</p></main>`),
  };
}

export function safeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? escapeHtml(url.toString()) : undefined;
  } catch {
    return undefined;
  }
}

export { escapeHtml };
