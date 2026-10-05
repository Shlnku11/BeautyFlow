import { Types } from 'mongoose';
import type { TenantContext } from '@/shared/types/tenant-context';
import { CreatePaymentSchema, PaymentListQuerySchema, MarkPaymentPaidSchema, RefundPaymentSchema } from '@/shared/schemas/payments';
import type { z } from 'zod';
import { ERROR_CODES } from '@/shared/error-codes';
import { AuditLog, User } from '../db/models';
import type { PaymentDocument } from '../db/models/payments';
import { withTransaction } from '../db/transactions';
import { assertPermission } from '../domain/permissions';
import { assertMoneyAmount, assertPaymentTransition, assertRefundAllowed } from '../domain/payments';
import { ConflictError, NotFoundError, ValidationError } from '../http/errors';
import { PaymentRepository } from '../repositories/payment-repository';
import { TransactionRepository } from '../repositories/transaction-repository';

const payments = new PaymentRepository();
const transactions = new TransactionRepository();
type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>;
type MarkPaymentInput = z.infer<typeof MarkPaymentPaidSchema>;
type RefundPaymentInput = z.infer<typeof RefundPaymentSchema>;
type ListQuery = z.infer<typeof PaymentListQuerySchema>;

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function isTransactionContention(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('hasErrorLabel' in error && typeof error.hasErrorLabel === 'function' && error.hasErrorLabel('TransientTransactionError')) return true;
  return 'code' in error && (error.code === 112 || error.code === 251);
}

function validatePaidAt(value: string | undefined, appointmentCreatedAt: Date, now: Date): Date {
  const paidAt = value ? new Date(value) : now;
  const earliest = appointmentCreatedAt.getTime() - 365 * 86_400_000;
  if (!Number.isFinite(paidAt.getTime()) || paidAt > now || paidAt.getTime() < earliest) {
    throw new ValidationError([], 'Дата оплаты должна быть не в будущем и не раньше создания записи более чем на 365 дней');
  }
  return paidAt;
}

export class PaymentService {
  async list(ctx: TenantContext, query: ListQuery) {
    assertPermission(ctx.role, 'payments:read');
    const result = await payments.list(ctx, query);
    const users = result.data.length ? await User.find({ _id: { $in: result.data.map((row) => row.createdBy) } }).select({ name: 1 }).lean().exec() : [];
    const names = new Map(users.map((user) => [user._id.toString(), user.name]));
    const data = result.data.map((row) => ({
      id: row._id.toString(), appointmentId: row.appointmentId.toString(), customerId: row.customerId.toString(), staffId: row.staffId.toString(),
      amountMinor: row.amountMinor, refundedMinor: row.refundedMinor, currency: row.currency, method: row.method, status: row.status,
      ...(row.paidAt ? { paidAt: row.paidAt.toISOString() } : {}), ...(row.notes ? { notes: row.notes } : {}),
      createdBy: { id: row.createdBy.toString(), name: names.get(row.createdBy.toString()) ?? '' }, createdAt: row.createdAt.toISOString(),
    }));
    return { data, meta: { total: result.total, page: query.page, limit: query.limit, totals: result.totals } };
  }

