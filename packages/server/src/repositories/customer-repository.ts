import { Types } from 'mongoose';
import type { TenantContext } from '@/shared/types/tenant-context';
import { Appointment, Business, Customer, Service, Settings, Staff, Transaction } from '../db/models';

export class CustomerRepository {
  async masterPhoneVisibility(ctx: TenantContext): Promise<boolean> {
    const settings = await Settings.findOne({ businessId: new Types.ObjectId(ctx.businessId) }).select({ 'privacy.masterSeesCustomerPhone': 1 }).lean().exec();
    return settings?.privacy.masterSeesCustomerPhone !== false;
  }

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

  hasCustomerAppointmentsForStaff(ctx: TenantContext, customerId: string, staffId: string) {
    return Appointment.exists({ businessId: ctx.businessId, customerId, staffId }).exec();
  }

  async customerSummary(ctx: TenantContext, customerId: string) {
    const now = new Date();
    const [business, visitsCount, lastVisit, nextVisit, paidRows] = await Promise.all([
      Business.findOne({ _id: ctx.businessId }).select({ currency: 1 }).lean().exec(),
      Appointment.countDocuments({ businessId: ctx.businessId, customerId, status: 'completed' }).exec(),
      Appointment.findOne({ businessId: ctx.businessId, customerId, status: 'completed' }).sort({ startAt: -1 }).select({ startAt: 1 }).lean().exec(),
      Appointment.findOne({ businessId: ctx.businessId, customerId, startAt: { $gt: now }, status: { $in: ['pending', 'confirmed'] } }).sort({ startAt: 1 }).select({ startAt: 1 }).lean().exec(),
      Transaction.aggregate<{ _id: 'charge' | 'refund'; total: number }>([
        { $match: { businessId: new Types.ObjectId(ctx.businessId), customerId: new Types.ObjectId(customerId) } },
        { $group: { _id: '$type', total: { $sum: '$amountMinor' } } },
      ]).exec(),
    ]);
    const totals = new Map(paidRows.map(({ _id, total }) => [_id, total]));
    return {
      visitsCount,
      ...(lastVisit ? { lastVisitAt: lastVisit.startAt.toISOString() } : {}),
      ...(nextVisit ? { nextVisitAt: nextVisit.startAt.toISOString() } : {}),
      totalPaidMinor: (totals.get('charge') ?? 0) - (totals.get('refund') ?? 0),
      currency: business?.currency,
    };
  }

