import type { Types } from 'mongoose';

import { createModelSchema, registerModel } from './common';

export interface UserDocument {
  _id: Types.ObjectId;
  email: string;
  emailNormalized: string;
  passwordHash: string | null;
  name: string;
  locale: 'ru';
  status: 'active' | 'invited' | 'disabled';
  lastLoginAt?: Date | null;
  passwordChangedAt?: Date | null;
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = createModelSchema<UserDocument>({
  email: { type: String, required: true, trim: true, maxlength: 254 },
  emailNormalized: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  passwordHash: { type: String, default: null },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
  locale: { type: String, enum: ['ru'], required: true, default: 'ru' },
  status: { type: String, enum: ['active', 'invited', 'disabled'], required: true, default: 'active' },
  lastLoginAt: { type: Date, default: null },
  passwordChangedAt: { type: Date, default: null },
  passwordResetTokenHash: { type: String, trim: true },
  passwordResetExpiresAt: { type: Date },
});

export const User = registerModel<UserDocument>('User', 'users', schema);
