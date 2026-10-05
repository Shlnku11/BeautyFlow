import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('login route loads and provides a labeled form', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Войти' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Пароль')).toBeVisible();
});

test('login route has no serious or critical axe violations', async ({ page }) => {
  await page.goto('/login');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
});

test('UI component sandbox has no serious or critical axe violations', async ({ page }) => {
  await page.goto('/__dev/ui');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
});

test('health API reports a ready database', async ({ request }) => {
  const response = await request.get('http://localhost:3000/api/health');
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toEqual({ status: 'ok', db: 'up' });
});

test('business owner can register and log back in using a server-side session', async ({ page, context }) => {
  const run = `${Date.now()}`;
  const ipOffset = Number(run) % 16_777_214;
  const testIp = `198.51.${Math.floor(ipOffset / 256) % 256}.${ipOffset % 256 || 1}`;
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': testIp });
  const email = `e2e.${run}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Название бизнеса').fill(`E2E Studio ${run}`);
  await page.getByLabel('Страна').selectOption('KG');
  await page.getByLabel('Валюта').selectOption('KGS');
  await page.getByLabel('Ваше имя').fill('E2E Owner');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill('Strong-password-123');
  await page.getByLabel('Я принимаю условия использования').check();
  await page.getByRole('button', { name: 'Создать бизнес' }).click();
  await expect(page).toHaveURL(/\/app/);

  await context.clearCookies();
  // A separate Page starts with a fresh React Query auth cache. Reusing the registration
  // page can race its stale authenticated state against /login and abort that navigation.
  const loginPage = await context.newPage();
  await loginPage.goto('/login');
  await loginPage.getByLabel('Email').fill(email);
  await loginPage.getByLabel('Пароль').fill('Strong-password-123');
  await loginPage.getByRole('button', { name: 'Войти' }).click();
  await expect(loginPage).toHaveURL(/\/app/);
  await loginPage.close();
  await page.goto('/app/dashboard');
  await expect(page.getByRole('heading', { name: 'Обзор' })).toBeVisible();
  await expect(page.getByTestId('dashboard-kpis').locator('article')).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'Ближайшие записи' })).toBeVisible();

  const staffResponse = await page.request.post('http://localhost:3000/api/staff', {
    headers: { Origin: 'http://localhost:3000' },
    data: { displayName: 'E2E Staff', color: 'teal', acceptsOnlineBooking: true },
  });
  expect(staffResponse.status()).toBe(201);
  const createdStaff = (await staffResponse.json()).data as { id: string };
  expect(createdStaff).toMatchObject({ displayName: 'E2E Staff', color: 'teal', isActive: true });
  await page.goto('/app/staff');
  await expect(page.getByRole('heading', { name: 'Сотрудники' })).toBeVisible();
  await page.getByRole('link', { name: 'E2E Staff' }).click();
  await expect(page.getByRole('tab', { name: 'Профиль' })).toBeVisible();
  for (const tab of ['Расписание', 'Исключения', 'Услуги', 'Доступ']) await expect(page.getByRole('tab', { name: tab })).toBeVisible();

  const serviceResponse = await page.request.post('http://localhost:3000/api/services', {
    headers: { Origin: 'http://localhost:3000' },
    data: { name: 'E2E haircut', durationMinutes: 30, priceMinor: 2500, staffIds: [createdStaff.id] },
  });
  expect(serviceResponse.status()).toBe(201);
  const createdService = (await serviceResponse.json()).data as { id: string };
  expect(createdService).toMatchObject({ name: 'E2E haircut', durationMinutes: 30, priceMinor: 2500, staffIds: [createdStaff.id] });
  await page.goto('/app/services');
  await expect(page.getByRole('heading', { name: 'Услуги' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'E2E haircut' })).toBeVisible();

  const scheduleResponse = await page.request.put(`http://localhost:3000/api/staff/${createdStaff.id}/schedule`, {
    headers: { Origin: 'http://localhost:3000' },
    data: { weekly: [{ isoWeekday: 1, intervals: [{ start: '09:00', end: '17:00' }], breaks: [{ start: '12:00', end: '12:30' }] }] },
  });
  expect(scheduleResponse.status()).toBe(200);
  expect((await scheduleResponse.json()).data.schedule.weekly).toHaveLength(1);

  const exceptionDate = '2030-06-10';
  const exceptionResponse = await page.request.post(`http://localhost:3000/api/staff/${createdStaff.id}/exceptions`, {
    headers: { Origin: 'http://localhost:3000' },
    data: { date: exceptionDate, kind: 'day_off', intervals: [], breaks: [] },
  });
  expect(exceptionResponse.status()).toBe(200);
  const exceptionsResponse = await page.request.get(`http://localhost:3000/api/staff/${createdStaff.id}/exceptions?from=${exceptionDate}&to=${exceptionDate}`);
  expect((await exceptionsResponse.json()).data).toHaveLength(1);
  const deleteExceptionResponse = await page.request.delete(`http://localhost:3000/api/staff/${createdStaff.id}/exceptions/${exceptionDate}`, { headers: { Origin: 'http://localhost:3000' } });
  expect(deleteExceptionResponse.status()).toBe(204);
  const availabilityResponse = await page.request.get(`http://localhost:3000/api/availability?serviceId=${createdService.id}&staffId=${createdStaff.id}&date=${exceptionDate}`);
  expect(availabilityResponse.status()).toBe(200);
  expect((await availabilityResponse.json()).data.slots[0]).toMatchObject({ startAt: '2030-06-10T03:00:00.000Z', staffId: createdStaff.id });

  const phone = `+996555${(Number(run) % 1_000_000).toString().padStart(6, '0')}`;
  const customerResponse = await page.request.post('http://localhost:3000/api/customers', {
    headers: { Origin: 'http://localhost:3000' },
    data: { firstName: 'E2E Client', phone, contacts: [{ type: 'telegram', value: 'e2e-client' }] },
  });
  expect(customerResponse.status()).toBe(201);
  const customerData = (await customerResponse.json()).data as { id: string; phone: string };
  expect(customerData.phone).toBe(phone);
  await page.goto('/app/customers');
  await page.getByLabel('Поиск').fill('E2E');
  await expect(page.getByRole('link', { name: 'E2E Client' })).toBeVisible();
  await page.getByRole('link', { name: 'E2E Client' }).click();
  await expect(page.getByRole('heading', { name: 'E2E Client' })).toBeVisible();
  const duplicateCustomerResponse = await page.request.post('http://localhost:3000/api/customers', {
    headers: { Origin: 'http://localhost:3000' },
    data: { firstName: 'Duplicate', phone },
  });
  expect(duplicateCustomerResponse.status()).toBe(409);
  const customerListResponse = await page.request.get('http://localhost:3000/api/customers?q=E2E');
  expect((await customerListResponse.json()).data).toEqual(expect.arrayContaining([expect.objectContaining({ id: customerData.id, firstName: 'E2E Client' })]));

  const appointmentRequest = { customerId: customerData.id, serviceId: createdService.id, staffId: createdStaff.id, startAt: '2030-06-10T03:00:00.000Z' };
  const firstAppointmentResponse = await page.request.post('http://localhost:3000/api/appointments', {
    headers: { Origin: 'http://localhost:3000', 'Idempotency-Key': `e2e-${run}` },
    data: appointmentRequest,
  });
  expect(firstAppointmentResponse.status()).toBe(201);
  const firstAppointment = (await firstAppointmentResponse.json()).data;
  expect(firstAppointment).toMatchObject({ startAt: appointmentRequest.startAt, staff: { id: createdStaff.id }, service: { id: createdService.id }, customer: { id: customerData.id } });
  const idempotentReplay = await page.request.post('http://localhost:3000/api/appointments', {
    headers: { Origin: 'http://localhost:3000', 'Idempotency-Key': `e2e-${run}` },
    data: appointmentRequest,
  });
  expect(idempotentReplay.status()).toBe(200);
  expect((await idempotentReplay.json()).data.id).toBe(firstAppointment.id);
  await page.goto('/app/calendar');
  await expect(page.getByRole('heading', { name: 'Календарь' })).toBeVisible();
  await page.getByLabel('Дата').fill('2030-06-10');
  await page.getByRole('button', { name: /E2E Client/ }).click();
  await expect(page.getByRole('heading', { name: 'Запись' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Запись' })).toBeHidden();

  const raceRequests = await Promise.all(Array.from({ length: 20 }, (_, competitor) => page.request.post('http://localhost:3000/api/appointments', {
    headers: { Origin: 'http://localhost:3000', 'Idempotency-Key': `e2e-race-${run}-${competitor}` },
    data: { ...appointmentRequest, startAt: '2030-06-10T03:30:00.000Z' },
  })));
  expect(raceRequests.map((response) => response.status()).sort((a, b) => a - b)).toEqual([201, ...Array.from({ length: 19 }, () => 409)]);

  const settingsResponse = await page.request.get('http://localhost:3000/api/settings');
  expect(settingsResponse.status()).toBe(200);
  expect((await settingsResponse.json()).data.business).toMatchObject({ countryCode: 'KG', currency: 'KGS' });
  await page.goto('/app/settings');
  for (const tab of ['Бизнес', 'Запись', 'Команда']) await expect(page.getByRole('tab', { name: tab })).toBeVisible();
  const bookingSettingsResponse = await page.request.patch('http://localhost:3000/api/settings/booking', {
    headers: { Origin: 'http://localhost:3000' },
    data: { minNoticeMinutes: 45 },
  });
  expect((await bookingSettingsResponse.json()).data.booking.minNoticeMinutes).toBe(45);
  const invalidTimezoneResponse = await page.request.patch('http://localhost:3000/api/settings/business', {
    headers: { Origin: 'http://localhost:3000' },
    data: { timezone: 'Invalid/Zone' },
  });
  expect(invalidTimezoneResponse.status()).toBe(422);

  const rejectedTenantOverride = await page.request.post('http://localhost:3000/api/staff', {
    headers: { Origin: 'http://localhost:3000' },
    data: { displayName: 'Injected tenant', color: 'teal', acceptsOnlineBooking: true, businessId: '000000000000000000000000' },
  });
  expect(rejectedTenantOverride.status()).toBe(422);

  const bookingDate = new Date();
  const untilMonday = (8 - bookingDate.getDay()) % 7 || 7;
  bookingDate.setDate(bookingDate.getDate() + untilMonday);
  const publicDate = bookingDate.toISOString().slice(0, 10);
  const publicSettings = (await settingsResponse.json()).data as { business: { slug: string; name: string } };
  await page.goto(`/b/${publicSettings.business.slug}`);
  await expect(page.getByRole('heading', { name: publicSettings.business.name, exact: true })).toBeVisible();
  await page.getByLabel('Услуга').selectOption(createdService.id);
  await page.getByLabel('Мастер').selectOption(createdStaff.id);
  await page.getByLabel('Дата').fill(publicDate);
  await page.getByRole('button', { name: 'Показать время' }).click();
  await page.getByRole('button', { name: /\d{2}:\d{2}/ }).first().click();
  await page.getByLabel('Имя').fill('Public E2E Client');
  await page.getByLabel('Телефон').fill(`+996777${(Number(run) % 1_000_000).toString().padStart(6, '0')}`);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Подтвердить запись' }).click();
  await expect(page.getByRole('heading', { name: 'Запись оформлена' })).toBeVisible();
  const managePath = new URL(await page.getByRole('link', { name: 'Управлять записью' }).getAttribute('href') ?? '').pathname;
  await page.goto(`http://localhost:5173${managePath}`);
  await expect(page.getByRole('heading', { name: 'Управление записью' })).toBeVisible();
  await page.getByRole('button', { name: 'Отменить запись' }).click();
});
