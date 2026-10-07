import { test, expect } from '@playwright/test';
import { boot } from './helpers.js';

const die = (page) => page.evaluate(() => { window.state.hero.hp = 0; window.state.gameOver = true; });

test('score can be submitted again on a second game', async ({ page }) => {
  await boot(page, 'Again');
  await die(page);
  await expect(page.locator('#game-over')).toBeVisible();
  await page.locator('#submit-score').click();
  await expect(page.locator('#leaderboard')).toBeVisible();
  await page.locator('#play-again').click();
  await expect(page.locator('#leaderboard')).toBeHidden();
  await die(page);
  await expect(page.locator('#game-over')).toBeVisible();
  await expect(page.locator('#submit-score')).toBeEnabled();
});

test('a player can skip submitting and play again', async ({ page }) => {
  await boot(page, 'Skipper');
  await die(page);
  await expect(page.locator('#game-over')).toBeVisible();
  await page.locator('#skip-submit').click();
  await expect(page.locator('#game-over')).toBeHidden();
  const s = await page.evaluate(() => ({ running: window.state.running, hp: window.state.hero.hp,
    over: window.state.gameOver, focus: document.activeElement?.id }));
  expect(s).toEqual({ running: true, hp: 100, over: false, focus: 'type-input' });
});

test('skip is unavailable while a submission is in flight', async ({ page }) => {
  await boot(page, 'Slow');
  let release;
  const held = new Promise((r) => { release = r; });
  await page.route('**/api/score.php', async (route) => { await held; await route.continue(); });
  await die(page);
  await expect(page.locator('#game-over')).toBeVisible();
  await page.locator('#submit-score').click();
  await expect(page.locator('#skip-submit')).toBeDisabled();
  release();
  await expect(page.locator('#leaderboard')).toBeVisible();
  // And it is usable again on the next game over.
  await page.locator('#play-again').click();
  await die(page);
  await expect(page.locator('#skip-submit')).toBeEnabled();
});

test('the red "stalled" input style does not survive into the next game', async ({ page }) => {
  await boot(page, 'Stall');
  await page.locator('#type-input').focus();
  await page.evaluate(() => { window.state.hero.hp = 1; });
  await page.waitForFunction(() => window.state.enemies.length > 0, null, { timeout: 8000 });
  const wrong = await page.evaluate(() => {
    const firsts = new Set(window.state.enemies.map(e => e.word[0]));
    return 'abcdefghijklmnopqrstuvwxyz'.split('').find(c => !firsts.has(c));
  });
  await page.keyboard.type(wrong);
  await expect(page.locator('#game-over')).toBeVisible();
  await page.locator('#skip-submit').click();
  await expect(page.locator('#type-input')).not.toHaveClass(/stalled/);
  await expect(page.locator('#type-input')).toHaveValue('');
});
