import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { verifyLoginEmail } from '../email-verification';

interface ServiceFixture {
  id: string;
  name: string;
  description?: string;
  durationMinutes: number;
  bufferMinutes: number;
  priceMinor: number;
  currency: string;
  onlineBookingEnabled: boolean;
  isActive: boolean;
  staffIds: string[];
}

interface StaffFixture {
  id: string;
  displayName: string;
}

test('service cards fit narrow shells and preserve editing details', async ({ page }) => {
  const run = `${Date.now()}`;
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': `198.23.${Number(run.slice(-8)) % 255}.${Number(run.slice(-4)) % 254 + 1}` });
  await page.goto('/login');
  await page.getByLabel('Email').fill('owner@demo.local');
  await page.getByLabel('Пароль', { exact: true }).fill('demo-password-123');
  await page.getByRole('button', { name: 'Войти' }).click();
  await verifyLoginEmail(page, 'owner@demo.local');
  await expect(page.getByRole('heading', { name: 'Обзор' })).toBeVisible();

  const [servicesResponse, staffResponse] = await Promise.all([
    page.request.get('http://localhost:3000/api/services'),
    page.request.get('http://localhost:3000/api/staff'),
  ]);
  expect(servicesResponse.status()).toBe(200);
  expect(staffResponse.status()).toBe(200);
  const services = (await servicesResponse.json()).data as ServiceFixture[];
  const staff = (await staffResponse.json()).data as StaffFixture[];
  const service = services.find((row) => row.isActive);
  if (!service) throw new Error('Seeded demo business has no active services');
  const serviceStaff = staff.filter((person) => service.staffIds.includes(person.id)).map((person) => person.displayName);

  await page.goto('/app/services');
  await expect(page.getByRole('heading', { name: 'Услуги' })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  const cards = page.getByRole('list', { name: 'Карточки услуг' });
  const card = cards.getByRole('article', { name: `Услуга: ${service.name}` });
  await expect(card).toContainText(`${service.durationMinutes} мин`);
  await expect(card).toContainText(`${service.bufferMinutes} мин`);
  await expect(card).toContainText(service.onlineBookingEnabled ? 'Доступна' : 'Выключена');
  if (serviceStaff.length) await expect(card).toContainText(serviceStaff.join(', '));
  await expect(card.getByRole('button', { name: `Изменить услугу: ${service.name}` })).toBeVisible();

  for (const width of [320, 375, 768, 1023, 1119, 1120, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(documentWidth, `services screen overflows at ${width}px`).toBeLessThanOrEqual(width);
    if (width < 1120) {
      await expect(cards).toBeVisible();
      await expect(page.getByRole('region', { name: 'Таблица услуг' })).toBeHidden();
    } else {
      const table = page.getByRole('region', { name: 'Таблица услуг' });
      await expect(cards).toBeHidden();
      await expect(table).toBeVisible();
      expect(await table.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
    }
  }

  await page.setViewportSize({ width: 375, height: 812 });
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? '')), theme).toEqual([]);
  }

  await card.getByRole('button', { name: `Изменить услугу: ${service.name}` }).click();
  await expect(page.getByRole('dialog', { name: `Изменить: ${service.name}` })).toBeVisible();
});
