import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { verifyLoginEmail } from '../email-verification';

interface AppointmentFixture {
  id: string;
  customer: { firstName: string; lastName?: string };
  staff: { displayName: string };
  service: { name: string };
  startAt: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
}

const statusLabels: Record<AppointmentFixture['status'], string> = {
  pending: 'Ожидает',
  confirmed: 'Подтверждена',
  completed: 'Завершена',
  cancelled: 'Отменена',
  no_show: 'Неявка',
};

test('appointment cards fit narrow shells and preserve appointment actions', async ({ page }) => {
  test.setTimeout(60_000);
  const run = `${Date.now()}`;
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': `198.22.${Number(run.slice(-8)) % 255}.${Number(run.slice(-4)) % 254 + 1}` });
  await page.goto('/login');
  await page.getByLabel('Email').fill('owner@demo.local');
  await page.getByLabel('Пароль', { exact: true }).fill('demo-password-123');
  await page.getByRole('button', { name: 'Войти' }).click();
  await verifyLoginEmail(page, 'owner@demo.local');
  await expect(page.getByRole('heading', { name: 'Обзор' })).toBeVisible();

  const response = await page.request.get('http://localhost:3000/api/appointments?limit=100');
  expect(response.status()).toBe(200);
  const appointments = (await response.json()).data as AppointmentFixture[];
  const appointment = appointments.find((row) => row.status !== 'cancelled');
  if (!appointment) throw new Error('Seeded demo business has no active appointments');
  const customerName = `${appointment.customer.firstName} ${appointment.customer.lastName ?? ''}`.trim();
  const dateFrom = new Date(appointment.startAt);
  dateFrom.setUTCDate(dateFrom.getUTCDate() - 1);
  const dateTo = new Date(appointment.startAt);
  dateTo.setUTCDate(dateTo.getUTCDate() + 1);

  await page.goto('/app/appointments');
  await expect(page.getByRole('heading', { name: 'Записи' })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByLabel('С даты').fill(dateFrom.toISOString().slice(0, 10));
  await page.getByLabel('По дату').fill(dateTo.toISOString().slice(0, 10));
  const cards = page.getByRole('region', { name: 'Карточки записей' });
  await expect(cards.getByRole('status')).toHaveCount(0);
  const card = cards.getByRole('article')
    .filter({ hasText: customerName })
    .filter({ hasText: appointment.service.name })
    .filter({ hasText: appointment.staff.displayName })
    .filter({ hasText: statusLabels[appointment.status] });
  await expect(card.first()).toBeVisible();
  await expect(card).toContainText(appointment.staff.displayName);
  await expect(card).toContainText(statusLabels[appointment.status]);
  await expect(card.getByRole('button', { name: 'Подробнее' })).toBeVisible();
  await expect(card.getByRole('link', { name: 'Принять оплату' })).toBeVisible();

  for (const width of [320, 375, 768, 1024, 1279, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(documentWidth, `appointments screen overflows at ${width}px`).toBeLessThanOrEqual(width);
    if (width < 1280) {
      await expect(cards).toBeVisible();
      await expect(page.getByRole('region', { name: 'Таблица записей' })).toBeHidden();
    } else {
      const table = page.getByRole('region', { name: 'Таблица записей' });
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

  await card.getByRole('button', { name: 'Подробнее' }).click();
  await expect(page.getByRole('dialog', { name: 'Запись' })).toBeVisible();
});
