import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const amount = z.number().int().positive().refine(Number.isSafeInteger, 'amountMinor must be a safe integer');

export const CreatePaymentSchema = z.object({
  appointmentId: id,
  amountMinor: amount,
  method: z.enum(['cash', 'card', 'transfer', 'online']),
  status: z.enum(['paid', 'pending']).default('paid'),
  paidAt: z.iso.datetime().optional(),
  notes: z.string().trim().max(500).optional(),
}).strict();

export const MarkPaymentPaidSchema = z.object({
  paidAt: z.iso.datetime().optional(),
  method: z.enum(['cash', 'card', 'transfer', 'online']).optional(),
}).strict();

export const CancelPaymentSchema = z.object({ reason: z.string().trim().max(300).optional() }).strict();

export const RefundPaymentSchema = z.object({
  amountMinor: amount,
  note: z.string().trim().min(1).max(500),
}).strict();

export const PaymentListQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  method: z.enum(['cash', 'card', 'transfer', 'online']).optional(),
  status: z.enum(['pending', 'paid', 'refunded', 'cancelled']).optional(),
  staffId: id.optional(),
  customerId: id.optional(),
  q: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, 'to must not precede from');
