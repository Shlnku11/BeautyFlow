import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('customer detail uses localized values and passes axe in both themes', async ({ page }) => {
  const run = `${Date.now()}`;
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': `198.19.${Number(run.slice(-8)) % 255}.${Number(run.slice(-4)) % 254 + 1}` });
  await page.goto('/login');
  await page.getByLabel('Email').fill('owner@demo.local');
  await page.getByLabel('Пароль').fill('demo-password-123');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('heading', { name: 'Обзор' })).toBeVisible();
  const response = await page.request.get('http://localhost:3000/api/customers?limit=100');
  expect(response.status()).toBe(200);
  const customerRows = (await response.json()).data as { id: string; firstName: string; lastName?: string }[];
  let customer = customerRows[0];
  let hasVisitHistory = false;
  for (const candidate of customerRows) {
    const historyResponse = await page.request.get(`http://localhost:3000/api/customers/${candidate.id}/appointments?limit=100`);
    if (!historyResponse.ok()) continue;
    const history = (await historyResponse.json()).data as { id: string }[];
    if (history.length > 0) {
      customer = candidate;
      hasVisitHistory = true;
      break;
    }
  }
  expect(customer).toBeDefined();
  if (!customer) throw new Error('Seeded demo business has no customers');
  expect(hasVisitHistory).toBe(true);
  await page.goto(`/app/customers/${customer.id}`);
  await expect(page.getByRole('heading', { name: `${customer.firstName} ${customer.lastName ?? ''}`.trim() })).toBeVisible();
  const metrics = page.getByRole('region', { name: 'Показатели клиента' });
  await expect(metrics).toContainText('Завершённых визитов');
  await expect(metrics).toContainText('Оплачено всего');
  for (const rawField of ['visitsCount', 'lastVisitAt', 'nextVisitAt', 'totalPaidMinor', 'currency']) {
    await expect(page.getByText(rawField, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole('heading', { name: 'История визитов' }).locator('xpath=..').getByRole('listitem').first()).toBeVisible();

  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? '')), theme).toEqual([]);
    await page.screenshot({ path: `docs/screenshots/customer-detail-after-${theme}.png`, fullPage: true, animations: 'disabled' });
  }

  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(documentWidth, `customer detail overflows at ${width}px`).toBeLessThanOrEqual(width);
  }
});
