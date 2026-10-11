import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import type { TenantContext } from '@/shared/types/tenant-context';
import type { CalendarQuerySchema } from '@/shared/schemas/calendar';
import type { z } from 'zod';
import { localDayBounds } from '../domain/time';
import { computeWorkingIntervals } from '../domain/booking-engine/working-intervals';
import { NotFoundError } from '../http/errors';
import { CalendarRepository } from '../repositories/calendar-repository';
import { PaymentRepository } from '../repositories/payment-repository';

const repository = new CalendarRepository();
const paymentRepository = new PaymentRepository();
type CalendarQuery = z.infer<typeof CalendarQuerySchema>;
type MinuteRange = { start: number; end: number };

function withoutMoney(snapshot: Record<string, unknown>) {
  const visible = { ...snapshot };
  delete visible.costMinor;
  delete visible.priceMinor;
  delete visible.currency;
  return visible;
}

function subtractRange(ranges: MinuteRange[], cut: MinuteRange): MinuteRange[] {
  return ranges.flatMap((range) => {
    if (cut.end <= range.start || cut.start >= range.end) return [range];
    return [
      ...(cut.start > range.start ? [{ start: range.start, end: cut.start }] : []),
      ...(cut.end < range.end ? [{ start: cut.end, end: range.end }] : []),
    ];
  });
}

function durationInMinutes(startAt: Date, endAt: Date, from: Date, to: Date): number {
  const start = Math.max(startAt.getTime(), from.getTime());
  const end = Math.min(endAt.getTime(), to.getTime());
  return Math.max(0, Math.floor((end - start) / 60_000));
}

