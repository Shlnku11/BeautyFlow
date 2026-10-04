import { Schema } from 'mongoose';
import type { Types } from 'mongoose';

import { createModelSchema, registerModel } from './common';
import type { ScheduleInterval } from './staff-schedules';

export interface StaffExceptionDocument {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  staffId: Types.ObjectId;
  date: string;
  kind: 'day_off' | 'custom';
  intervals: ScheduleInterval[];
  breaks: ScheduleInterval[];
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const intervalSchema = new Schema<ScheduleInterval>(
  {
    start: { type: String, required: true, trim: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    end: { type: String, required: true, trim: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  },
  { _id: false, strict: 'throw' },
);

const schema = createModelSchema<StaffExceptionDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, immutable: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true, immutable: true },
    date: { type: String, required: true, trim: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    kind: { type: String, enum: ['day_off', 'custom'], required: true },
    intervals: { type: [intervalSchema], required: true, default: [] },
    breaks: { type: [intervalSchema], required: true, default: [] },
    reason: { type: String, trim: true, maxlength: 200 },
  },
  { tenant: true },
);

export const StaffException = registerModel<StaffExceptionDocument>('StaffException', 'staffExceptions', schema);
