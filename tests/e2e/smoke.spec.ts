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
  const testIp = `198.51.${Math.floor(ipOffset / 256)}.${(ipOffset % 256) + 1}`;
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
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill('Strong-password-123');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/app/);

  const staffResponse = await page.request.post('http://localhost:3000/api/staff', {
    headers: { Origin: 'http://localhost:3000' },
    data: { displayName: 'E2E Staff', color: 'teal', acceptsOnlineBooking: true },
  });
  expect(staffResponse.status()).toBe(201);
  // Playwright returns parsed JSON as untyped data; this test uses only the contract's id field.
  const createdStaff = (await staffResponse.json()).data as { id: string };
  expect(createdStaff).toMatchObject({ displayName: 'E2E Staff', color: 'teal', isActive: true });

  const serviceResponse = await page.request.post('http://localhost:3000/api/services', {
    headers: { Origin: 'http://localhost:3000' },
    data: { name: 'E2E haircut', durationMinutes: 30, priceMinor: 2500, staffIds: [createdStaff.id] },
  });
  expect(serviceResponse.status()).toBe(201);
  expect((await serviceResponse.json()).data).toMatchObject({ name: 'E2E haircut', durationMinutes: 30, priceMinor: 2500, staffIds: [createdStaff.id] });

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

  const phone = `+996555${(Number(run) % 1_000_000).toString().padStart(6, '0')}`;
  const customerResponse = await page.request.post('http://localhost:3000/api/customers', {
    headers: { Origin: 'http://localhost:3000' },
    data: { firstName: 'E2E Client', phone, contacts: [{ type: 'telegram', value: 'e2e-client' }] },
  });
  expect(customerResponse.status()).toBe(201);
  // Only stable contract fields are needed for the following duplicate and list checks.
  const customerData = (await customerResponse.json()).data as { id: string; phone: string };
  expect(customerData.phone).toBe(phone);
  const duplicateCustomerResponse = await page.request.post('http://localhost:3000/api/customers', {
    headers: { Origin: 'http://localhost:3000' },
    data: { firstName: 'Duplicate', phone },
  });
  expect(duplicateCustomerResponse.status()).toBe(409);
  const customerListResponse = await page.request.get('http://localhost:3000/api/customers?q=E2E');
  expect((await customerListResponse.json()).data).toEqual(expect.arrayContaining([expect.objectContaining({ id: customerData.id, firstName: 'E2E Client' })]));

  const settingsResponse = await page.request.get('http://localhost:3000/api/settings');
  expect(settingsResponse.status()).toBe(200);
  expect((await settingsResponse.json()).data.business).toMatchObject({ countryCode: 'KG', currency: 'KGS' });
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
});
