import { hash } from '@node-rs/argon2';
import mongoose from 'mongoose';
import { getEnv } from '../packages/server/src/config/env';
import { Business, BusinessMember, Customer, Service, Settings, Staff, StaffSchedule, StaffService, User } from '../packages/server/src/db/models';

const DEMO_EMAIL = 'owner@demo.local';
const DEMO_PASSWORD = 'demo-password-123';
const MASTER_EMAIL = 'master@demo.local';
const MASTER_PASSWORD = 'demo-password-123';
const DEMO_SLUG = 'beautyflow-demo';

async function seed(): Promise<void> {
  const env = getEnv();
  if (env.NODE_ENV !== 'development') throw new Error('Seed is allowed only when NODE_ENV=development');
  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB_NAME, maxPoolSize: env.MONGODB_MAX_POOL_SIZE });

  const now = new Date();
  const ownerHash = await hash(DEMO_PASSWORD, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  const masterHash = await hash(MASTER_PASSWORD, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  const owner = await User.findOneAndUpdate(
    { emailNormalized: DEMO_EMAIL },
    { $set: { email: DEMO_EMAIL, emailNormalized: DEMO_EMAIL, passwordHash: ownerHash, name: 'Демо-владелец', locale: 'ru', status: 'active', passwordChangedAt: now } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).exec();
  const master = await User.findOneAndUpdate(
    { emailNormalized: MASTER_EMAIL },
    { $set: { email: MASTER_EMAIL, emailNormalized: MASTER_EMAIL, passwordHash: masterHash, name: 'Демо-мастер', locale: 'ru', status: 'active', passwordChangedAt: now } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).exec();

  const business = await Business.findOneAndUpdate(
    { slug: DEMO_SLUG },
    { $set: { name: 'BeautyFlow Demo Studio', slug: DEMO_SLUG, timezone: 'Asia/Bishkek', currency: 'KGS', countryCode: 'KG', phone: '+996 555 010 010', address: 'Бишкек, проспект Чуй, 123', publicDescription: 'Демонстрационный салон BeautyFlow', status: 'active' } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).exec();

  await BusinessMember.findOneAndUpdate(
    { businessId: business._id, userId: owner._id },
    { $set: { role: 'owner', status: 'active', joinedAt: now }, $unset: { staffId: 1, inviteTokenHash: 1, inviteExpiresAt: 1 } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).exec();
  const staff = await Staff.findOneAndUpdate(
    { businessId: business._id, displayName: 'Демо-мастер' },
    { $set: { displayName: 'Демо-мастер', email: MASTER_EMAIL, phone: '+996 555 010 011', bio: 'Мастер-демонстрация BeautyFlow', color: 'violet', isActive: true, acceptsOnlineBooking: true, displayOrder: 0, isDeleted: false, deletedAt: null } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).exec();
  await BusinessMember.findOneAndUpdate(
    { businessId: business._id, userId: master._id },
    { $set: { role: 'master', status: 'active', staffId: staff._id, joinedAt: now }, $unset: { inviteTokenHash: 1, inviteExpiresAt: 1 } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).exec();

  const service = await Service.findOneAndUpdate(
    { businessId: business._id, nameNormalized: 'стрижка и укладка' },
    { $set: { name: 'Стрижка и укладка', nameNormalized: 'стрижка и укладка', description: 'Форма и укладка с учётом ваших пожеланий', durationMinutes: 60, bufferMinutes: 15, priceMinor: 250_000, currency: 'KGS', onlineBookingEnabled: true, isActive: true, displayOrder: 0, isDeleted: false, deletedAt: null } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).exec();
  await StaffService.findOneAndUpdate(
    { businessId: business._id, staffId: staff._id, serviceId: service._id },
    { $setOnInsert: { businessId: business._id, staffId: staff._id, serviceId: service._id } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).exec();

  const weekly = Array.from({ length: 6 }, (_, index) => ({ isoWeekday: index + 1, intervals: [{ start: '09:00', end: '18:00' }], breaks: [{ start: '13:00', end: '14:00' }] }));
  await StaffSchedule.findOneAndUpdate(
    { businessId: business._id, staffId: staff._id },
    { $set: { weekly } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).exec();

  await Customer.findOneAndUpdate(
    { businessId: business._id, phoneNormalized: '+996555010012' },
    { $set: { businessId: business._id, firstName: 'Алина', lastName: 'Демо', phone: '+996 555 010 012', phoneNormalized: '+996555010012', email: 'alina@demo.local', searchTokens: ['алина', 'демо'], source: 'internal', notes: 'Предпочитает утренние записи', isDeleted: false, deletedAt: null, contacts: [] } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).exec();

  await Settings.findOneAndUpdate(
    { businessId: business._id },
    { $setOnInsert: { businessId: business._id } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).exec();

  const publicUri = `${process.env.DEV_APP_BASE_URL ?? 'http://localhost:5173'}/b/${DEMO_SLUG}`;
  process.stdout.write(`Демо-аккаунты готовы. Публичная запись: ${publicUri}\nВойти: ${DEMO_EMAIL} / ${DEMO_PASSWORD}\nМастер: ${MASTER_EMAIL} / ${MASTER_PASSWORD}\n`);
}

seed().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}).finally(async () => {
  await mongoose.disconnect();
});

