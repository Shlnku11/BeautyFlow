import { Schema } from 'mongoose';
import type { Types } from 'mongoose';

import { createModelSchema, registerModel } from './common';

export const NOTIFICATION_CHANNELS = ['email', 'sms', 'push'] as const;
export const NOTIFICATION_KINDS = [
  'appointment_confirmed',
  'appointment_changed',
  'appointment_cancelled',
  'reminder_24h',
  'reminder_1h',
  'followup_after_visit',
  'staff_invite',
  'password_reset',
] as const;
export const NOTIFICATION_STATUSES = ['scheduled', 'processing', 'sent', 'failed', 'cancelled', 'skipped'] as const;

export interface NotificationRecipient {
  email?: string;
  phone?: string;
  name?: string;
}

export interface NotificationDocument {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  appointmentId?: Types.ObjectId;
  customerId?: Types.ObjectId;
  channel: (typeof NOTIFICATION_CHANNELS)[number];
  kind: (typeof NOTIFICATION_KINDS)[number];
  recipient: NotificationRecipient;
  status: (typeof NOTIFICATION_STATUSES)[number];
  scheduledFor: Date;
  nextAttemptAt: Date;
  attempts: number;
  maxAttempts: number;
  lockedUntil?: Date;
  lockedBy?: string;
  lastError?: string;
  sentAt?: Date;
  providerMessageId?: string;
  templateData?: unknown;
  dedupeKey: string;
  expireAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const recipientSchema = new Schema<NotificationRecipient>(
  {
    email: { type: String, trim: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 64 },
    name: { type: String, trim: true, maxlength: 120 },
  },
  { _id: false, strict: 'throw' },
);

const schema = createModelSchema<NotificationDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, immutable: true },
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment' },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    channel: { type: String, enum: NOTIFICATION_CHANNELS, required: true },
    kind: { type: String, enum: NOTIFICATION_KINDS, required: true },
    recipient: { type: recipientSchema, required: true },
    status: { type: String, enum: NOTIFICATION_STATUSES, required: true, default: 'scheduled' },
    scheduledFor: { type: Date, required: true },
    nextAttemptAt: { type: Date, required: true },
    attempts: { type: Number, required: true, min: 0, default: 0 },
    maxAttempts: { type: Number, required: true, min: 1, default: 5 },
    lockedUntil: { type: Date },
    lockedBy: { type: String, trim: true, maxlength: 120 },
    lastError: { type: String, trim: true, maxlength: 500 },
    sentAt: { type: Date },
    providerMessageId: { type: String, trim: true, maxlength: 256 },
    templateData: { type: Schema.Types.Mixed },
    dedupeKey: { type: String, required: true, trim: true, maxlength: 300 },
    expireAt: { type: Date },
  },
  { tenant: true },
);

export const Notification = registerModel<NotificationDocument>('Notification', 'notifications', schema);
