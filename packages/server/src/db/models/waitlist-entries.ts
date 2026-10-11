import { Schema } from 'mongoose';
import type { Types } from 'mongoose';
import { createModelSchema, registerModel } from './common';

export type WaitlistStatus = 'active' | 'contacted' | 'booked' | 'paused';
export interface WaitlistEntryDocument {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  customerId: Types.ObjectId;
  serviceId: Types.ObjectId;
  staffId?: Types.ObjectId;
  fromDate: string;
  toDate: string;
  preferredTimeStart?: string;
  preferredTimeEnd?: string;
  note?: string;
  status: WaitlistStatus;
  lastOfferedAt?: Date;
  lastOfferedStartAt?: Date;
  lastOfferedStaffId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = createModelSchema<WaitlistEntryDocument>({
  businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, immutable: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
  staffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
  fromDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  toDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  preferredTimeStart: { type: String, match: /^(?:[01]\d|2[0-3]):[0-5]\d$/ },
  preferredTimeEnd: { type: String, match: /^(?:[01]\d|2[0-3]):[0-5]\d$/ },
  note: { type: String, trim: true, maxlength: 500 },
  status: { type: String, enum: ['active', 'contacted', 'booked', 'paused'], required: true, default: 'active' },
  lastOfferedAt: { type: Date },
  lastOfferedStartAt: { type: Date },
  lastOfferedStaffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
}, { tenant: true });

schema.index({ businessId: 1, status: 1, serviceId: 1, fromDate: 1, toDate: 1 }, { name: 'business_waitlist_slot_match' });
export const WaitlistEntry = registerModel<WaitlistEntryDocument>('WaitlistEntry', 'waitlistEntries', schema);
