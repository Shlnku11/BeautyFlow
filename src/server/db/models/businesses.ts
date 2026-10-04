import type { Types } from 'mongoose';

import { BUSINESS_COUNTRY_CODES, BUSINESS_CURRENCIES } from '@/shared/constants';
import { createModelSchema, registerModel } from './common';

export interface BusinessDocument {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  timezone: string;
  currency: (typeof BUSINESS_CURRENCIES)[number];
  countryCode: (typeof BUSINESS_COUNTRY_CODES)[number];
  phone?: string;
  email?: string;
  address?: string;
  publicDescription?: string;
  status: 'active' | 'suspended' | 'closed';
  createdAt: Date;
  updatedAt: Date;
}

const schema = createModelSchema<BusinessDocument>({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  slug: { type: String, required: true, trim: true, lowercase: true, minlength: 3, maxlength: 40, immutable: true },
  timezone: { type: String, required: true, trim: true },
  currency: { type: String, enum: BUSINESS_CURRENCIES, required: true },
  countryCode: { type: String, enum: BUSINESS_COUNTRY_CODES, required: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true },
  address: { type: String, trim: true, maxlength: 300 },
  publicDescription: { type: String, trim: true, maxlength: 1000 },
  status: { type: String, enum: ['active', 'suspended', 'closed'], required: true, default: 'active' },
});

export const Business = registerModel<BusinessDocument>('Business', 'businesses', schema);
