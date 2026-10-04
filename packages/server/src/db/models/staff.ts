import { Schema } from 'mongoose';
import type { Types } from 'mongoose';

import { createModelSchema, registerModel, softDeleteFields } from './common';

export const STAFF_COLORS = ['violet', 'rose', 'teal', 'amber', 'blue', 'green', 'orange', 'slate'] as const;

export interface StaffDocument {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  displayName: string;
  email?: string;
  phone?: string;
  bio?: string;
  color: (typeof STAFF_COLORS)[number];
  isActive: boolean;
  acceptsOnlineBooking: boolean;
  displayOrder: number;
  bookingVersion: number;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = createModelSchema<StaffDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, immutable: true },
    displayName: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 64 },
    bio: { type: String, trim: true, maxlength: 1000 },
    color: { type: String, enum: STAFF_COLORS, required: true, default: 'violet' },
    isActive: { type: Boolean, required: true, default: true },
    acceptsOnlineBooking: { type: Boolean, required: true, default: true },
    displayOrder: { type: Number, required: true, default: 0 },
    bookingVersion: { type: Number, required: true, default: 0 },
    ...softDeleteFields,
  },
  { tenant: true },
);

export const Staff = registerModel<StaffDocument>('Staff', 'staff', schema);
