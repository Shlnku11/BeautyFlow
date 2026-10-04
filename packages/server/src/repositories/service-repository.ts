import { Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import type { TenantContext } from '@/shared/types/tenant-context';
import { Business, Service, Staff, StaffService } from '../db/models';

export class ServiceRepository {
  async businessCurrency(ctx: TenantContext) {
    const business = await Business.findById(ctx.businessId).select({ currency: 1 }).lean().exec();
    return business?.currency;
  }

  async staffIdsExist(ctx: TenantContext, ids: string[]): Promise<boolean> {
    if (ids.length === 0) return true;
    const count = await Staff.countDocuments({ _id: { $in: ids }, businessId: ctx.businessId, isActive: true, isDeleted: false }).exec();
    return count === new Set(ids).size;
  }

  async list(ctx: TenantContext, filters: { isActive?: boolean | undefined; staffId?: string | undefined }) {
    const where: Record<string, unknown> = { businessId: ctx.businessId, isDeleted: false };
    if (filters.isActive !== undefined) where.isActive = filters.isActive;
    let serviceIds: Types.ObjectId[] | undefined;
    if (filters.staffId) {
      const staffServiceLinks = await StaffService.find({ businessId: ctx.businessId, staffId: filters.staffId }).select({ serviceId: 1 }).lean().exec();
      serviceIds = staffServiceLinks.map((link) => link.serviceId);
    } else if (ctx.role === 'master' && ctx.staffId) {
      const staffServiceLinks = await StaffService.find({ businessId: ctx.businessId, staffId: ctx.staffId }).select({ serviceId: 1 }).lean().exec();
      serviceIds = staffServiceLinks.map((link) => link.serviceId);
    }
    if (serviceIds) where._id = { $in: serviceIds };
    return Service.find(where).sort({ displayOrder: 1, name: 1 }).lean().exec();
  }

  findById(ctx: TenantContext, id: string) {
    return Service.findOne({ _id: id, businessId: ctx.businessId, isDeleted: false }).lean().exec();
  }

  create(ctx: TenantContext, data: Record<string, unknown>, session: ClientSession) {
    return new Service({ businessId: new Types.ObjectId(ctx.businessId), ...data }).save({ session });
  }

  async replaceStaffLinks(ctx: TenantContext, serviceId: Types.ObjectId, staffIds: string[], session: ClientSession) {
    await StaffService.deleteMany({ businessId: ctx.businessId, serviceId }, { session }).exec();
    if (staffIds.length > 0) {
      await StaffService.insertMany(staffIds.map((staffId) => ({ businessId: new Types.ObjectId(ctx.businessId), serviceId, staffId: new Types.ObjectId(staffId) })), { session, ordered: true });
    }
  }

  async staffLinks(ctx: TenantContext, serviceId: Types.ObjectId) {
    const links = await StaffService.find({ businessId: ctx.businessId, serviceId }).select({ staffId: 1 }).lean().exec();
    return links.map((link) => link.staffId.toString());
  }

  update(ctx: TenantContext, id: string, patch: Record<string, unknown>, session: ClientSession) {
    return Service.findOneAndUpdate({ _id: id, businessId: ctx.businessId, isDeleted: false }, { $set: patch }, { returnDocument: 'after', runValidators: true, session }).lean().exec();
  }
}
