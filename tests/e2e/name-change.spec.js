import { test, expect } from '@playwright/test';
import { boot, teacher } from './helpers.js';

const die = (page) => page.evaluate(() => { window.state.hero.hp = 0; window.state.gameOver = true; });

test('a profane first name is refused with a message', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#name-entry')).toBeVisible();
  await page.locator('#entry-name').fill('shithead');
  await page.locator('#start-playing').click();
  await expect(page.locator('#entry-error')).toContainText('not allowed');
  await expect(page.locator('#name-entry')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('sts_player_name'))).toBeNull();
});

test('Enter submits the name form', async ({ page }) => {
  await page.goto('/');
  await page.locator('#entry-name').fill('Quinn');
  await page.keyboard.press('Enter');
  await expect(page.locator('#name-entry')).toBeHidden();
  expect(await page.evaluate(() => window.state.playerName)).toBe('Quinn');
});

test('a browser that saved a profane name earlier is asked for a new one', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('sts_player_name', 'shithead');
      sessionStorage.setItem('seeded', '1');
    }
  });
  await page.goto('/');
  await expect(page.locator('#name-entry')).toBeVisible({ timeout: 6000 });
  expect(await page.evaluate(() => ({
    saved: localStorage.getItem('sts_player_name'), running: window.state.running, name: window.state.playerName,
  }))).toEqual({ saved: null, running: false, name: '' });
  await page.locator('#entry-name').fill('Better');
  await page.locator('#start-playing').click();
  await expect(page.locator('#name-entry')).toBeHidden();
  expect(await page.evaluate(() => window.state.running)).toBe(true);
});

test('Change name on the game-over screen renames the player', async ({ page }) => {
  await boot(page, 'Before');
  // Let one poll create the presence row under the old name.
  await page.waitForResponse((r) => r.url().includes('/api/state.php') && r.url().includes('name=Before'));
  await die(page);
  await expect(page.locator('#game-over')).toBeVisible();
  await page.locator('#change-name').click();
  await expect(page.locator('#name-entry')).toBeVisible();
  await expect(page.locator('#entry-name')).toHaveValue('Before');

  await page.locator('#entry-name').fill('damn');
  await page.locator('#start-playing').click();
  await expect(page.locator('#entry-error')).toContainText('not allowed');
  await expect(page.locator('#game-over-name')).toHaveText('Before');

  await page.locator('#entry-name').fill('');
  await page.locator('#start-playing').click();
  await expect(page.locator('#entry-error')).toBeVisible();

  await page.locator('#entry-name').fill('After');
  await page.locator('#start-playing').click();
  await expect(page.locator('#name-entry')).toBeHidden();
  await expect(page.locator('#game-over')).toBeVisible();     // still on game over
  await expect(page.locator('#game-over-name')).toHaveText('After');
  expect(await page.evaluate(() => window.state.running)).toBe(false);

  // The server agrees, so later polls do not revert it.
  await page.waitForResponse((r) => r.url().includes('/api/state.php') && r.url().includes('name=After'));
  await page.waitForResponse((r) => r.url().includes('/api/state.php'));
  expect(await page.evaluate(() => window.state.playerName)).toBe('After');
  expect(page.url()).not.toContain('#');
});

test('a failed save in change mode keeps the old name', async ({ page }) => {
  await boot(page, 'Keeper');
  await die(page);
  await page.locator('#change-name').click();
  await page.route('**/api/rename.php', (route) => route.fulfill({ status: 500, json: { error: 'boom' } }));
  await page.locator('#entry-name').fill('Newname');
  await page.locator('#start-playing').click();
  await expect(page.locator('#entry-error')).toContainText('Could not save');
  await expect(page.locator('#name-entry')).toBeVisible();
  expect(await page.evaluate(() => ({ n: window.state.playerName, s: localStorage.getItem('sts_player_name') })))
    .toEqual({ n: 'Keeper', s: 'Keeper' });
  // Cancel closes the modal and leaves everything as it was.
  await page.locator('#cancel-name').click();
  await expect(page.locator('#name-entry')).toBeHidden();
  await expect(page.locator('#game-over-name')).toHaveText('Keeper');
});

test('changing name while the teacher has paused the class works and stays paused', async ({ page, request }) => {
  await boot(page, 'Paused');
  await page.waitForResponse((r) => r.url().includes('/api/state.php') && r.url().includes('name=Paused'));
  await die(page);
  await expect(page.locator('#game-over')).toBeVisible();
  await teacher(request, { action: 'pause' });
  try {
    await page.waitForFunction(() => window.state.paused === true, null, { timeout: 6000 });
    await page.locator('#change-name').click();
    await page.locator('#entry-name').fill('Renamed');
    await page.locator('#start-playing').click();
    await expect(page.locator('#name-entry')).toBeHidden();
    await expect(page.locator('#game-over-name')).toHaveText('Renamed');
    expect(await page.evaluate(() => ({ paused: window.state.paused, running: window.state.running })))
      .toEqual({ paused: true, running: false });
  } finally {
    await teacher(request, { action: 'resume' });
  }
});

test('a name rejected after the run already ended does not restart the dead run', async ({ page }) => {
  // Server unreachable at first: the saved (disallowed) name is not caught yet.
  await page.route('**/api/state.php*', (route) => route.abort());
  await page.route('**/api/rename.php', (route) => route.abort());
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('sts_player_name', 'shithead');
      sessionStorage.setItem('seeded', '1');
    }
  });
  await page.goto('/');
  await page.waitForFunction(() => window.state && window.state.running);
  await die(page);
  await expect(page.locator('#game-over')).toBeVisible();
  // Connectivity returns; the next poll rejects the name.
  await page.unroute('**/api/state.php*');
  await page.unroute('**/api/rename.php');
  await expect(page.locator('#name-entry')).toBeVisible({ timeout: 6000 });
  await page.locator('#entry-name').fill('Good');
  await page.locator('#start-playing').click();
  await expect(page.locator('#name-entry')).toBeHidden();
  await expect(page.locator('#game-over')).toBeVisible();
  await expect(page.locator('#game-over-name')).toHaveText('Good');
  expect(await page.evaluate(() => ({ running: window.state.running, over: window.state.gameOver })))
    .toEqual({ running: false, over: true });
});
