import type { z } from 'zod';
import type { TenantContext } from '@/shared/types/tenant-context';
import { BusinessSettingsSchema, BookingSettingsSchema } from '@/shared/schemas/settings';
import { ERROR_CODES } from '@/shared/error-codes';
import { AppError, NotFoundError } from '../http/errors';
import { isValidTimeZone } from '../domain/time';
import { withTransaction } from '../db/transactions';
import { SettingsRepository } from '../repositories/settings-repository';

const repository = new SettingsRepository();
type BusinessPatch = z.infer<typeof BusinessSettingsSchema>;
type BookingPatch = z.infer<typeof BookingSettingsSchema>;

export class SettingsService {
  async get(ctx: TenantContext) {
    const [business, settings] = await repository.load(ctx);
    if (!business || !settings) throw new NotFoundError();
    return { business: { name: business.name, slug: business.slug, timezone: business.timezone, currency: business.currency, countryCode: business.countryCode, ...(business.phone ? { phone: business.phone } : {}), ...(business.email ? { email: business.email } : {}), ...(business.address ? { address: business.address } : {}), ...(business.publicDescription ? { publicDescription: business.publicDescription } : {}) }, booking: settings.booking, notifications: { ...settings.notifications, ...(ctx.role === 'admin' ? { readOnly: true } : {}) }, privacy: settings.privacy };
  }

  async updateBusiness(ctx: TenantContext, patch: BusinessPatch) {
    if (patch.timezone !== undefined && !isValidTimeZone(patch.timezone)) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 422, 'Некорректный часовой пояс IANA');
    const [business] = await repository.load(ctx);
    if (!business) throw new NotFoundError();
    const changesZone = patch.timezone !== undefined && patch.timezone !== business.timezone;
    const changesCurrency = patch.currency !== undefined && patch.currency !== business.currency;
    if ((changesZone || changesCurrency) && (await repository.futureAppointmentCount(ctx)) > 0) {
      if (changesZone) throw new AppError(ERROR_CODES.TIMEZONE_CHANGE_BLOCKED, 409, 'Часовой пояс нельзя изменить при будущих записях');
      throw new AppError(ERROR_CODES.CURRENCY_CHANGE_BLOCKED, 409, 'Валюту нельзя изменить при будущих записях');
    }
    const businessFields: Record<string, unknown> = {};
    for (const field of ['name', 'phone', 'email', 'address', 'publicDescription', 'timezone', 'currency', 'countryCode'] as const) if (patch[field] !== undefined) businessFields[field] = patch[field];
    const privacyFields: Record<string, unknown> = {};
    if (patch.privacy) for (const [key, value] of Object.entries(patch.privacy)) if (value !== undefined) privacyFields[`privacy.${key}`] = value;
    await withTransaction(async (session) => {
      if (Object.keys(businessFields).length > 0) await repository.updateBusiness(ctx, businessFields, session);
      if (Object.keys(privacyFields).length > 0) await repository.updateSettings(ctx, privacyFields, session);
    });
    return this.get(ctx);
  }

  async updateBooking(ctx: TenantContext, patch: BookingPatch) {
    await withTransaction((session) => repository.updateSettings(ctx, Object.fromEntries(Object.entries(patch).map(([key, value]) => [`booking.${key}`, value])), session));
    const [, settings] = await repository.load(ctx);
    if (!settings) throw new NotFoundError();
    return { booking: settings.booking };
  }
}
