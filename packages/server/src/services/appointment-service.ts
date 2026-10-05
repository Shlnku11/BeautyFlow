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
import { canTransitionStatus, type AppointmentStatus } from '../domain/booking-engine/transitions';
import { assertPermission } from '../domain/permissions';
import { Notification } from '../db/models';

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
  private async enqueueEmail(ctx: TenantContext, session: import('mongoose').ClientSession, appointmentId: unknown, customerId: unknown, email: string | undefined, name: string, kind: 'appointment_confirmed' | 'appointment_changed' | 'appointment_cancelled' | 'reminder_24h' | 'reminder_1h' | 'followup_after_visit', scheduledFor: Date, dedupeSuffix: string, enabled: boolean) {
    if (!email || !enabled) return;
    await Notification.updateOne({ businessId: ctx.businessId, dedupeKey: `email:${kind}:${String(appointmentId)}:${dedupeSuffix}` }, { $setOnInsert: { businessId: ctx.businessId, appointmentId, customerId, channel: 'email', kind, recipient: { email, name }, status: 'scheduled', scheduledFor, nextAttemptAt: scheduledFor, attempts: 0, maxAttempts: 5, dedupeKey: `email:${kind}:${String(appointmentId)}:${dedupeSuffix}` } }, { upsert: true, session }).exec();
  }

  private async enqueueConfirmed(ctx: TenantContext, session: import('mongoose').ClientSession, appointmentId: unknown, customerId: unknown, email: string | undefined, name: string, startAt: Date, settings: NonNullable<Awaited<ReturnType<AppointmentRepository['findSettings']>>>) {
    const now = new Date();
    const epoch = String(startAt.getTime());
    await this.enqueueEmail(ctx, session, appointmentId, customerId, email, name, 'appointment_confirmed', now, '0', settings.notifications.emailEnabled && settings.notifications.confirmationEnabled);
    for (const [kind, offset, enabled] of [['reminder_24h', 86_400_000, settings.notifications.reminder24hEnabled], ['reminder_1h', 3_600_000, settings.notifications.reminder1hEnabled]] as const) {
      const scheduledFor = new Date(startAt.getTime() - offset);
      if (scheduledFor > now) await this.enqueueEmail(ctx, session, appointmentId, customerId, email, name, kind, scheduledFor, epoch, settings.notifications.emailEnabled && enabled);
    }
  }

  async list(ctx: TenantContext, query: Record<string, unknown>) {
    const filter: Record<string, unknown> = {};
    if (ctx.role === 'master') filter.staffId = ctx.staffId;
    for (const key of ['staffId', 'customerId', 'serviceId', 'source'] as const) if (typeof query[key] === 'string') filter[key] = query[key];
    if (typeof query.from === 'string' || typeof query.to === 'string') filter.startAt = { ...(typeof query.from === 'string' ? { $gte: new Date(query.from) } : {}), ...(typeof query.to === 'string' ? { $lt: new Date(query.to) } : {}) };
    if (query.status) filter.status = Array.isArray(query.status) ? { $in: query.status } : query.status;
    const rows = await repository.list(ctx, filter, ((query.page as number) - 1) * (query.limit as number), query.limit as number);
    const result = await Promise.all(rows.map(async (row) => this.renderExisting(ctx, row)));
    return result.map((value) => ctx.role === 'master' ? this.masterDto(value) : value);
  }

  async get(ctx: TenantContext, id: string) {
    const row = await repository.findById(ctx, id);
    if (!row || (ctx.role === 'master' && String(row.staffId) !== ctx.staffId)) throw new NotFoundError();
    const dto = await this.renderExisting(ctx, row);
    return ctx.role === 'master' ? this.masterDto(dto) : dto;
  }

  private masterDto(value: unknown) {
    const dto = value as Record<string, unknown>;
    const customer = dto.customer as Record<string, unknown>;
    return { ...dto, customer: { id: customer.id, firstName: customer.firstName, ...(typeof customer.lastName === 'string' ? { lastName: customer.lastName } : {}) }, payment: undefined, internalNote: undefined };
  }

  async update(ctx: TenantContext, id: string, input: Record<string, unknown>) {
    const row = await repository.findById(ctx, id);
    if (!row || (ctx.role === 'master' && String(row.staffId) !== ctx.staffId)) throw new NotFoundError();
    if (ctx.role === 'master') {
      assertPermission(ctx.role, 'appointments:visit_note');
      if (Object.keys(input).some((key) => key !== 'visitNote')) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 422, 'Мастер может изменить только заметку после визита');
    }
    const set: Record<string, unknown> = {};
    for (const key of ['customerNote', 'internalNote', 'visitNote'] as const) if (input[key] !== undefined) set[key] = input[key];
    if (ctx.role !== 'master' && (input.serviceId || input.staffId)) {
      const serviceId = String(input.serviceId ?? row.serviceId);
      const staffId = String(input.staffId ?? row.staffId);
      const [service, staff] = await Promise.all([repository.findServiceById(ctx, serviceId), repository.findStaffById(ctx, staffId)]);
      if (!service || !staff) throw new NotFoundError();
      if (!(await repository.staffProvidesService(ctx, staffId, serviceId))) throw new AppError(ERROR_CODES.STAFF_DOES_NOT_PROVIDE_SERVICE, 422, 'Сотрудник не оказывает эту услугу');
      const startAt = row.startAt;
      const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
      const blockedUntilAt = new Date(endAt.getTime() + service.bufferMinutes * 60_000);
      const available = await availability.get(ctx, { serviceId, staffId, date: DateTime.fromJSDate(startAt, { zone: (await repository.findBusiness(ctx))?.timezone ?? 'UTC' }).toISODate() ?? '', enforceNotice: false, excludeAppointmentId: id });
      if (!available.slots.some((slot) => slot.startAt === startAt.toISOString())) throw new ConflictError(ERROR_CODES.SLOT_UNAVAILABLE, 'Это время уже занято');
      set.staffId = staff._id; set.serviceId = service._id; set.endAt = endAt; set.blockedUntilAt = blockedUntilAt; set.bufferMinutes = service.bufferMinutes;
      set.serviceSnapshot = { name: service.name, durationMinutes: service.durationMinutes, priceMinor: service.priceMinor, currency: service.currency };
      // BOOKING_ENGINE_SPEC §5.2: occupiedKeys must be recomputed whenever staff, duration, or buffer changes.
      set.occupiedKeys = occupiedKeysFor(staffId, startAt, blockedUntilAt);
    }
    const changed = await withTransaction(async (session) => {
      const previousStaff = String(row.staffId);
      const nextStaff = String(set.staffId ?? row.staffId);
      if (nextStaff !== previousStaff) {
        const [a, b] = await Promise.all([repository.findStaffById(ctx, previousStaff, session), repository.findStaffById(ctx, nextStaff, session)]);
        if (!a || !b) throw new NotFoundError();
        for (const staff of [a, b]) if ((await repository.incrementBookingVersion(ctx, staff._id.toString(), staff.bookingVersion, session)).modifiedCount !== 1) throw new ConflictError(ERROR_CODES.SLOT_UNAVAILABLE, 'Расписание изменилось');
      }
      if (set.staffId && (await repository.hasOverlap(ctx, nextStaff, row.startAt, set.blockedUntilAt as Date, session, id) || await repository.hasBlockOverlap(ctx, nextStaff, row.startAt, set.blockedUntilAt as Date, session))) throw new ConflictError(ERROR_CODES.SLOT_UNAVAILABLE, 'Это время уже занято');
      return repository.updateById(ctx, id, { $set: set }, session);
    });
    if (!changed) throw new NotFoundError();
    return this.get(ctx, id);
  }

  async reschedule(ctx: TenantContext, id: string, input: Record<string, unknown>) {
    const row = await repository.findById(ctx, id);
    if (!row) throw new NotFoundError();
    const staffId = String(input.staffId ?? row.staffId);
    const staff = await repository.findStaffById(ctx, staffId);
    const service = await repository.findServiceById(ctx, String(row.serviceId));
    const business = await repository.findBusiness(ctx);
    if (!staff || !service || !business) throw new NotFoundError();
    const startAt = new Date(String(input.startAt));
    if (startAt.getTime() % 300_000 !== 0) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 422, 'Время должно быть кратно пяти минутам');
    const date = DateTime.fromJSDate(startAt, { zone: business.timezone }).toISODate() ?? '';
    const slots = await availability.get(ctx, { serviceId: String(row.serviceId), staffId, date, enforceNotice: input.enforceNotice === true, excludeAppointmentId: id });
    if (!slots.slots.some((slot) => slot.startAt === startAt.toISOString())) throw new ConflictError(ERROR_CODES.SLOT_UNAVAILABLE, 'Это время уже занято');
    const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
    const blockedUntilAt = new Date(endAt.getTime() + service.bufferMinutes * 60_000);
    // BOOKING_ENGINE_SPEC §5.2: replace occupiedKeys atomically with all derived time fields.
    const updated = await withTransaction(async (session) => {
      const staffIds = [...new Set([String(row.staffId), staffId])];
      for (const value of staffIds) {
        const current = await repository.findStaffById(ctx, value, session);
        if (!current || (await repository.incrementBookingVersion(ctx, value, current.bookingVersion, session)).modifiedCount !== 1) throw new ConflictError(ERROR_CODES.SLOT_UNAVAILABLE, 'Расписание изменилось');
      }
      const fresh = await repository.findById(ctx, id);
      if (!fresh || fresh.updatedAt.getTime() !== row.updatedAt.getTime()) throw new ConflictError(ERROR_CODES.SLOT_UNAVAILABLE, 'Запись уже изменена');
      if (await repository.hasOverlap(ctx, staffId, startAt, blockedUntilAt, session, id) || await repository.hasBlockOverlap(ctx, staffId, startAt, blockedUntilAt, session)) throw new ConflictError(ERROR_CODES.SLOT_UNAVAILABLE, 'Это время уже занято');
      return repository.updateById(ctx, id, { $set: { staffId: staff._id, startAt, endAt, blockedUntilAt, bufferMinutes: service.bufferMinutes, occupiedKeys: occupiedKeysFor(staffId, startAt, blockedUntilAt) }, $inc: { rescheduleCount: 1 } }, session);
    });
    if (!updated) throw new NotFoundError();
    return this.get(ctx, id);
  }

  async changeStatus(ctx: TenantContext, id: string, input: Record<string, unknown>) {
    const row = await repository.findById(ctx, id);
    if (!row || (ctx.role === 'master' && String(row.staffId) !== ctx.staffId)) throw new NotFoundError();
    const status = input.status as AppointmentStatus;
    if (!canTransitionStatus(row.status as AppointmentStatus, status, ctx.role)) throw new ConflictError(ERROR_CODES.INVALID_STATUS_TRANSITION, 'Недопустимый переход статуса');
    if ((status === 'completed' || status === 'no_show') && row.startAt > new Date()) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 422, 'Нельзя закрыть будущую запись');
    if (ctx.role === 'master' && status === 'cancelled' && !input.cancelReason) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 422, 'Укажите причину отмены');
    const set: Record<string, unknown> = { status };
    const unset: Record<string, ''> = {};
    if (status === 'cancelled') { set.cancelledAt = new Date(); set.cancelledBy = 'staff'; if (input.cancelReason) set.cancelReason = input.cancelReason; unset.occupiedKeys = ''; }
    if (status === 'no_show') unset.occupiedKeys = '';
    if (status === 'confirmed') { set.occupiedKeys = row.occupiedKeys ?? occupiedKeysFor(String(row.staffId), row.startAt, row.blockedUntilAt); unset.cancelledAt = ''; unset.cancelledBy = ''; unset.cancelReason = ''; }
    if (status === 'completed') set.completedAt = new Date();
    const updated = await withTransaction(async (session) => {
      const staff = await repository.findStaffById(ctx, String(row.staffId), session);
      if (!staff || (await repository.incrementBookingVersion(ctx, String(row.staffId), staff.bookingVersion, session)).modifiedCount !== 1) throw new ConflictError(ERROR_CODES.SLOT_UNAVAILABLE, 'Расписание изменилось');
      if (status === 'confirmed' && (await repository.hasOverlap(ctx, String(row.staffId), row.startAt, row.blockedUntilAt, session, id) || await repository.hasBlockOverlap(ctx, String(row.staffId), row.startAt, row.blockedUntilAt, session))) throw new ConflictError(ERROR_CODES.SLOT_UNAVAILABLE, 'Это время уже занято');
      const saved = await repository.updateById(ctx, id, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, session);
      const settings = await repository.findSettings(ctx);
      const refs = await repository.findReferences(ctx, row);
      if (saved && settings && refs) {
        const customer = refs.customer;
        const name = `${customer.firstName}${customer.lastName ? ` ${customer.lastName}` : ''}`;
        if (status === 'confirmed') await this.enqueueConfirmed(ctx, session, saved._id, customer._id, typeof row.contactEmail === 'string' ? row.contactEmail : customer.email, name, row.startAt, settings);
        if (status === 'cancelled') {
          await Notification.updateMany({ businessId: ctx.businessId, appointmentId: saved._id, status: 'scheduled', kind: { $in: ['reminder_24h', 'reminder_1h'] } }, { $set: { status: 'cancelled' } }, { session }).exec();
          await this.enqueueEmail(ctx, session, saved._id, customer._id, typeof row.contactEmail === 'string' ? row.contactEmail : customer.email, name, 'appointment_cancelled', new Date(), String(saved.__v), settings.notifications.emailEnabled && settings.notifications.cancellationEnabled);
        }
        if (status === 'no_show' || status === 'completed') await Notification.updateMany({ businessId: ctx.businessId, appointmentId: saved._id, status: 'scheduled', kind: { $in: ['reminder_24h', 'reminder_1h'] } }, { $set: { status: 'cancelled' } }, { session }).exec();
        if (status === 'completed') await this.enqueueEmail(ctx, session, saved._id, customer._id, typeof row.contactEmail === 'string' ? row.contactEmail : customer.email, name, 'followup_after_visit', new Date(Date.now() + settings.notifications.followUpDelayMinutes * 60_000), String(saved.__v), settings.notifications.emailEnabled && settings.notifications.followUpEnabled);
      }
      return saved;
    });
    if (!updated) throw new NotFoundError();
    return this.get(ctx, id);
  }

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
          if ((input.status ?? (settings.booking.autoConfirm ? 'confirmed' : 'pending')) === 'confirmed') await this.enqueueConfirmed(ctx, session, appointment._id, actualCustomer._id, actualCustomer.email, `${actualCustomer.firstName}${actualCustomer.lastName ? ` ${actualCustomer.lastName}` : ''}`, startAt, settings);
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
