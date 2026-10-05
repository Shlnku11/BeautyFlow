import type { NotificationTemplateData, RenderedEmail } from '../../types';
import { renderEmail } from './common';
export const render = (data: NotificationTemplateData): RenderedEmail => renderEmail('Запись изменена', 'Детали вашей записи изменились.', data);
