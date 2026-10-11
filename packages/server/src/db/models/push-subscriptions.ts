import { Schema } from 'mongoose';
import type { Types } from 'mongoose';

import { createModelSchema, registerModel } from './common';

export interface PushSubscriptionDocument {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  userId: Types.ObjectId;
  endpointHash: string;
  encryptedPayload: string;
  userAgent?: string;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = createModelSchema<PushSubscriptionDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, immutable: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    endpointHash: { type: String, required: true, trim: true, minlength: 64, maxlength: 64 },
    encryptedPayload: { type: String, required: true, trim: true, maxlength: 8192 },
    userAgent: { type: String, trim: true, maxlength: 500 },
    lastUsedAt: { type: Date },
  },
  { tenant: true },
);

export const PushSubscription = registerModel<PushSubscriptionDocument>('PushSubscription', 'pushSubscriptions', schema);
