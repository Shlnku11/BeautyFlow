import { Schema } from 'mongoose';
import type { Types } from 'mongoose';

import { BUSINESS_CURRENCIES } from '@/shared/constants';
import { createModelSchema, registerModel } from './common';

export interface PaymentDocument {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  appointmentId: Types.ObjectId;
  customerId: Types.ObjectId;
  staffId: Types.ObjectId;
  amountMinor: number;
  refundedMinor: number;
  currency: (typeof BUSINESS_CURRENCIES)[number];
  method: 'cash' | 'card' | 'transfer' | 'online';
  status: 'pending' | 'paid' | 'refunded' | 'cancelled';
  paidAt?: Date;
  notes?: string;
  idempotencyKey?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = createModelSchema<PaymentDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, immutable: true },
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true, immutable: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, immutable: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true, immutable: true },
    amountMinor: { type: Number, required: true, min: 1, validate: Number.isInteger },
    refundedMinor: { type: Number, required: true, min: 0, default: 0, validate: Number.isInteger },
    currency: { type: String, enum: BUSINESS_CURRENCIES, required: true },
    method: { type: String, enum: ['cash', 'card', 'transfer', 'online'], required: true },
    status: { type: String, enum: ['pending', 'paid', 'refunded', 'cancelled'], required: true },
    paidAt: { type: Date },
    notes: { type: String, trim: true, maxlength: 500 },
    idempotencyKey: { type: String, trim: true, maxlength: 80 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  },
  { tenant: true, optimisticConcurrency: true },
);

export const Payment = registerModel<PaymentDocument>('Payment', 'payments', schema);
