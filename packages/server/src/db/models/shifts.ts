import { Schema } from 'mongoose';
import type { Types } from 'mongoose';

import { createModelSchema, registerModel } from './common';

export interface ShiftDocument {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  staffId: Types.ObjectId;
  userId: Types.ObjectId;
  startedAt: Date;
  closedAt?: Date;
  hourlyRateMinor: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = createModelSchema<ShiftDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, immutable: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true, immutable: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    startedAt: { type: Date, required: true, immutable: true },
    closedAt: { type: Date },
    hourlyRateMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger, immutable: true },
  },
  { tenant: true },
);

schema.index({ businessId: 1, staffId: 1 }, { unique: true, partialFilterExpression: { closedAt: { $exists: false } } });
schema.index({ businessId: 1, startedAt: -1 });

export const Shift = registerModel<ShiftDocument>('Shift', 'shifts', schema);
