import { Types } from 'mongoose';
import type { TenantContext } from '@/shared/types/tenant-context';
import { AppError, ConflictError, NotFoundError } from '../http/errors';
import { withTransaction } from '../db/transactions';
import { InventoryItem, InventoryMovement, Service } from '../db/models';

function isDuplicate(error: unknown) { return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000; }
function itemDto(row: { _id: Types.ObjectId; name: string; unit: string; onHand: number; reorderThreshold: number; unitCostMinor: number; isActive: boolean }) {
  return { id: row._id.toString(), name: row.name, unit: row.unit, onHand: row.onHand, reorderThreshold: row.reorderThreshold, unitCostMinor: row.unitCostMinor, isActive: row.isActive, lowStock: row.onHand <= row.reorderThreshold };
}

export class InventoryService {
  async list(ctx: TenantContext) {
    const rows = await InventoryItem.find({ businessId: ctx.businessId }).sort({ isActive: -1, nameNormalized: 1 }).lean().exec();
    return { data: rows.map(itemDto) };
  }

  async create(ctx: TenantContext, input: { name: string; unit: string; unitCostMinor: number; initialQuantity: number; reorderThreshold: number }) {
    try {
      const data = await withTransaction(async (session) => {
        const item = await new InventoryItem({ businessId: new Types.ObjectId(ctx.businessId), name: input.name, nameNormalized: input.name.toLocaleLowerCase('ru'), unit: input.unit, unitCostMinor: input.unitCostMinor, onHand: input.initialQuantity, reorderThreshold: input.reorderThreshold, isActive: true }).save({ session });
        if (input.initialQuantity > 0) await new InventoryMovement({ businessId: item.businessId, inventoryItemId: item._id, type: 'restock', quantityDelta: input.initialQuantity, reason: 'Начальный остаток', actorUserId: new Types.ObjectId(ctx.userId), eventKey: `opening:${item._id.toString()}` }).save({ session });
        return item.toObject();
      });
      return itemDto(data);
    } catch (error: unknown) {
      if (isDuplicate(error)) throw new ConflictError('CONFLICT', 'Материал с таким названием уже существует');
      throw error;
    }
  }

  async update(ctx: TenantContext, id: string, patch: { name?: string | undefined; unit?: string | undefined; unitCostMinor?: number | undefined; reorderThreshold?: number | undefined; isActive?: boolean | undefined }) {
    if (!Object.keys(patch).length) throw new AppError('VALIDATION_ERROR', 422, 'Нет изменений для сохранения');
    if (patch.isActive === false && await Service.exists({ businessId: ctx.businessId, isDeleted: false, isActive: true, 'inventoryConsumptions.inventoryItemId': id }).exec()) {
      throw new ConflictError('CONFLICT', 'Сначала уберите этот материал из активных услуг');
    }
    const update: Record<string, unknown> = { ...patch };
    if (patch.name !== undefined) update.nameNormalized = patch.name.toLocaleLowerCase('ru');
    try {
      const item = await InventoryItem.findOneAndUpdate({ _id: id, businessId: ctx.businessId }, { $set: update }, { returnDocument: 'after', runValidators: true }).lean().exec();
      if (!item) throw new NotFoundError('Материал не найден');
      return itemDto(item);
    } catch (error: unknown) {
      if (isDuplicate(error)) throw new ConflictError('CONFLICT', 'Материал с таким названием уже существует');
      throw error;
    }
  }

  async adjust(ctx: TenantContext, id: string, input: { quantityDelta: number; reason: string }) {
    return withTransaction(async (session) => {
      const filter: Record<string, unknown> = { _id: id, businessId: ctx.businessId, isActive: true };
      if (input.quantityDelta < 0) filter.onHand = { $gte: Math.abs(input.quantityDelta) };
      const item = await InventoryItem.findOneAndUpdate(filter, { $inc: { onHand: input.quantityDelta } }, { returnDocument: 'after', session, runValidators: true }).lean().exec();
      if (!item) {
        const exists = await InventoryItem.exists({ _id: id, businessId: ctx.businessId }).session(session).exec();
        if (!exists) throw new NotFoundError('Материал не найден');
        throw new ConflictError('CONFLICT', 'Нельзя списать больше материала, чем есть на складе');
      }
      await new InventoryMovement({ businessId: new Types.ObjectId(ctx.businessId), inventoryItemId: item._id, type: input.quantityDelta > 0 ? 'restock' : 'adjustment', quantityDelta: input.quantityDelta, reason: input.reason, actorUserId: new Types.ObjectId(ctx.userId), eventKey: `manual:${new Types.ObjectId().toString()}` }).save({ session });
      return itemDto(item);
    });
  }

  async movements(ctx: TenantContext, id: string) {
    if (!(await InventoryItem.exists({ _id: id, businessId: ctx.businessId }))) throw new NotFoundError('Материал не найден');
    const rows = await InventoryMovement.find({ businessId: ctx.businessId, inventoryItemId: id }).sort({ createdAt: -1, _id: -1 }).limit(100).lean().exec();
    return { data: rows.map((row) => ({ id: row._id.toString(), type: row.type, quantityDelta: row.quantityDelta, reason: row.reason, appointmentId: row.appointmentId?.toString(), createdAt: row.createdAt.toISOString() })) };
  }
}
