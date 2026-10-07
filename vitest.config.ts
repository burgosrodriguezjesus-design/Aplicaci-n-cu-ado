import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/tests/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: { AUTO_BACKUPS: '0', DATABASE_URL: '' },
  },
});
