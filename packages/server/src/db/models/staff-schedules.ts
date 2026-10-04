import { Schema } from 'mongoose';
import type { Types } from 'mongoose';

import { createModelSchema, registerModel } from './common';

export interface ScheduleInterval {
  start: string;
  end: string;
}

export interface ScheduleDay {
  isoWeekday: number;
  intervals: ScheduleInterval[];
  breaks: ScheduleInterval[];
}

export interface StaffScheduleDocument {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  staffId: Types.ObjectId;
  weekly: ScheduleDay[];
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

const daySchema = new Schema<ScheduleDay>(
  {
    isoWeekday: { type: Number, required: true, min: 1, max: 7 },
    intervals: { type: [intervalSchema], required: true, default: [] },
    breaks: { type: [intervalSchema], required: true, default: [] },
  },
  { _id: false, strict: 'throw' },
);

const schema = createModelSchema<StaffScheduleDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, immutable: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true, immutable: true },
    weekly: { type: [daySchema], required: true, default: [], maxlength: 7 },
  },
  { tenant: true, optimisticConcurrency: true },
);

export const StaffSchedule = registerModel<StaffScheduleDocument>('StaffSchedule', 'staffSchedules', schema);
