import { Schema } from 'mongoose';
import type { Types } from 'mongoose';

import { BUSINESS_CURRENCIES } from '@/shared/constants';
import { createModelSchema, registerModel } from './common';

export class ImmutableDocumentError extends Error {
  constructor() {
    super('Проведённая транзакция неизменяема');
    this.name = 'ImmutableDocumentError';
  }
}

export interface TransactionDocument {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  paymentId: Types.ObjectId;
  appointmentId: Types.ObjectId;
  customerId: Types.ObjectId;
  staffId: Types.ObjectId;
  type: 'charge' | 'refund';
  direction: 'in' | 'out';
  amountMinor: number;
  currency: (typeof BUSINESS_CURRENCIES)[number];
  method: 'cash' | 'card' | 'transfer' | 'online';
  occurredAt: Date;
  note?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = createModelSchema<TransactionDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, immutable: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, immutable: true },
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true, immutable: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, immutable: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true, immutable: true },
    type: { type: String, enum: ['charge', 'refund'], required: true, immutable: true },
    direction: { type: String, enum: ['in', 'out'], required: true, immutable: true },
    amountMinor: { type: Number, required: true, min: 1, validate: Number.isInteger, immutable: true },
    currency: { type: String, enum: BUSINESS_CURRENCIES, required: true, immutable: true },
    method: { type: String, enum: ['cash', 'card', 'transfer', 'online'], required: true, immutable: true },
    occurredAt: { type: Date, required: true, immutable: true },
    note: { type: String, trim: true, maxlength: 500, immutable: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  },
  { tenant: true },
);

const rejectMutation = (): never => {
  throw new ImmutableDocumentError();
};

// DATA_MODEL_MONGODB §15 / PAYMENTS_SPEC §4: ledger entries are append-only; corrections require compensating rows.
for (const operation of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'deleteOne',
  'deleteMany',
  'replaceOne',
] as const) {
  schema.pre(operation, rejectMutation);
}

schema.pre('save', function immutableExistingTransaction() {
  if (!this.isNew) throw new ImmutableDocumentError();
});

export const Transaction = registerModel<TransactionDocument>('Transaction', 'transactions', schema);
