import { DateTime } from 'luxon';
import type { TenantContext } from '@/shared/types/tenant-context';
import { Appointment, Business, Shift, Staff, Transaction } from '../db/models';
import { ValidationError } from '../http/errors';

function dayBounds(from: string, to: string, timezone: string) {
  const start = DateTime.fromISO(from, { zone: timezone }).startOf('day');
  const endExclusive = DateTime.fromISO(to, { zone: timezone }).plus({ days: 1 }).startOf('day');
  if (!start.isValid || !endExclusive.isValid) throw new ValidationError([], 'Некорректный период отчёта');
  return { start: start.toJSDate(), end: endExclusive.toJSDate() };
}

export class FinancialReportService {
  async get(ctx: TenantContext, from: string, to: string) {
    const business = await Business.findById(ctx.businessId).select('timezone currency').lean().exec();
    if (!business) throw new ValidationError([], 'Бизнес не найден');
    const { start, end } = dayBounds(from, to, business.timezone);
    const [transactions, completed, shifts] = await Promise.all([
      Transaction.find({ businessId: ctx.businessId, occurredAt: { $gte: start, $lt: end } }).select('direction amountMinor method').lean().exec(),
      Appointment.find({ businessId: ctx.businessId, status: 'completed', completedAt: { $gte: start, $lt: end } }).select('serviceSnapshot.costMinor').lean().exec(),
      Shift.find({ businessId: ctx.businessId, startedAt: { $lt: end }, $or: [{ closedAt: { $gt: start } }, { closedAt: { $exists: false } }] }).select('staffId startedAt closedAt hourlyRateMinor').lean().exec(),
    ]);
    const now = new Date();
    const incomeMinor = transactions.reduce((total, row) => total + (row.direction === 'in' ? row.amountMinor : 0), 0);
    const refundsMinor = transactions.reduce((total, row) => total + (row.direction === 'out' ? row.amountMinor : 0), 0);
    const materialCostMinor = completed.reduce((total, row) => total + (row.serviceSnapshot?.costMinor ?? 0), 0);
    const unpricedCostAppointments = completed.filter((row) => !Number.isSafeInteger(row.serviceSnapshot?.costMinor)).length;
    const staffIds = [...new Set(shifts.map((shift) => shift.staffId.toString()))];
    const staff = await Staff.find({ businessId: ctx.businessId, _id: { $in: staffIds } }).select('_id displayName').lean().exec();
    const staffNames = new Map(staff.map((row) => [row._id.toString(), row.displayName]));
    const payrollByStaff = new Map<string, { staffId: string; name: string; minutes: number; wageMinor: number }>();
    for (const shift of shifts) {
      const fromMs = Math.max(shift.startedAt.getTime(), start.getTime());
      const toMs = Math.min((shift.closedAt ?? now).getTime(), end.getTime(), now.getTime());
      if (toMs <= fromMs) continue;
      const elapsedMs = toMs - fromMs;
      const staffId = shift.staffId.toString();
      const current = payrollByStaff.get(staffId) ?? { staffId, name: staffNames.get(staffId) ?? 'Сотрудник', minutes: 0, wageMinor: 0 };
      current.minutes += Math.floor(elapsedMs / 60_000);
      current.wageMinor += Math.round(shift.hourlyRateMinor * elapsedMs / 3_600_000);
      payrollByStaff.set(staffId, current);
    }
    const payroll = [...payrollByStaff.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const payrollMinor = payroll.reduce((total, row) => total + row.wageMinor, 0);
    return {
      from, to, timezone: business.timezone, currency: business.currency,
      totals: { incomeMinor, refundsMinor, materialCostMinor, payrollMinor, netProfitMinor: unpricedCostAppointments === 0 ? incomeMinor - refundsMinor - materialCostMinor - payrollMinor : null, completedAppointments: completed.length, unpricedCostAppointments, paidOperations: transactions.filter((row) => row.direction === 'in').length, shifts: shifts.length },
      payroll,
    };
  }
}
