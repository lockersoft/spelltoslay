import { test, expect } from '@playwright/test';

test('plays a run, dies, submits a score, sees leaderboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('SLAY');

  // Force the hero's HP to 0 immediately to trigger game over.
  // (We don't try to "play" the game in the test — that's brittle.)
  await page.evaluate(() => {
    state.hero.hp = 0;
  });

  // Game-over modal appears within ~1 frame.
  await expect(page.locator('#game-over')).toBeVisible({ timeout: 2000 });

  // Submit a score.
  await page.fill('#player-name', 'TestUser');
  await page.click('#submit-score');

  // Leaderboard modal appears with the entry.
  const lb = page.locator('#leaderboard');
  await expect(lb).toBeVisible({ timeout: 4000 });
  await expect(lb.locator('#lb-alltime')).toContainText('TestUser');
});

test('teacher pause freezes the game', async ({ page }) => {
  // Open the game in one tab.
  await page.goto('/');

  // Open teacher panel in another tab with a known key.
  // For E2E we need a config; the webServer started fresh — so we plant one.
  // Easier: hit the teacher endpoint directly with the dev key.
  // Tests assume config/config.php has teacher_key='e2e-key' (set in step 5).
  const res = await page.request.post('/api/teacher.php?key=e2e-key', {
    data: { action: 'pause' },
  });
  expect(res.ok()).toBeTruthy();

  // Within ~2s the overlay should be visible.
  await expect(page.locator('#overlay')).toBeVisible({ timeout: 4000 });
  await expect(page.locator('#overlay')).toContainText('PAUSED BY TEACHER');

  // Resume.
  await page.request.post('/api/teacher.php?key=e2e-key', {
    data: { action: 'resume' },
  });
  await expect(page.locator('#overlay')).toBeHidden({ timeout: 4000 });
});
