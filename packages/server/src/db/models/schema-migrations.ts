import type { Types } from 'mongoose';

import { createModelSchema, registerModel } from './common';

export interface SchemaMigrationDocument {
  _id: Types.ObjectId;
  id: string;
  appliedAt: Date;
  checksum: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = createModelSchema<SchemaMigrationDocument>({
  id: { type: String, required: true, trim: true, match: /^\d{3}_[a-z0-9_]+$/ },
  appliedAt: { type: Date, required: true },
  checksum: { type: String, required: true, trim: true, minlength: 64, maxlength: 64 },
});

export const SchemaMigration = registerModel<SchemaMigrationDocument>(
  'SchemaMigration',
  'schemaMigrations',
  schema,
);
