import { describe, expect, it } from 'vitest';

import { parseEnv } from '@/server/config/env';

describe('environment validation', () => {
  it('applies documented defaults and validates secrets', () => {
    const env = parseEnv({
      NODE_ENV: 'test',
      APP_BASE_URL: 'http://localhost:3000',
      MONGODB_URI: 'mongodb://localhost:27017/db?replicaSet=rs0',
      MONGODB_DB_NAME: 'db',
      TOKEN_PEPPER: 'p'.repeat(40),
      CRON_SECRET: 'c'.repeat(40),
      EMAIL_FROM_ADDRESS: 'test@example.test',
      EMAIL_FROM_NAME: 'Tests',
    });

    expect(env.SESSION_COOKIE_NAME).toBe('na_sid');
    expect(env.SESSION_TTL_DAYS).toBe(14);
    expect(env.WORKER_BATCH_LIMIT).toBe(50);
  });

  it('rejects console mail delivery in production and incomplete SMTP settings', () => {
    const base = {
      APP_BASE_URL: 'https://example.test',
      MONGODB_URI: 'mongodb://localhost:27017/db?replicaSet=rs0',
      MONGODB_DB_NAME: 'db',
      TOKEN_PEPPER: 'p'.repeat(40),
      CRON_SECRET: 'c'.repeat(40),
      EMAIL_FROM_ADDRESS: 'test@example.test',
      EMAIL_FROM_NAME: 'Tests',
    };

    expect(() => parseEnv({ ...base, NODE_ENV: 'production', EMAIL_PROVIDER: 'console' })).toThrow();
    expect(() => parseEnv({ ...base, NODE_ENV: 'test', EMAIL_PROVIDER: 'smtp' })).toThrow();
  });
});
