import { Types } from 'mongoose';
import type { TenantContext } from '@/shared/types/tenant-context';
import { Staff } from '../db/models';
import type { StaffDocument } from '../db/models/staff';

export class StaffRepository {
  list(ctx: TenantContext, query: { includeInactive: boolean; page: number; limit: number }) {
    const filter = { businessId: new Types.ObjectId(ctx.businessId), isDeleted: false, ...(query.includeInactive ? {} : { isActive: true }) };
    return Staff.find(filter).sort({ displayOrder: 1, displayName: 1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean().exec();
  }

  findById(ctx: TenantContext, id: string) {
    return Staff.findOne({ _id: id, businessId: ctx.businessId, isDeleted: false }).lean().exec();
  }

  create(ctx: TenantContext, input: { displayName: string; bio?: string | undefined; color: StaffDocument['color']; phone?: string | undefined; email?: string | undefined; acceptsOnlineBooking: boolean }) {
    const data: Record<string, unknown> = { businessId: new Types.ObjectId(ctx.businessId), displayName: input.displayName, color: input.color, acceptsOnlineBooking: input.acceptsOnlineBooking };
    if (input.bio !== undefined) data.bio = input.bio;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.email !== undefined) data.email = input.email;
    return new Staff(data).save();
  }

  update(ctx: TenantContext, id: string, patch: Record<string, unknown>) {
    return Staff.findOneAndUpdate({ _id: id, businessId: ctx.businessId, isDeleted: false }, { $set: patch }, { returnDocument: 'after', runValidators: true }).lean().exec();
  }
}
