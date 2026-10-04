import { Types } from 'mongoose';
import type { TenantContext } from '@/shared/types/tenant-context';
import { Appointment, Business, Customer, Settings } from '../db/models';

export class CustomerRepository {
  businessCountry(ctx: TenantContext) {
    return Business.findById(ctx.businessId).select({ countryCode: 1 }).lean().exec();
  }

  create(ctx: TenantContext, data: Record<string, unknown>) {
    return new Customer({ businessId: new Types.ObjectId(ctx.businessId), source: 'internal', ...data }).save();
  }

  findByPhone(ctx: TenantContext, phoneNormalized: string) {
    return Customer.findOne({ businessId: ctx.businessId, phoneNormalized, isDeleted: false }).select({ _id: 1 }).lean().exec();
  }

  findById(ctx: TenantContext, id: string) {
    return Customer.findOne({ _id: id, businessId: ctx.businessId, isDeleted: false }).lean().exec();
  }

  async list(ctx: TenantContext, query: { q?: string | undefined; hasUpcoming?: boolean | undefined; source?: 'internal' | 'public' | undefined; sort: 'createdAt' | 'lastName' | 'lastVisitAt'; order: 'asc' | 'desc'; page: number; limit: number }) {
    const where: Record<string, unknown> = { businessId: ctx.businessId, isDeleted: false };
    if (query.q) where.searchTokens = { $regex: `^${query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toLocaleLowerCase('ru')}` };
    if (query.source) where.source = query.source;
    if (ctx.role === 'master' && ctx.staffId) {
      const appointmentRows = await Appointment.find({ businessId: ctx.businessId, staffId: ctx.staffId }).distinct('customerId').exec();
      where._id = { $in: appointmentRows };
    }
    if (query.hasUpcoming !== undefined) {
      const upcomingCustomers = await Appointment.find({ businessId: ctx.businessId, startAt: { $gt: new Date() }, status: { $in: ['pending', 'confirmed'] } }).distinct('customerId').exec();
      where._id = query.hasUpcoming ? { $in: upcomingCustomers } : { $nin: upcomingCustomers };
    }
    const direction = query.order === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = query.sort === 'lastVisitAt' ? { createdAt: -1 } : { [query.sort]: direction };
    const customers = await Customer.find(where).sort(sort).skip((query.page - 1) * query.limit).limit(query.limit).lean().exec();
    const privacy = await Settings.findOne({ businessId: ctx.businessId }).select({ 'privacy.masterSeesCustomerPhone': 1 }).lean().exec();
    const allowed = ctx.role !== 'master' || privacy?.privacy.masterSeesCustomerPhone !== false;
    return customers.map((customer) => ({ id: customer._id.toString(), firstName: customer.firstName, ...(customer.lastName ? { lastName: customer.lastName } : {}), ...(allowed ? { phone: customer.phone } : {}), ...(ctx.role !== 'master' ? { email: customer.email, notes: customer.notes, contacts: customer.contacts, source: customer.source, createdAt: customer.createdAt } : {}) }));
  }

  update(ctx: TenantContext, id: string, patch: Record<string, unknown>) {
    return Customer.findOneAndUpdate({ _id: id, businessId: ctx.businessId, isDeleted: false }, { $set: patch }, { returnDocument: 'after', runValidators: true }).lean().exec();
  }
}
