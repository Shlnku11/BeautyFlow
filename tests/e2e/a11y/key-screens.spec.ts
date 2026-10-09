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

test('key owner and public screens pass axe and fit required viewports', async ({ page, browser }) => {
  test.setTimeout(420_000);
  await registerOwner(page, `${Date.now()}`);
  const guestContext = await browser.newContext({ baseURL: appOrigin });
  const guestPage = await guestContext.newPage();

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
    const target = path === '/' || path === '/login' || path === '/register' ? guestPage : page;
    await target.goto(path);
    await expect(target.getByRole('heading', { name: heading }).first()).toBeVisible();
    if (path === '/app/dashboard') {
      await target.keyboard.press('Tab');
      await expect(target.getByRole('link', { name: 'Перейти к основному содержимому' })).toBeFocused();
      await target.keyboard.press('Enter');
      await expect(target.locator('#main-content')).toBeFocused();
    }
    await prepareFullPageScreenshot(target);
    for (const theme of ['light', 'dark'] as const) {
      await target.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await target.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expectNoSeriousAxeViolations(target, `${path} (${theme})`);
      await target.screenshot({ path: `docs/screenshots/${screenshotName}-${theme}.png`, fullPage: true, animations: 'disabled' });
      if (screenshotName === 'customer-detail') {
        const customerMetrics = target.getByRole('region', { name: 'Показатели клиента' });
        await expect(customerMetrics).toContainText('Завершённых визитов');
        for (const rawField of ['visitsCount', 'lastVisitAt', 'nextVisitAt', 'totalPaidMinor', 'currency']) {
          await expect(target.getByText(rawField, { exact: true })).toHaveCount(0);
        }
      }
    }
    await target.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
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
      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(documentWidth, `${path} overflows at ${width}px`).toBeLessThanOrEqual(width);
      if (path === '/app/calendar' && width < 768) {
        await expect(page.getByRole('button', { name: 'День' })).toHaveAttribute('aria-pressed', 'true');
        const calendarGrid = page.getByRole('region', { name: 'Календарная сетка' });
        await expect.poll(() => calendarGrid.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
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

  await guestPage.goto(`/b/${settings.business.slug}`);
  await expect(guestPage.getByRole('heading', { name: /A11y Studio/ })).toBeVisible();
  await guestPage.keyboard.press('Tab');
  await expect(guestPage.getByLabel('Услуга')).toBeFocused();
  await guestPage.keyboard.press('Tab');
  await expect(guestPage.getByLabel('Мастер')).toBeFocused();
  await guestPage.keyboard.press('Tab');
  await expect(guestPage.getByLabel('Дата')).toBeFocused();
  await guestPage.getByLabel('Дата').fill(bookingDate);
  const showSlots = guestPage.getByRole('button', { name: 'Показать время' });
  for (let index = 0; index < 5 && !(await showSlots.evaluate((element) => element === document.activeElement)); index += 1) await guestPage.keyboard.press('Tab');
  await expect(showSlots).toBeFocused();
  await guestPage.keyboard.press('Enter');
  const slotButtons = guestPage.getByRole('group', { name: 'Доступное время' }).getByRole('button');
  await expect(slotButtons.first()).toBeVisible();
  await captureThemeScreenshots(guestPage, 'public-booking');
  await guestPage.keyboard.press('Tab');
  await guestPage.keyboard.press('Enter');
  for (let index = 1; index < await slotButtons.count(); index += 1) await guestPage.keyboard.press('Tab');
  await guestPage.keyboard.press('Tab');
  await expect(guestPage.getByLabel('Имя')).toBeFocused();
  await guestPage.keyboard.type('Keyboard Client');
  await guestPage.keyboard.press('Tab');
  await guestPage.keyboard.press('Tab');
  await guestPage.keyboard.type(`+996777${String(Date.now()).slice(-6)}`);
  await guestPage.keyboard.press('Tab');
  await guestPage.keyboard.press('Tab');
  const submitBooking = guestPage.getByRole('button', { name: 'Подтвердить запись' });
  for (let index = 0; index < 5 && !(await submitBooking.evaluate((element) => element === document.activeElement)); index += 1) await guestPage.keyboard.press('Tab');
  await expect(submitBooking).toBeFocused();
  await guestPage.keyboard.press('Enter');
  await expect(guestPage.getByRole('heading', { name: 'Запись оформлена' })).toBeVisible();
  await captureThemeScreenshots(guestPage, 'public-confirmation');
  await guestPage.getByRole('link', { name: 'Управлять записью' }).click();
  await expect(guestPage.getByRole('heading', { name: 'Управление записью' })).toBeVisible();
  await captureThemeScreenshots(guestPage, 'public-manage');
  await guestContext.close();
});

