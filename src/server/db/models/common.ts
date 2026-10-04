import { model, models, Schema } from 'mongoose';
import type { Model, SchemaDefinition } from 'mongoose';

import { tenantPlugin } from '@/server/db/plugins/tenant';

export function createModelSchema<T>(
  definition: SchemaDefinition<T>,
  options: { optimisticConcurrency?: boolean; tenant?: boolean } = {},
): Schema<T> {
  const schema = new Schema<T>(definition, {
    timestamps: true,
    strict: 'throw',
    autoIndex: false,
    ...(options.optimisticConcurrency ? { optimisticConcurrency: true } : {}),
  });

  if (options.tenant) schema.plugin(tenantPlugin);
  return schema;
}

export function registerModel<T>(name: string, collection: string, schema: Schema<T>): Model<T> {
  const existing = models[name] as Model<T> | undefined;
  return existing ?? model<T>(name, schema, collection);
}

export const softDeleteFields = {
  isDeleted: { type: Boolean, required: true, default: false },
  deletedAt: { type: Date, default: null },
} as const;
