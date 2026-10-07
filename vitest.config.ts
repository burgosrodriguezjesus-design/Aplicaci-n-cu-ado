import { defineConfig } from 'vitest/config';
import os from 'node:os';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['server/tests/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    env: {
      DATA_DIR: path.join(os.tmpdir(), `obrador-test-${process.pid}`),
      AUTO_BACKUPS: '0',
    },
  },
});
