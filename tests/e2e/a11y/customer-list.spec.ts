import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { verifyLoginEmail } from '../email-verification';

test('customer list cards fit phones and preserve all contact metadata', async ({ page }) => {
  const run = `${Date.now()}`;
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': `198.21.${Number(run.slice(-8)) % 255}.${Number(run.slice(-4)) % 254 + 1}` });
  await page.goto('/login');
  await page.getByLabel('Email').fill('owner@demo.local');
  await page.getByLabel('Пароль', { exact: true }).fill('demo-password-123');
  await page.getByRole('button', { name: 'Войти' }).click();
  await verifyLoginEmail(page, 'owner@demo.local');
  await expect(page.getByRole('heading', { name: 'Обзор' })).toBeVisible();
  await expect(page.getByText(/Подтвердите email/)).toHaveCount(0);

  const response = await page.request.get('http://localhost:3000/api/customers?limit=100');
  expect(response.status()).toBe(200);
  const customers = (await response.json()).data as { id: string; firstName: string; lastName?: string; phone: string; email?: string }[];
  const firstCustomer = customers[0];
  if (!firstCustomer) throw new Error('Seeded demo business has no customers');

  await page.goto('/app/customers');
  await expect(page.getByRole('heading', { name: 'Клиенты' })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  const cards = page.getByRole('list', { name: 'Карточки клиентов' });
  await expect(cards.getByRole('link').first()).toContainText(`${firstCustomer.firstName} ${firstCustomer.lastName ?? ''}`.trim());
  await expect(cards.getByRole('link').first()).toContainText(firstCustomer.phone);
  if (firstCustomer.email) await expect(cards.getByRole('link').first()).toContainText(firstCustomer.email);
  await expect(cards.getByRole('link').first()).toContainText('Добавлен');

  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(documentWidth, `customer list overflows at ${width}px`).toBeLessThanOrEqual(width);
    if (width < 768) {
      await expect(cards).toBeVisible();
      await expect(page.getByRole('table', { name: 'Список клиентов' })).toBeHidden();
    } else {
      await expect(cards).toBeHidden();
      await expect(page.getByRole('table', { name: 'Список клиентов' })).toBeVisible();
    }
  }

  await page.setViewportSize({ width: 375, height: 812 });
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? '')), theme).toEqual([]);
    await page.screenshot({ path: `docs/screenshots/customers-after-mobile-${theme}.png`, fullPage: true, animations: 'disabled' });
  }

  await cards.getByRole('link').first().click();
  await expect(page.getByRole('heading', { name: `${firstCustomer.firstName} ${firstCustomer.lastName ?? ''}`.trim() })).toBeVisible();
});
