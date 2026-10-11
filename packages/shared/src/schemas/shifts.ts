import { z } from 'zod';

export const ShiftReportQuerySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
}).strict().refine((value) => value.from <= value.to, 'Дата окончания должна быть не раньше даты начала');

export const ShiftIdSchema = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }).strict();
export const FinancialReportQuerySchema = ShiftReportQuerySchema;
export const ActivityListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(30).default(10) }).strict();
export const AuditListQuerySchema = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional(), actorId: z.string().regex(/^[a-f\d]{24}$/i).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).strict().refine((value) => !value.from || !value.to || value.from <= value.to, 'Дата окончания должна быть не раньше даты начала');
