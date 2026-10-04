import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import type { z } from 'zod';
import type { TenantContext } from '@/shared/types/tenant-context';
import type { CreateAppointmentSchema } from '@/shared/schemas/appointments';
import { ERROR_CODES } from '@/shared/error-codes';
import { normalizePhone } from '../domain/phone';
import { occupiedKeysFor } from '../domain/booking-engine/occupancy';
import { localDayBounds } from '../domain/time';
import { withTransaction } from '../db/transactions';
import { AppError, ConflictError, NotFoundError } from '../http/errors';
import { AvailabilityService } from './availability-service';
import { AppointmentRepository } from '../repositories/appointment-repository';

const repository = new AppointmentRepository();
const availability = new AvailabilityService();
type CreateInput = z.infer<typeof CreateAppointmentSchema>;

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function toDto(appointment: Record<string, unknown>, customer: Record<string, unknown>, staff: Record<string, unknown>, service: Record<string, unknown>) {
  const snapshot = appointment.serviceSnapshot as { name: string; durationMinutes: number; priceMinor: number; currency: string };
  return {
    id: String(appointment._id),
    customer: { id: String(customer._id), firstName: customer.firstName, ...(typeof customer.lastName === 'string' ? { lastName: customer.lastName } : {}), phone: customer.phone, ...(typeof customer.email === 'string' ? { email: customer.email } : {}) },
    staff: { id: String(staff._id), displayName: staff.displayName, color: staff.color },
    service: { id: String(service._id), name: service.name },
    startAt: (appointment.startAt as Date).toISOString(),
    endAt: (appointment.endAt as Date).toISOString(),
    blockedUntilAt: (appointment.blockedUntilAt as Date).toISOString(),
    status: appointment.status,
    source: appointment.source,
    serviceSnapshot: snapshot,
    ...(typeof appointment.customerNote === 'string' ? { customerNote: appointment.customerNote } : {}),
    ...(typeof appointment.internalNote === 'string' ? { internalNote: appointment.internalNote } : {}),
    rescheduleCount: appointment.rescheduleCount,
    payment: { paidMinor: 0, refundedMinor: 0, balanceMinor: snapshot.priceMinor },
  };
}

