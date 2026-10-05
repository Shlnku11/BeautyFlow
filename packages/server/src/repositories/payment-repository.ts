import { Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import { DateTime } from 'luxon';
import type { TenantContext } from '@/shared/types/tenant-context';
import { Appointment, Business, Customer, Payment } from '../db/models';
import type { PaymentDocument } from '../db/models/payments';
import type { PaymentListQuerySchema } from '@/shared/schemas/payments';
import type { z } from 'zod';
import { ValidationError } from '../http/errors';

type PaymentListQuery = z.infer<typeof PaymentListQuerySchema>;

export class PaymentRepository {
  findById(ctx: TenantContext, id: string, session?: ClientSession) {
    const query = Payment.findOne({ _id: id, businessId: new Types.ObjectId(ctx.businessId) });
    return (session ? query.session(session) : query).lean().exec();
  }

  findByIdempotencyKey(ctx: TenantContext, key: string, session?: ClientSession) {
    const query = Payment.findOne({ businessId: new Types.ObjectId(ctx.businessId), idempotencyKey: key });
    return (session ? query.session(session) : query).lean().exec();
  }

  appointment(ctx: TenantContext, id: string, session: ClientSession) {
    return Appointment.findOne({ _id: id, businessId: new Types.ObjectId(ctx.businessId) }).session(session).lean().exec();
  }

  business(ctx: TenantContext, session: ClientSession) {
    return Business.findById(ctx.businessId).session(session).select({ currency: 1, timezone: 1 }).lean().exec();
  }

  create(ctx: TenantContext, input: Omit<PaymentDocument, '_id' | 'businessId' | 'refundedMinor' | 'createdAt' | 'updatedAt' | '__v'>, session: ClientSession) {
    return new Payment({ businessId: new Types.ObjectId(ctx.businessId), ...input, refundedMinor: 0 }).save({ session });
  }

  async list(ctx: TenantContext, query: PaymentListQuery) {
    const businessId = new Types.ObjectId(ctx.businessId);
    const filter: Record<string, unknown> = { businessId };
    if (query.method) filter.method = query.method;
    if (query.status) filter.status = query.status;
    if (query.staffId) filter.staffId = new Types.ObjectId(query.staffId);
    if (query.customerId) filter.customerId = new Types.ObjectId(query.customerId);
    if (query.from || query.to) {
      const business = await Business.findById(ctx.businessId).select({ timezone: 1 }).lean().exec();
      if (!business) return { data: [], total: 0, totals: { paidMinor: 0, refundedMinor: 0 } };
      const start = query.from ? DateTime.fromISO(query.from, { zone: business.timezone }).startOf('day').toUTC().toJSDate() : undefined;
      const end = query.to ? DateTime.fromISO(query.to, { zone: business.timezone }).startOf('day').plus({ days: 1 }).toUTC().toJSDate() : undefined;
      const dateRange = { ...(start ? { $gte: start } : {}), ...(end ? { $lt: end } : {}) };
      filter.$or = [
        { status: { $in: ['pending', 'cancelled'] }, createdAt: dateRange },
        { status: { $in: ['paid', 'refunded'] }, paidAt: dateRange },
      ];
    }
    if (query.q) {
      const term = query.q.trim().toLocaleLowerCase('ru');
      const phoneTerm = term.replace(/\D/g, '');
      const pattern = `^${(phoneTerm.length >= 3 ? phoneTerm : term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
      const customers = await Customer.find({ businessId, isDeleted: false, searchTokens: { $regex: pattern } }).select({ _id: 1 }).limit(201).lean().exec();
      if (customers.length > 200) throw new ValidationError([], 'Уточните поисковый запрос');
      filter.customerId = { $in: customers.map(({ _id }) => _id) };
    }
    const [rows, total, totalsResult] = await Promise.all([
      Payment.find(filter).sort({ paidAt: -1, createdAt: -1, _id: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean().exec(),
      Payment.countDocuments(filter).exec(),
      Payment.aggregate<{ paidMinor: number; refundedMinor: number }>([
        { $match: filter },
        { $group: { _id: null, paidMinor: { $sum: { $cond: [{ $in: ['$status', ['paid', 'refunded']] }, '$amountMinor', 0] } }, refundedMinor: { $sum: { $cond: [{ $in: ['$status', ['paid', 'refunded']] }, '$refundedMinor', 0] } } } },
      ]).exec(),
    ]);
    // PAYMENTS_SPEC §5: totals cover the filtered payment sample by paidAt/createdAt, not ledger occurredAt.
    return { data: rows, total, totals: totalsResult[0] ?? { paidMinor: 0, refundedMinor: 0 } };
  }

  async transitionPendingToPaid(ctx: TenantContext, id: string, update: { paidAt: Date; method: PaymentDocument['method'] }, session: ClientSession) {
    return Payment.findOneAndUpdate({ _id: id, businessId: new Types.ObjectId(ctx.businessId), status: 'pending' }, { $set: { status: 'paid', paidAt: update.paidAt, method: update.method }, $inc: { __v: 1 } }, { session, returnDocument: 'after', runValidators: true }).lean().exec();
  }

  async transitionPendingToCancelled(ctx: TenantContext, id: string) {
    return Payment.findOneAndUpdate({ _id: id, businessId: new Types.ObjectId(ctx.businessId), status: 'pending' }, { $set: { status: 'cancelled' }, $inc: { __v: 1 } }, { returnDocument: 'after', runValidators: true }).lean().exec();
  }

  async applyRefund(ctx: TenantContext, payment: PaymentDocument, refundMinor: number, session: ClientSession) {
    const refundedMinor = payment.refundedMinor + refundMinor;
    const status = refundedMinor === payment.amountMinor ? 'refunded' : 'paid';
    const updated = await Payment.findOneAndUpdate(
      { _id: payment._id, businessId: new Types.ObjectId(ctx.businessId), status: 'paid', refundedMinor: payment.refundedMinor },
      { $inc: { refundedMinor: refundMinor, __v: 1 }, $set: { status } },
      { session, returnDocument: 'after', runValidators: true },
    ).lean().exec();
    return updated;
  }
}
