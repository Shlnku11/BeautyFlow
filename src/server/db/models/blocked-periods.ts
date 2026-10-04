import { Schema } from 'mongoose';
import type { Types } from 'mongoose';

import { createModelSchema, registerModel } from './common';

export interface BlockedPeriodDocument {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  staffId: Types.ObjectId;
  startAt: Date;
  endAt: Date;
  reason?: string;
  groupId?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = createModelSchema<BlockedPeriodDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, immutable: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true, immutable: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true, validate: { validator: function (this: BlockedPeriodDocument, value: Date) { return value > this.startAt; }, message: 'endAt must be after startAt' } },
    reason: { type: String, trim: true, maxlength: 200 },
    groupId: { type: Schema.Types.ObjectId },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { tenant: true },
);

export const BlockedPeriod = registerModel<BlockedPeriodDocument>('BlockedPeriod', 'blockedPeriods', schema);
