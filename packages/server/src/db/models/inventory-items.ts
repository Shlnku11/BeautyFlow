import { Schema } from 'mongoose';
import type { Types } from 'mongoose';
import { createModelSchema, registerModel } from './common';

export interface InventoryItemDocument {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  name: string;
  nameNormalized: string;
  unit: string;
  onHand: number;
  reorderThreshold: number;
  unitCostMinor: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const quantity = (value: number) => Number.isFinite(value) && value >= 0 && Math.round(value * 10_000) === value * 10_000;
const schema = createModelSchema<InventoryItemDocument>({
  businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  nameNormalized: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
  unit: { type: String, required: true, trim: true, maxlength: 20 },
  onHand: { type: Number, required: true, min: 0, validate: quantity },
  reorderThreshold: { type: Number, required: true, min: 0, validate: quantity },
  unitCostMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  isActive: { type: Boolean, required: true, default: true },
}, { tenant: true });

schema.index({ businessId: 1, nameNormalized: 1 }, { unique: true, name: 'business_inventory_name' });
export const InventoryItem = registerModel<InventoryItemDocument>('InventoryItem', 'inventoryItems', schema);
