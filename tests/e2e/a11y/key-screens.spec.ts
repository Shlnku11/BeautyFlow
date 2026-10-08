import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { verifyRegistrationEmail } from '../email-verification';
import { captureThemeScreenshots, prepareFullPageScreenshot } from '../screen-capture';
import { appOrigin } from '../test-origin';

async function registerOwner(page: Page, run: string): Promise<void> {
  const ipOffset = Number(run.slice(-8)) % 65_536;
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': `198.18.${Math.floor(ipOffset / 256)}.${ipOffset % 256 || 1}` });
  await page.goto('/register');
  await page.getByLabel('Название бизнеса').fill(`A11y Studio ${run}`);
  await page.getByLabel('Часовой пояс').fill('Asia/Bishkek');
  await page.getByLabel('Страна').selectOption('KG');
  await page.getByLabel('Валюта').selectOption('KGS');
  await page.getByLabel('Ваше имя').fill('A11y Owner');
  const email = `a11y.${run}@example.test`;
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill('Strong-password-123');
  await page.getByLabel('Я принимаю условия использования').check();
  await page.getByRole('button', { name: 'Создать бизнес' }).click();
  await verifyRegistrationEmail(page, email);
}

async function expectNoSeriousAxeViolations(page: Page, screen: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? '')), screen).toEqual([]);
}

