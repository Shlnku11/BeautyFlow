import type { Express } from 'express';
import { z } from 'zod';
import type { TenantContext } from '@/shared/types/tenant-context';
import { CancelPaymentSchema, CreatePaymentSchema, MarkPaymentPaidSchema, PaymentListQuerySchema, RefundPaymentSchema } from '@/shared/schemas/payments';
import { ValidationError } from './errors';
import { defineExpressRoute } from './define-express-route';
import { PaymentService } from '../services/payment-service';

const service = new PaymentService();
const idParams = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }).strict();
export const IMPLEMENTED_PAYMENT_ROUTE_IDS = new Set(['PAY-01', 'PAY-02', 'PAY-04', 'PAY-05', 'PAY-06']);

export function registerPaymentRoutes(app: Express): void {
  app.get('/api/payments', defineExpressRoute({ id: 'PAY-01', method: 'GET', path: '/api/payments', auth: 'session', permission: 'payments:read', contextSource: 'SESSION', querySchema: PaymentListQuerySchema, handler: async ({ context, query }) => {
    const result = await service.list(context as TenantContext, query);
    return Response.json({ data: result.data, meta: result.meta });
  } }));

  app.post('/api/payments', defineExpressRoute({ id: 'PAY-02', method: 'POST', path: '/api/payments', auth: 'session', permission: 'payments:create', contextSource: 'SESSION', bodySchema: CreatePaymentSchema, handler: async ({ context, body, request }) => {
    const key = request.headers.get('idempotency-key')?.trim();
    if (!key || key.length > 80) throw new ValidationError([], 'Требуется корректный заголовок Idempotency-Key');
    const result = await service.create(context as TenantContext, body, key);
    return Response.json({ data: result.payment }, { status: result.statusCode });
  } }));

  app.post('/api/payments/:id/mark-paid', defineExpressRoute({ id: 'PAY-04', method: 'POST', path: '/api/payments/:id/mark-paid', auth: 'session', permission: 'payments:create', contextSource: 'SESSION', paramsSchema: idParams, bodySchema: MarkPaymentPaidSchema, handler: ({ context, params, body }) => service.markPaid(context as TenantContext, params.id, body) }));
  app.post('/api/payments/:id/cancel', defineExpressRoute({ id: 'PAY-05', method: 'POST', path: '/api/payments/:id/cancel', auth: 'session', permission: 'payments:cancel', contextSource: 'SESSION', paramsSchema: idParams, bodySchema: CancelPaymentSchema, handler: ({ context, params, body }) => service.cancel(context as TenantContext, params.id, body.reason) }));
  app.post('/api/payments/:id/refund', defineExpressRoute({ id: 'PAY-06', method: 'POST', path: '/api/payments/:id/refund', auth: 'session', permission: 'payments:refund', contextSource: 'SESSION', paramsSchema: idParams, bodySchema: RefundPaymentSchema, handler: ({ context, params, body }) => service.refund(context as TenantContext, params.id, body) }));
}
