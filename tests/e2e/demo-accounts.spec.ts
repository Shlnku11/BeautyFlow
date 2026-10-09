import { expect, test, type Page } from '@playwright/test';
import { appOrigin } from './test-origin';
import { verifyLoginEmail } from './email-verification';

async function signIn(page: Page, email: string, ip: string) {
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': ip });
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill('demo-password-123');
  await page.getByRole('button', { name: 'Войти' }).click();
  await verifyLoginEmail(page, email);
}

test('seeded demo owner can sign in and open the dashboard', async ({ page }) => {
  await signIn(page, 'owner@demo.local', '198.21.0.101');
  await expect(page.getByRole('heading', { name: 'Обзор' })).toBeVisible();
  const response = await page.request.get(`${appOrigin}/api/auth/me`);
  expect(response.status()).toBe(200);
  expect((await response.json()).data.active.role).toBe('owner');
});

test('seeded demo master can sign in and open My Day', async ({ page }) => {
  await signIn(page, 'master@demo.local', '198.21.0.102');
  const response = await page.request.get(`${appOrigin}/api/auth/me`);
  expect(response.status()).toBe(200);
  expect((await response.json()).data.active.role).toBe('master');
  await page.goto('/app/my-day');
  await expect(page.getByRole('heading', { name: 'Мой день' })).toBeVisible();
});
