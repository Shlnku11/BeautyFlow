import { hash } from '@node-rs/argon2';
import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import { getEnv } from '../packages/server/src/config/env';
import { Appointment, Business, BusinessMember, Customer, Payment, Service, Settings, Staff, StaffSchedule, StaffService, Transaction, User } from '../packages/server/src/db/models';
import type { AppointmentDocument } from '../packages/server/src/db/models/appointments';
import type { ServiceDocument } from '../packages/server/src/db/models/services';
import { occupiedKeysFor } from '../packages/server/src/domain/booking-engine/occupancy';

const DEMO_EMAIL = 'owner@demo.local';
const DEMO_PASSWORD = 'demo-password-123';
const MASTER_EMAIL = 'master@demo.local';
const MASTER_PASSWORD = 'demo-password-123';
const DEMO_SLUG = 'demo-salon';
const TIMEZONE = 'Asia/Bishkek';

const staffRows = [
  { name: 'Анна', email: MASTER_EMAIL, phone: '+996 555 100 001', color: 'violet' },
  { name: 'Мария', email: 'maria@demo.local', phone: '+996 555 100 002', color: 'rose' },
  { name: 'Елена', email: 'elena@demo.local', phone: '+996 555 100 003', color: 'teal' },
] as const;

const serviceRows = [
  { name: 'Стрижка', durationMinutes: 60, bufferMinutes: 15, priceMinor: 150_000 },
  { name: 'Окрашивание', durationMinutes: 120, bufferMinutes: 15, priceMinor: 450_000 },
  { name: 'Маникюр', durationMinutes: 60, bufferMinutes: 10, priceMinor: 120_000 },
  { name: 'Педикюр', durationMinutes: 75, bufferMinutes: 10, priceMinor: 150_000 },
  { name: 'Массаж лица', durationMinutes: 45, bufferMinutes: 10, priceMinor: 200_000 },
] as const;

const customerRows = [
  ['Алина', 'Смирнова'], ['Дарья', 'Иванова'], ['Марина', 'Петрова'], ['Ольга', 'Соколова'], ['Екатерина', 'Кузнецова'],
  ['Светлана', 'Попова'], ['Наталья', 'Лебедева'], ['Ирина', 'Козлова'], ['Юлия', 'Новикова'], ['Анна', 'Морозова'],
] as const;

interface SeedAppointment {
  key: string;
  status: AppointmentDocument['status'];
  date: DateTime;
  time: string;
  staffIndex: number;
  customerIndex: number;
  serviceIndex: number;
}

function localDateTime(date: DateTime, time: string): Date {
  const [hour = '0', minute = '0'] = time.split(':');
  return date.set({ hour: Number(hour), minute: Number(minute), second: 0, millisecond: 0 }).toUTC().toJSDate();
}

function isOccupiedKeysConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; keyPattern?: unknown };
  if (candidate.code !== 11000 || typeof candidate.keyPattern !== 'object' || candidate.keyPattern === null) return false;
  return 'occupiedKeys' in candidate.keyPattern;
}

function candidateStartTimes(row: SeedAppointment, service: ServiceDocument): Date[] {
  const [preferredHour = '0', preferredMinute = '0'] = row.time.split(':');
  const preferred = Number(preferredHour) * 60 + Number(preferredMinute);
  const latestStart = 19 * 60 - service.durationMinutes - service.bufferMinutes;
  const startMinutes = [
    ...Array.from({ length: Math.max(0, Math.floor((13 * 60 - service.durationMinutes - service.bufferMinutes - 10 * 60) / 15) + 1) }, (_, index) => 10 * 60 + index * 15),
    ...Array.from({ length: Math.max(0, Math.floor((latestStart - 14 * 60) / 15) + 1) }, (_, index) => 14 * 60 + index * 15),
  ];
  return startMinutes
    .sort((left, right) => Math.abs(left - preferred) - Math.abs(right - preferred) || left - right)
    .map((minute) => localDateTime(row.date, `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`));
}

function openDay(offset: number): DateTime {
  let day = DateTime.now().setZone(TIMEZONE).startOf('day').plus({ days: offset });
  while (day.weekday === 7) day = day.plus({ days: 1 });
  return day;
}

function historicalDay(dayOfMonth: number): DateTime {
  const previousMonth = DateTime.now().setZone(TIMEZONE).startOf('month').minus({ months: 1 });
  let day = previousMonth.set({ day: Math.min(dayOfMonth, previousMonth.daysInMonth ?? dayOfMonth) }).startOf('day');
  while (day.weekday === 7) day = day.plus({ days: 1 });
  return day;
}

