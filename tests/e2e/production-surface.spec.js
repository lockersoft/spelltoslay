import { test, expect } from '@playwright/test';
import { teacher } from './helpers.js';

// The test hooks (window.state and friends) exist only on the hostname
// "localhost". Reach the same server by its loopback address to see what any
// other hostname — production included — gets.
const OTHER_HOST = 'http://127.0.0.1:8001/';

test('game internals are not global off localhost', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sts_player_name', 'Prod'));
  await page.goto(OTHER_HOST);
  await expect(page.locator('#build-version')).not.toHaveText('v…', { timeout: 8000 });
  const surface = await page.evaluate(() => ({
    state: typeof window.state,
    pick: typeof window.pickWordFor,
    add: typeof window.addEnemyToIndex,
  }));
  expect(surface).toEqual({ state: 'undefined', pick: 'undefined', add: 'undefined' });
});

test('the game still plays off localhost: a pushed word can be typed and slain', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => localStorage.setItem('sts_player_name', 'Prod'));
  await page.goto(OTHER_HOST);
  await expect(page.locator('#name-entry')).toBeHidden();
  const input = page.locator('#type-input');
  await input.focus();

  // No hooks here, so drive it the way a classroom does: the teacher pushes a
  // word, the next enemy to spawn carries it, the student types it.
  const word = 'zyzzyvaqqx';
  await teacher(request, { action: 'pushWord', word });
  const prefix = word.slice(0, -1);
  // Until that enemy has spawned, the first letter is a typo and the input
  // stalls; keep retrying until the whole prefix is accepted.
  await expect(async () => {
    await input.fill('');
    await page.keyboard.type(prefix);
    await expect(input).toHaveValue(prefix, { timeout: 300 });
    await expect(input).not.toHaveClass(/stalled/, { timeout: 300 });
  }).toPass({ timeout: 15_000 });
  // The partial word has been on screen for several frames: the frame loop
  // (which re-locks the target every frame) must still be alive, and the
  // final letter must slay, which empties the input.
  await page.waitForTimeout(300);
  await page.keyboard.type(word.slice(-1));
  await expect(input).toHaveValue('');
  await expect(page.locator('#game-over')).toBeHidden();
  expect(errors).toEqual([]);
});
