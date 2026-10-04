import type { ClientSession } from 'mongoose';
import type { TenantContext } from '@/shared/types/tenant-context';
import { Appointment, Business, Settings } from '../db/models';

export class SettingsRepository {
  load(ctx: TenantContext) {
    return Promise.all([
      Business.findById(ctx.businessId).lean().exec(),
      Settings.findOne({ businessId: ctx.businessId }).lean().exec(),
    ]);
  }

  futureAppointmentCount(ctx: TenantContext) {
    return Appointment.countDocuments({ businessId: ctx.businessId, startAt: { $gt: new Date() }, status: { $in: ['pending', 'confirmed'] } }).exec();
  }

  updateBusiness(ctx: TenantContext, fields: Record<string, unknown>, session: ClientSession) {
    return Business.updateOne({ _id: ctx.businessId }, { $set: fields }, { runValidators: true, session }).exec();
  }

  updateSettings(ctx: TenantContext, fields: Record<string, unknown>, session: ClientSession) {
    return Settings.updateOne({ businessId: ctx.businessId }, { $set: fields }, { runValidators: true, session }).exec();
  }
}
