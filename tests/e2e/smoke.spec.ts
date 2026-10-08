import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { verifyRegistrationEmail } from './email-verification';
import { prepareFullPageScreenshot } from './screen-capture';
import { appOrigin } from './test-origin';

test('root opens the public landing page without a redirect loop', async ({ page }) => {
  const mainFrameNavigations: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) mainFrameNavigations.push(new URL(frame.url()).pathname);
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('h1')).toHaveText(/Онлайн-запись для\s+салонов красоты/);
  await expect(page.getByRole('link', { name: 'Начать бесплатно' }).first()).toBeVisible();
  await page.waitForTimeout(500);
  const transitions = mainFrameNavigations.filter((path, index) => index === 0 || path !== mainFrameNavigations[index - 1]);
  expect(transitions, mainFrameNavigations.join(' → ')).toEqual(['/']);
  expect(mainFrameNavigations.length).toBeLessThanOrEqual(4);
  await page.screenshot({ path: 'test-results/runtime-landing.png' });
});

test('landing dashboard preview follows the active color scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const preview = page.locator('#top picture img');
  await expect(preview).toHaveAttribute('alt', /Обзор BeautyFlow/);
  await expect.poll(() => preview.evaluate((image: HTMLImageElement) => new URL(image.currentSrc).pathname)).toBe('/images/dashboard-light.png');

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => preview.evaluate((image: HTMLImageElement) => new URL(image.currentSrc).pathname)).toBe('/images/dashboard-dark.png');
});

test('landing has no serious or critical accessibility violations in either theme', async ({ page }) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.goto('/');
    await page.locator('h1').waitFor({ state: 'visible' });
    await prepareFullPageScreenshot(page);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
  }
});

