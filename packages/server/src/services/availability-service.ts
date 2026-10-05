import type { TenantContext } from '@/shared/types/tenant-context';
import { AvailabilityRepository } from '../repositories/availability-repository';
import { NotFoundError, ValidationError } from '../http/errors';
import { localDayBounds } from '../domain/time';
import { computeWorkingIntervals } from '../domain/booking-engine/working-intervals';
import { generateSlots } from '../domain/booking-engine/slots';
import { compareStaffLoad } from '../domain/booking-engine/candidates';

const repository = new AvailabilityRepository();

export class AvailabilityService {
  async get(ctx: TenantContext, input: { serviceId: string; staffId: string; date: string; enforceNotice: boolean; excludeAppointmentId?: string | undefined }) {
    const [business, settings, service] = await Promise.all([repository.findBusiness(ctx), repository.findSettings(ctx), repository.findService(ctx, input.serviceId)]);
    if (!business || !settings || !service) throw new NotFoundError();
    const dayBounds = localDayBounds(input.date, business.timezone);
    if (input.staffId !== 'any') {
      const staff = await repository.findStaff(ctx, input.staffId);
      if (!staff || !(await repository.staffProvidesService(ctx, input.staffId, input.serviceId))) throw new NotFoundError();
      return { date: input.date, timezone: business.timezone, slots: await this.staffSlots(ctx, input, business.timezone, settings, service, staff._id.toString(), dayBounds) };
    }

    const candidates = await repository.listBookableStaff(ctx, input.serviceId);
    const withLoad = await Promise.all(candidates.map(async (staff) => ({ staff, load: await repository.countStaffAppointmentsForDay(ctx, staff._id.toString(), dayBounds.from, dayBounds.to) })));
    withLoad.sort(compareStaffLoad);
    const unique = new Map<string, string>();
    for (const { staff } of withLoad) {
      const starts = await this.staffSlots(ctx, input, business.timezone, settings, service, staff._id.toString(), dayBounds);
      for (const start of starts) unique.set(start.startAt, start.startAt);
    }
    return { date: input.date, timezone: business.timezone, slots: [...unique.keys()].sort().map((startAt) => ({ startAt })) };
  }

  private async staffSlots(ctx: TenantContext, input: { serviceId: string; date: string; enforceNotice: boolean; excludeAppointmentId?: string | undefined }, timezone: string, settings: NonNullable<Awaited<ReturnType<AvailabilityRepository['findSettings']>>>, service: NonNullable<Awaited<ReturnType<AvailabilityRepository['findService']>>>, staffId: string, dayBounds: { from: Date; to: Date }) {
    const [schedule, exception, occupied] = await Promise.all([
      repository.findSchedule(ctx, staffId),
      repository.findException(ctx, staffId, input.date),
      repository.occupancies(ctx, staffId, dayBounds.from, dayBounds.to, input.excludeAppointmentId),
    ]);
    const working = computeWorkingIntervals(input.date, timezone, schedule?.weekly ?? [], exception ?? undefined);
    const slots = generateSlots(service.durationMinutes, service.bufferMinutes, working, settings.booking.slotStepMinutes, occupied, { timezone, now: new Date(), minNoticeMinutes: settings.booking.minNoticeMinutes, maxAdvanceDays: settings.booking.maxAdvanceDays, enforceNotice: input.enforceNotice });
    if (input.enforceNotice) {
      const latest = new Date();
      latest.setDate(latest.getDate() + settings.booking.maxAdvanceDays + 1);
      if (dayBounds.from > latest) throw new ValidationError([{ path: ['date'], message: 'Дата за пределами разрешённого периода записи' }]);
    }
    return slots.map((startAt) => ({ startAt: startAt.toISOString(), staffId }));
  }
}
