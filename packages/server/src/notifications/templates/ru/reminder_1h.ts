import type { NotificationTemplateData, RenderedEmail } from '../../types';
import { renderReminder } from './common';
export const render = (data: NotificationTemplateData): RenderedEmail => renderReminder('Напоминание о записи через час', 'Напоминаем: ваша запись начнётся примерно через час.', data);
