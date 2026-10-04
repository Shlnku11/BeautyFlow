import { Schema } from 'mongoose';
import type { Types } from 'mongoose';

import { createModelSchema, registerModel } from './common';

export interface SessionDocument {
  _id: Types.ObjectId;
  tokenHash: string;
  userId: Types.ObjectId;
  businessId: Types.ObjectId;
  ip?: string;
  userAgent?: string;
  lastSeenAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = createModelSchema<SessionDocument>({
  tokenHash: { type: String, required: true, trim: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
  ip: { type: String, trim: true, maxlength: 64 },
  userAgent: { type: String, trim: true, maxlength: 256 },
  lastSeenAt: { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date, required: true },
  absoluteExpiresAt: { type: Date, required: true },
});

export const Session = registerModel<SessionDocument>('Session', 'sessions', schema);
