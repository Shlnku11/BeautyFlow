import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import type { TenantContext } from '@/shared/types/tenant-context';
import { Business, Customer, Service, Staff, StaffService, WaitlistEntry } from '../db/models';
import type { WaitlistStatus } from '../db/models/waitlist-entries';
import { AppError, NotFoundError } from '../http/errors';
import { enqueueWorkEvent } from '../notifications/work-events';

export class WaitlistService {
  async list(ctx: TenantContext, status?: WaitlistStatus) {
    const rows = await WaitlistEntry.find({ businessId: ctx.businessId, ...(status ? { status } : {}) }).sort({ status: 1, createdAt: -1 }).limit(200).lean().exec();
    const customerIds = [...new Set(rows.map((row) => row.customerId.toString()))].map((id) => new Types.ObjectId(id));
    const serviceIds = [...new Set(rows.map((row) => row.serviceId.toString()))].map((id) => new Types.ObjectId(id));
    const staffIds = [...new Set(rows.flatMap((row) => row.staffId ? [row.staffId.toString()] : []))].map((id) => new Types.ObjectId(id));
    const [customers, services, staff] = await Promise.all([
      Customer.find({ businessId: ctx.businessId, _id: { $in: customerIds } }).select('firstName lastName phone').lean().exec(),
      Service.find({ businessId: ctx.businessId, _id: { $in: serviceIds } }).select('name').lean().exec(),
      Staff.find({ businessId: ctx.businessId, _id: { $in: staffIds } }).select('displayName').lean().exec(),
    ]);
    const customerMap = new Map(customers.map((row) => [row._id.toString(), row]));
    const serviceMap = new Map(services.map((row) => [row._id.toString(), row.name]));
    const staffMap = new Map(staff.map((row) => [row._id.toString(), row.displayName]));
    return { data: rows.flatMap((row) => {
      const customer = customerMap.get(row.customerId.toString());
      if (!customer) return [];
      return [{ id: row._id.toString(), customer: { id: customer._id.toString(), name: `${customer.firstName}${customer.lastName ? ` ${customer.lastName}` : ''}`, phone: customer.phone }, service: { id: row.serviceId.toString(), name: serviceMap.get(row.serviceId.toString()) ?? 'Услуга удалена' }, staff: row.staffId ? { id: row.staffId.toString(), name: staffMap.get(row.staffId.toString()) ?? 'Сотрудник удалён' } : null, fromDate: row.fromDate, toDate: row.toDate, ...(row.preferredTimeStart ? { preferredTimeStart: row.preferredTimeStart, preferredTimeEnd: row.preferredTimeEnd } : {}), ...(row.note ? { note: row.note } : {}), status: row.status, ...(row.lastOfferedStartAt ? { lastOfferedAt: row.lastOfferedAt?.toISOString(), lastOfferedStartAt: row.lastOfferedStartAt.toISOString() } : {}), createdAt: row.createdAt.toISOString() }];
    }) };
  }

  async create(ctx: TenantContext, input: { customerId: string; serviceId: string; staffId?: string | undefined; fromDate: string; toDate: string; preferredTimeStart?: string | undefined; preferredTimeEnd?: string | undefined; note?: string | undefined }) {
    const [customer, service, staffLink, activeStaff] = await Promise.all([
      Customer.exists({ _id: input.customerId, businessId: ctx.businessId, isDeleted: false }).exec(),
      Service.exists({ _id: input.serviceId, businessId: ctx.businessId, isDeleted: false, isActive: true }).exec(),
      input.staffId ? StaffService.exists({ businessId: ctx.businessId, staffId: input.staffId, serviceId: input.serviceId }).exec() : Promise.resolve(true),
      input.staffId ? Staff.exists({ _id: input.staffId, businessId: ctx.businessId, isActive: true, isDeleted: false }).exec() : Promise.resolve(true),
    ]);
    if (!customer) throw new NotFoundError('Клиент не найден');
    if (!service) throw new NotFoundError('Активная услуга не найдена');
    if (!staffLink || !activeStaff) throw new AppError('VALIDATION_ERROR', 422, 'Этот сотрудник недоступен для выбранной услуги');
    const row = await new WaitlistEntry({ businessId: new Types.ObjectId(ctx.businessId), customerId: new Types.ObjectId(input.customerId), serviceId: new Types.ObjectId(input.serviceId), ...(input.staffId ? { staffId: new Types.ObjectId(input.staffId) } : {}), fromDate: input.fromDate, toDate: input.toDate, ...(input.preferredTimeStart ? { preferredTimeStart: input.preferredTimeStart, preferredTimeEnd: input.preferredTimeEnd } : {}), ...(input.note ? { note: input.note } : {}), status: 'active', createdBy: new Types.ObjectId(ctx.userId) }).save();
    return { id: row._id.toString(), status: row.status };
  }

