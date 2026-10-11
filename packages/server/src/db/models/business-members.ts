import { Schema } from 'mongoose';
import type { Types } from 'mongoose';

import { BUSINESS_ROLES } from '@/shared/constants';
import { createModelSchema, registerModel } from './common';

export interface BusinessMemberDocument {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  userId: Types.ObjectId;
  role: (typeof BUSINESS_ROLES)[number];
  staffId?: Types.ObjectId;
  status: 'active' | 'invited' | 'disabled';
  inviteTokenHash?: string;
  inviteExpiresAt?: Date;
  invitedBy?: Types.ObjectId;
  joinedAt?: Date;
  activityReadAt?: Date;
  notificationPreferences: {
    appointmentAlerts: boolean;
    paymentAlerts: boolean;
    pushEnabled: boolean;
    soundEnabled: boolean;
    soundVolume: number;
    quietHoursStart?: string;
    quietHoursEnd?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const notificationPreferencesSchema = new Schema<BusinessMemberDocument['notificationPreferences']>(
  {
    appointmentAlerts: { type: Boolean, default: true },
    paymentAlerts: { type: Boolean, default: true },
    pushEnabled: { type: Boolean, default: false },
    soundEnabled: { type: Boolean, default: false },
    soundVolume: { type: Number, min: 0.1, max: 1, default: 0.45 },
    quietHoursStart: { type: String, match: /^(?:[01]\d|2[0-3]):[0-5]\d$/ },
    quietHoursEnd: { type: String, match: /^(?:[01]\d|2[0-3]):[0-5]\d$/ },
  },
  { _id: false, strict: 'throw' },
);

const schema = createModelSchema<BusinessMemberDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, immutable: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: BUSINESS_ROLES, required: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
    status: { type: String, enum: ['active', 'invited', 'disabled'], required: true, default: 'invited' },
    inviteTokenHash: { type: String, trim: true },
    inviteExpiresAt: { type: Date },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    joinedAt: { type: Date },
    activityReadAt: { type: Date },
    notificationPreferences: { type: notificationPreferencesSchema, default: () => ({}) },
  },
  { tenant: true },
);

export const BusinessMember = registerModel<BusinessMemberDocument>(
  'BusinessMember',
  'businessMembers',
  schema,
);
