import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import type { PublicContext, TenantContext } from '@/shared/types/tenant-context';
import { Business, Appointment, Service, Staff, StaffService, Settings } from '../db/models';
import { hashSessionToken } from '../auth/session-token';
import { getEnv } from '../config/env';
import { NotFoundError, AppError, ConflictError } from '../http/errors';
import { ERROR_CODES } from '@/shared/error-codes';
import { AvailabilityService } from './availability-service';
import { AppointmentService } from './appointment-service';

const availability = new AvailabilityService();
const appointments = new AppointmentService();

function tenant(ctx: PublicContext): TenantContext { return { businessId: ctx.businessId, userId: new Types.ObjectId().toString(), role: 'owner' }; }

export class PublicBookingService {
  async profile(ctx: PublicContext) {
    const [business, settings] = await Promise.all([Business.findOne({ _id: ctx.businessId, status: 'active' }).lean().exec(), Settings.findOne({ businessId: ctx.businessId }).lean().exec()]);
    if (!business || !settings?.booking.publicEnabled) throw new NotFoundError();
    return { name: business.name, slug: business.slug, timezone: business.timezone, currency: business.currency, ...(business.address ? { address: business.address } : {}), ...(business.phone ? { phone: business.phone } : {}), ...(business.publicDescription ? { publicDescription: business.publicDescription } : {}), bookingConfig: { maxAdvanceDays: settings.booking.maxAdvanceDays, slotStepMinutes: settings.booking.slotStepMinutes }, consent: { required: settings.privacy.requireConsent, ...(settings.privacy.consentText ? { text: settings.privacy.consentText } : {}) } };
  }

  async services(ctx: PublicContext) {
    await this.profile(ctx);
    const rows = await Service.find({ businessId: ctx.businessId, isActive: true, isDeleted: false, onlineBookingEnabled: true }).sort({ displayOrder: 1, _id: 1 }).lean().exec();
    const result = [];
    for (const service of rows) {
      const staffIds = await StaffService.find({ businessId: ctx.businessId, serviceId: service._id }).distinct('staffId').exec();
      const count = await Staff.countDocuments({ businessId: ctx.businessId, _id: { $in: staffIds }, isActive: true, isDeleted: false, acceptsOnlineBooking: true }).exec();
      if (count) result.push({ id: service._id.toString(), name: service.name, ...(service.description ? { description: service.description } : {}), durationMinutes: service.durationMinutes, priceMinor: service.priceMinor, currency: service.currency });
    }
    return result;
  }

  async staff(ctx: PublicContext, serviceId: string) {
    await this.profile(ctx);
    const service = await Service.findOne({ _id: serviceId, businessId: ctx.businessId, isActive: true, isDeleted: false, onlineBookingEnabled: true }).lean().exec();
    if (!service) throw new NotFoundError();
    const ids = await StaffService.find({ businessId: ctx.businessId, serviceId }).distinct('staffId').exec();
    const staffRows = await Staff.find({ businessId: ctx.businessId, _id: { $in: ids }, isActive: true, isDeleted: false, acceptsOnlineBooking: true }).sort({ displayOrder: 1, _id: 1 }).lean().exec();
    return staffRows.map((row) => ({ id: row._id.toString(), displayName: row.displayName, ...(row.bio ? { bio: row.bio } : {}) }));
  }

  async slots(ctx: PublicContext, input: { serviceId: string; staffId: string; date: string; excludeAppointmentId?: string }) {
    await this.profile(ctx);
    if (!(await this.services(ctx)).some((service) => service.id === input.serviceId)) throw new NotFoundError();
    if (input.staffId !== 'any' && !(await this.staff(ctx, input.serviceId)).some((staff) => staff.id === input.staffId)) throw new NotFoundError();
    const result = await availability.get(tenant(ctx), { ...input, enforceNotice: true });
    return { date: result.date, timezone: result.timezone, slots: result.slots.map(({ startAt }) => ({ startAt })) };
  }

