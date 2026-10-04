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
  expect((await staffResponse.json()).data).toMatchObject({ displayName: 'E2E Staff', color: 'teal', isActive: true });

  const rejectedTenantOverride = await page.request.post('http://localhost:3000/api/staff', {
    headers: { Origin: 'http://localhost:3000' },
    data: { displayName: 'Injected tenant', color: 'teal', acceptsOnlineBooking: true, businessId: '000000000000000000000000' },
  });
  expect(rejectedTenantOverride.status()).toBe(422);
});
