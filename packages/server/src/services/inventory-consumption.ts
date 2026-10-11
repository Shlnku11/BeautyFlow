import { Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import { InventoryItem, InventoryMovement } from '../db/models';
import { ConflictError, NotFoundError } from '../http/errors';

type ServiceForSnapshot = { name: string; durationMinutes: number; priceMinor: number; currency: string; costItems?: { amountMinor: number }[]; inventoryConsumptions?: { inventoryItemId: Types.ObjectId; quantity: number }[] };

export async function buildServiceSnapshot(businessId: string, service: ServiceForSnapshot, session?: ClientSession) {
  const refs = service.inventoryConsumptions ?? [];
  const ids = refs.map((item) => item.inventoryItemId);
  const query = InventoryItem.find({ businessId, _id: { $in: ids }, isActive: true });
  const rows = ids.length ? await (session ? query.session(session) : query).lean().exec() : [];
  if (rows.length !== ids.length) throw new NotFoundError('Один из материалов услуги отключён или удалён');
  const byId = new Map(rows.map((row) => [row._id.toString(), row]));
  const inventoryConsumptions = refs.map((ref) => {
    const item = byId.get(ref.inventoryItemId.toString());
    if (!item) throw new NotFoundError('Материал услуги не найден');
    const costMinor = Math.round(ref.quantity * item.unitCostMinor);
    return { inventoryItemId: item._id, name: item.name, unit: item.unit, quantity: ref.quantity, unitCostMinor: item.unitCostMinor, costMinor };
  });
  const costMinor = (service.costItems ?? []).reduce((total, item) => total + item.amountMinor, 0) + inventoryConsumptions.reduce((total, item) => total + item.costMinor, 0);
  return { name: service.name, durationMinutes: service.durationMinutes, priceMinor: service.priceMinor, currency: service.currency, costMinor, inventoryConsumptions };
}

export async function applyInventoryForStatusChange(input: { businessId: string; actorUserId: string; appointmentId: Types.ObjectId; fromStatus: string; toStatus: string; serviceSnapshot: { inventoryConsumptions?: { inventoryItemId: Types.ObjectId; name: string; unit: string; quantity: number; unitCostMinor: number; costMinor: number }[] }; cycleKey: string }, session: ClientSession) {
  if (input.fromStatus !== 'completed' && input.toStatus === 'completed') {
    for (const material of input.serviceSnapshot.inventoryConsumptions ?? []) {
      const item = await InventoryItem.findOneAndUpdate({ _id: material.inventoryItemId, businessId: input.businessId, onHand: { $gte: material.quantity } }, { $inc: { onHand: -material.quantity } }, { returnDocument: 'after', session, runValidators: true }).lean().exec();
      if (!item) throw new ConflictError('CONFLICT', `Недостаточно материала «${material.name}» на складе`);
      await new InventoryMovement({ businessId: new Types.ObjectId(input.businessId), inventoryItemId: material.inventoryItemId, type: 'consumption', quantityDelta: -material.quantity, reason: 'Расход материалов по завершённой записи', appointmentId: input.appointmentId, actorUserId: new Types.ObjectId(input.actorUserId), cycleKey: input.cycleKey, eventKey: `${input.cycleKey}:consumption:${material.inventoryItemId.toString()}` }).save({ session });
    }
  }
  if (input.fromStatus === 'completed' && input.toStatus !== 'completed') {
    const consumed = await InventoryMovement.find({ businessId: input.businessId, appointmentId: input.appointmentId, cycleKey: input.cycleKey, type: 'consumption' }).session(session).lean().exec();
    for (const movement of consumed) {
      const quantity = Math.abs(movement.quantityDelta);
      await InventoryItem.updateOne({ _id: movement.inventoryItemId, businessId: input.businessId }, { $inc: { onHand: quantity } }, { session }).exec();
      await new InventoryMovement({ businessId: new Types.ObjectId(input.businessId), inventoryItemId: movement.inventoryItemId, type: 'reversal', quantityDelta: quantity, reason: 'Возврат материалов при отмене завершения услуги', appointmentId: input.appointmentId, actorUserId: new Types.ObjectId(input.actorUserId), cycleKey: input.cycleKey, eventKey: `${input.cycleKey}:reversal:${movement.inventoryItemId.toString()}` }).save({ session });
    }
  }
}
