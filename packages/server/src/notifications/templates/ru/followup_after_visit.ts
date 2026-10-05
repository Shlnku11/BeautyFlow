import type { NotificationTemplateData, RenderedEmail } from '../../types';
import { renderEmail } from './common';
export const render = (data: NotificationTemplateData): RenderedEmail => renderEmail('Спасибо за визит', 'Спасибо, что выбрали нас. Будем рады видеть вас снова.', data);