  async days(ctx: PublicContext, input: { serviceId: string; staffId: string; month: string }) {
    const first = DateTime.fromFormat(`${input.month}-01`, 'yyyy-MM-dd', { zone: 'UTC' });
    if (!first.isValid) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 422, 'Некорректный месяц');
    const days: string[] = [];
    for (let day = 1; day <= first.daysInMonth; day += 1) {
      const date = first.set({ day }).toISODate();
      if (date && (await this.slots(ctx, { ...input, date })).slots.length > 0) days.push(date);
    }
    return { month: input.month, days };
  }

  async book(ctx: PublicContext, input: { serviceId: string; staffId: string; startAt: string; customer: { firstName: string; lastName?: string; phone: string; email?: string }; customerNote?: string; acceptPrivacy?: boolean; website?: string }, idempotencyKey?: string) {
    const [profile, settings] = await Promise.all([this.profile(ctx), Settings.findOne({ businessId: ctx.businessId }).lean().exec()]);
    if (!settings) throw new NotFoundError();
    if (input.website?.trim()) throw new NotFoundError();
    if (settings.privacy.requireConsent && input.acceptPrivacy !== true) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 422, 'Необходимо согласие на обработку данных');
    if (!(await this.services(ctx)).some((item) => item.id === input.serviceId)) throw new NotFoundError();
    if (input.staffId !== 'any' && !(await this.staff(ctx, input.serviceId)).some((item) => item.id === input.staffId)) throw new NotFoundError();
    const result = await appointments.create(tenant(ctx), { serviceId: input.serviceId, staffId: input.staffId, startAt: input.startAt, newCustomer: input.customer, customerNote: input.customerNote, enforceNotice: true }, idempotencyKey, { source: 'public', ...(input.acceptPrivacy ? { privacyAcceptedAt: new Date() } : {}) });
    const manageToken = result.manageToken;
    if (!manageToken) throw new ConflictError(ERROR_CODES.CONFLICT, 'Не удалось создать ссылку управления');
    return { statusCode: result.statusCode, data: { appointment: await this.publicDto(ctx, result.appointment), manageToken, manageUrl: `${getEnv().APP_BASE_URL}/b/${encodeURIComponent(profile.slug)}/manage/${encodeURIComponent(manageToken)}` } };
  }

  private async publicDto(ctx: PublicContext, value: unknown) {
    const dto = value as Record<string, unknown>;
    const staff = dto.staff as Record<string, unknown>;
    const [business, settings, row] = await Promise.all([Business.findOne({ _id: ctx.businessId, status: 'active' }).lean().exec(), Settings.findOne({ businessId: ctx.businessId }).lean().exec(), Appointment.findOne({ _id: new Types.ObjectId(String(dto.id)), businessId: ctx.businessId }).lean().exec()]);
    if (!business || !settings || !row) throw new NotFoundError();
    const hoursUntilStart = (row.startAt.getTime() - Date.now()) / 3_600_000;
    return { id: dto.id, business: { name: business.name, slug: business.slug, timezone: business.timezone, ...(business.address ? { address: business.address } : {}), ...(business.phone ? { phone: business.phone } : {}) }, service: row.serviceSnapshot, staff: { displayName: staff.displayName }, startAt: dto.startAt, endAt: dto.endAt, status: dto.status, canCancel: ['pending', 'confirmed'].includes(String(dto.status)) && hoursUntilStart >= settings.booking.cancellationWindowHours, canReschedule: dto.status === 'confirmed' && hoursUntilStart >= settings.booking.cancellationWindowHours && row.rescheduleCount < settings.booking.customerRescheduleLimit };
  }

  private async manageAppointment(ctx: PublicContext, token: string) {
    const row = await Appointment.findOne({ businessId: ctx.businessId, manageTokenHash: hashSessionToken(token), manageTokenExpiresAt: { $gt: new Date() } }).lean().exec();
    if (!row) throw new NotFoundError();
    return row;
  }

  async manage(ctx: PublicContext, token: string) {
    const row = await this.manageAppointment(ctx, token);
    return this.publicDto(ctx, await appointments.get(tenant(ctx), row._id.toString()));
  }

  async manageSlots(ctx: PublicContext, token: string, date: string) {
    const row = await this.manageAppointment(ctx, token);
    const settings = await Settings.findOne({ businessId: ctx.businessId }).lean().exec();
    if (!settings || row.status !== 'confirmed' || row.rescheduleCount >= settings.booking.customerRescheduleLimit || row.startAt.getTime() - Date.now() < settings.booking.cancellationWindowHours * 3_600_000) throw new AppError(ERROR_CODES.RESCHEDULE_NOT_ALLOWED, 403, 'Перенос недоступен');
    return this.slots(ctx, { serviceId: row.serviceId.toString(), staffId: row.staffId.toString(), date, excludeAppointmentId: row._id.toString() });
  }

  async cancel(ctx: PublicContext, token: string, reason?: string) {
    const row = await this.manageAppointment(ctx, token);
    const settings = await Settings.findOne({ businessId: ctx.businessId }).lean().exec();
    if (!settings || row.startAt.getTime() - Date.now() < settings.booking.cancellationWindowHours * 3_600_000) throw new AppError(ERROR_CODES.CANCELLATION_WINDOW_PASSED, 403, 'Окно отмены завершено');
    const dto = await appointments.changeStatus(tenant(ctx), row._id.toString(), { status: 'cancelled', cancelReason: reason, actor: 'customer' });
    return this.publicDto(ctx, dto);
  }

  async reschedule(ctx: PublicContext, token: string, startAt: string) {
    const row = await this.manageAppointment(ctx, token);
    const settings = await Settings.findOne({ businessId: ctx.businessId }).lean().exec();
    if (row.status !== 'confirmed') throw new ConflictError(ERROR_CODES.INVALID_STATUS_TRANSITION, 'Запись нельзя перенести в текущем статусе');
    if (!settings || row.startAt.getTime() - Date.now() < settings.booking.cancellationWindowHours * 3_600_000) throw new AppError(ERROR_CODES.CANCELLATION_WINDOW_PASSED, 403, 'Окно переноса завершено');
    if (row.rescheduleCount >= settings.booking.customerRescheduleLimit) throw new AppError(ERROR_CODES.RESCHEDULE_LIMIT_REACHED, 403, 'Достигнут лимит переносов');
    const dto = await appointments.reschedule(tenant(ctx), row._id.toString(), { startAt, staffId: row.staffId.toString(), enforceNotice: true });
    return this.publicDto(ctx, dto);
  }
}
