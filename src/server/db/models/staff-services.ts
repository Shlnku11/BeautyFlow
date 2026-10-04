import { Schema } from 'mongoose';
import type { Types } from 'mongoose';

import { createModelSchema, registerModel } from './common';

export interface StaffServiceDocument {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  staffId: Types.ObjectId;
  serviceId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = createModelSchema<StaffServiceDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, immutable: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true, immutable: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true, immutable: true },
  },
  { tenant: true },
);

export const StaffService = registerModel<StaffServiceDocument>('StaffService', 'staffServices', schema);