export class CalendarService {
  async get(ctx: TenantContext, query: CalendarQuery) {
    const business = await repository.findBusiness(ctx);
    if (!business) throw new NotFoundError();
    const timezone = business.timezone;
    const requestedDate = query.date ?? DateTime.now().setZone(timezone).toISODate() ?? '';
    let fromLocal = DateTime.fromISO(requestedDate, { zone: timezone });
    if (!fromLocal.isValid || fromLocal.toISODate() !== requestedDate) throw new RangeError('Invalid calendar date or timezone');
    if (query.view === 'week') fromLocal = fromLocal.startOf('week');
    const days = query.view === 'week' ? 7 : 1;
    const from = fromLocal.startOf('day').toUTC().toJSDate();
    const to = fromLocal.plus({ days }).startOf('day').toUTC().toJSDate();
    const startDate = fromLocal.toISODate() ?? requestedDate;
    const endDate = fromLocal.plus({ days }).toISODate() ?? requestedDate;
    const explicitIds = query.staffIds ? (Array.isArray(query.staffIds) ? query.staffIds : [query.staffIds]) : query.staffId ? [query.staffId] : undefined;
    if (ctx.role === 'master' && explicitIds?.some((id) => id !== ctx.staffId)) throw new NotFoundError();
    const scopedIds = ctx.role === 'master' ? [ctx.staffId ?? ''] : explicitIds;
    const staff = await repository.listStaff(ctx, scopedIds);
    if (explicitIds && staff.length !== new Set(explicitIds).size) throw new NotFoundError();
    const staffIds = staff.map((item) => item._id.toString());
    const [appointments, blockedPeriods, schedules, exceptions, settings] = staffIds.length ? await Promise.all([
      repository.listAppointments(ctx, staffIds, from, to, query.includeCancelled === 'true'),
      repository.listBlocks(ctx, staffIds, from, to),
      repository.listSchedules(ctx, staffIds),
      repository.listExceptions(ctx, staffIds, startDate, endDate),
      repository.findSettings(ctx),
    ]) : [[], [], [], [], await repository.findSettings(ctx)];
    const references = await repository.listReferences(ctx, [...new Set(appointments.map((row) => row.customerId.toString()))].map((id) => new Types.ObjectId(id)), [...new Set(appointments.map((row) => row.serviceId.toString()))].map((id) => new Types.ObjectId(id)));
    const paymentBalances = ctx.role === 'master' ? undefined : await paymentRepository.appointmentBalances(ctx, appointments);
    const appointmentDtos = appointments.flatMap((row) => {
      const customer = references.customers.get(row.customerId.toString());
      const service = references.services.get(row.serviceId.toString());
      const staffRow = staff.find((item) => item._id.equals(row.staffId));
      if (!customer || !service || !staffRow) return [];
      return [{
        id: row._id.toString(),
        customer: { id: customer._id.toString(), firstName: customer.firstName, ...(customer.lastName ? { lastName: customer.lastName } : {}), ...(ctx.role === 'master' ? (settings?.privacy.masterSeesCustomerPhone ? { phone: customer.phone } : {}) : { phone: customer.phone, ...(customer.email ? { email: customer.email } : {}) }) },
        staff: { id: staffRow._id.toString(), displayName: staffRow.displayName, color: staffRow.color },
        service: { id: service._id.toString(), name: service.name },
        startAt: row.startAt.toISOString(), endAt: row.endAt.toISOString(), blockedUntilAt: row.blockedUntilAt.toISOString(), status: row.status, source: row.source,
        serviceSnapshot: ctx.role === 'master' ? withoutMoney(row.serviceSnapshot as unknown as Record<string, unknown>) : row.serviceSnapshot,
        ...(row.customerNote ? { customerNote: row.customerNote } : {}),
        ...(ctx.role !== 'master' && row.internalNote ? { internalNote: row.internalNote } : {}),
        ...(ctx.role === 'master' && row.visitNote ? { visitNote: row.visitNote } : {}),
        rescheduleCount: row.rescheduleCount,
        ...(ctx.role === 'master' ? {} : { payment: paymentBalances?.get(row._id.toString()) }),
      }];
    });
    const scheduleMap = new Map(schedules.map((item) => [item.staffId.toString(), item.weekly]));
    const exceptionMap = new Map(exceptions.map((item) => [`${item.staffId.toString()}:${item.date}`, item]));
    const workingIntervals: { staffId: string; date: string; intervals: { start: string; end: string }[] }[] = [];
    const loadByStaff = new Map(staff.map((item) => [item._id.toString(), { bookedMinutes: 0, availableMinutes: 0 }]));
    for (let offset = 0; offset < days; offset += 1) {
      const localDay = fromLocal.plus({ days: offset });
      const date = localDay.toISODate() ?? requestedDate;
      const dayBounds = localDayBounds(date, timezone);
      for (const member of staff) {
        const staffId = member._id.toString();
        const exception = exceptionMap.get(`${staffId}:${date}`);
        let ranges = computeWorkingIntervals(date, timezone, scheduleMap.get(staffId) ?? [], exception ? { kind: exception.kind, intervals: exception.intervals, breaks: exception.breaks } : undefined);
        const dayBlocks = blockedPeriods.filter((block) => block.staffId.equals(member._id) && block.startAt < dayBounds.to && block.endAt > dayBounds.from);
        let minutes = ranges.map((range) => ({ start: range.startAt.getTime(), end: range.endAt.getTime() }));
        for (const block of dayBlocks) minutes = subtractRange(minutes, { start: Math.max(block.startAt.getTime(), dayBounds.from.getTime()), end: Math.min(block.endAt.getTime(), dayBounds.to.getTime()) });
        ranges = minutes.map((range) => ({ startAt: new Date(range.start), endAt: new Date(range.end) }));
        workingIntervals.push({ staffId, date, intervals: ranges.map((range) => ({ start: range.startAt.toISOString(), end: range.endAt.toISOString() })) });
        const load = loadByStaff.get(staffId);
        if (load) load.availableMinutes += minutes.reduce((total, range) => total + Math.floor((range.end - range.start) / 60_000), 0);
      }
      for (const row of appointmentDtos) {
        const appointmentStart = new Date(row.startAt);
        if (appointmentStart < dayBounds.from || appointmentStart >= dayBounds.to || !['pending', 'confirmed', 'completed'].includes(row.status)) continue;
        const load = loadByStaff.get(row.staff.id);
        if (load) load.bookedMinutes += durationInMinutes(appointmentStart, new Date(row.endAt), dayBounds.from, dayBounds.to);
      }
    }
    const load = staff.map((member) => {
      const value = loadByStaff.get(member._id.toString()) ?? { bookedMinutes: 0, availableMinutes: 0 };
      return { staffId: member._id.toString(), ...value, loadPercent: value.availableMinutes === 0 ? null : Math.min(100, Math.round(value.bookedMinutes / value.availableMinutes * 100)) };
    });
    return {
      range: { from: from.toISOString(), to: to.toISOString(), timezone },
      staff: staff.map((item) => ({ id: item._id.toString(), displayName: item.displayName, color: item.color })),
      appointments: appointmentDtos,
      blockedPeriods: blockedPeriods.map((block) => ({ id: block._id.toString(), staffId: block.staffId.toString(), startAt: block.startAt.toISOString(), endAt: block.endAt.toISOString(), ...(block.reason ? { reason: block.reason } : {}) })),
      workingIntervals,
      load,
    };
  }
}
