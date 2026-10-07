import { defineConfig } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

// A fresh SQLite file per run, outside the repo, so e2e never touches the
// developer's data/spelltoslay.db or config/config.php.
const dbPath = path.join(os.tmpdir(), `sts_e2e_${process.pid}.sqlite`);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  // One worker: every spec shares one server and one database, and several
  // specs change class-wide state (reload broadcast, polls) that would leak
  // into pages another worker is testing.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:8001',
    headless: true,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'php scripts/init_db.php && php -S localhost:8001 -t public',
      url: 'http://localhost:8001/api/health.php',
      reuseExistingServer: false,
      timeout: 10_000,
      env: { STS_DB_PATH: dbPath, STS_TEACHER_KEY: 'e2e-key' },
    },
  ],
});