test('key owner and public screens pass axe and fit required viewports', async ({ page }) => {
  test.setTimeout(240_000);
  await registerOwner(page, `${Date.now()}`);

  const staffResponse = await page.request.post('http://localhost:3000/api/staff', {
    headers: { Origin: appOrigin },
    data: { displayName: 'A11y Master', color: 'teal', acceptsOnlineBooking: true },
  });
  expect(staffResponse.status()).toBe(201);
  const staff = (await staffResponse.json()).data as { id: string };
  const serviceResponse = await page.request.post('http://localhost:3000/api/services', {
    headers: { Origin: appOrigin },
    data: { name: 'A11y Service', durationMinutes: 30, priceMinor: 1000, staffIds: [staff.id] },
  });
  expect(serviceResponse.status()).toBe(201);
  const customerResponse = await page.request.post('http://localhost:3000/api/customers', {
    headers: { Origin: appOrigin },
    data: { firstName: 'A11y Customer', phone: `+996555${String(Date.now()).slice(-6)}` },
  });
  expect(customerResponse.status()).toBe(201);
  const customer = (await customerResponse.json()).data as { id: string };
  const settings = (await (await page.request.get('http://localhost:3000/api/settings')).json()).data as { business: { slug: string } };

  const screens = [
    ['landing', '/', 'Онлайн-запись для салонов красоты'],
    ['login', '/login', 'Войти'],
    ['register', '/register', 'Создать бизнес'],
    ['dashboard', '/app/dashboard', 'Обзор'],
    ['calendar', '/app/calendar', 'Календарь'],
    ['appointments', '/app/appointments', 'Записи'],
    ['staff', '/app/staff', 'Сотрудники'],
    ['staff-detail', `/app/staff/${staff.id}`, 'A11y Master'],
    ['services', '/app/services', 'Услуги'],
    ['customers', '/app/customers', 'Клиенты'],
    ['customer-detail', `/app/customers/${customer.id}`, 'A11y Customer'],
    ['settings', '/app/settings', 'Настройки'],
    ['payments', '/app/payments', 'Оплаты'],
  ] as const;

  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [screenshotName, path, heading] of screens) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    if (path === '/app/dashboard') {
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'Перейти к основному содержимому' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('#main-content')).toBeFocused();
    }
    await prepareFullPageScreenshot(page);
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expectNoSeriousAxeViolations(page, `${path} (${theme})`);
      await page.screenshot({ path: `docs/screenshots/${screenshotName}-${theme}.png`, fullPage: true, animations: 'disabled' });
      if (screenshotName === 'customer-detail') {
        const customerMetrics = page.getByRole('region', { name: 'Показатели клиента' });
        await expect(customerMetrics).toContainText('Завершённых визитов');
        for (const rawField of ['visitsCount', 'lastVisitAt', 'nextVisitAt', 'totalPaidMinor', 'currency']) {
          await expect(page.getByText(rawField, { exact: true })).toHaveCount(0);
        }
        await page.screenshot({ path: `docs/screenshots/customer-detail-after-${theme}.png`, fullPage: true, animations: 'disabled' });
      }
    }
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  }

  await page.goto('/__dev/ui');
  await page.getByRole('button', { name: 'Open dialog' }).click();
  const sandboxDialogTitle = page.getByRole('heading', { name: 'Dialog' });
  await expect(sandboxDialogTitle).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sandboxDialogTitle).toBeHidden();

  const responsiveScreens = ['/app/dashboard', '/app/calendar', '/app/staff', '/app/services', '/app/customers', '/app/settings', '/app/payments'];
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 812 });
    for (const path of responsiveScreens) {
      await page.goto(path);
      await expect(page.locator('main').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(documentWidth, `${path} overflows at ${width}px`).toBeLessThanOrEqual(width);
      if (path === '/app/calendar' && width < 768) {
        await expect(page.getByRole('button', { name: 'День' })).toHaveAttribute('aria-pressed', 'true');
        const calendarGrid = page.getByRole('region', { name: 'Календарная сетка' });
        await expect.poll(() => calendarGrid.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
        if (width === 375) await page.screenshot({ path: 'docs/screenshots/calendar-after-mobile.png', fullPage: true, animations: 'disabled' });
      }
      if (width < 768) {
        await expect(page.getByRole('button', { name: 'Открыть меню' })).toBeVisible();
        await expect(page.getByRole('navigation', { name: 'Мобильная навигация' })).toBeVisible();
        await page.getByRole('button', { name: 'Открыть меню' }).click();
        await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();
        await page.getByRole('button', { name: 'Закрыть меню' }).click();
      }
    }
  }

  const bookingDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const weekday = new Date(`${bookingDate}T12:00:00Z`).getUTCDay() || 7;
  const scheduleResponse = await page.request.put(`http://localhost:3000/api/staff/${staff.id}/schedule`, {
    headers: { Origin: appOrigin },
    data: { weekly: [{ isoWeekday: weekday, intervals: [{ start: '09:00', end: '17:00' }], breaks: [] }] },
  });
  expect(scheduleResponse.status()).toBe(200);
  const privacyResponse = await page.request.patch('http://localhost:3000/api/settings/business', {
    headers: { Origin: appOrigin },
    data: { privacy: { requireConsent: false } },
  });
  expect(privacyResponse.status()).toBe(200);

  await page.goto(`/b/${settings.business.slug}`);
  await expect(page.getByRole('heading', { name: /A11y Studio/ })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Услуга')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Мастер')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Дата')).toBeFocused();
  await page.getByLabel('Дата').fill(bookingDate);
  const showSlots = page.getByRole('button', { name: 'Показать время' });
  for (let index = 0; index < 5 && !(await showSlots.evaluate((element) => element === document.activeElement)); index += 1) await page.keyboard.press('Tab');
  await expect(showSlots).toBeFocused();
  await page.keyboard.press('Enter');
  const slotButtons = page.getByRole('group', { name: 'Доступное время' }).getByRole('button');
  await expect(slotButtons.first()).toBeVisible();
  await captureThemeScreenshots(page, 'public-booking');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  for (let index = 1; index < await slotButtons.count(); index += 1) await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Имя')).toBeFocused();
  await page.keyboard.type('Keyboard Client');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.type(`+996777${String(Date.now()).slice(-6)}`);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const submitBooking = page.getByRole('button', { name: 'Подтвердить запись' });
  for (let index = 0; index < 5 && !(await submitBooking.evaluate((element) => element === document.activeElement)); index += 1) await page.keyboard.press('Tab');
  await expect(submitBooking).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Запись оформлена' })).toBeVisible();
  await captureThemeScreenshots(page, 'public-confirmation');
  await page.getByRole('link', { name: 'Управлять записью' }).click();
  await expect(page.getByRole('heading', { name: 'Управление записью' })).toBeVisible();
  await captureThemeScreenshots(page, 'public-manage');
});

