import { test, expect } from '@playwright/test';

// Regression: typeInput's blur listener used to call typeInput.focus() on a 50ms
// timer unconditionally — so clicking the name-entry input bounced focus back
// to the gameplay typing bar mid-keystroke. The guard now requires state.running.
test('focus stays in #entry-name while user types their name', async ({ page }) => {
  // No saved name → modal is shown on load.
  await page.addInitScript(() => localStorage.removeItem('sts_player_name'));
  await page.goto('/');
  await expect(page.locator('#name-entry')).toBeVisible();

  await page.locator('#entry-name').click();
  // The buggy recapture fires after 50ms; wait long enough for it to bite.
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('entry-name');

  // Real per-key typing must land in #entry-name, not get swallowed by #type-input.
  await page.keyboard.type('Quinn');
  expect(await page.locator('#entry-name').inputValue()).toBe('Quinn');
  expect(await page.locator('#type-input').inputValue()).toBe('');

  // Submitting should still work and hand focus to the typing bar afterward.
  await page.locator('#start-playing').click();
  await expect(page.locator('#name-entry')).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('type-input');
});
