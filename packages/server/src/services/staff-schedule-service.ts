import type { TenantContext } from '@/shared/types/tenant-context';
import type { z } from 'zod';
import type { StaffExceptionSchema } from '@/shared/schemas/schedule';
import { withTransaction } from '../db/transactions';
import { NotFoundError } from '../http/errors';
import { StaffScheduleRepository } from '../repositories/staff-schedule-repository';

const repository = new StaffScheduleRepository();

function assertOwnStaff(ctx: TenantContext, staffId: string): void {
  if (ctx.role === 'master' && ctx.staffId !== staffId) throw new NotFoundError();
}

export class StaffScheduleService {
  async getWeekly(ctx: TenantContext, staffId: string) {
    assertOwnStaff(ctx, staffId);
    if (!(await repository.findStaff(ctx, staffId))) throw new NotFoundError();
    const schedule = await repository.findWeekly(ctx, staffId);
    return { weekly: schedule?.weekly ?? [] };
  }

  async replaceWeekly(ctx: TenantContext, staffId: string, weekly: unknown) {
    if (!(await repository.findStaff(ctx, staffId))) throw new NotFoundError();
    return withTransaction(async (session) => {
      const schedule = await repository.replaceWeekly(ctx, staffId, weekly, session);
      if (!schedule) throw new NotFoundError();
      const affectedAppointmentsCount = await repository.countUpcomingAppointments(ctx, staffId, session);
      return { schedule: { weekly: schedule.weekly }, affectedAppointmentsCount };
    });
  }

  async listExceptions(ctx: TenantContext, staffId: string, from: string, to: string) {
    assertOwnStaff(ctx, staffId);
    if (!(await repository.findStaff(ctx, staffId))) throw new NotFoundError();
    const records = await repository.listExceptions(ctx, staffId, from, to);
    return records.map(({ date, kind, intervals, breaks, reason }) => ({ date, kind, intervals, breaks, ...(reason ? { reason } : {}) }));
  }

  async upsertException(ctx: TenantContext, staffId: string, input: z.infer<typeof StaffExceptionSchema>) {
    if (!(await repository.findStaff(ctx, staffId))) throw new NotFoundError();
    return withTransaction(async (session) => {
      const exception = await repository.upsertException(ctx, staffId, input, session);
      const affectedAppointmentsCount = await repository.countUpcomingAppointments(ctx, staffId, session);
      return { exception: exception ? { date: exception.date, kind: exception.kind, intervals: exception.intervals, breaks: exception.breaks, ...(exception.reason ? { reason: exception.reason } : {}) } : null, affectedAppointmentsCount };
    });
  }

  async deleteException(ctx: TenantContext, staffId: string, date: string): Promise<void> {
    if (!(await repository.findStaff(ctx, staffId))) throw new NotFoundError();
    await withTransaction(async (session) => {
      const deleted = await repository.deleteException(ctx, staffId, date, session);
      if (!deleted) throw new NotFoundError();
    });
  }
}
