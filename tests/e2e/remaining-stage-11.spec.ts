import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import mongoose from 'mongoose';
import { verifyRegistrationEmail } from './email-verification';
import { captureThemeScreenshots } from './screen-capture';
import { appOrigin } from './test-origin';

const origin = appOrigin;
const ownerPassword = 'Strong-password-123';

function futureMonday(weeksAhead = 1): string {
  const date = new Date();
  const daysUntilMonday = (8 - date.getUTCDay()) % 7 || 7;
  date.setUTCDate(date.getUTCDate() + daysUntilMonday + (weeksAhead - 1) * 7);
  return date.toISOString().slice(0, 10);
}

async function registerOwner(page: Page, label: string): Promise<{ businessId: string; slug: string }> {
  const run = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const ipOffset = Number(run.replaceAll('-', '').slice(-8)) % 65_536;
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': `198.19.${Math.floor(ipOffset / 256)}.${ipOffset % 256 || 1}` });
  await page.goto('/register');
  await page.getByLabel('Название бизнеса').fill(`${label} ${run}`);
  await page.getByLabel('Страна').selectOption('KG');
  await page.getByLabel('Валюта').selectOption('KGS');
  await page.getByLabel('Ваше имя').fill(`${label} Owner`);
  const email = `${label.toLowerCase()}.${run}@example.test`;
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(ownerPassword);
  await page.getByLabel('Я принимаю условия использования').check();
  await page.getByRole('button', { name: 'Создать бизнес' }).click();
  await verifyRegistrationEmail(page, email);
  const response = await page.request.get(`${origin}/api/auth/me`);
  expect(response.ok()).toBeTruthy();
  const me = (await response.json()).data as { active: { businessId: string; business: { slug: string } } };
  return { businessId: me.active.businessId, slug: me.active.business.slug };
}

async function createCatalog(page: Page, label: string, email?: string) {
  const staffResponse = await page.request.post(`${origin}/api/staff`, {
    headers: { Origin: origin },
    data: { displayName: `${label} Master`, ...(email ? { email } : {}), color: 'teal', acceptsOnlineBooking: true },
  });
  expect(staffResponse.status()).toBe(201);
  const staff = (await staffResponse.json()).data as { id: string; accessInvite?: string };
  const serviceResponse = await page.request.post(`${origin}/api/services`, {
    headers: { Origin: origin },
    data: { name: `${label} Service`, durationMinutes: 30, priceMinor: 1250, staffIds: [staff.id] },
  });
  expect(serviceResponse.status()).toBe(201);
  const service = (await serviceResponse.json()).data as { id: string };
  const scheduleResponse = await page.request.put(`${origin}/api/staff/${staff.id}/schedule`, {
    headers: { Origin: origin },
    data: { weekly: Array.from({ length: 7 }, (_, index) => ({ isoWeekday: index + 1, intervals: [{ start: '09:00', end: '17:00' }], breaks: [] })) },
  });
  expect(scheduleResponse.status()).toBe(200);
  return { staff, service };
}

async function getSlots(page: Page, slug: string, serviceId: string, staffId: string, date: string): Promise<{ startAt: string }[]> {
  const response = await page.request.get(`${origin}/api/public/b/${slug}/availability?serviceId=${serviceId}&staffId=${staffId}&date=${date}`);
  expect(response.ok()).toBeTruthy();
  return ((await response.json()).data as { slots: { startAt: string }[] }).slots;
}

async function connectE2eDatabase() {
  if (mongoose.connection.readyState !== 1) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI must be loaded for E2E tenant/occupancy assertions');
    await mongoose.connect(uri, process.env.MONGODB_DB_NAME ? { dbName: process.env.MONGODB_DB_NAME } : {});
  }
  return mongoose.connection;
}

