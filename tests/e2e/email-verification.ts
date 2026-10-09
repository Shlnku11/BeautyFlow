import { MongoClient } from 'mongodb';
import { expect, type Page } from '@playwright/test';
import { DEV_DEMO_LOGIN_EMAILS } from '../../packages/shared/src/constants';

async function pendingVerificationCode(email: string): Promise<string> {
  const uri = process.env.MONGODB_URI;
  const databaseName = process.env.MONGODB_DB_NAME;
  if (!uri || !databaseName) throw new Error('E2E MongoDB configuration is missing');
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const notification = await client.db(databaseName).collection('notifications').findOne(
      { kind: 'email_verification', status: 'scheduled', 'recipient.email': email },
      { sort: { scheduledFor: -1 } },
    );
    const code = notification?.templateData && typeof notification.templateData === 'object'
      ? Reflect.get(notification.templateData, 'verificationCode')
      : undefined;
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new Error('Verification code was not queued');
    return code;
  } finally {
    await client.close();
  }
}

async function pendingLoginCode(email: string): Promise<string> {
  const uri = process.env.MONGODB_URI;
  const databaseName = process.env.MONGODB_DB_NAME;
  if (!uri || !databaseName) throw new Error('E2E MongoDB configuration is missing');
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const notification = await client.db(databaseName).collection('notifications').findOne(
      { kind: 'login_verification', status: 'scheduled', 'recipient.email': email },
      { sort: { scheduledFor: -1 } },
    );
    const code = notification?.templateData && typeof notification.templateData === 'object'
      ? Reflect.get(notification.templateData, 'loginCode')
      : undefined;
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new Error('Login code was not queued');
    return code;
  } finally {
    await client.close();
  }
}

async function fillVerificationCells(page: Page, code: string): Promise<void> {
  for (const [index, digit] of Array.from(code).entries()) {
    await page.getByLabel(`Цифра ${index + 1} из 6`).fill(digit);
  }
}

export async function verifyRegistrationEmail(page: Page, email: string): Promise<void> {
  await page.getByRole('heading', { name: 'Подтвердите email' }).waitFor();
  await fillVerificationCells(page, await pendingVerificationCode(email));
  await page.getByRole('button', { name: 'Подтвердить email' }).click();
  await page.waitForURL(/\/app(?:\/dashboard)?$/);
}

export async function verifyLoginEmail(page: Page, email: string): Promise<void> {
  if (DEV_DEMO_LOGIN_EMAILS.some((demoEmail) => demoEmail === email.toLowerCase())) {
    await page.waitForURL(/\/app(?:\/dashboard)?$/);
    return;
  }

  const verificationHeading = page.getByRole('heading', { name: 'Подтвердите вход' });
  await expect(verificationHeading).toBeVisible();
  await fillVerificationCells(page, await pendingLoginCode(email));
  await page.getByRole('button', { name: 'Подтвердить и войти' }).click();
  await page.waitForURL(/\/app(?:\/dashboard)?$/);
}
