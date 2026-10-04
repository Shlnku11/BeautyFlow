import { Schema } from 'mongoose';
import type { Types } from 'mongoose';

import { BUSINESS_ROLES } from '@/shared/constants';
import { createModelSchema, registerModel } from './common';

export interface BusinessMemberDocument {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  userId: Types.ObjectId;
  role: (typeof BUSINESS_ROLES)[number];
  staffId?: Types.ObjectId;
  status: 'active' | 'invited' | 'disabled';
  inviteTokenHash?: string;
  inviteExpiresAt?: Date;
  invitedBy?: Types.ObjectId;
  joinedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = createModelSchema<BusinessMemberDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, immutable: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: BUSINESS_ROLES, required: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
    status: { type: String, enum: ['active', 'invited', 'disabled'], required: true, default: 'invited' },
    inviteTokenHash: { type: String, trim: true },
    inviteExpiresAt: { type: Date },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    joinedAt: { type: Date },
  },
  { tenant: true },
);

export const BusinessMember = registerModel<BusinessMemberDocument>(
  'BusinessMember',
  'businessMembers',
  schema,
);
