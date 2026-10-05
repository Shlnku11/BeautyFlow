import type { NotificationTemplateData, RenderedEmail } from '../../types';
import { renderReminder } from './common';
export const render = (data: NotificationTemplateData): RenderedEmail => renderReminder('Напоминание о записи завтра', 'Напоминаем о вашей записи через 24 часа.', data);
