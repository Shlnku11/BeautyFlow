import { NotFoundError } from '../http/errors';
import { StaffRepository } from '../repositories/staff-repository';
import type { TenantContext } from '@/shared/types/tenant-context';
import type { StaffDocument } from '../db/models/staff';

const repository = new StaffRepository();

function toDto(staff: Record<string, unknown>) {
  const { _id, displayName, email, phone, bio, color, isActive, acceptsOnlineBooking, displayOrder } = staff;
  return {
    id: String(_id),
    displayName,
    ...(typeof email === 'string' ? { email } : {}),
    ...(typeof phone === 'string' ? { phone } : {}),
    ...(typeof bio === 'string' ? { bio } : {}),
    color,
    isActive,
    acceptsOnlineBooking,
    displayOrder,
  };
}

export class StaffService {
  async list(ctx: TenantContext, query: { includeInactive: boolean; page: number; limit: number }) {
    const staff = await repository.list(ctx, query);
    return staff.filter((item) => ctx.role !== 'master' || ctx.staffId === item._id.toString()).map((item) => toDto(item as unknown as Record<string, unknown>));
  }

  async get(ctx: TenantContext, id: string) {
    if (ctx.role === 'master' && ctx.staffId !== id) throw new NotFoundError();
    const staff = await repository.findById(ctx, id);
    if (!staff) throw new NotFoundError();
    return toDto(staff as unknown as Record<string, unknown>);
  }

  async create(ctx: TenantContext, input: { displayName: string; bio?: string | undefined; color: StaffDocument['color']; phone?: string | undefined; email?: string | undefined; acceptsOnlineBooking: boolean }) {
    if (input.email) throw new Error('Staff invitations are implemented with the team-members phase');
    const staff = await repository.create(ctx, input);
    return toDto(staff as unknown as Record<string, unknown>);
  }

  async update(ctx: TenantContext, id: string, patch: Record<string, unknown>) {
    if (ctx.role === 'master' && ctx.staffId !== id) throw new NotFoundError();
    const staff = await repository.update(ctx, id, patch);
    if (!staff) throw new NotFoundError();
    return toDto(staff as unknown as Record<string, unknown>);
  }
}
