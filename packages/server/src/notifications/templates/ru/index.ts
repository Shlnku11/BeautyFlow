import type { NotificationDocument } from '@/server/db/models/notifications';
import type { NotificationTemplateData, RenderedEmail } from '../../types';
import * as appointmentConfirmed from './appointment_confirmed';
import * as appointmentChanged from './appointment_changed';
import * as appointmentCancelled from './appointment_cancelled';
import * as reminder24h from './reminder_24h';
import * as reminder1h from './reminder_1h';
import * as followupAfterVisit from './followup_after_visit';
import * as staffInvite from './staff_invite';
import * as passwordReset from './password_reset';
import * as emailVerification from './email_verification';

type EmailKind = Extract<NotificationDocument['kind'], 'appointment_confirmed' | 'appointment_changed' | 'appointment_cancelled' | 'reminder_24h' | 'reminder_1h' | 'followup_after_visit' | 'staff_invite' | 'password_reset' | 'email_verification'>;
const templates: Record<EmailKind, (data: NotificationTemplateData) => RenderedEmail> = {
  appointment_confirmed: appointmentConfirmed.render,
  appointment_changed: appointmentChanged.render,
  appointment_cancelled: appointmentCancelled.render,
  reminder_24h: reminder24h.render,
  reminder_1h: reminder1h.render,
  followup_after_visit: followupAfterVisit.render,
  staff_invite: staffInvite.render,
  password_reset: passwordReset.render,
  email_verification: emailVerification.render,
};

export function renderRuTemplate(kind: EmailKind, data: NotificationTemplateData): RenderedEmail { return templates[kind](data); }