test('landing stays within narrow and desktop viewport widths', async ({ page }) => {
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth, heading: document.querySelector('h1')?.scrollWidth, headingClient: document.querySelector('h1')?.clientWidth }));
    expect(dimensions.document, `document overflow at ${width}px`).toBeLessThanOrEqual(width);
    expect(dimensions.heading, `heading overflow at ${width}px`).toBeLessThanOrEqual(dimensions.headingClient ?? 0);
  }
});

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
  await verifyRegistrationEmail(page, email);

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
  await page.getByRole('button', { name: 'Открыть поиск' }).click();
  await expect(page.getByRole('dialog', { name: 'Быстрый переход' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Поиск по разделам' }).fill('Клиенты');
  await page.getByRole('dialog').getByRole('link', { name: 'Клиенты' }).click();
  await expect(page).toHaveURL(/\/app\/customers$/);
  await expect(page.getByRole('heading', { name: 'Клиенты' })).toBeVisible();

  const staffResponse = await page.request.post('http://localhost:3000/api/staff', {
    headers: { Origin: appOrigin },
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
    headers: { Origin: appOrigin },
    data: { name: 'E2E haircut', durationMinutes: 30, priceMinor: 2500, staffIds: [createdStaff.id] },
  });
  expect(serviceResponse.status()).toBe(201);
  const createdService = (await serviceResponse.json()).data as { id: string };
  expect(createdService).toMatchObject({ name: 'E2E haircut', durationMinutes: 30, priceMinor: 2500, staffIds: [createdStaff.id] });
  await page.goto('/app/services');
  await expect(page.getByRole('heading', { name: 'Услуги' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'E2E haircut', exact: true })).toBeVisible();

  const scheduleResponse = await page.request.put(`http://localhost:3000/api/staff/${createdStaff.id}/schedule`, {
    headers: { Origin: appOrigin },
    data: { weekly: [{ isoWeekday: 1, intervals: [{ start: '09:00', end: '17:00' }], breaks: [{ start: '12:00', end: '12:30' }] }] },
  });
  expect(scheduleResponse.status()).toBe(200);
  expect((await scheduleResponse.json()).data.schedule.weekly).toHaveLength(1);

  const exceptionDate = '2030-06-10';
  const exceptionResponse = await page.request.post(`http://localhost:3000/api/staff/${createdStaff.id}/exceptions`, {
    headers: { Origin: appOrigin },
    data: { date: exceptionDate, kind: 'day_off', intervals: [], breaks: [] },
  });
  expect(exceptionResponse.status()).toBe(200);
  const exceptionsResponse = await page.request.get(`http://localhost:3000/api/staff/${createdStaff.id}/exceptions?from=${exceptionDate}&to=${exceptionDate}`);
  expect((await exceptionsResponse.json()).data).toHaveLength(1);
  const deleteExceptionResponse = await page.request.delete(`http://localhost:3000/api/staff/${createdStaff.id}/exceptions/${exceptionDate}`, { headers: { Origin: appOrigin } });
  expect(deleteExceptionResponse.status()).toBe(204);
  const availabilityResponse = await page.request.get(`http://localhost:3000/api/availability?serviceId=${createdService.id}&staffId=${createdStaff.id}&date=${exceptionDate}`);
  expect(availabilityResponse.status()).toBe(200);
  expect((await availabilityResponse.json()).data.slots[0]).toMatchObject({ startAt: '2030-06-10T03:00:00.000Z', staffId: createdStaff.id });

  const phone = `+996555${(Number(run) % 1_000_000).toString().padStart(6, '0')}`;
  const customerResponse = await page.request.post('http://localhost:3000/api/customers', {
    headers: { Origin: appOrigin },
    data: { firstName: 'E2E Client', phone, contacts: [{ type: 'telegram', value: 'e2e-client' }] },
  });
  expect(customerResponse.status()).toBe(201);
  const customerData = (await customerResponse.json()).data as { id: string; phone: string };
  expect(customerData.phone).toBe(phone);
  await page.goto('/app/customers');
  await page.getByRole('textbox', { name: 'Поиск клиентов' }).fill('E2E');
  await expect(page.getByRole('link', { name: 'E2E Client' })).toBeVisible();
  await page.getByRole('link', { name: 'E2E Client' }).click();
  await expect(page.getByRole('heading', { name: 'E2E Client' })).toBeVisible();
  const duplicateCustomerResponse = await page.request.post('http://localhost:3000/api/customers', {
    headers: { Origin: appOrigin },
    data: { firstName: 'Duplicate', phone },
  });
  expect(duplicateCustomerResponse.status()).toBe(409);
  const customerListResponse = await page.request.get('http://localhost:3000/api/customers?q=E2E');
  expect((await customerListResponse.json()).data).toEqual(expect.arrayContaining([expect.objectContaining({ id: customerData.id, firstName: 'E2E Client' })]));

  const appointmentRequest = { customerId: customerData.id, serviceId: createdService.id, staffId: createdStaff.id, startAt: '2030-06-10T03:00:00.000Z' };
  const firstAppointmentResponse = await page.request.post('http://localhost:3000/api/appointments', {
    headers: { Origin: appOrigin, 'Idempotency-Key': `e2e-${run}` },
    data: appointmentRequest,
  });
  expect(firstAppointmentResponse.status()).toBe(201);
  const firstAppointment = (await firstAppointmentResponse.json()).data;
  expect(firstAppointment).toMatchObject({ startAt: appointmentRequest.startAt, staff: { id: createdStaff.id }, service: { id: createdService.id }, customer: { id: customerData.id } });
  const idempotentReplay = await page.request.post('http://localhost:3000/api/appointments', {
    headers: { Origin: appOrigin, 'Idempotency-Key': `e2e-${run}` },
    data: appointmentRequest,
  });
  expect(idempotentReplay.status()).toBe(200);
  expect((await idempotentReplay.json()).data.id).toBe(firstAppointment.id);
  await page.goto('/app/calendar');
  await expect(page.getByRole('heading', { name: 'Календарь' })).toBeVisible();
  await page.getByLabel('Дата').fill('2030-06-10');
  await page.getByRole('button', { name: 'Неделя' }).click();
  await page.waitForLoadState('networkidle');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: 'outputs/calendar-final-light.png' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'outputs/calendar-final-dark.png' });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('region', { name: 'Календарная сетка' }).getByRole('button', { name: /E2E Client/ }).click();
  await expect(page.getByRole('heading', { name: 'Запись', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Запись' })).toBeHidden();

  const raceRequests = await Promise.all(Array.from({ length: 20 }, (_, competitor) => page.request.post('http://localhost:3000/api/appointments', {
    headers: { Origin: appOrigin, 'Idempotency-Key': `e2e-race-${run}-${competitor}` },
    data: { ...appointmentRequest, startAt: '2030-06-10T03:30:00.000Z' },
  })));
  expect(raceRequests.map((response) => response.status()).sort((a, b) => a - b)).toEqual([201, ...Array.from({ length: 19 }, () => 409)]);

  const settingsResponse = await page.request.get('http://localhost:3000/api/settings');
  expect(settingsResponse.status()).toBe(200);
  expect((await settingsResponse.json()).data.business).toMatchObject({ countryCode: 'KG', currency: 'KGS' });
  await page.goto('/app/settings');
  for (const tab of ['Бизнес', 'Запись', 'Команда']) await expect(page.getByRole('tab', { name: tab })).toBeVisible();
  const bookingSettingsResponse = await page.request.patch('http://localhost:3000/api/settings/booking', {
    headers: { Origin: appOrigin },
    data: { minNoticeMinutes: 45 },
  });
  expect((await bookingSettingsResponse.json()).data.booking.minNoticeMinutes).toBe(45);
  const invalidTimezoneResponse = await page.request.patch('http://localhost:3000/api/settings/business', {
    headers: { Origin: appOrigin },
    data: { timezone: 'Invalid/Zone' },
  });
  expect(invalidTimezoneResponse.status()).toBe(422);

  const rejectedTenantOverride = await page.request.post('http://localhost:3000/api/staff', {
    headers: { Origin: appOrigin },
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
  await page.goto(`${appOrigin}${managePath}`);
  await expect(page.getByRole('heading', { name: 'Управление записью' })).toBeVisible();
  await page.getByRole('button', { name: 'Отменить запись' }).click();
});

test('business registration through the browser form opens the owner dashboard', async ({ page }) => {
  const run = `${Date.now()}`;
  const ipOffset = Number(run) % 16_777_214;
  const testIp = `203.0.${Math.floor(ipOffset / 256) % 256}.${ipOffset % 256 || 1}`;
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': testIp });
  await page.goto('/register');
  await page.getByLabel('Название бизнеса').fill(`Runtime Studio ${run}`);
  await page.getByLabel('Страна').selectOption('KG');
  await page.getByLabel('Валюта').selectOption('KGS');
  await page.getByLabel('Ваше имя').fill('Runtime Owner');
  const email = `runtime.${run}@example.test`;
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill('Runtime-password-123');
  await page.getByLabel('Я принимаю условия использования').check();
  await page.getByRole('button', { name: 'Создать бизнес' }).click();
  await verifyRegistrationEmail(page, email);
  await expect(page.getByRole('heading', { name: 'Обзор' })).toBeVisible();
  await expect(page.getByTestId('dashboard-kpis').locator('article')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/runtime-dashboard.png' });

  const staffName = 'Алия';
  await page.goto('/app/staff');
  await page.getByRole('heading', { name: 'Сотрудники' }).waitFor();
  await page.getByRole('button', { name: 'Добавить сотрудника' }).first().click();
  await page.getByLabel('Имя сотрудника').fill(staffName);
  await page.getByRole('button', { name: 'Добавить сотрудника', exact: true }).click();
  const staffLink = page.getByRole('link', { name: `Открыть профиль сотрудника ${staffName}` });
  await expect(staffLink).toBeVisible();
  await staffLink.click();
  await page.getByRole('tab', { name: 'Расписание' }).click();
  const monday = page.getByRole('checkbox', { name: 'Понедельник' });
  await monday.check();
  await page.getByLabel('Понедельник: начало').fill('09:00');
  await page.getByLabel('Понедельник: конец').fill('17:00');
  await page.getByRole('button', { name: 'Сохранить расписание' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Расписание сохранено' })).toBeVisible();

  const serviceName = 'Стрижка';
  await page.goto('/app/services');
  await page.getByRole('button', { name: '＋ Услуга' }).first().click();
  await page.getByLabel('Название').fill(serviceName);
  await page.getByLabel('Длительность, мин').fill('30');
  await page.getByLabel('Перерыв, мин').fill('0');
  await page.getByLabel('Цена').fill('25');
  await page.getByRole('checkbox', { name: staffName }).check();
  await page.getByRole('button', { name: 'Создать услугу' }).click();
  await expect(page.getByRole('cell', { name: serviceName, exact: true })).toBeVisible();

  const bookingDate = new Date();
  const untilMonday = (8 - bookingDate.getDay()) % 7 || 7;
  bookingDate.setDate(bookingDate.getDate() + untilMonday);
  const publicDate = bookingDate.toISOString().slice(0, 10);
  const slug = await page.request.get('http://localhost:3000/api/settings').then(async (response) => (await response.json()).data.business.slug as string);
  await page.goto(`/b/${slug}`);
  await page.getByLabel('Услуга').selectOption({ label: `${serviceName} · 30 мин.` });
  await page.getByLabel('Мастер').selectOption({ label: staffName });
  await page.getByLabel('Дата').fill(publicDate);
  await page.getByRole('button', { name: 'Показать время' }).click();
  const availableTime = page.getByRole('button', { name: /^\d{2}:\d{2}$/ }).first();
  await expect(availableTime).toBeVisible();
  await availableTime.click();
  await page.getByLabel('Имя').fill('Runtime Client');
  await page.getByLabel('Телефон').fill(`+996777${(Number(run) % 1_000_000).toString().padStart(6, '0')}`);
  const privacyConsent = page.getByRole('checkbox');
  if (await privacyConsent.count()) await privacyConsent.check();
  await page.getByRole('button', { name: 'Подтвердить запись' }).click();
  await expect(page.getByRole('heading', { name: 'Запись оформлена' })).toBeVisible();
  const manageUrl = await page.getByRole('link', { name: 'Управлять записью' }).getAttribute('href');
  await page.getByRole('link', { name: 'Управлять записью' }).click();
  await expect(page.getByRole('heading', { name: 'Управление записью' })).toBeVisible();

  await page.goto('/app/appointments');
  await expect(page.getByRole('heading', { name: 'Записи' })).toBeVisible();
  const appointmentRow = page.getByRole('row').filter({ hasText: 'Runtime Client' });
  await expect(appointmentRow).toBeVisible();
  await expect(appointmentRow.getByText('Принять оплату')).toBeHidden();
  await appointmentRow.getByRole('button', { name: 'Runtime Client' }).click();
  const appointmentDialog = page.getByRole('dialog', { name: 'Запись' });
  await expect(appointmentDialog).toBeVisible();
  await appointmentDialog.getByLabel('Закрыть').click();
  await expect(appointmentDialog).toBeHidden();

  await page.goto('/app/payments');
  await expect(page.getByRole('heading', { name: 'Оплаты' })).toBeVisible();
  await page.getByRole('button', { name: '＋ Принять оплату' }).click();
  const paymentDialog = page.getByRole('dialog', { name: 'Принять оплату' });
  const appointmentSelect = paymentDialog.getByLabel('Запись');
  await expect.poll(async () => appointmentSelect.locator('option').count()).toBeGreaterThan(1);
  await appointmentSelect.selectOption({ index: 1 });
  await paymentDialog.getByLabel(/Сумма/).fill('25.00');
  await paymentDialog.getByRole('button', { name: 'Сохранить оплату' }).click();
  await expect(paymentDialog).toBeHidden();
  const paidPaymentCard = page.getByRole('list', { name: 'Карточки оплат' }).getByRole('listitem').filter({ hasText: 'Runtime Client' });
  await expect(paidPaymentCard.getByText('Оплачено', { exact: true })).toBeVisible();

  if (!manageUrl) throw new Error('Public booking did not provide a manage link');
  await page.goto(manageUrl);
  await expect(page.getByRole('heading', { name: 'Управление записью' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Отменить запись' })).toBeVisible();
  await page.goto('/app/calendar');
  await expect(page.getByRole('heading', { name: 'Календарь' })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel('Дата').fill(publicDate);
  const calendarAppointment = page.getByRole('region', { name: 'Календарная сетка' }).getByRole('button', { name: /Runtime Client/ });
  await expect(calendarAppointment).toBeVisible();
  const calendarAppointmentBounds = await calendarAppointment.boundingBox();
  expect(calendarAppointmentBounds?.height ?? 0).toBeGreaterThanOrEqual(39);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: 'docs/screenshots/calendar-after-light.png', fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: 'docs/screenshots/calendar-after-dark.png', fullPage: true });
  await page.goto('/app/dashboard');
  await expect(page.getByRole('heading', { name: 'Обзор' })).toBeVisible();
});
