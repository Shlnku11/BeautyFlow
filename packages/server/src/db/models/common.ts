import mongoose from 'mongoose';
import type { Model, Schema as MongooseSchema, SchemaDefinition } from 'mongoose';

import { tenantPlugin } from '@/server/db/plugins/tenant';

export function createModelSchema<T>(
  definition: SchemaDefinition<T>,
  options: { optimisticConcurrency?: boolean; tenant?: boolean } = {},
): MongooseSchema<T> {
  const schema = new mongoose.Schema<T>(definition, {
    timestamps: true,
    strict: 'throw',
    autoIndex: false,
    ...(options.optimisticConcurrency ? { optimisticConcurrency: true } : {}),
  });

  if (options.tenant) schema.plugin(tenantPlugin);
  return schema;
}

export function registerModel<T>(name: string, collection: string, schema: MongooseSchema<T>): Model<T> {
  const existing = mongoose.models[name] as Model<T> | undefined;
  return existing ?? mongoose.model<T>(name, schema, collection);
}

export const softDeleteFields = {
  isDeleted: { type: Boolean, required: true, default: false },
  deletedAt: { type: Date, default: null },
} as const;