test('E2E-3: customer reschedule wins the target slot and occupiedKeys stay unique', async ({ page, context }) => {
  test.setTimeout(120_000);
  const { businessId, slug } = await registerOwner(page, 'E2E-3');
  const { staff, service } = await createCatalog(page, 'E2E-3');
  const startDate = futureMonday(2);
  const targetDate = futureMonday(3);
  const [originalSlot] = await getSlots(page, slug, service.id, staff.id, startDate);
  const [targetSlot] = await getSlots(page, slug, service.id, staff.id, targetDate);
  if (!originalSlot || !targetSlot) throw new Error('Expected available slots for the E2E reschedule scenario');
  const created = await page.request.post(`${origin}/api/public/b/${slug}/appointments`, {
    headers: { Origin: origin },
    data: { serviceId: service.id, staffId: staff.id, startAt: originalSlot.startAt, customer: { firstName: 'Move E2E', phone: '+996700123456' }, acceptPrivacy: true },
  });
  expect(created.status()).toBe(201);
  const appointment = (await created.json()).data as { appointment: { id: string }; manageToken: string };

  const secondTab = await context.newPage();
  await page.goto(`/b/${slug}/manage/${appointment.manageToken}`);
  await expect(page.getByRole('heading', { name: 'Управление записью' })).toBeVisible();
  await secondTab.goto(`/b/${slug}`);
  await secondTab.getByLabel('Услуга').selectOption(service.id);
  await secondTab.getByLabel('Мастер').selectOption(staff.id);
  await secondTab.getByLabel('Дата').fill(targetDate);
  await secondTab.getByRole('button', { name: 'Показать время' }).click();
  const targetClock = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Bishkek', hour: '2-digit', minute: '2-digit' }).format(new Date(targetSlot.startAt));
  await secondTab.getByRole('button', { name: targetClock }).click();
  await secondTab.getByLabel('Имя').fill('Concurrent E2E');
  await secondTab.getByLabel('Телефон').fill('+996700123457');
  await secondTab.getByRole('checkbox').check();
  await page.getByLabel('Новая дата').fill(targetDate);
  await page.getByRole('button', { name: 'Показать время' }).click();
  await page.getByRole('button', { name: targetClock }).click();
  await expect(page.getByText(/E2E-3.*Service/)).toBeVisible();

  await page.getByRole('button', { name: 'Показать время' }).click();
  await page.getByRole('button', { name: targetClock }).click();
  await expect(page.getByText(/E2E-3.*Service/)).toBeVisible();
  await expect.poll(async () => {
    const row = await page.request.get(`${origin}/api/public/manage/${appointment.manageToken}`);
    return ((await row.json()).data as { startAt: string }).startAt;
  }).toBe(targetSlot.startAt);
  const contenderPromise = secondTab.waitForResponse((response) => response.url().includes(`/api/public/b/${slug}/appointments`) && response.request().method() === 'POST', { timeout: 120_000 });
  await secondTab.getByRole('button', { name: 'Подтвердить запись' }).click();
  const contender = await contenderPromise;
  expect(contender.status()).toBe(409);
  expect((await contender.json()).error.code).toBe('SLOT_UNAVAILABLE');

  const startCell = Math.floor(new Date(targetSlot.startAt).getTime() / 300_000);
  const occupied = Array.from({ length: 6 }, (_, offset) => `${staff.id}:${startCell + offset}`);
  const db = await connectE2eDatabase();
  const rows = await db.collection('appointments').find({
    businessId: new mongoose.Types.ObjectId(businessId),
    staffId: new mongoose.Types.ObjectId(staff.id),
    status: { $in: ['pending', 'confirmed', 'completed'] },
    occupiedKeys: { $in: occupied },
  }).toArray();
  expect(rows).toHaveLength(1);
  expect(rows[0]?.occupiedKeys).toEqual(expect.arrayContaining(occupied));
  expect((rows[0]?.startAt as Date).toISOString()).toBe(targetSlot.startAt);
  await secondTab.close();
});

test('E2E-5: invited master accepts AUTH-06, sees only own data, and is denied owner routes', async ({ page, context }) => {
  const { slug } = await registerOwner(page, 'E2E-5');
  const email = `master.${Date.now()}@example.test`;
  const { staff } = await createCatalog(page, 'E2E-5', email);
  expect(staff.accessInvite).toBe('sent');

  const db = await connectE2eDatabase();
  await expect.poll(async () => Boolean(await db.collection('notifications').findOne({ kind: 'staff_invite', 'recipient.email': email }))).toBe(true);
  const invitation = await db.collection('notifications').findOne({ kind: 'staff_invite', 'recipient.email': email });
  if (!invitation) throw new Error('The staff invitation notification was not persisted');
  const invitationData = invitation as unknown as { templateData: { inviteUrl: string }; status: string };
  const inviteUrl = invitationData.templateData.inviteUrl;
  expect(invitationData.status).toBe('scheduled');
  const inviteToken = new URL(inviteUrl).searchParams.get('token');
  expect(inviteToken).toBeTruthy();

  const accepted = await page.request.post(`${origin}/api/auth/accept-invite`, {
    headers: { Origin: origin }, data: { token: inviteToken, name: 'E2E Invited Master', password: ownerPassword },
  });
  expect(accepted.status()).toBe(200);
  await context.clearCookies();
  const loginPage = await context.newPage();
  await loginPage.goto('/login');
  await loginPage.getByLabel('Email').fill(email);
  await loginPage.getByLabel('Пароль').fill(ownerPassword);
  await loginPage.getByRole('button', { name: 'Войти' }).click();
  await expect(loginPage).toHaveURL(/\/app/);
  const me = await loginPage.request.get(`${origin}/api/auth/me`).then((response) => response.json()) as { data: { active: { role: string; staffId?: string }; permissions: string[] } };
  expect(me.data.active).toMatchObject({ role: 'master', staffId: staff.id });
  await loginPage.goto('/app/my-day');
  await expect(loginPage.getByRole('heading', { name: 'Мой день' })).toBeVisible();
  await loginPage.setViewportSize({ width: 1440, height: 1000 });
  await captureThemeScreenshots(loginPage, 'my-day');
  for (const label of ['Обзор', 'Оплаты', 'Настройки']) await expect(loginPage.getByRole('navigation').getByRole('link', { name: label })).toHaveCount(0);
  await expect(loginPage.getByRole('link', { name: 'Запись' })).toHaveCount(me.data.permissions.includes('appointments:create') ? 1 : 0);
  await loginPage.getByRole('button', { name: 'Открыть поиск' }).click();
  await loginPage.getByRole('textbox', { name: 'Поиск по разделам' }).fill('Оплаты');
  await expect(loginPage.getByText('Подходящих разделов не найдено.')).toBeVisible();
  await loginPage.keyboard.press('Escape');

  for (const path of ['/api/dashboard/summary', '/api/payments', '/api/settings', '/api/members']) {
    const denied = await loginPage.request.get(`${origin}${path}`);
    expect(denied.status(), path).toBe(403);
  }
  for (const path of ['/app/dashboard', '/app/payments', '/app/settings']) {
    await loginPage.goto(path);
    await expect(loginPage).toHaveURL(/\/app\/(my-day|calendar)$/);
  }
  const calendarResponse = await loginPage.request.get(`${origin}/api/calendar`);
  expect(calendarResponse.ok()).toBeTruthy();
  const calendar = (await calendarResponse.json()).data as { staff: { id: string }[]; appointments: { staff: { id: string } }[] };
  expect(calendar.staff.map((item) => item.id)).toEqual([staff.id]);
  expect(calendar.appointments.every((item) => item.staff.id === staff.id)).toBeTruthy();
  await loginPage.close();
  expect(slug).toBeTruthy();
});

