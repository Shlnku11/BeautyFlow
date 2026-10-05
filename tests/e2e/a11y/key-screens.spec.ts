import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function registerOwner(page: Page, run: string): Promise<void> {
  const ipOffset = Number(run.slice(-8)) % 65_536;
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': `198.18.${Math.floor(ipOffset / 256)}.${ipOffset % 256 || 1}` });
  await page.goto('/register');
  await page.getByLabel('Название бизнеса').fill(`A11y Studio ${run}`);
  await page.getByLabel('Часовой пояс').fill('Asia/Bishkek');
  await page.getByLabel('Страна').selectOption('KG');
  await page.getByLabel('Валюта').selectOption('KGS');
  await page.getByLabel('Ваше имя').fill('A11y Owner');
  await page.getByLabel('Email').fill(`a11y.${run}@example.test`);
  await page.getByLabel('Пароль').fill('Strong-password-123');
  await page.getByLabel('Я принимаю условия использования').check();
  await page.getByRole('button', { name: 'Создать бизнес' }).click();
  await expect(page).toHaveURL(/\/app/);
}

async function expectNoSeriousAxeViolations(page: Page, screen: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? '')), screen).toEqual([]);
}

test('key owner and public screens pass axe and fit required viewports', async ({ page }) => {
  test.setTimeout(120_000);
  await registerOwner(page, `${Date.now()}`);

  const staffResponse = await page.request.post('http://localhost:3000/api/staff', {
    headers: { Origin: 'http://localhost:5173' },
    data: { displayName: 'A11y Master', color: 'teal', acceptsOnlineBooking: true },
  });
  expect(staffResponse.status()).toBe(201);
  const staff = (await staffResponse.json()).data as { id: string };
  const serviceResponse = await page.request.post('http://localhost:3000/api/services', {
    headers: { Origin: 'http://localhost:5173' },
    data: { name: 'A11y Service', durationMinutes: 30, priceMinor: 1000, staffIds: [staff.id] },
  });
  expect(serviceResponse.status()).toBe(201);
  const customerResponse = await page.request.post('http://localhost:3000/api/customers', {
    headers: { Origin: 'http://localhost:5173' },
    data: { firstName: 'A11y Customer', phone: `+996555${String(Date.now()).slice(-6)}` },
  });
  expect(customerResponse.status()).toBe(201);
  const customer = (await customerResponse.json()).data as { id: string };
  const settings = (await (await page.request.get('http://localhost:3000/api/settings')).json()).data as { business: { slug: string } };

  const screens = [
    ['/', 'Ваш салон. Ваш ритм. Всё под контролем.'],
    ['/login', 'Войти'],
    ['/register', 'Создать бизнес'],
    ['/app/dashboard', 'Обзор'],
    ['/app/calendar', 'Календарь'],
    ['/app/staff', 'Сотрудники'],
    [`/app/staff/${staff.id}`, 'A11y Master'],
    ['/app/services', 'Услуги'],
    ['/app/customers', 'Клиенты'],
    [`/app/customers/${customer.id}`, 'A11y Customer'],
    ['/app/settings', 'Настройки'],
    ['/app/payments', 'Оплаты'],
    [`/b/${settings.business.slug}`, 'A11y Studio'],
  ] as const;

  for (const [path, heading] of screens) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    if (path === '/app/dashboard') {
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'Перейти к основному содержимому' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('#main-content')).toBeFocused();
    }
    await expectNoSeriousAxeViolations(page, path);
  }

  await page.goto('/__dev/ui');
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
      if (width < 768) await expect(page.getByRole('navigation', { name: 'Мобильная навигация' })).toBeVisible();
    }
  }

  const bookingDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const weekday = new Date(`${bookingDate}T12:00:00Z`).getUTCDay() || 7;
  const scheduleResponse = await page.request.put(`http://localhost:3000/api/staff/${staff.id}/schedule`, {
    headers: { Origin: 'http://localhost:5173' },
    data: { weekly: [{ isoWeekday: weekday, intervals: [{ start: '09:00', end: '17:00' }], breaks: [] }] },
  });
  expect(scheduleResponse.status()).toBe(200);
  const privacyResponse = await page.request.patch('http://localhost:3000/api/settings/business', {
    headers: { Origin: 'http://localhost:5173' },
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
});
