import type { NotificationTemplateData, RenderedEmail } from '../../types';
import { renderEmail } from './common';
export const render = (data: NotificationTemplateData): RenderedEmail => renderEmail('Запись отменена', 'Ваша запись отменена.', data);