function seedAppointments(now: DateTime): SeedAppointment[] {
  const rows: SeedAppointment[] = [];
  const completedDays = [2, 4, 7, 9, 11, 14, 16, 18, 21, 23];
  for (const [index, day] of completedDays.entries()) {
    rows.push({ key: `demo-completed-${String(index + 1).padStart(2, '0')}`, status: 'completed', date: historicalDay(day), time: ['10:00', '12:00', '14:30', '16:00'][index % 4] ?? '10:00', staffIndex: index % 3, customerIndex: index % 10, serviceIndex: index % 5 });
  }

  const inactiveDays = [3, 8, 10, 15, 17];
  for (const [index, day] of inactiveDays.entries()) {
    rows.push({ key: `demo-inactive-${String(index + 1).padStart(2, '0')}`, status: index < 3 ? 'cancelled' : 'no_show', date: historicalDay(day), time: ['11:00', '14:00', '16:00'][index % 3] ?? '11:00', staffIndex: (index + 1) % 3, customerIndex: (index + 4) % 10, serviceIndex: (index + 2) % 5 });
  }

  const confirmedDays = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5];
  for (const [index, offset] of confirmedDays.entries()) {
    rows.push({ key: `demo-confirmed-${String(index + 1).padStart(2, '0')}`, status: 'confirmed', date: openDay(offset), time: index % 2 === 0 ? '10:00' : '14:00', staffIndex: index % 2, customerIndex: (index + 2) % 10, serviceIndex: (index + 1) % 5 });
  }

  for (let index = 0; index < 5; index += 1) {
    const offset = 8 + index;
    const day = now.plus({ days: offset }).startOf('day');
    rows.push({ key: `demo-pending-${String(index + 1).padStart(2, '0')}`, status: 'pending', date: day.weekday === 7 ? day.plus({ days: 1 }) : day, time: ['10:00', '12:00', '14:00', '16:00', '17:00'][index] ?? '10:00', staffIndex: index % 3, customerIndex: (index + 5) % 10, serviceIndex: (index + 3) % 5 });
  }
  return rows;
}