  async create(ctx: TenantContext, input: CreatePaymentInput, idempotencyKey: string) {
    assertPermission(ctx.role, 'payments:create');
    assertMoneyAmount(input.amountMinor);
    const prior = await payments.findByIdempotencyKey(ctx, idempotencyKey);
    if (prior) return { payment: await this.dto(prior), statusCode: 201 };
    try {
      const payment = await withTransaction(async (session) => {
        const existing = await payments.findByIdempotencyKey(ctx, idempotencyKey, session);
        if (existing) return existing;
        const appointment = await payments.appointment(ctx, input.appointmentId, session);
        if (!appointment) throw new NotFoundError();
        if (appointment.status === 'cancelled') throw new ConflictError(ERROR_CODES.APPOINTMENT_CANCELLED, 'Нельзя принять оплату по отменённой записи');
        const business = await payments.business(ctx, session);
        if (!business) throw new NotFoundError();
        const status = input.status ?? 'paid';
        const paidAt = status === 'paid' ? validatePaidAt(input.paidAt, appointment.createdAt, new Date()) : undefined;
        const created = await payments.create(ctx, {
          appointmentId: appointment._id, customerId: appointment.customerId, staffId: appointment.staffId,
          amountMinor: input.amountMinor, currency: business.currency, method: input.method, status,
          ...(paidAt ? { paidAt } : {}), ...(input.notes ? { notes: input.notes } : {}),
          idempotencyKey, createdBy: new Types.ObjectId(ctx.userId),
        }, session);
        if (status === 'paid' && paidAt) {
          // PAYMENTS_SPEC §4 / DATA_MODEL_MONGODB §14–15: the charge is atomic with payment creation.
          await transactions.create(ctx, { paymentId: created._id, appointmentId: created.appointmentId, customerId: created.customerId, staffId: created.staffId, type: 'charge', direction: 'in', amountMinor: created.amountMinor, currency: created.currency, method: created.method, occurredAt: paidAt, createdBy: new Types.ObjectId(ctx.userId) }, session);
        }
        await AuditLog.create([{ businessId: new Types.ObjectId(ctx.businessId), actorUserId: new Types.ObjectId(ctx.userId), actorRole: ctx.role, action: 'payment.created', entityType: 'payment', entityId: created._id, metadata: { paymentId: created._id.toString(), amountMinor: created.amountMinor, method: created.method } }], { session });
        return created.toObject();
      });
      return { payment: await this.dto(payment), statusCode: 201 };
    } catch (error: unknown) {
      if (!isDuplicateKey(error)) throw error;
      const existing = await payments.findByIdempotencyKey(ctx, idempotencyKey);
      if (!existing) throw error;
      return { payment: await this.dto(existing), statusCode: 201 };
    }
  }

  async markPaid(ctx: TenantContext, id: string, input: MarkPaymentInput) {
    assertPermission(ctx.role, 'payments:create');
    return withTransaction(async (session) => {
      const current = await payments.findById(ctx, id, session);
      if (!current) throw new NotFoundError();
      if (current.status === 'paid') return this.dto(current);
      assertPaymentTransition(current.status, 'paid');
      const appointment = await payments.appointment(ctx, current.appointmentId.toString(), session);
      if (!appointment) throw new NotFoundError();
      if (appointment.status === 'cancelled') throw new ConflictError(ERROR_CODES.APPOINTMENT_CANCELLED, 'Нельзя принять оплату по отменённой записи');
      const paidAt = validatePaidAt(input.paidAt, appointment.createdAt, new Date());
      const updated = await payments.transitionPendingToPaid(ctx, id, { paidAt, method: input.method ?? current.method }, session);
      if (!updated) {
        const fresh = await payments.findById(ctx, id, session);
        if (fresh?.status === 'paid') return this.dto(fresh);
        throw new ConflictError(ERROR_CODES.INVALID_PAYMENT_TRANSITION, 'Статус платежа уже изменился');
      }
      // PAYMENTS_SPEC §4 / DATA_MODEL_MONGODB §14–15: only the pending→paid winner appends a charge.
      await transactions.create(ctx, { paymentId: updated._id, appointmentId: updated.appointmentId, customerId: updated.customerId, staffId: updated.staffId, type: 'charge', direction: 'in', amountMinor: updated.amountMinor, currency: updated.currency, method: updated.method, occurredAt: paidAt, createdBy: new Types.ObjectId(ctx.userId) }, session);
      return this.dto(updated);
    });
  }

