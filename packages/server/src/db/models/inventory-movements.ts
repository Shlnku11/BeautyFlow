import { Schema } from 'mongoose';
import type { Types } from 'mongoose';
import { createModelSchema, registerModel } from './common';

export type InventoryMovementType = 'restock' | 'adjustment' | 'consumption' | 'reversal';
export interface InventoryMovementDocument {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  inventoryItemId: Types.ObjectId;
  type: InventoryMovementType;
  quantityDelta: number;
  reason: string;
  appointmentId?: Types.ObjectId;
  cycleKey?: string;
  actorUserId?: Types.ObjectId;
  eventKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = createModelSchema<InventoryMovementDocument>({
  businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, immutable: true },
  inventoryItemId: { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true, immutable: true },
  type: { type: String, enum: ['restock', 'adjustment', 'consumption', 'reversal'], required: true, immutable: true },
  quantityDelta: { type: Number, required: true, validate: (value: number) => Number.isFinite(value) && value !== 0 && Math.round(value * 10_000) === value * 10_000, immutable: true },
  reason: { type: String, required: true, trim: true, maxlength: 240, immutable: true },
  appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', immutable: true },
  cycleKey: { type: String, trim: true, maxlength: 200, immutable: true },
  actorUserId: { type: Schema.Types.ObjectId, ref: 'User', immutable: true },
  eventKey: { type: String, required: true, trim: true, maxlength: 240, immutable: true },
}, { tenant: true });

for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'replaceOne'] as const) schema.pre(operation, function rejectLedgerMutation() { throw new Error('Историю движения материалов нельзя изменять'); });
schema.pre('save', function rejectExistingLedgerMutation() { if (!this.isNew) throw new Error('Историю движения материалов нельзя изменять'); });
schema.index({ businessId: 1, eventKey: 1 }, { unique: true, name: 'business_inventory_event' });
schema.index({ businessId: 1, inventoryItemId: 1, createdAt: -1 }, { name: 'business_inventory_item_ledger' });
export const InventoryMovement = registerModel<InventoryMovementDocument>('InventoryMovement', 'inventoryMovements', schema);