test('E2E-7: direct A-to-B customer, staff, and appointment routes stay isolated', async ({ browser }: { browser: Browser }) => {
  test.setTimeout(120_000);
  const contextA: BrowserContext = await browser.newContext();
  const contextB: BrowserContext = await browser.newContext();
  const ownerA = await contextA.newPage();
  const ownerB = await contextB.newPage();
  await registerOwner(ownerA, 'E2E-7-A');
  const { slug: slugB } = await registerOwner(ownerB, 'E2E-7-B');
  const { staff, service } = await createCatalog(ownerB, 'E2E-7-B');
  const customerResponse = await ownerB.request.post(`${origin}/api/customers`, {
    headers: { Origin: origin }, data: { firstName: 'Tenant B Customer', phone: '+996700765432' },
  });
  expect(customerResponse.status()).toBe(201);
  const customer = (await customerResponse.json()).data as { id: string };
  const [slot] = await getSlots(ownerB, slugB, service.id, staff.id, futureMonday(2));
  if (!slot) throw new Error('Expected an available tenant B appointment slot');
  const appointmentResponse = await ownerB.request.post(`${origin}/api/appointments`, {
    headers: { Origin: origin, 'Idempotency-Key': `e2e-tenant-${Date.now()}` },
    data: { newCustomer: { firstName: 'Tenant B Appointment', phone: '+996700765433' }, staffId: staff.id, serviceId: service.id, startAt: slot.startAt },
  });
  expect(appointmentResponse.status()).toBe(201);
  const appointment = (await appointmentResponse.json()).data as { id: string };

  for (const path of [`/api/customers/${customer.id}`, `/api/staff/${staff.id}`, `/api/appointments/${appointment.id}`]) {
    const response = await ownerA.request.get(`${origin}${path}`);
    expect(response.status(), path).toBe(404);
  }
  const customerDetailPromise = ownerA.waitForResponse((response) => response.url().includes(`/api/customers/${customer.id}`));
  await ownerA.goto(`/app/customers/${customer.id}`);
  const customerDetail = await customerDetailPromise;
  expect(customerDetail.status()).toBe(404);
  await expect(ownerA.getByText('Не найдено', { exact: true })).toBeVisible();
  const staffDetailPromise = ownerA.waitForResponse((response) => response.url().includes(`/api/staff/${staff.id}`));
  await ownerA.goto(`/app/staff/${staff.id}`);
  expect((await staffDetailPromise).status()).toBe(404);
  await expect(ownerA.getByText('Не найдено', { exact: true })).toBeVisible();
  const appointmentDetailPromise = ownerA.waitForResponse((response) => response.url().includes(`/api/appointments/${appointment.id}`));
  await ownerA.goto(`/app/appointments/${appointment.id}`);
  expect((await appointmentDetailPromise).status()).toBe(404);
  await expect(ownerA.getByText('Не найдено', { exact: true })).toBeVisible();
  await contextA.close();
  await contextB.close();
});
