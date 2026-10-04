import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@/server': fileURLToPath(new URL('./packages/server/src', import.meta.url)),
      '@/shared': fileURLToPath(new URL('./packages/shared/src', import.meta.url)),
      '@': fileURLToPath(new URL('./packages/client/src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/api/**/*.test.ts', 'tests/race/**/*.test.ts', 'tests/isolation/**/*.test.ts'],
    restoreMocks: true,
    clearMocks: true,
  },
});
