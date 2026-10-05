import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const localDate = z.iso.date();

export const DashboardQuerySchema = z.object({
  preset: z.enum(['today', 'week', 'month', 'last_month']).optional(),
  period: z.enum(['today', 'week', 'month', 'last_month']).optional(),
  from: localDate.optional(),
  to: localDate.optional(),
  staffId: id.optional(),
  compare: z.enum(['true', 'false']).optional(),
}).strict().superRefine((query, context) => {
  if (query.preset && query.period) context.addIssue({ code: 'custom', message: 'Укажите один вариант периода' });
  if ((query.from && !query.to) || (!query.from && query.to)) context.addIssue({ code: 'custom', message: 'from и to должны быть указаны вместе' });
  if ((query.preset || query.period) && (query.from || query.to)) context.addIssue({ code: 'custom', message: 'Укажите preset или диапазон дат' });
  if (query.from && query.to && (Date.parse(`${query.to}T00:00:00Z`) < Date.parse(`${query.from}T00:00:00Z`) || (Date.parse(`${query.to}T00:00:00Z`) - Date.parse(`${query.from}T00:00:00Z`)) / 86_400_000 > 365)) context.addIssue({ code: 'custom', message: 'Диапазон должен быть не больше 366 дней' });
});

export const DashboardUpcomingQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(20).default(10), staffId: id.optional() }).strict();
export const MasterDashboardQuerySchema = z.object({ date: localDate.optional() }).strict();
