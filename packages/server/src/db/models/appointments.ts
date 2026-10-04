import { Schema } from 'mongoose';
import type { Types } from 'mongoose';

import { BUSINESS_CURRENCIES } from '@/shared/constants';
import { createModelSchema, registerModel } from './common';

export const APPOINTMENT_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'] as const;

export interface ServiceSnapshot {
  name: string;
  durationMinutes: number;
  priceMinor: number;
  currency: (typeof BUSINESS_CURRENCIES)[number];
}

export interface AppointmentDocument {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  customerId: Types.ObjectId;
  staffId: Types.ObjectId;
  serviceId: Types.ObjectId;
  startAt: Date;
  endAt: Date;
  bufferMinutes: number;
  blockedUntilAt: Date;
  occupiedKeys?: string[];
  status: (typeof APPOINTMENT_STATUSES)[number];
  source: 'public' | 'internal';
  serviceSnapshot: ServiceSnapshot;
  contactEmail?: string;
  customerNote?: string;
  internalNote?: string;
  visitNote?: string;
  manageTokenHash?: string;
  manageTokenExpiresAt?: Date;
  rescheduleCount: number;
  privacyAcceptedAt?: Date;
  idempotencyKey?: string;
  cancelledAt?: Date;
  cancelledBy?: 'customer' | 'staff' | 'system';
  cancelReason?: string;
  completedAt?: Date;
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const serviceSnapshotSchema = new Schema<ServiceSnapshot>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    durationMinutes: { type: Number, required: true, min: 5, max: 720 },
    priceMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: BUSINESS_CURRENCIES, required: true },
  },
  { _id: false, strict: 'throw' },
);

const schema = createModelSchema<AppointmentDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, immutable: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    bufferMinutes: { type: Number, required: true, min: 0, max: 120 },
    blockedUntilAt: { type: Date, required: true },
    occupiedKeys: { type: [String], default: undefined },
    status: { type: String, enum: APPOINTMENT_STATUSES, required: true },
    source: { type: String, enum: ['public', 'internal'], required: true },
    serviceSnapshot: { type: serviceSnapshotSchema, required: true },
    contactEmail: { type: String, trim: true, maxlength: 254 },
    customerNote: { type: String, trim: true, maxlength: 500 },
    internalNote: { type: String, trim: true, maxlength: 2000 },
    visitNote: { type: String, trim: true, maxlength: 2000 },
    manageTokenHash: { type: String, trim: true },
    manageTokenExpiresAt: { type: Date },
    rescheduleCount: { type: Number, required: true, default: 0, min: 0 },
    privacyAcceptedAt: { type: Date },
    idempotencyKey: { type: String, trim: true, maxlength: 80 },
    cancelledAt: { type: Date },
    cancelledBy: { type: String, enum: ['customer', 'staff', 'system'] },
    cancelReason: { type: String, trim: true, maxlength: 300 },
    completedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { tenant: true, optimisticConcurrency: true },
);

export const Appointment = registerModel<AppointmentDocument>('Appointment', 'appointments', schema);
