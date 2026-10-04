import { Schema } from 'mongoose';
import type { Types } from 'mongoose';

import { createModelSchema, registerModel, softDeleteFields } from './common';

export const CUSTOMER_CONTACT_TYPES = ['telegram', 'whatsapp', 'instagram', 'other'] as const;

export interface CustomerContact {
  type: (typeof CUSTOMER_CONTACT_TYPES)[number];
  value: string;
}

export interface CustomerDocument {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  firstName: string;
  lastName?: string;
  phone: string;
  phoneNormalized: string;
  email?: string;
  emailNormalized?: string;
  contacts?: CustomerContact[];
  notes?: string;
  searchTokens: string[];
  source: 'internal' | 'public';
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const contactSchema = new Schema<CustomerContact>(
  {
    type: { type: String, enum: CUSTOMER_CONTACT_TYPES, required: true },
    value: { type: String, required: true, trim: true, maxlength: 120 },
  },
  { _id: false, strict: 'throw' },
);

const schema = createModelSchema<CustomerDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, immutable: true },
    firstName: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    lastName: { type: String, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, maxlength: 64 },
    phoneNormalized: { type: String, required: true, trim: true, maxlength: 32 },
    email: { type: String, trim: true, maxlength: 254 },
    emailNormalized: { type: String, trim: true, lowercase: true, maxlength: 254 },
    contacts: { type: [contactSchema], default: undefined, validate: (value: CustomerContact[]) => value.length <= 10 },
    notes: { type: String, trim: true, maxlength: 4000 },
    searchTokens: { type: [String], required: true, default: [] },
    source: { type: String, enum: ['internal', 'public'], required: true },
    ...softDeleteFields,
  },
  { tenant: true },
);

export const Customer = registerModel<CustomerDocument>('Customer', 'customers', schema);