  async appointments(ctx: TenantContext, customer: { _id: Types.ObjectId; firstName: string; lastName?: string; phone: string; email?: string }, query: { status?: string | string[] | undefined; from?: string | undefined; to?: string | undefined; page: number; limit: number }) {
    const customerId = customer._id.toString();
    const filter: Record<string, unknown> = { businessId: new Types.ObjectId(ctx.businessId), customerId: new Types.ObjectId(customerId) };
    if (ctx.role === 'master' && ctx.staffId) filter.staffId = new Types.ObjectId(ctx.staffId);
    if (query.status) filter.status = Array.isArray(query.status) ? { $in: query.status } : query.status;
    if (query.from || query.to) filter.startAt = { ...(query.from ? { $gte: new Date(query.from) } : {}), ...(query.to ? { $lte: new Date(query.to) } : {}) };
    const [rows, total] = await Promise.all([
      Appointment.find(filter).sort({ startAt: -1, _id: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean().exec(),
      Appointment.countDocuments(filter).exec(),
    ]);
    const staffIds = [...new Set(rows.map(({ staffId }) => staffId.toString()))];
    const serviceIds = [...new Set(rows.map(({ serviceId }) => serviceId.toString()))];
    const [staffRows, serviceRows, transactions, privacy] = await Promise.all([
      Staff.find({ _id: { $in: staffIds }, businessId: new Types.ObjectId(ctx.businessId) }).select({ displayName: 1, color: 1 }).lean().exec(),
      Service.find({ _id: { $in: serviceIds }, businessId: new Types.ObjectId(ctx.businessId) }).select({ name: 1 }).lean().exec(),
      rows.length === 0 ? Promise.resolve([]) : Transaction.aggregate<{ _id: { appointmentId: Types.ObjectId; type: 'charge' | 'refund' }; total: number }>([
        { $match: { businessId: new Types.ObjectId(ctx.businessId), appointmentId: { $in: rows.map(({ _id }) => _id) } } },
        { $group: { _id: { appointmentId: '$appointmentId', type: '$type' }, total: { $sum: '$amountMinor' } } },
      ]).exec(),
      Settings.findOne({ businessId: new Types.ObjectId(ctx.businessId) }).select({ 'privacy.masterSeesCustomerPhone': 1 }).lean().exec(),
    ]);
    const staffById = new Map(staffRows.map((staff) => [staff._id.toString(), staff]));
    const serviceById = new Map(serviceRows.map((service) => [service._id.toString(), service]));
    const paymentsByAppointment = new Map<string, { charge: number; refund: number }>();
    for (const row of transactions) {
      const appointmentKey = row._id.appointmentId.toString();
      const total = paymentsByAppointment.get(appointmentKey) ?? { charge: 0, refund: 0 };
      total[row._id.type] = row.total;
      paymentsByAppointment.set(appointmentKey, total);
    }
    const data = rows.flatMap((appointment) => {
      const staff = staffById.get(appointment.staffId.toString());
      const service = serviceById.get(appointment.serviceId.toString());
      if (!staff || !service) return [];
      const paid = paymentsByAppointment.get(appointment._id.toString()) ?? { charge: 0, refund: 0 };
      const snapshot = appointment.serviceSnapshot;
      return [{
        id: appointment._id.toString(),
        customer: {
          id: customerId,
          firstName: customer.firstName,
          ...(customer.lastName ? { lastName: customer.lastName } : {}),
          ...(ctx.role !== 'master' || privacy?.privacy.masterSeesCustomerPhone !== false ? { phone: customer.phone } : {}),
          ...(ctx.role !== 'master' && customer.email ? { email: customer.email } : {}),
        },
        staff: { id: staff._id.toString(), displayName: staff.displayName, color: staff.color },
        service: { id: service._id.toString(), name: service.name },
        startAt: appointment.startAt.toISOString(), endAt: appointment.endAt.toISOString(), blockedUntilAt: appointment.blockedUntilAt.toISOString(),
        status: appointment.status, source: appointment.source, serviceSnapshot: snapshot,
        ...(appointment.customerNote ? { customerNote: appointment.customerNote } : {}),
        ...(ctx.role !== 'master' && appointment.internalNote ? { internalNote: appointment.internalNote } : {}),
        ...(appointment.visitNote ? { visitNote: appointment.visitNote } : {}), rescheduleCount: appointment.rescheduleCount,
        ...(ctx.role !== 'master' ? { payment: { paidMinor: paid.charge, refundedMinor: paid.refund, balanceMinor: Math.max(0, snapshot.priceMinor - paid.charge + paid.refund) } } : {}),
      }];
    });
    return { data, total };
  }

  async list(ctx: TenantContext, query: { q?: string | undefined; hasUpcoming?: boolean | undefined; source?: 'internal' | 'public' | undefined; sort: 'createdAt' | 'lastName' | 'lastVisitAt'; order: 'asc' | 'desc'; page: number; limit: number }) {
    const where: Record<string, unknown> = { businessId: new Types.ObjectId(ctx.businessId), isDeleted: false };
    if (query.q) where.searchTokens = { $regex: `^${query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toLocaleLowerCase('ru')}` };
    if (query.source) where.source = query.source;
    const appointmentScope: Record<string, unknown> = { businessId: new Types.ObjectId(ctx.businessId) };
    if (ctx.role === 'master' && ctx.staffId) {
      appointmentScope.staffId = ctx.staffId;
      const appointmentRows = await Appointment.find(appointmentScope).distinct('customerId').exec();
      where._id = { $in: appointmentRows };
    }
    if (query.hasUpcoming !== undefined) {
      const upcomingCustomers = await Appointment.find({ ...appointmentScope, startAt: { $gt: new Date() }, status: { $in: ['pending', 'confirmed'] } }).distinct('customerId').exec();
      if (ctx.role === 'master' && ctx.staffId) {
        const selector = where._id;
        const allowedIds = selector && typeof selector === 'object' && '$in' in selector && Array.isArray(selector.$in)
          ? selector.$in.filter((id): id is Types.ObjectId => id instanceof Types.ObjectId)
          : [];
        const upcomingIds = new Set(upcomingCustomers.map((id) => id.toString()));
        where._id = { $in: allowedIds.filter((id) => query.hasUpcoming ? upcomingIds.has(id.toString()) : !upcomingIds.has(id.toString())) };
      } else {
        where._id = query.hasUpcoming ? { $in: upcomingCustomers } : { $nin: upcomingCustomers };
      }
    }
    const direction = query.order === 'asc' ? 1 : -1;
    const total = await Customer.countDocuments(where).exec();
    let customers;
    if (query.sort === 'lastVisitAt') {
      customers = await Customer.aggregate([
        { $match: where },
        { $lookup: { from: 'appointments', let: { customerId: '$_id' }, pipeline: [
          { $match: { $expr: { $and: [ { $eq: ['$businessId', new Types.ObjectId(ctx.businessId)] }, { $eq: ['$customerId', '$$customerId'] }, { $eq: ['$status', 'completed'] } ] } } },
          { $sort: { startAt: -1 } }, { $limit: 1 }, { $project: { startAt: 1 } },
        ], as: 'lastVisitRows' } },
        { $set: { lastVisitAt: { $arrayElemAt: ['$lastVisitRows.startAt', 0] } } },
        { $sort: { lastVisitAt: direction, _id: direction } },
        { $skip: (query.page - 1) * query.limit }, { $limit: query.limit }, { $unset: 'lastVisitRows' },
      ]).exec();
    } else {
      customers = await Customer.find(where).sort({ [query.sort]: direction }).skip((query.page - 1) * query.limit).limit(query.limit).lean().exec();
    }
    const privacy = await Settings.findOne({ businessId: ctx.businessId }).select({ 'privacy.masterSeesCustomerPhone': 1 }).lean().exec();
    const allowed = ctx.role !== 'master' || privacy?.privacy.masterSeesCustomerPhone !== false;
    const customerIds = customers.map((customer) => customer._id);
    const now = new Date();
    const activity = customerIds.length === 0 ? [] : await Appointment.aggregate<{ _id: Types.ObjectId; visitsCount: number; lastVisitAt?: Date; nextVisitAt?: Date }>([
      { $match: { businessId: new Types.ObjectId(ctx.businessId), customerId: { $in: customerIds }, ...(ctx.role === 'master' && ctx.staffId ? { staffId: new Types.ObjectId(ctx.staffId) } : {}) } },
      { $group: {
        _id: '$customerId',
        visitsCount: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        lastVisitAt: { $max: { $cond: [{ $eq: ['$status', 'completed'] }, '$startAt', null] } },
        nextVisitAt: { $min: { $cond: [{ $and: [{ $in: ['$status', ['pending', 'confirmed']] }, { $gt: ['$startAt', now] }] }, '$startAt', null] } },
      } },
    ]).exec();
    const activityByCustomer = new Map(activity.map((row) => [row._id.toString(), row]));
    const data = customers.map((customer) => {
      const result = {
        id: customer._id.toString(), firstName: customer.firstName,
        ...(customer.lastName ? { lastName: customer.lastName } : {}),
        ...(allowed ? { phone: customer.phone } : {}),
        ...(ctx.role !== 'master' ? {
          ...(customer.email ? { email: customer.email } : {}),
          ...(customer.notes ? { notes: customer.notes } : {}),
          ...(customer.contacts ? { contacts: customer.contacts } : {}),
          source: customer.source,
          createdAt: customer.createdAt.toISOString(),
          visitsCount: activityByCustomer.get(customer._id.toString())?.visitsCount ?? 0,
          ...(activityByCustomer.get(customer._id.toString())?.lastVisitAt ? { lastVisitAt: activityByCustomer.get(customer._id.toString())?.lastVisitAt?.toISOString() } : {}),
          ...(activityByCustomer.get(customer._id.toString())?.nextVisitAt ? { nextVisitAt: activityByCustomer.get(customer._id.toString())?.nextVisitAt?.toISOString() } : {}),
        } : {}),
      };
      return result;
    });
    return { data, meta: { page: query.page, limit: query.limit, total } };
  }

  update(ctx: TenantContext, id: string, patch: Record<string, unknown>) {
    return Customer.findOneAndUpdate({ _id: id, businessId: ctx.businessId, isDeleted: false }, { $set: patch }, { returnDocument: 'after', runValidators: true }).lean().exec();
  }
}
