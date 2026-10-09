import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

// Screenshots of every page and state, for reviewing a visual change by eye.
// Not part of the test suite: run with
//   SCREENS_LABEL=before npx playwright test -c playwright.screens.config.js
// Pictures land in screens/<label>/ (gitignored).
export default defineConfig({
  ...base,
  testDir: './tests/screens',
  testMatch: /.*\.screens\.js/,
});
