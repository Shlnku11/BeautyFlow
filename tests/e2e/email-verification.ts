import { MongoClient } from 'mongodb';
import type { Page } from '@playwright/test';

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

export async function verifyRegistrationEmail(page: Page, email: string): Promise<void> {
  await page.getByRole('heading', { name: 'Подтвердите email' }).waitFor();
  await page.getByLabel('Код подтверждения').fill(await pendingVerificationCode(email));
  await page.getByRole('button', { name: 'Подтвердить email' }).click();
  await page.waitForURL(/\/app(?:\/dashboard)?$/);
}
