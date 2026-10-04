import { Schema } from 'mongoose';
import type { Aggregate, Query } from 'mongoose';

export class TenantGuardError extends Error {
  constructor(message = 'Запрос к бизнес-данным требует фильтр businessId') {
    super(message);
    this.name = 'TenantGuardError';
  }
}

type TenantFilter = Record<string, unknown>;

function hasTopLevelBusinessId(filter: TenantFilter): boolean {
  return Object.prototype.hasOwnProperty.call(filter, 'businessId') && filter.businessId != null;
}

function assertTenantFilter(filter: TenantFilter): void {
  if (!hasTopLevelBusinessId(filter)) throw new TenantGuardError();
}

function addSoftDeleteFilter(filter: TenantFilter, softDelete: boolean): void {
  if (softDelete && !Object.prototype.hasOwnProperty.call(filter, 'isDeleted')) {
    filter.isDeleted = false;
  }
}

const tenantQueryOperations = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'updateOne',
  'updateMany',
  'deleteOne',
  'deleteMany',
  'countDocuments',
] as const;

export interface TenantPluginOptions {
  softDelete?: boolean;
}

export const tenantPlugin = (schema: Schema, options: TenantPluginOptions = {}): void => {
  const softDelete = options.softDelete ?? schema.path('isDeleted') !== undefined;

  if (schema.path('businessId') === undefined) {
    schema.add({
      businessId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },
    });
  }

  for (const operation of tenantQueryOperations) {
    schema.pre(operation, function tenantQueryGuard(this: Query<unknown, unknown>) {
      // Mongoose exposes a dynamic filter type; the guard inspects only top-level keys.
      const filter = this.getFilter() as TenantFilter;
      assertTenantFilter(filter);
      addSoftDeleteFilter(filter, softDelete);
      this.setQuery(filter);
    });
  }

  schema.pre('aggregate', function tenantAggregateGuard(this: Aggregate<unknown[]>) {
    const pipeline = this.pipeline();
    const firstStage = pipeline[0];
    if (!firstStage || typeof firstStage !== 'object' || !('$match' in firstStage)) {
      throw new TenantGuardError('Агрегация должна начинаться с $match по businessId');
    }

    const firstMatch = firstStage.$match;
    if (typeof firstMatch !== 'object' || firstMatch === null || Array.isArray(firstMatch)) {
      throw new TenantGuardError('Первый $match агрегации должен содержать businessId');
    }

    // Aggregation expressions are driver values; the guard inspects only tenant-related keys.
    const filter = firstMatch as TenantFilter;
    assertTenantFilter(filter);
    addSoftDeleteFilter(filter, softDelete);
  });
};
