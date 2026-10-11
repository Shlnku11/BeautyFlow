import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectFromDatabase } from '../../packages/server/src/db/connection';
import { up as createIndexes } from '../../packages/server/migrations/000_init';
import { Appointment, AuditLog, Business, Shift, Staff, Transaction } from '../../packages/server/src/db/models';
import { FinancialReportService } from '../../packages/server/src/services/financial-report-service';
import { ShiftService } from '../../packages/server/src/services/shift-service';
import type { TenantContext } from '../../packages/shared/src/types/tenant-context';

describe('staff shifts and financial reports', () => {
  let replSet: MongoMemoryReplSet;
  let businessId: mongoose.Types.ObjectId;
  let staffId: mongoose.Types.ObjectId;
  let userId: mongoose.Types.ObjectId;
  let context: TenantContext;
  const shifts = new ShiftService();
  const reports = new FinancialReportService();

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGODB_URI = replSet.getUri('shift_report_test');
    process.env.MONGODB_DB_NAME = 'shift_report_test';
    process.env.TEST_MONGODB_URI = replSet.getUri('shift_report_test');
    await connectToDatabase();
    if (!mongoose.connection.db) throw new Error('Missing MongoDB database');
    await createIndexes(mongoose.connection.db);
  }, 120_000);

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
    businessId = new mongoose.Types.ObjectId();
    userId = new mongoose.Types.ObjectId();
    const [business, staff] = await Promise.all([
      Business.create({ _id: businessId, name: 'Shift salon', slug: `shift-${businessId}`, timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', status: 'active' }),
      Staff.create({ businessId, displayName: 'Master One', hourlyRateMinor: 10_000 }),
    ]);
    staffId = staff._id;
    context = { businessId: business._id.toString(), userId: userId.toString(), role: 'master', staffId: staffId.toString() };
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await replSet.stop();
  });

  it('starts one shift per staff member, captures the hourly rate, and closes it with an audit trail', async () => {
    expect(await shifts.current(context)).toBeNull();
    const opened = await shifts.start(context);
    expect(opened).toMatchObject({ staffId: staffId.toString(), hourlyRateMinor: 10_000 });
    expect(await shifts.current(context)).toMatchObject({ id: opened.id });
    await expect(shifts.start(context)).rejects.toMatchObject({ code: 'SHIFT_ALREADY_OPEN', httpStatus: 409 });

    const closed = await shifts.close(context);
    expect(closed.id).toBe(opened.id);
    expect(closed.closedAt).toBeDefined();
    expect(closed.minutes).toBeGreaterThanOrEqual(1);
    expect(closed.wageMinor).toBeGreaterThanOrEqual(0);
    expect(await shifts.current(context)).toBeNull();
    expect(await AuditLog.countDocuments({ businessId, action: { $in: ['shift.started', 'shift.closed'] } })).toBe(2);
  }, 30_000);

  it('keeps an open shift available when the staff member signs in with a newly linked account', async () => {
    const opened = await shifts.start(context);
    const relinkedContext = { ...context, userId: new mongoose.Types.ObjectId().toString() };
    const { routeRuntime } = await import('../../packages/server/src/auth/route-runtime');

    expect(await shifts.current(relinkedContext)).toMatchObject({ id: opened.id });
    expect(await routeRuntime.hasActiveShift?.(relinkedContext)).toBe(true);

    const closed = await shifts.close(relinkedContext);
    expect(closed.id).toBe(opened.id);
    expect(await shifts.current(relinkedContext)).toBeNull();
    expect(await routeRuntime.hasActiveShift?.(relinkedContext)).toBe(false);
  }, 30_000);

  it('limits totals and prorates wages to the selected local-day range', async () => {
    const customerId = new mongoose.Types.ObjectId();
    const serviceId = new mongoose.Types.ObjectId();
    const appointment = await Appointment.create({
      businessId, customerId, staffId, serviceId,
      startAt: new Date('2025-01-02T01:00:00.000Z'), endAt: new Date('2025-01-02T02:00:00.000Z'), blockedUntilAt: new Date('2025-01-02T02:00:00.000Z'), bufferMinutes: 0,
      status: 'completed', completedAt: new Date('2025-01-02T01:00:00.000Z'), source: 'internal',
      serviceSnapshot: { name: 'Color', durationMinutes: 60, priceMinor: 12_000, currency: 'KGS', costMinor: 2_000 }, rescheduleCount: 0,
    });
    const paymentId = new mongoose.Types.ObjectId();
    await Transaction.create([
      { businessId, paymentId, appointmentId: appointment._id, customerId, staffId, type: 'charge', direction: 'in', amountMinor: 10_000, currency: 'KGS', method: 'cash', occurredAt: new Date('2025-01-02T01:00:00.000Z'), createdBy: userId },
      { businessId, paymentId: new mongoose.Types.ObjectId(), appointmentId: appointment._id, customerId, staffId, type: 'refund', direction: 'out', amountMinor: 1_000, currency: 'KGS', method: 'cash', occurredAt: new Date('2025-01-02T02:00:00.000Z'), createdBy: userId },
      { businessId, paymentId: new mongoose.Types.ObjectId(), appointmentId: appointment._id, customerId, staffId, type: 'charge', direction: 'in', amountMinor: 99_000, currency: 'KGS', method: 'cash', occurredAt: new Date('2025-01-03T01:00:00.000Z'), createdBy: userId },
    ]);
    await Shift.create({
      businessId, staffId, userId, startedAt: new Date('2025-01-01T16:00:00.000Z'), closedAt: new Date('2025-01-02T03:00:00.000Z'), hourlyRateMinor: 10_000,
    });

    const report = await reports.get(context, '2025-01-02', '2025-01-02');
    expect(report.totals).toMatchObject({ incomeMinor: 10_000, refundsMinor: 1_000, materialCostMinor: 2_000, payrollMinor: 90_000, netProfitMinor: -83_000, completedAppointments: 1, paidOperations: 1, shifts: 1 });
    expect(report.payroll).toEqual([{ staffId: staffId.toString(), name: 'Master One', minutes: 540, wageMinor: 90_000 }]);
  });
});
