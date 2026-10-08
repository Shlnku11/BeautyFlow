import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { verifyLoginEmail } from '../email-verification';

interface PaymentFixture {
  appointmentId: string;
  amountMinor: number;
  refundedMinor: number;
  currency: string;
  method: 'cash' | 'card' | 'transfer' | 'online';
  status: 'pending' | 'paid' | 'refunded' | 'cancelled';
}

interface AppointmentFixture {
  customer: { firstName: string; lastName?: string };
  service: { name: string };
}

test('payment cards fit tablet and phone layouts and preserve payment actions', async ({ page }) => {
  const run = `${Date.now()}`;
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': `198.20.${Number(run.slice(-8)) % 255}.${Number(run.slice(-4)) % 254 + 1}` });
  await page.goto('/login');
  await page.getByLabel('Email').fill('owner@demo.local');
  await page.getByLabel('Пароль', { exact: true }).fill('demo-password-123');
  await page.getByRole('button', { name: 'Войти' }).click();
  await verifyLoginEmail(page, 'owner@demo.local');
  await expect(page.getByRole('heading', { name: 'Обзор' })).toBeVisible();

  const paymentsResponse = await page.request.get('http://localhost:3000/api/payments?page=1&limit=100');
  expect(paymentsResponse.status()).toBe(200);
  const paymentRows = (await paymentsResponse.json()).data as PaymentFixture[];
  const payment = paymentRows[0];
  if (!payment) throw new Error('Seeded demo business has no payments');
  const appointmentResponse = await page.request.get(`http://localhost:3000/api/appointments/${payment.appointmentId}`);
  expect(appointmentResponse.status()).toBe(200);
  const appointment = (await appointmentResponse.json()).data as AppointmentFixture;
  const customerName = `${appointment.customer.firstName} ${appointment.customer.lastName ?? ''}`.trim();

  await page.goto('/app/payments');
  await expect(page.getByRole('heading', { name: 'Оплаты' })).toBeVisible();
  const cards = page.getByRole('list', { name: 'Карточки оплат' });
  const firstCard = cards.locator('li').first();
  await expect(firstCard).toContainText(customerName);
  await expect(firstCard).toContainText(appointment.service.name);
  await expect(firstCard).toContainText('Дата оплаты');
  await expect(firstCard).toContainText('Метод');
  await expect(firstCard).toContainText('Сумма');
  await expect(firstCard).toContainText('Возвращено');
  await expect(firstCard).toContainText('Принял оплату');
  if (payment.status === 'pending') await expect(firstCard.getByRole('button', { name: 'Оплатить' })).toBeVisible();
  if (payment.status === 'paid') await expect(firstCard.getByRole('button', { name: 'Вернуть' })).toBeVisible();

  for (const width of [320, 375, 768, 1024, 1439, 1440, 1535, 1536]) {
    await page.setViewportSize({ width, height: 900 });
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(documentWidth, `payments screen overflows at ${width}px`).toBeLessThanOrEqual(width);
    if (width < 1536) {
      await expect(cards).toBeVisible();
      await expect(page.getByRole('region', { name: 'Таблица оплат' })).toBeHidden();
    } else {
      const table = page.getByRole('region', { name: 'Таблица оплат' });
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
    await page.screenshot({ path: `docs/screenshots/payments-after-mobile-${theme}.png`, fullPage: true, animations: 'disabled' });
  }

  await page.setViewportSize({ width: 1536, height: 1000 });
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.screenshot({ path: `docs/screenshots/payments-after-wide-${theme}.png`, fullPage: true, animations: 'disabled' });
  }
});
