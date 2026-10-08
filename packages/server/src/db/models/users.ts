import type { Types } from 'mongoose';

import { createModelSchema, registerModel } from './common';

export interface UserDocument {
  _id: Types.ObjectId;
  email: string;
  emailNormalized: string;
  emailVerified: boolean;
  emailVerificationCodeHash?: string;
  emailVerificationExpiresAt?: Date;
  emailVerificationAttempts: number;
  loginVerificationCodeHash?: string;
  loginVerificationExpiresAt?: Date;
  loginVerificationAttempts: number;
  googleId?: string;
  avatarUrl?: string;
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
  emailVerified: { type: Boolean, required: true, default: false },
  emailVerificationCodeHash: { type: String, trim: true },
  emailVerificationExpiresAt: { type: Date },
  emailVerificationAttempts: { type: Number, required: true, min: 0, default: 0 },
  loginVerificationCodeHash: { type: String, trim: true },
  loginVerificationExpiresAt: { type: Date },
  loginVerificationAttempts: { type: Number, required: true, min: 0, default: 0 },
  googleId: { type: String, trim: true },
  avatarUrl: { type: String, trim: true, maxlength: 2048 },
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