async function upsertUser(email: string, name: string, passwordHash: string) {
  const user = await User.findOneAndUpdate(
    { emailNormalized: email },
    { $set: { email, emailNormalized: email, passwordHash, name, locale: 'ru', status: 'active', passwordChangedAt: new Date() } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).exec();
  return user;
}

async function ensureDemoBusiness() {
  const legacy = await Business.findOne({ slug: 'beautyflow-demo' }).lean().exec();
  const requested = await Business.findOne({ slug: DEMO_SLUG }).lean().exec();
  if (legacy && !legacy._id.equals(requested?._id ?? legacy._id)) {
    if (requested) {
      const linkedCounts = await Promise.all([
        BusinessMember.countDocuments({ businessId: requested._id }).exec(),
        Staff.countDocuments({ businessId: requested._id }).exec(),
        Service.countDocuments({ businessId: requested._id }).exec(),
        Customer.countDocuments({ businessId: requested._id }).exec(),
        Appointment.countDocuments({ businessId: requested._id }).exec(),
        Payment.countDocuments({ businessId: requested._id }).exec(),
        Transaction.countDocuments({ businessId: requested._id }).exec(),
        Settings.countDocuments({ businessId: requested._id }).exec(),
      ]);
      if (linkedCounts.some((count) => count > 0)) throw new Error(`Cannot migrate demo tenant: ${DEMO_SLUG} already contains linked records`);
      await Business.collection.deleteOne({ _id: requested._id, slug: DEMO_SLUG });
    }
    // The Business.slug application field is immutable; this local, development-only migration renames the legacy demo tenant without changing its identity.
    await Business.collection.updateOne(
      { _id: legacy._id, slug: 'beautyflow-demo' },
      { $set: { slug: DEMO_SLUG, name: 'BeautyFlow Demo Studio', timezone: TIMEZONE, currency: 'KGS', countryCode: 'KG', phone: '+996 555 010 010', address: 'Бишкек, проспект Чуй, 123', publicDescription: 'Демонстрационный салон BeautyFlow', status: 'active' } },
    );
    const migrated = await Business.findById(legacy._id).exec();
    if (!migrated) throw new Error('Legacy demo business migration failed');
    return migrated;
  }
  return Business.findOneAndUpdate(
    { slug: DEMO_SLUG },
    { $set: { name: 'BeautyFlow Demo Studio', slug: DEMO_SLUG, timezone: TIMEZONE, currency: 'KGS', countryCode: 'KG', phone: '+996 555 010 010', address: 'Бишкек, проспект Чуй, 123', publicDescription: 'Демонстрационный салон BeautyFlow', status: 'active' } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).exec();
}

async function seed(): Promise<void> {
  const env = getEnv();
  if (env.NODE_ENV !== 'development') throw new Error('Seed is allowed only when NODE_ENV=development');
  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB_NAME, maxPoolSize: env.MONGODB_MAX_POOL_SIZE });

  const owner = await upsertUser(DEMO_EMAIL, 'Демо-владелец', await hash(DEMO_PASSWORD, { memoryCost: 19_456, timeCost: 2, parallelism: 1 }));
  const master = await upsertUser(MASTER_EMAIL, 'Демо-мастер', await hash(MASTER_PASSWORD, { memoryCost: 19_456, timeCost: 2, parallelism: 1 }));
  const business = await ensureDemoBusiness();

  const now = DateTime.now().setZone(TIMEZONE);
  const ownerMembership = await BusinessMember.findOneAndUpdate(
    { businessId: business._id, userId: owner._id },
    { $set: { role: 'owner', status: 'active', joinedAt: now.toJSDate() }, $unset: { staffId: 1, inviteTokenHash: 1, inviteExpiresAt: 1 } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).exec();
  void ownerMembership;

  const staffDocs = await Promise.all(staffRows.map((row, index) => Staff.findOneAndUpdate(
    { businessId: business._id, email: row.email },
    { $set: { displayName: row.name, email: row.email, phone: row.phone, bio: `${row.name} — мастер BeautyFlow Demo Studio`, color: row.color, isActive: true, acceptsOnlineBooking: true, displayOrder: index, bookingVersion: 1, isDeleted: false, deletedAt: null } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).exec()));
  const masterStaff = staffDocs[0];
  if (!masterStaff) throw new Error('Unable to seed the master staff profile');
  await BusinessMember.findOneAndUpdate(
    { businessId: business._id, userId: master._id },
    { $set: { role: 'master', status: 'active', staffId: masterStaff._id, joinedAt: now.toJSDate() }, $unset: { inviteTokenHash: 1, inviteExpiresAt: 1 } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).exec();

  const legacyService = await Service.findOne({ businessId: business._id, nameNormalized: 'стрижка и укладка' }).lean().exec();
  const firstService = serviceRows[0];
  if (legacyService && firstService) {
    await Service.findOneAndUpdate(
      { businessId: business._id, _id: legacyService._id },
      { $set: { ...firstService, nameNormalized: firstService.name.toLocaleLowerCase('ru'), description: `${firstService.name} в BeautyFlow Demo Studio`, currency: 'KGS', onlineBookingEnabled: true, isActive: true, displayOrder: 0, isDeleted: false, deletedAt: null } },
      { returnDocument: 'after', runValidators: true },
    ).exec();
  }
  const serviceDocs = await Promise.all(serviceRows.map((row, index) => {
    const nameNormalized = row.name.trim().toLocaleLowerCase('ru');
    return Service.findOneAndUpdate(
      { businessId: business._id, nameNormalized },
      { $set: { ...row, nameNormalized, description: `${row.name} в BeautyFlow Demo Studio`, currency: 'KGS', onlineBookingEnabled: true, isActive: true, displayOrder: index, isDeleted: false, deletedAt: null } },
      { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
    ).exec();
  }));
  const validStaff = staffDocs.filter((row) => row !== null);
  const validServices = serviceDocs.filter((row) => row !== null);
  await Promise.all(validStaff.flatMap((staff) => validServices.map((service) => StaffService.findOneAndUpdate(
    { businessId: business._id, staffId: staff._id, serviceId: service._id },
    { $setOnInsert: { businessId: business._id, staffId: staff._id, serviceId: service._id } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).exec())));

  const weekly = Array.from({ length: 6 }, (_, index) => ({ isoWeekday: index + 1, intervals: [{ start: '10:00', end: '19:00' }], breaks: [{ start: '13:00', end: '14:00' }] }));
  await Promise.all(validStaff.map((staff) => StaffSchedule.findOneAndUpdate(
    { businessId: business._id, staffId: staff._id },
    { $set: { weekly } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).exec()));

  const legacyCustomer = await Customer.findOne({ businessId: business._id, phoneNormalized: '+996555010012' }).lean().exec();
  const firstCustomer = customerRows[0];
  if (legacyCustomer && firstCustomer) {
    const email = 'client001@demo.local';
    await Customer.findOneAndUpdate(
      { businessId: business._id, _id: legacyCustomer._id },
      { $set: { firstName: firstCustomer[0], lastName: firstCustomer[1], phone: '+996 555 001 000', phoneNormalized: '+996555001000', email, emailNormalized: email, searchTokens: ['алина', 'смирнова', '996555001000'], source: 'internal', isDeleted: false, deletedAt: null, contacts: [] } },
      { returnDocument: 'after', runValidators: true },
    ).exec();
  }
  const customers = await Promise.all(customerRows.map(([firstName, lastName], index) => {
    const suffix = String(index + 1).padStart(3, '0');
    const phoneNormalized = `+996555${suffix}000`;
    const email = `client${suffix}@demo.local`;
    return Customer.findOneAndUpdate(
      { businessId: business._id, phoneNormalized },
      { $set: { firstName, lastName, phone: `+996 555 ${suffix} 000`, phoneNormalized, email, emailNormalized: email, notes: index === 0 ? 'Предпочитает утренние записи.' : undefined, searchTokens: [firstName.toLocaleLowerCase('ru'), lastName.toLocaleLowerCase('ru'), phoneNormalized.replace(/\D/g, '')], source: 'internal', isDeleted: false, deletedAt: null, contacts: [] } },
      { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
    ).exec();
  }));

  await Settings.findOneAndUpdate(
    { businessId: business._id },
    { $setOnInsert: { businessId: business._id } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).exec();

  const appointmentRows = seedAppointments(now);
  const appointments: AppointmentDocument[] = [];
  for (const row of appointmentRows) {
    const staff = validStaff[row.staffIndex];
    const service = validServices[row.serviceIndex];
    const customer = customers[row.customerIndex];
    if (!staff || !service || !customer) throw new Error(`Missing demo reference for ${row.key}`);
    const active = ['pending', 'confirmed', 'completed'].includes(row.status);
    const preferredStart = localDateTime(row.date, row.time);
    const startCandidates = active ? candidateStartTimes(row, service) : [preferredStart];
    let appointment: AppointmentDocument | null = null;
    for (const startAt of startCandidates) {
      const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
      const blockedUntilAt = new Date(endAt.getTime() + service.bufferMinutes * 60_000);
      const cancelledAt = row.status === 'cancelled' ? endAt : undefined;
      const completedAt = row.status === 'completed' ? endAt : undefined;
      const seedFields = {
        businessId: business._id,
        customerId: customer._id,
        staffId: staff._id,
        serviceId: service._id,
        startAt,
        endAt,
        bufferMinutes: service.bufferMinutes,
        blockedUntilAt,
        ...(active ? { occupiedKeys: occupiedKeysFor(staff._id.toString(), startAt, blockedUntilAt) } : {}),
        status: row.status,
        source: 'internal' as const,
        serviceSnapshot: { name: service.name, durationMinutes: service.durationMinutes, priceMinor: service.priceMinor, currency: service.currency },
        contactEmail: customer.email,
        customerNote: row.status === 'completed' ? 'Пожелания обсудили перед визитом.' : undefined,
        internalNote: row.status === 'pending' ? 'Ожидается подтверждение клиента.' : undefined,
        visitNote: row.status === 'completed' ? 'Визит завершён, клиент доволен результатом.' : undefined,
        idempotencyKey: row.key,
        rescheduleCount: 0,
        createdBy: owner._id,
        ...(cancelledAt ? { cancelledAt, cancelledBy: 'staff' as const, cancelReason: 'Демо-отмена' } : {}),
        ...(completedAt ? { completedAt } : {}),
      };
      // BOOKING_ENGINE_SPEC §§5.2, 7: occupiedKeys come from the booking engine for blocking states; terminal cancellation/no-show has no slot claim.
      try {
        appointment = await Appointment.findOneAndUpdate(
          { businessId: business._id, idempotencyKey: row.key },
          { $set: seedFields, ...(!active ? { $unset: { occupiedKeys: 1 } } : {}) },
          { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
        ).exec();
      } catch (error) {
        if (active && isOccupiedKeysConflict(error)) continue;
        throw error;
      }
      if (appointment) break;
    }
    if (!appointment) throw new Error(`No unoccupied demo appointment slot found for ${row.key}`);
    appointments.push(appointment);
  }

  const completedAppointments = appointmentRows.flatMap((row, index) => row.status === 'completed' ? [appointments[index]].filter((item) => item !== null) : []);
  const paymentPlans = [
    { appointmentIndex: 0, status: 'paid' as const, amountMinor: 600_000, refundedMinor: 0, method: 'card' as const },
    { appointmentIndex: 1, status: 'paid' as const, amountMinor: 650_000, refundedMinor: 0, method: 'cash' as const },
    { appointmentIndex: 2, status: 'paid' as const, amountMinor: 550_000, refundedMinor: 0, method: 'transfer' as const },
    { appointmentIndex: 3, status: 'paid' as const, amountMinor: 600_000, refundedMinor: 0, method: 'card' as const },
    { appointmentIndex: 4, status: 'paid' as const, amountMinor: 500_000, refundedMinor: 0, method: 'cash' as const },
    { appointmentIndex: 5, status: 'paid' as const, amountMinor: 500_000, refundedMinor: 200_000, method: 'card' as const },
    { appointmentIndex: 6, status: 'pending' as const, amountMinor: 450_000, refundedMinor: 0, method: 'transfer' as const },
    { appointmentIndex: 7, status: 'pending' as const, amountMinor: 300_000, refundedMinor: 0, method: 'cash' as const },
  ];
  const demoPayments = await Promise.all(paymentPlans.map(async (plan, index) => {
    const appointment = completedAppointments[plan.appointmentIndex];
    if (!appointment) throw new Error(`Missing completed appointment for payment ${index + 1}`);
    const paidAt = plan.status === 'pending' ? undefined : appointment.startAt;
    return Payment.findOneAndUpdate(
      { businessId: business._id, idempotencyKey: `demo-payment-${String(index + 1).padStart(2, '0')}` },
      { $set: { businessId: business._id, appointmentId: appointment._id, customerId: appointment.customerId, staffId: appointment.staffId, amountMinor: plan.amountMinor, refundedMinor: plan.refundedMinor, currency: 'KGS', method: plan.method, status: plan.status, ...(paidAt ? { paidAt } : {}), notes: index < 6 ? 'Оплата за услугу и дополнительные уходовые средства.' : 'Ожидается оплата визита.', idempotencyKey: `demo-payment-${String(index + 1).padStart(2, '0')}`, createdBy: owner._id }, ...(!paidAt ? { $unset: { paidAt: 1 } } : {}) },
      { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
    ).exec();
  }));

  for (const payment of demoPayments) {
    if (payment.status === 'pending') continue;
    const occurredAt = payment.paidAt ?? payment.createdAt;
    const existingCharge = await Transaction.findOne({ businessId: business._id, paymentId: payment._id, type: 'charge' }).lean().exec();
    if (!existingCharge) {
      // PAYMENTS_SPEC §4 / DATA_MODEL_MONGODB §§14–15: ledger rows are append-only and created once per seeded paid operation.
      await Transaction.create({ businessId: business._id, paymentId: payment._id, appointmentId: payment.appointmentId, customerId: payment.customerId, staffId: payment.staffId, type: 'charge', direction: 'in', amountMinor: payment.amountMinor, currency: payment.currency, method: payment.method, occurredAt, createdBy: owner._id });
    }
    if (payment.refundedMinor > 0) {
      const existingRefund = await Transaction.findOne({ businessId: business._id, paymentId: payment._id, type: 'refund' }).lean().exec();
      if (!existingRefund) await Transaction.create({ businessId: business._id, paymentId: payment._id, appointmentId: payment.appointmentId, customerId: payment.customerId, staffId: payment.staffId, type: 'refund', direction: 'out', amountMinor: payment.refundedMinor, currency: payment.currency, method: payment.method, occurredAt: new Date(occurredAt.getTime() + 60_000), note: 'Частичный возврат по просьбе клиента.', createdBy: owner._id });
    }
  }

  const counts = await Promise.all([
    Staff.countDocuments({ businessId: business._id, isDeleted: false }).exec(),
    Service.countDocuments({ businessId: business._id, isDeleted: false }).exec(),
    Customer.countDocuments({ businessId: business._id, isDeleted: false }).exec(),
    Appointment.countDocuments({ businessId: business._id }).exec(),
    Payment.countDocuments({ businessId: business._id }).exec(),
  ]);
  process.stdout.write(`Создано: ${counts[0]} мастера, ${counts[1]} услуг, ${counts[2]} клиентов, ${counts[3]} записей, ${counts[4]} оплат. Войти: ${DEMO_EMAIL} / ${DEMO_PASSWORD}\n`);
  process.stdout.write(`Публичная запись: ${process.env.DEV_APP_BASE_URL ?? 'http://localhost:5173'}/b/${DEMO_SLUG}\n`);
}

seed().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}).finally(async () => {
  await mongoose.disconnect();
});
