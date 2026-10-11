import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import type { TenantContext } from '@/shared/types/tenant-context';
import { AuditLog, Business, BusinessMember, User } from '../db/models';

type ActivityRow = { _id: Types.ObjectId; action: string; entityType: string; entityId: unknown; actorUserId?: Types.ObjectId | null; actorRole: string; metadata?: unknown; createdAt: Date };

function toDto(row: ActivityRow, actorName: string) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
  return { id: row._id.toString(), action: row.action, entityType: row.entityType, entityId: String(row.entityId), actor: { id: row.actorUserId?.toString() ?? '', name: actorName, role: row.actorRole }, createdAt: row.createdAt.toISOString(), ...(typeof metadata.routeId === 'string' ? { routeId: metadata.routeId } : {}), ...(typeof metadata.method === 'string' ? { method: metadata.method } : {}), ...(Array.isArray(metadata.fieldNames) ? { fieldNames: metadata.fieldNames.filter((item): item is string => typeof item === 'string') } : {}) };
}

export class ActivityService {
  async list(ctx: TenantContext, limit: number) {
    const [member, rows] = await Promise.all([
      BusinessMember.findOne({ businessId: ctx.businessId, userId: ctx.userId, status: 'active' }).select('activityReadAt').lean().exec(),
      AuditLog.find({ businessId: ctx.businessId }).sort({ createdAt: -1, _id: -1 }).limit(limit).lean().exec(),
    ]);
    const readAt = member?.activityReadAt ?? new Date(0);
    const unreadCount = await AuditLog.countDocuments({ businessId: ctx.businessId, createdAt: { $gt: readAt } }).exec();
    const actorIds = [...new Set(rows.flatMap((row) => row.actorUserId ? [row.actorUserId.toString()] : []))].map((id) => new Types.ObjectId(id));
    const users = await User.find({ _id: { $in: actorIds } }).select('_id name').lean().exec();
    const names = new Map(users.map((user) => [user._id.toString(), user.name]));
    return { items: rows.map((row) => toDto(row as unknown as ActivityRow, names.get(row.actorUserId?.toString() ?? '') ?? (row.actorRole === 'system' ? 'Система' : 'Участник команды'))), unreadCount };
  }

  async markRead(ctx: TenantContext) {
    const now = new Date();
    await BusinessMember.updateOne({ businessId: ctx.businessId, userId: ctx.userId, status: 'active' }, { $set: { activityReadAt: now } }).exec();
    return { readAt: now.toISOString() };
  }

  async audit(ctx: TenantContext, input: { from?: string | undefined; to?: string | undefined; actorId?: string | undefined; limit: number }) {
    const business = await Business.findById(ctx.businessId).select('timezone').lean().exec();
    const timezone = business?.timezone ?? 'UTC';
    const createdAt: Record<string, Date> = {};
    if (input.from) createdAt.$gte = DateTime.fromISO(input.from, { zone: timezone }).startOf('day').toJSDate();
    if (input.to) createdAt.$lt = DateTime.fromISO(input.to, { zone: timezone }).plus({ days: 1 }).startOf('day').toJSDate();
    const rows = await AuditLog.find({ businessId: ctx.businessId, ...(Object.keys(createdAt).length ? { createdAt } : {}), ...(input.actorId ? { actorUserId: new Types.ObjectId(input.actorId) } : {}) }).sort({ createdAt: -1, _id: -1 }).limit(input.limit).lean().exec();
    const actorIds = [...new Set(rows.flatMap((row) => row.actorUserId ? [row.actorUserId.toString()] : []))].map((id) => new Types.ObjectId(id));
    const users = await User.find({ _id: { $in: actorIds } }).select('_id name').lean().exec();
    const names = new Map(users.map((user) => [user._id.toString(), user.name]));
    return { data: rows.map((row) => toDto(row as unknown as ActivityRow, names.get(row.actorUserId?.toString() ?? '') ?? (row.actorRole === 'system' ? 'Система' : 'Участник команды'))), meta: { limit: input.limit } };
  }
}
