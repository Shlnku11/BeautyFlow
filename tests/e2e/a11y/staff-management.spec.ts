import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { verifyLoginEmail } from '../email-verification';

interface StaffFixture {
  id: string;
  displayName: string;
  isActive: boolean;
  acceptsOnlineBooking: boolean;
  serviceIds?: string[];
}
interface ServiceFixture { staffIds: string[]; }

async function expectNoSeriousAxeViolations(page: import('@playwright/test').Page, screen: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? '')), screen).toEqual([]);
}

test('staff list and profile tabs are responsive, keyboard accessible, and usable in both themes', async ({ page }) => {
  test.setTimeout(90_000);
  const run = `${Date.now()}`;
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': `198.24.${Number(run.slice(-8)) % 255}.${Number(run.slice(-4)) % 254 + 1}` });
  await page.goto('/login');
  await page.getByLabel('Email').fill('owner@demo.local');
  await page.getByLabel('Пароль', { exact: true }).fill('demo-password-123');
  await page.getByRole('button', { name: 'Войти' }).click();
  await verifyLoginEmail(page, 'owner@demo.local');
  await expect(page.getByRole('heading', { name: 'Обзор' })).toBeVisible();

  const response = await page.request.get('http://localhost:3000/api/staff');
  expect(response.status()).toBe(200);
  const staffRows = (await response.json()).data as StaffFixture[];
  const servicesResponse = await page.request.get('http://localhost:3000/api/services');
  expect(servicesResponse.status()).toBe(200);
  const services = (await servicesResponse.json()).data as ServiceFixture[];
  const staff = staffRows.find((row) => row.isActive) ?? staffRows[0];
  if (!staff) throw new Error('The real demo tenant needs at least one staff member');
  const assignedCount = services.filter((service) => service.staffIds.includes(staff.id)).length;
  const assignedRemainder100 = assignedCount % 100;
  const assignedRemainder10 = assignedCount % 10;
  const assignedWord = assignedRemainder100 >= 11 && assignedRemainder100 <= 14 ? 'услуг' : assignedRemainder10 === 1 ? 'услуга' : assignedRemainder10 >= 2 && assignedRemainder10 <= 4 ? 'услуги' : 'услуг';
  const assignedLabel = `${assignedCount} ${assignedWord}`;

  await page.goto('/app/staff');
  await expect(page.getByRole('heading', { name: 'Сотрудники' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Сводка команды' })).toContainText(String(staffRows.length));
  await page.setViewportSize({ width: 375, height: 812 });
  const cards = page.getByRole('list', { name: 'Карточки сотрудников' });
  const staffLinkName = `Открыть профиль сотрудника ${staff.displayName}`;
  await expect(cards.getByRole('link', { name: staffLinkName })).toContainText(assignedLabel);

  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `staff list overflows at ${width}px`).toBeLessThanOrEqual(width);
    if (width < 1280) {
      await expect(cards).toBeVisible();
      await expect(page.getByRole('region', { name: 'Таблица сотрудников' })).toBeHidden();
    } else {
      await expect(cards).toBeHidden();
      await expect(page.getByRole('region', { name: 'Таблица сотрудников' })).toBeVisible();
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expectNoSeriousAxeViolations(page, `staff list (${theme})`);
    await page.screenshot({ path: `docs/screenshots/staff-list-after-${theme}.png`, fullPage: true, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 375, height: 812 });
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.screenshot({ path: `docs/screenshots/staff-list-mobile-after-${theme}.png`, animations: 'disabled' });
  }

  await page.getByLabel('Поиск сотрудников').fill('такого-сотрудника-нет');
  await expect(page.getByRole('heading', { name: 'Ничего не найдено' })).toBeVisible();
  await page.getByRole('button', { name: 'Очистить поиск' }).click();
  await page.getByRole('button', { name: 'Добавить сотрудника' }).click();
  const createDialog = page.getByRole('dialog', { name: 'Новый сотрудник' });
  await expect(createDialog).toBeVisible();
  const staffNameInput = createDialog.getByLabel('Имя сотрудника');
  await expect(staffNameInput).toHaveAttribute('required', '');
  await createDialog.getByRole('button', { name: 'Добавить сотрудника', exact: true }).click();
  await expect(staffNameInput).toBeFocused();
  await createDialog.getByRole('button', { name: 'Отмена' }).click();
  await expect(createDialog).toBeHidden();

  const staffListRoute = '**/api/staff?includeInactive=false';
  await page.route(staffListRoute, (route) => route.abort());
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Не удалось загрузить данные' })).toBeVisible();
  await page.unroute(staffListRoute);
  await page.getByRole('button', { name: 'Повторить' }).click();
  await expect(cards).toBeVisible();

  await page.getByRole('link', { name: staffLinkName }).click();
  await expect(page.getByRole('heading', { name: staff.displayName })).toBeVisible();
  await expect(page.locator('main')).toContainText(assignedLabel);
  await page.getByRole('tab', { name: 'Профиль' }).click();
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Профиль сохранён' })).toBeVisible();
  const profileTab = page.getByRole('tab', { name: 'Профиль' });
  await profileTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Расписание' })).toHaveAttribute('aria-selected', 'true');

  const tabScreens = [
    { label: 'Профиль', heading: 'Данные профиля', screenshot: 'profile' },
    { label: 'Расписание', heading: 'Недельный график', screenshot: 'schedule' },
    { label: 'Исключения', heading: 'Новое исключение', screenshot: 'exceptions' },
    { label: 'Услуги', heading: 'Услуги специалиста', screenshot: 'services' },
    { label: 'Доступ', heading: 'Доступ к кабинету', screenshot: 'access' },
  ];

  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const tab of tabScreens) {
    await page.getByRole('tab', { name: tab.label }).click();
    await expect(page.getByRole('heading', { name: tab.heading })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.getByRole('heading', { name: staff.displayName }).click();
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expectNoSeriousAxeViolations(page, `staff ${tab.label} (${theme})`);
      await page.screenshot({ path: `docs/screenshots/staff-${tab.screenshot}-after-${theme}.png`, fullPage: true, animations: 'disabled' });
    }
  }

  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `staff profile overflows at ${width}px`).toBeLessThanOrEqual(width);
    await page.getByRole('tab', { name: 'Профиль' }).click();
  }
});
