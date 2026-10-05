import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// E2E setup reads the same runtime config as the dev server for tenant-scoped database assertions.
if (!process.env.MONGODB_URI && existsSync('.env')) process.loadEnvFile('.env');

const e2eTokenPepper = `e2e-${Date.now()}-abcdefghijklmnopqrstuvwxyz0123456789`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    { command: 'npm run dev:server', url: 'http://localhost:3000/api/health', reuseExistingServer: !process.env.CI, timeout: 120_000, env: { TOKEN_PEPPER: e2eTokenPepper, TRUSTED_PROXY_HOPS: '1' } },
    { command: 'npm run dev:client', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI, timeout: 120_000 },
  ],
});