export class AppointmentService {
  async create(ctx: TenantContext, input: CreateInput, idempotencyKey?: string): Promise<{ appointment: unknown; statusCode: 200 | 201 }> {
    if (idempotencyKey && idempotencyKey.length > 80) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 422, 'Idempotency-Key не должен превышать 80 символов');
    if (idempotencyKey) {
      const previous = await repository.findIdempotent(ctx, idempotencyKey);
      if (previous) return { appointment: await this.renderExisting(ctx, previous), statusCode: 200 };
    }
    const startAt = new Date(input.startAt);
    if (startAt.getTime() % 300_000 !== 0) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 422, 'Время записи должно быть кратно пяти минутам');
    const [business, settings, service] = await Promise.all([repository.findBusiness(ctx), repository.findSettings(ctx), repository.findService(ctx, input.serviceId)]);
    if (!business || !settings || !service) throw new NotFoundError();
    const localDate = DateTime.fromJSDate(startAt, { zone: business.timezone }).toISODate();
    if (!localDate) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 422, 'Некорректная дата записи');
    const available = await availability.get(ctx, { serviceId: input.serviceId, staffId: input.staffId, date: localDate, enforceNotice: input.enforceNotice ?? false });
    if (!available.slots.some((slot) => slot.startAt === startAt.toISOString())) throw new ConflictError(ERROR_CODES.SLOT_UNAVAILABLE, 'Это время уже занято');

    let candidates: Array<NonNullable<Awaited<ReturnType<AppointmentRepository['findStaff']>>>>;
    if (input.staffId === 'any') {
      const values = await repository.listCandidates(ctx, input.serviceId);
      const bounds = localDayBounds(localDate, business.timezone);
      const counts = await Promise.all(values.map(async (staff) => ({ staff, count: await repository.countStaffAppointmentsForDay(ctx, staff._id.toString(), bounds.from, bounds.to) })));
      counts.sort((a, b) => a.count - b.count || a.staff.displayOrder - b.staff.displayOrder || a.staff._id.toString().localeCompare(b.staff._id.toString()));
      candidates = counts.map(({ staff }) => staff);
    } else {
      if (!(await repository.staffProvidesService(ctx, input.staffId, input.serviceId))) throw new AppError(ERROR_CODES.STAFF_DOES_NOT_PROVIDE_SERVICE, 422, 'Сотрудник не оказывает эту услугу');
      const staff = await repository.findStaff(ctx, input.staffId);
      if (!staff) throw new NotFoundError();
      candidates = [staff];
    }

    let customer = input.customerId ? await repository.findCustomer(ctx, input.customerId) : null;
    if (input.customerId && !customer) throw new NotFoundError('Клиент не найден');
    const newPhoneNormalized = input.newCustomer ? normalizePhone(input.newCustomer.phone, business.countryCode) : undefined;
    if (input.newCustomer && newPhoneNormalized) customer = await repository.findCustomerByPhone(ctx, newPhoneNormalized);
    if (candidates.length === 0) throw new NotFoundError('Нет доступных сотрудников для услуги');

    for (const staff of candidates) {
      try {
        const result = await withTransaction(async (session) => {
          const versionUpdate = await repository.incrementBookingVersion(ctx, staff._id.toString(), staff.bookingVersion, session);
          if (versionUpdate.modifiedCount !== 1) throw new ConflictError(ERROR_CODES.SLOT_UNAVAILABLE, 'Расписание изменилось, обновите список времени');
          const durationMs = service.durationMinutes * 60_000;
          const endAt = new Date(startAt.getTime() + durationMs);
          const blockedUntilAt = new Date(endAt.getTime() + service.bufferMinutes * 60_000);
          if (await repository.hasOverlap(ctx, staff._id.toString(), startAt, blockedUntilAt, session) || await repository.hasBlockOverlap(ctx, staff._id.toString(), startAt, blockedUntilAt, session)) throw new ConflictError(ERROR_CODES.SLOT_UNAVAILABLE, 'Это время уже занято');
          let actualCustomer = customer;
          if (input.newCustomer && newPhoneNormalized && !actualCustomer) {
            const duplicate = await repository.findCustomerByPhone(ctx, newPhoneNormalized, session);
            if (duplicate) actualCustomer = duplicate;
            else {
              const value = input.newCustomer;
              const customerData: Record<string, unknown> = { firstName: value.firstName, phone: value.phone, phoneNormalized: newPhoneNormalized, searchTokens: [value.firstName.toLocaleLowerCase('ru'), newPhoneNormalized.replace(/\D/g, '')] };
              if (value.lastName !== undefined) { customerData.lastName = value.lastName; customerData.searchTokens = [...(customerData.searchTokens as string[]), value.lastName.toLocaleLowerCase('ru')]; }
              if (value.email !== undefined) { customerData.email = value.email; customerData.emailNormalized = value.email.toLocaleLowerCase('en'); }
              if (value.contacts !== undefined) customerData.contacts = value.contacts;
              if (value.notes !== undefined) customerData.notes = value.notes;
              actualCustomer = await repository.createCustomer(ctx, customerData, session) as unknown as NonNullable<typeof actualCustomer>;
            }
          }
          if (!actualCustomer) throw new NotFoundError('Клиент не найден');
          const snapshot = { name: service.name, durationMinutes: service.durationMinutes, priceMinor: service.priceMinor, currency: service.currency };
          const appointment = await repository.create(ctx, {
            customerId: actualCustomer._id,
            staffId: staff._id,
            serviceId: service._id,
            startAt,
            endAt,
            bufferMinutes: service.bufferMinutes,
            blockedUntilAt,
            occupiedKeys: occupiedKeysFor(staff._id.toString(), startAt, blockedUntilAt),
            status: input.status ?? (settings.booking.autoConfirm ? 'confirmed' : 'pending'),
            source: 'internal',
            serviceSnapshot: snapshot,
            rescheduleCount: 0,
            ...(actualCustomer.email ? { contactEmail: actualCustomer.email } : {}),
            ...(input.customerNote ? { customerNote: input.customerNote } : {}),
            ...(input.internalNote ? { internalNote: input.internalNote } : {}),
            ...(idempotencyKey ? { idempotencyKey } : {}),
            createdBy: new Types.ObjectId(ctx.userId),
          }, session);
          return { dto: toDto(appointment.toObject() as unknown as Record<string, unknown>, actualCustomer as unknown as Record<string, unknown>, staff as unknown as Record<string, unknown>, service as unknown as Record<string, unknown>), statusCode: 201 as const };
        });
        return { appointment: result.dto, statusCode: result.statusCode };
      } catch (error: unknown) {
        if (!isDuplicateKey(error)) throw error;
        if (idempotencyKey) {
          const previous = await repository.findIdempotent(ctx, idempotencyKey);
          if (previous) return { appointment: await this.renderExisting(ctx, previous), statusCode: 200 };
        }
        if (input.staffId !== 'any' || staff === candidates[candidates.length - 1]) throw new ConflictError(ERROR_CODES.SLOT_UNAVAILABLE, 'Это время только что заняли');
      }
    }
    throw new ConflictError(ERROR_CODES.SLOT_UNAVAILABLE, 'Это время только что заняли');
  }

  private async renderExisting(ctx: TenantContext, appointment: NonNullable<Awaited<ReturnType<AppointmentRepository['findIdempotent']>>>) {
    const refs = await repository.findReferences(ctx, appointment);
    if (!refs) throw new NotFoundError();
    return toDto(appointment as unknown as Record<string, unknown>, refs.customer as unknown as Record<string, unknown>, refs.staff as unknown as Record<string, unknown>, refs.service as unknown as Record<string, unknown>);
  }
}
