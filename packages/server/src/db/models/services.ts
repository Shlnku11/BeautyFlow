import { Schema } from 'mongoose';
import type { Types } from 'mongoose';

import { BUSINESS_CURRENCIES } from '@/shared/constants';
import { createModelSchema, registerModel, softDeleteFields } from './common';

export interface ServiceDocument {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  name: string;
  nameNormalized: string;
  description?: string;
  durationMinutes: number;
  bufferMinutes: number;
  priceMinor: number;
  costItems: { name: string; amountMinor: number }[];
  inventoryConsumptions: { inventoryItemId: Types.ObjectId; quantity: number }[];
  currency: (typeof BUSINESS_CURRENCIES)[number];
  onlineBookingEnabled: boolean;
  isActive: boolean;
  displayOrder: number;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = createModelSchema<ServiceDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, immutable: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    nameNormalized: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000 },
    durationMinutes: { type: Number, required: true, min: 5, max: 720, validate: Number.isInteger },
    bufferMinutes: { type: Number, required: true, min: 0, max: 120, default: 0, validate: (value: number) => Number.isInteger(value) && value % 5 === 0 },
    priceMinor: { type: Number, required: true, min: 0, validate: Number.isInteger },
    costItems: { type: [{ name: { type: String, required: true, trim: true, maxlength: 120 }, amountMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger } }], default: [] },
    inventoryConsumptions: { type: [{ inventoryItemId: { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true }, quantity: { type: Number, required: true, min: 0.0001, validate: (value: number) => Number.isFinite(value) && Math.round(value * 10_000) === value * 10_000 } }], default: [] },
    currency: { type: String, enum: BUSINESS_CURRENCIES, required: true },
    onlineBookingEnabled: { type: Boolean, required: true, default: true },
    isActive: { type: Boolean, required: true, default: true },
    displayOrder: { type: Number, required: true, default: 0 },
    ...softDeleteFields,
  },
  { tenant: true },
);

export const Service = registerModel<ServiceDocument>('Service', 'services', schema);
