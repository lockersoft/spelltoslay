import { test, expect } from '@playwright/test';
import { boot, teacher } from './helpers.js';

async function countLoadsAfterBroadcast(page, request) {
  let loads = 0;
  page.on('load', () => { loads += 1; });
  await teacher(request, { action: 'broadcastReload' });
  // The flag stays set server-side for 10s; watch past that window.
  await page.waitForTimeout(13_000);
  return loads;
}

test('one broadcast reloads the page exactly once', async ({ page, request }) => {
  await boot(page);
  expect(await countLoadsAfterBroadcast(page, request)).toBe(1);
});

test('still exactly one reload when sessionStorage is unavailable', async ({ page, request }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      get() { throw new DOMException('blocked', 'SecurityError'); },
    });
  });
  await boot(page);
  // The storage-free fallback ignores a broadcast stamped with the same
  // second as this page's first poll; step past that second first.
  await page.waitForTimeout(1100);
  expect(await countLoadsAfterBroadcast(page, request)).toBe(1);
});
