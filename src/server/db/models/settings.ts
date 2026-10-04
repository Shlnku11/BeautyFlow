import { Schema } from 'mongoose';
import type { Types } from 'mongoose';

import { createModelSchema, registerModel } from './common';

export interface SettingsDocument {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  booking: {
    publicEnabled: boolean;
    slotStepMinutes: 5 | 10 | 15 | 20 | 30 | 60;
    minNoticeMinutes: number;
    maxAdvanceDays: number;
    autoConfirm: boolean;
    cancellationWindowHours: number;
    customerRescheduleLimit: number;
  };
  notifications: {
    emailEnabled: boolean;
    confirmationEnabled: boolean;
    changeEnabled: boolean;
    cancellationEnabled: boolean;
    reminder24hEnabled: boolean;
    reminder1hEnabled: boolean;
    followUpEnabled: boolean;
    followUpDelayMinutes: number;
    senderName?: string;
    replyTo?: string;
  };
  privacy: {
    masterSeesCustomerPhone: boolean;
    dataRetentionDays: number;
    consentText: string;
    requireConsent: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const bookingSchema = new Schema<SettingsDocument['booking']>(
  {
    publicEnabled: { type: Boolean, default: true },
    slotStepMinutes: { type: Number, enum: [5, 10, 15, 20, 30, 60], default: 15 },
    minNoticeMinutes: { type: Number, min: 0, max: 10_080, default: 120 },
    maxAdvanceDays: { type: Number, min: 1, max: 365, default: 60 },
    autoConfirm: { type: Boolean, default: true },
    cancellationWindowHours: { type: Number, min: 0, max: 168, default: 12 },
    customerRescheduleLimit: { type: Number, min: 0, max: 10, default: 2 },
  },
  { _id: false, strict: 'throw' },
);

const notificationSettingsSchema = new Schema<SettingsDocument['notifications']>(
  {
    emailEnabled: { type: Boolean, default: true },
    confirmationEnabled: { type: Boolean, default: true },
    changeEnabled: { type: Boolean, default: true },
    cancellationEnabled: { type: Boolean, default: true },
    reminder24hEnabled: { type: Boolean, default: true },
    reminder1hEnabled: { type: Boolean, default: true },
    followUpEnabled: { type: Boolean, default: true },
    followUpDelayMinutes: { type: Number, min: 15, max: 2880, default: 120 },
    senderName: { type: String, trim: true, maxlength: 80 },
    replyTo: { type: String, trim: true, lowercase: true },
  },
  { _id: false, strict: 'throw' },
);

const privacySchema = new Schema<SettingsDocument['privacy']>(
  {
    masterSeesCustomerPhone: { type: Boolean, default: true },
    dataRetentionDays: { type: Number, min: 30, max: 3650, default: 730 },
    consentText: { type: String, trim: true, maxlength: 2000, default: '' },
    requireConsent: { type: Boolean, default: true },
  },
  { _id: false, strict: 'throw' },
);

const schema = createModelSchema<SettingsDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, immutable: true },
    booking: { type: bookingSchema, default: () => ({}) },
    notifications: { type: notificationSettingsSchema, default: () => ({}) },
    privacy: { type: privacySchema, default: () => ({}) },
  },
  { tenant: true, optimisticConcurrency: true },
);

export const Settings = registerModel<SettingsDocument>('Settings', 'settings', schema);
