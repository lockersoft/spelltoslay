import { test, expect } from '@playwright/test';

test('happy path: type a word, see score submitted', async ({ page }) => {
  await page.goto('/');

  // Name entry
  await page.locator('#entry-name').fill('E2E');
  await page.locator('#start-playing').click();
  await expect(page.locator('#name-entry')).toBeHidden();

  // Type a known easy word from the day-one builtin pool. "cat" is in grade-K.
  // We don't know which enemy will spawn, so brute-force: type each easy word
  // until we slay something or the run ends.
  const tryWords = ['cat','dog','run','sit','sun','it','at','in','on','is','no','to','up','we','I','of','my','me'];
  const input = page.locator('#type-input');
  await input.focus();

  // Wait for at least one enemy to spawn
  await page.waitForFunction(() => window.state && window.state.enemies && window.state.enemies.length > 0,
    null, { timeout: 8000 });

  // Pluck a live word and type it.
  const word = await page.evaluate(() => window.state.enemies[0]?.word || '');
  expect(word.length).toBeGreaterThan(0);
  await input.type(word);

  // Confirm at least one slay registered
  await page.waitForFunction(() => window.state && window.state.kills >= 1, null, { timeout: 4000 });

  // Force game over by zeroing HP via the dev hook
  await page.evaluate(() => { window.state.hero.hp = 0; window.state.gameOver = true; });

  // Submit score
  await expect(page.locator('#game-over')).toBeVisible({ timeout: 4000 });
  await page.locator('#submit-score').click();
  await expect(page.locator('#leaderboard')).toBeVisible({ timeout: 4000 });
  await expect(page.locator('#lb-alltime li').first()).toContainText('E2E');
});
