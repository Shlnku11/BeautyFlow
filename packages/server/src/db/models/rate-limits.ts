import type { Types } from 'mongoose';

import { createModelSchema, registerModel } from './common';

export interface RateLimitDocument {
  _id: Types.ObjectId;
  key: string;
  count: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = createModelSchema<RateLimitDocument>({
  key: { type: String, required: true, trim: true, maxlength: 512 },
  count: { type: Number, required: true, min: 0, default: 0, validate: Number.isInteger },
  expiresAt: { type: Date, required: true },
});

export const RateLimit = registerModel<RateLimitDocument>('RateLimit', 'rateLimits', schema);
