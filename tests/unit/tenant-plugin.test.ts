import mongoose, { Schema } from 'mongoose';
import type { Model } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { TenantGuardError, tenantPlugin } from '@/server/db/plugins/tenant';

const schema = new Schema({
  isDeleted: { type: Boolean, default: false },
  name: { type: String },
});
schema.plugin(tenantPlugin);
interface TenantPluginTestDocument {
  businessId?: mongoose.Types.ObjectId;
  isDeleted: boolean;
  name?: string;
}

const TenantPluginTestModel = (mongoose.models.TenantPluginTestModel ??
  mongoose.model('TenantPluginTestModel', schema)) as Model<TenantPluginTestDocument>;

describe('tenantPlugin', () => {
  it('rejects business queries without a tenant filter', async () => {
    await expect(TenantPluginTestModel.find({}).exec()).rejects.toBeInstanceOf(TenantGuardError);
  });

  it('requires the first aggregate stage to scope businessId', async () => {
    await expect(TenantPluginTestModel.aggregate([{ $match: { isDeleted: false } }]).exec()).rejects.toBeInstanceOf(
      TenantGuardError,
    );
  });
});