  async cancel(ctx: TenantContext, id: string, reason?: string) {
    assertPermission(ctx.role, 'payments:cancel');
    const current = await payments.findById(ctx, id);
    if (!current) throw new NotFoundError();
    assertPaymentTransition(current.status, 'cancelled');
    // PAYMENTS_SPEC §4: cancelling an unpaid payment has no money movement and must not append a transaction.
    const updated = await payments.transitionPendingToCancelled(ctx, id);
    if (!updated) throw new ConflictError(ERROR_CODES.INVALID_PAYMENT_TRANSITION, 'Статус платежа уже изменился');
    await AuditLog.create({ businessId: new Types.ObjectId(ctx.businessId), actorUserId: new Types.ObjectId(ctx.userId), actorRole: ctx.role, action: 'payment.cancelled', entityType: 'payment', entityId: updated._id, metadata: { paymentId: updated._id.toString(), ...(reason ? { reason } : {}) } });
    return this.dto(updated);
  }

  async refund(ctx: TenantContext, id: string, input: RefundPaymentInput) {
    assertPermission(ctx.role, 'payments:refund');
    assertMoneyAmount(input.amountMinor);
    try {
      return await withTransaction(async (session) => {
      const current = await payments.findById(ctx, id, session);
      if (!current) throw new NotFoundError();
      if (current.status !== 'paid') throw new ConflictError(ERROR_CODES.INVALID_PAYMENT_TRANSITION, 'Возврат доступен только для оплаченного платежа');
      assertRefundAllowed(current.amountMinor, current.refundedMinor, input.amountMinor);
      const updated = await payments.applyRefund(ctx, current as PaymentDocument, input.amountMinor, session);
      if (!updated) {
        const fresh = await payments.findById(ctx, id, session);
        if (!fresh) throw new NotFoundError();
        if (input.amountMinor > fresh.amountMinor - fresh.refundedMinor) throw new ConflictError(ERROR_CODES.REFUND_EXCEEDS_PAID, 'Сумма возврата превышает невозвращённый остаток оплаты');
        throw new ConflictError(ERROR_CODES.INVALID_PAYMENT_TRANSITION, 'Статус платежа уже изменился');
      }
      // PAYMENTS_SPEC §4 / DATA_MODEL_MONGODB §14–15: conditional refund increment and one immutable refund row commit together.
      await transactions.create(ctx, { paymentId: updated._id, appointmentId: updated.appointmentId, customerId: updated.customerId, staffId: updated.staffId, type: 'refund', direction: 'out', amountMinor: input.amountMinor, currency: updated.currency, method: updated.method, occurredAt: new Date(), note: input.note, createdBy: new Types.ObjectId(ctx.userId) }, session);
      await AuditLog.create([{ businessId: new Types.ObjectId(ctx.businessId), actorUserId: new Types.ObjectId(ctx.userId), actorRole: ctx.role, action: 'payment.refunded', entityType: 'payment', entityId: updated._id, metadata: { paymentId: updated._id.toString(), amountMinor: input.amountMinor, method: updated.method } }], { session });
      return this.dto(updated);
      });
    } catch (error: unknown) {
      if (!isTransactionContention(error)) throw error;
      const fresh = await payments.findById(ctx, id);
      if (!fresh) throw new NotFoundError();
      if (input.amountMinor > fresh.amountMinor - fresh.refundedMinor || fresh.status === 'refunded') {
        throw new ConflictError(ERROR_CODES.REFUND_EXCEEDS_PAID, 'Сумма возврата превышает невозвращённый остаток оплаты');
      }
      throw new ConflictError(ERROR_CODES.INVALID_PAYMENT_TRANSITION, 'Статус платежа уже изменился');
    }
  }

  private async dto(payment: PaymentDocument | Record<string, unknown>) {
    const row = payment as unknown as PaymentDocument;
    const user = await User.findById(row.createdBy).select({ name: 1 }).lean().exec();
    return {
      id: row._id.toString(), appointmentId: row.appointmentId.toString(), customerId: row.customerId.toString(), staffId: row.staffId.toString(),
      amountMinor: row.amountMinor, refundedMinor: row.refundedMinor, currency: row.currency, method: row.method, status: row.status,
      ...(row.paidAt ? { paidAt: row.paidAt.toISOString() } : {}), ...(row.notes ? { notes: row.notes } : {}),
      createdBy: { id: row.createdBy.toString(), name: user?.name ?? '' }, createdAt: row.createdAt.toISOString(),
    };
  }
}
