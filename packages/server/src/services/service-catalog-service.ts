import { Types } from 'mongoose';
import type { TenantContext } from '@/shared/types/tenant-context';
import { ERROR_CODES } from '@/shared/error-codes';
import { AppError, ConflictError, NotFoundError } from '../http/errors';
import { withTransaction } from '../db/transactions';
import { Staff } from '../db/models';
import { ServiceRepository } from '../repositories/service-repository';

const repository = new ServiceRepository();

function toDto(value: Record<string, unknown>, staffIds: string[]) {
  const { _id, name, description, durationMinutes, bufferMinutes, priceMinor, currency, onlineBookingEnabled, isActive, displayOrder } = value;
  return { id: String(_id), name, ...(typeof description === 'string' ? { description } : {}), durationMinutes, bufferMinutes, priceMinor, currency, onlineBookingEnabled, isActive, displayOrder, staffIds };
}

function isDuplicateName(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

export class ServiceCatalogService {
  async list(ctx: TenantContext, filters: { isActive?: boolean | undefined; staffId?: string | undefined }) {
    if (filters.staffId && !(await Staff.exists({ _id: filters.staffId, businessId: ctx.businessId, isDeleted: false }))) throw new NotFoundError();
    const records = await repository.list(ctx, filters);
    return Promise.all(records.map(async (record) => toDto(record as unknown as Record<string, unknown>, await repository.staffLinks(ctx, record._id))));
  }

  async create(ctx: TenantContext, input: { name: string; description?: string | undefined; durationMinutes: number; bufferMinutes: number; priceMinor: number; currency?: string | undefined; staffIds: string[]; onlineBookingEnabled: boolean; isActive: boolean }) {
    if (!(await repository.staffIdsExist(ctx, input.staffIds))) throw new NotFoundError('Сотрудник не найден');
    const currency = await repository.businessCurrency(ctx);
    if (!currency) throw new NotFoundError();
    if (input.currency && input.currency !== currency) throw new AppError('VALIDATION_ERROR', 422, 'Валюта должна совпадать с валютой бизнеса');
    try {
      return await withTransaction(async (session) => {
        const { staffIds, ...serviceInput } = input;
        const service = await repository.create(ctx, { ...serviceInput, currency, nameNormalized: input.name.toLocaleLowerCase('ru'), displayOrder: 0 }, session);
        await repository.replaceStaffLinks(ctx, service._id, staffIds, session);
        return toDto(service.toObject() as unknown as Record<string, unknown>, staffIds);
      });
    } catch (error: unknown) {
      if (isDuplicateName(error)) throw new ConflictError(ERROR_CODES.SERVICE_NAME_EXISTS, 'Услуга с таким названием уже существует');
      throw error;
    }
  }

  async update(ctx: TenantContext, id: string, patch: Record<string, unknown>) {
    const { staffIds, currency, ...fields } = patch;
    if (staffIds !== undefined && !Array.isArray(staffIds)) throw new AppError('VALIDATION_ERROR', 422, 'Некорректный список сотрудников');
    if (Array.isArray(staffIds) && !(await repository.staffIdsExist(ctx, staffIds as string[]))) throw new NotFoundError('Сотрудник не найден');
    const businessCurrency = await repository.businessCurrency(ctx);
    if (!businessCurrency) throw new NotFoundError();
    if (currency !== undefined && currency !== businessCurrency) throw new AppError('VALIDATION_ERROR', 422, 'Валюта должна совпадать с валютой бизнеса');
    if (typeof fields.name === 'string') fields.nameNormalized = fields.name.toLocaleLowerCase('ru');
    try {
      return await withTransaction(async (session) => {
        const service = await repository.update(ctx, id, fields, session);
        if (!service) throw new NotFoundError();
        if (Array.isArray(staffIds)) await repository.replaceStaffLinks(ctx, new Types.ObjectId(id), staffIds as string[], session);
        const linkedStaffIds = Array.isArray(staffIds) ? staffIds as string[] : await repository.staffLinks(ctx, new Types.ObjectId(id));
        return toDto(service as unknown as Record<string, unknown>, linkedStaffIds);
      });
    } catch (error: unknown) {
      if (isDuplicateName(error)) throw new ConflictError(ERROR_CODES.SERVICE_NAME_EXISTS, 'Услуга с таким названием уже существует');
      throw error;
    }
  }
}
