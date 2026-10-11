import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import type { TenantContext } from '@/shared/types/tenant-context';
import type { DashboardQuerySchema, DashboardUpcomingQuerySchema, MasterDashboardQuerySchema } from '@/shared/schemas/dashboard';
import type { z } from 'zod';
import { assertPermission } from '../domain/permissions';
import { previousPeriod as priorPeriod, resolvePeriod, utcBounds } from '../domain/dashboard-math';
import { NotFoundError } from '../http/errors';
import { DashboardRepository } from '../repositories/dashboard-repository';
import { PaymentRepository } from '../repositories/payment-repository';
import { CalendarService } from './calendar-service';

const repository = new DashboardRepository();
const paymentRepository = new PaymentRepository();
const calendar = new CalendarService();
type SummaryQuery = z.infer<typeof DashboardQuerySchema>;
type UpcomingQuery = z.infer<typeof DashboardUpcomingQuerySchema>;
type MasterQuery = z.infer<typeof MasterDashboardQuerySchema>;

export class DashboardService {
  async summary(ctx: TenantContext, query: SummaryQuery) {
    assertPermission(ctx.role, 'dashboard:read');
    const business = await repository.findBusiness(ctx);
    if (!business) throw new NotFoundError();
    if (query.staffId && !(await repository.staffExists(ctx, query.staffId))) throw new NotFoundError();
    const selectedPreset = query.preset ?? query.period;
    const period = resolvePeriod(business.timezone, { ...(selectedPreset ? { preset: selectedPreset } : {}), ...(query.from ? { from: query.from } : {}), ...(query.to ? { to: query.to } : {}) });
    const bounds = utcBounds(period);
    const [revenue, appointments, newCustomers] = await Promise.all([
      repository.revenue(ctx, bounds.from, bounds.to, query.staffId),
      repository.appointmentStats(ctx, bounds.from, bounds.to, query.staffId),
      repository.newCustomers(ctx, bounds.from, bounds.to),
    ]);
    let previous: { revenue: Awaited<ReturnType<DashboardRepository['revenue']>>; appointments: Awaited<ReturnType<DashboardRepository['appointmentStats']>>; newCustomers: number } | undefined;
    if (query.compare === 'true') {
      const previousBounds = utcBounds(priorPeriod(period));
      const [previousRevenue, previousAppointments, previousCustomers] = await Promise.all([
        repository.revenue(ctx, previousBounds.from, previousBounds.to, query.staffId),
        repository.appointmentStats(ctx, previousBounds.from, previousBounds.to, query.staffId),
        repository.newCustomers(ctx, previousBounds.from, previousBounds.to),
      ]);
      previous = { revenue: previousRevenue, appointments: previousAppointments, newCustomers: previousCustomers };
    }
    return {
      period: { from: period.from.toISODate(), to: period.to.minus({ days: 1 }).toISODate(), timezone: business.timezone },
      revenue: { ...revenue, currency: business.currency }, appointments, newCustomers,
      ...(previous ? { previous: { ...previous, revenue: { ...previous.revenue, currency: business.currency } } } : {}),
    };
  }

  async upcoming(ctx: TenantContext, query: UpcomingQuery) {
    assertPermission(ctx.role, 'dashboard:read');
    if (query.staffId && !(await repository.staffExists(ctx, query.staffId))) throw new NotFoundError();
    const rows = await repository.upcoming(ctx, new Date(), query.limit, query.staffId);
    const [customers, staff] = await repository.references(ctx, [...new Set(rows.map((row) => row.customerId.toString()))].map((id) => new Types.ObjectId(id)), [...new Set(rows.map((row) => row.staffId.toString()))].map((id) => new Types.ObjectId(id)));
    const paymentBalances = await paymentRepository.appointmentBalances(ctx, rows);
    const customerMap = new Map(customers.map((row) => [row._id.toString(), row]));
    const staffMap = new Map(staff.map((row) => [row._id.toString(), row]));
    return rows.flatMap((row) => {
      const customer = customerMap.get(row.customerId.toString());
      const member = staffMap.get(row.staffId.toString());
      if (!customer || !member) return [];
      return [{ id: row._id.toString(), customer: { id: customer._id.toString(), firstName: customer.firstName, ...(customer.lastName ? { lastName: customer.lastName } : {}), phone: customer.phone, ...(customer.email ? { email: customer.email } : {}) }, staff: { id: member._id.toString(), displayName: member.displayName, color: member.color }, service: { id: row.serviceId.toString(), name: row.serviceSnapshot.name }, startAt: row.startAt.toISOString(), endAt: row.endAt.toISOString(), blockedUntilAt: row.blockedUntilAt.toISOString(), status: row.status, source: row.source, serviceSnapshot: row.serviceSnapshot, ...(row.customerNote ? { customerNote: row.customerNote } : {}), rescheduleCount: row.rescheduleCount, payment: paymentBalances.get(row._id.toString()) }];
    });
  }

  async master(ctx: TenantContext, query: MasterQuery) {
    assertPermission(ctx.role, 'dashboard:read_own');
    if (!ctx.staffId) throw new NotFoundError();
    const initial = await calendar.get(ctx, { view: 'day', ...(query.date ? { date: query.date } : {}) });
    const timezone = initial.range.timezone;
    const date = query.date ?? DateTime.now().setZone(timezone).toISODate() ?? '';
    const localDay = DateTime.fromISO(date, { zone: timezone }).startOf('day');
    if (!localDay.isValid || localDay.toISODate() !== date) throw new RangeError('Invalid dashboard date');
    const month = localDay.startOf('month');
    const dayBounds = utcBounds({ from: localDay, to: localDay.plus({ days: 1 }) });
    const weekBounds = utcBounds({ from: localDay, to: localDay.plus({ days: 7 }) });
    const monthBounds = utcBounds({ from: month, to: month.plus({ months: 1 }) });
    const upcomingFrom = DateTime.now().setZone(timezone).toISODate() === date ? new Date() : dayBounds.from;
    const [, upcoming, monthCounts] = await Promise.all([
      repository.appointmentRows(ctx, ctx.staffId, dayBounds.from, dayBounds.to),
      repository.appointmentRows(ctx, ctx.staffId, upcomingFrom, weekBounds.to),
      repository.ownCounts(ctx, ctx.staffId, monthBounds.from, monthBounds.to),
    ]);
    // CAL-01 delegates booked and available time to the shared booking-engine working interval calculation.
    const dayViews = await Promise.all(Array.from({ length: 7 }, (_, offset) => calendar.get(ctx, { view: 'day', date: localDay.plus({ days: offset }).toISODate() ?? date })));
    const load = dayViews[0]?.load.find((item) => item.staffId === ctx.staffId);
    const todayDtos = initial.appointments;
    const upcomingIds = new Set(upcoming.map((row) => row._id.toString()));
    const upcomingDtos = dayViews.flatMap((view) => view.appointments).filter((row) => upcomingIds.has(row.id) && ['pending', 'confirmed'].includes(row.status)).slice(0, 20);
    return {
      date, today: todayDtos, upcoming: upcomingDtos,
      counts: { todayTotal: todayDtos.length, completedThisMonth: monthCounts.get('completed') ?? 0, noShowThisMonth: monthCounts.get('no_show') ?? 0 },
      load: load ? { bookedMinutes: load.bookedMinutes, availableMinutes: load.availableMinutes, loadPercent: load.loadPercent } : { bookedMinutes: 0, availableMinutes: 0, loadPercent: null },
    };
  }
}