  async update(ctx: TenantContext, id: string, status: 'active' | 'contacted' | 'booked' | 'paused') {
    const row = await WaitlistEntry.findOneAndUpdate({ _id: id, businessId: ctx.businessId }, { $set: { status } }, { returnDocument: 'after', runValidators: true }).lean().exec();
    if (!row) throw new NotFoundError('Заявка листа ожидания не найдена');
    return { id: row._id.toString(), status: row.status };
  }
}

export async function offerReleasedSlot(ctx: { businessId: string; session: import('mongoose').ClientSession }, slot: { serviceId: Types.ObjectId; staffId: Types.ObjectId; startAt: Date; serviceName: string }) {
  if (slot.startAt <= new Date()) return;
  const business = await Business.findById(ctx.businessId).select('timezone').session(ctx.session).lean().exec();
  const timezone = business?.timezone ?? 'UTC';
  const local = DateTime.fromJSDate(slot.startAt, { zone: timezone });
  const localDate = local.toISODate() ?? '';
  const localTime = local.toFormat('HH:mm');
  const entries = await WaitlistEntry.find({ businessId: ctx.businessId, serviceId: slot.serviceId, status: 'active', fromDate: { $lte: localDate }, toDate: { $gte: localDate }, $or: [{ staffId: { $exists: false } }, { staffId: slot.staffId }] }).sort({ createdAt: 1, _id: 1 }).limit(50).session(ctx.session).lean().exec();
  const matching = entries.filter((entry) => !entry.preferredTimeStart || (entry.preferredTimeStart <= localTime && localTime < (entry.preferredTimeEnd ?? ''))).slice(0, 10);
  if (!matching.length) return;
  const customers = await Customer.find({ businessId: ctx.businessId, _id: { $in: matching.map((entry) => entry.customerId) }, isDeleted: false }).select('firstName lastName').session(ctx.session).lean().exec();
  const names = new Map(customers.map((customer) => [customer._id.toString(), `${customer.firstName}${customer.lastName ? ` ${customer.lastName}` : ''}`]));
  const timeLabel = local.toFormat('dd.LL · HH:mm');
  for (const entry of matching) {
    const name = names.get(entry.customerId.toString());
    if (!name) continue;
    await WaitlistEntry.updateOne({ _id: entry._id, businessId: ctx.businessId, status: 'active' }, { $set: { lastOfferedAt: new Date(), lastOfferedStartAt: slot.startAt, lastOfferedStaffId: slot.staffId } }, { session: ctx.session }).exec();
    await enqueueWorkEvent({ businessId: ctx.businessId, kind: 'waitlist_offer', category: 'appointment', entityId: entry._id.toString(), dedupeKey: `waitlist-slot:${entry._id.toString()}:${slot.startAt.toISOString()}:${slot.staffId.toString()}`, title: 'Подходящее время освободилось', body: `${name} · ${slot.serviceName} · ${timeLabel}`, route: '/app/waitlist', session: ctx.session });
  }
}
