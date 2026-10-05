import { Types } from 'mongoose';
import type { TenantContext } from '@/shared/types/tenant-context';
import { Appointment, Business, Customer, Staff, Transaction } from '../db/models';

export class DashboardRepository {
  findBusiness(ctx: TenantContext) { return Business.findById(ctx.businessId).select('_id timezone currency').lean().exec(); }

  async revenue(ctx: TenantContext, from: Date, to: Date, staffId?: string) {
    const match = { businessId: new Types.ObjectId(ctx.businessId), occurredAt: { $gte: from, $lt: to }, ...(staffId ? { staffId: new Types.ObjectId(staffId) } : {}) };
    // DASHBOARD_SPEC §§1, 3.1: constrain tenant in the first pipeline stage before grouping money movements.
    const rows = await Transaction.aggregate<{ _id: 'charge' | 'refund'; sum: number }>([
      { $match: match },
      { $group: { _id: '$type', sum: { $sum: '$amountMinor' } } },
    ]).exec();
    const values = new Map(rows.map((row) => [row._id, row.sum]));
    const grossMinor = values.get('charge') ?? 0;
    const refundedMinor = values.get('refund') ?? 0;
    return { grossMinor, refundedMinor, netMinor: grossMinor - refundedMinor };
  }

  async appointmentStats(ctx: TenantContext, from: Date, to: Date, staffId?: string) {
    // DASHBOARD_SPEC §§1, 3.3: tenant match must be first to prevent cross-business counts.
    const rows = await Appointment.aggregate<{ _id: string; count: number }>([
      { $match: { businessId: new Types.ObjectId(ctx.businessId), startAt: { $gte: from, $lt: to }, ...(staffId ? { staffId: new Types.ObjectId(staffId) } : {}) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).exec();
    const counts = new Map(rows.map((row) => [row._id, row.count]));
    const pending = counts.get('pending') ?? 0;
    const confirmed = counts.get('confirmed') ?? 0;
    const completed = counts.get('completed') ?? 0;
    const cancelled = counts.get('cancelled') ?? 0;
    const noShow = counts.get('no_show') ?? 0;
    const total = pending + confirmed + completed + cancelled + noShow;
    return { total, pending, confirmed, completed, cancelled, noShow, cancellationRate: total ? cancelled / total : 0, noShowRate: total ? noShow / total : 0 };
  }

  newCustomers(ctx: TenantContext, from: Date, to: Date) {
    return Customer.countDocuments({ businessId: ctx.businessId, isDeleted: false, createdAt: { $gte: from, $lt: to } }).exec();
  }

  async staffExists(ctx: TenantContext, staffId: string) {
    return Boolean(await Staff.exists({ businessId: ctx.businessId, _id: staffId, isDeleted: false }).exec());
  }

  upcoming(ctx: TenantContext, now: Date, limit: number, staffId?: string) {
    return Appointment.find({ businessId: ctx.businessId, status: { $in: ['pending', 'confirmed'] }, startAt: { $gte: now }, ...(staffId ? { staffId } : {}) }).sort({ startAt: 1, _id: 1 }).limit(limit).lean().exec();
  }

  references(ctx: TenantContext, customerIds: Types.ObjectId[], staffIds: Types.ObjectId[]) {
    return Promise.all([
      Customer.find({ businessId: ctx.businessId, _id: { $in: customerIds } }).select('_id firstName lastName phone email').lean().exec(),
      Staff.find({ businessId: ctx.businessId, _id: { $in: staffIds } }).select('_id displayName color').lean().exec(),
    ]);
  }

  appointmentRows(ctx: TenantContext, staffId: string, from: Date, to: Date) {
    return Appointment.find({ businessId: ctx.businessId, staffId, startAt: { $gte: from, $lt: to } }).sort({ startAt: 1, _id: 1 }).lean().exec();
  }

  async ownCounts(ctx: TenantContext, staffId: string, from: Date, to: Date) {
    // DASHBOARD_SPEC §1 and API_CONTRACTS §4: master metrics are constrained by business and own staff before grouping.
    const rows = await Appointment.aggregate<{ _id: string; count: number }>([
      { $match: { businessId: new Types.ObjectId(ctx.businessId), staffId: new Types.ObjectId(staffId), startAt: { $gte: from, $lt: to } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).exec();
    return new Map(rows.map((row) => [row._id, row.count]));
  }
}
