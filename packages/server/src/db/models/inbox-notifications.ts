import { Schema } from 'mongoose';
import type { Types } from 'mongoose';

import { createModelSchema, registerModel } from './common';

export const INBOX_NOTIFICATION_KINDS = [
  'appointment_new',
  'appointment_changed',
  'appointment_cancelled',
  'payment_received',
  'payment_refunded',
  'waitlist_offer',
] as const;

export interface InboxNotificationDocument {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  userId: Types.ObjectId;
  kind: (typeof INBOX_NOTIFICATION_KINDS)[number];
  title: string;
  body: string;
  route: string;
  entityId?: Types.ObjectId;
  dedupeKey: string;
  readAt?: Date;
  expireAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = createModelSchema<InboxNotificationDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, immutable: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    kind: { type: String, enum: INBOX_NOTIFICATION_KINDS, required: true },
    title: { type: String, trim: true, required: true, maxlength: 120 },
    body: { type: String, trim: true, required: true, maxlength: 300 },
    route: { type: String, trim: true, required: true, maxlength: 300, match: /^\/app\// },
    entityId: { type: Schema.Types.ObjectId },
    dedupeKey: { type: String, required: true, trim: true, maxlength: 300 },
    readAt: { type: Date },
    expireAt: { type: Date, required: true },
  },
  { tenant: true },
);

export const InboxNotification = registerModel<InboxNotificationDocument>('InboxNotification', 'inboxNotifications', schema);
