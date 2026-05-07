import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:8001',
    headless: true,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'echo "<?php return [\\\"teacher_key\\\" => \\\"e2e-key\\\"];" > config/config.php && php scripts/init_db.php && php -S localhost:8001 -t public',
      url: 'http://localhost:8001/api/health.php',
      reuseExistingServer: false,
      timeout: 10_000,
      env: {},
    },
  ],
});
