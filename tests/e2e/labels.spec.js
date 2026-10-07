import { test, expect } from '@playwright/test';
import { boot, seedEnemies, teacher } from './helpers.js';

const ARENA = { w: 960, h: 600 };
const inside = (r) => r.cx - r.w / 2 >= 0 && r.cx + r.w / 2 <= ARENA.w
                   && r.cy - r.h / 2 >= 0 && r.cy + r.h / 2 <= ARENA.h;
const overlap = (a, b) => Math.abs(a.cx - b.cx) < (a.w + b.w) / 2
                       && Math.abs(a.cy - b.cy) < (a.h + b.h) / 2;

test('labels near the walls and above the top edge are pulled inside', async ({ page }) => {
  await boot(page);
  const rects = await page.evaluate((arena) => window.layoutLabels([
    { id: 'left',  x: 20,  y: 300, w: 120, h: 34 },
    { id: 'right', x: 940, y: 300, w: 120, h: 34 },
    { id: 'top',   x: 480, y: -40, w: 120, h: 34 },
  ], arena), ARENA);
  for (const r of rects) expect(inside(r), r.id).toBe(true);
});

test('a label wider than the arena does not throw and stays centred', async ({ page }) => {
  await boot(page);
  const rects = await page.evaluate((arena) => window.layoutLabels(
    [{ id: 'huge', x: 20, y: 300, w: 1200, h: 62 }], arena), ARENA);
  expect(rects[0].cx).toBe(480);
});

test('two labels wanting the same spot do not overlap', async ({ page }) => {
  await boot(page);
  const rects = await page.evaluate((arena) => window.layoutLabels([
    { id: 'a', x: 300, y: 200, w: 100, h: 34 },
    { id: 'b', x: 310, y: 205, w: 100, h: 34 },
    { id: 'c', x: 305, y: 210, w: 100, h: 34 },
  ], arena), ARENA);
  expect(rects[0]).toMatchObject({ cx: 300, cy: 200 });   // most important keeps its spot
  expect(overlap(rects[0], rects[1])).toBe(false);
  expect(overlap(rects[0], rects[2])).toBe(false);
  expect(overlap(rects[1], rects[2])).toBe(false);
  for (const r of rects) expect(inside(r), r.id).toBe(true);
});

test('real render: 32-letter words at the largest size stay readable at both walls', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await boot(page);
  await page.evaluate(() => { window.state.wordFontSize = 40; });
  const long = 'abcdefghijklmnopqrstuvwxyzabcdef';   // 32 letters
  await seedEnemies(page, [
    { id: 'L', word: long, x: 20, y: 200 },
    { id: 'R', word: long.split('').reverse().join(''), x: 940, y: 400 },
    { id: 'S', word: 'cat', x: 20, y: 10 },
  ]);
  await page.waitForFunction(() => (window.state.labelRects || []).length === 3);
  const rects = await page.evaluate(() => window.state.labelRects);
  for (const r of rects) {
    // Fully inside, or (wider than the arena at this size) centred on it.
    expect(inside(r) || (r.w >= ARENA.w && r.cx === ARENA.w / 2), JSON.stringify(r)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('teacher message appears in the message bar without a stray bullet', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.applyMessages('', 'see me after class'));
  await expect(page.locator('#message-bar')).toHaveText('see me after class');
  await page.evaluate(() => window.applyMessages('Eyes up', 'see me after class'));
  await expect(page.locator('#message-bar')).toHaveText('Eyes up • see me after class');
  await page.evaluate(() => window.applyMessages('', ''));
  await expect(page.locator('#message-bar')).toHaveText('');
});

test('leaderboard renders names as text, not markup', async ({ page }) => {
  await boot(page);
  await page.route('**/api/leaderboard.php', (route) => route.fulfill({
    json: { today: [], allTime: [{ name: '<img src=x onerror=window.__xss=1>', score: 5, wave: 1, wpm: 10, accuracy: 90 }] },
  }));
  await page.evaluate(() => window.renderLeaderboard());
  await expect(page.locator('#lb-alltime li')).toContainText('<img');
  expect(await page.locator('#lb-alltime img').count()).toBe(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test('a rejected poll vote is not shown as accepted', async ({ page, request }) => {
  await boot(page);
  await teacher(request, { action: 'startPoll', question: 'Ready?', options: ['Yes', 'No'] });
  try {
    await expect(page.locator('#poll-overlay')).toBeVisible({ timeout: 6000 });
    await page.route('**/api/poll-vote.php', (route) =>
      route.fulfill({ status: 400, json: { error: 'poll not active or wrong poll id' } }));
    await Promise.all([
      page.waitForResponse('**/api/poll-vote.php'),
      page.locator('#poll-options button').first().click(),
    ]);
    await page.waitForTimeout(150);
    // Not marked answered: otherwise the overlay shows "You picked" and then
    // auto-dismisses 15s later with no vote recorded.
    expect(await page.evaluate(() => window.state.pollAnsweredAt)).toBe(0);
    await expect(page.locator('#poll-options')).not.toContainText('You picked');
    await expect(page.locator('#poll-options button')).toHaveCount(2);
  } finally {
    await teacher(request, { action: 'endPoll' });
  }
});

test('poll buttons are not rebuilt on every state poll', async ({ page, request }) => {
  await boot(page);
  await teacher(request, { action: 'startPoll', question: 'Stable?', options: ['Yes', 'No'] });
  try {
    await expect(page.locator('#poll-overlay')).toBeVisible({ timeout: 6000 });
    await page.evaluate(() => { document.querySelector('#poll-options button').dataset.mark = '1'; });
    await page.waitForResponse((r) => r.url().includes('/api/state.php'));
    await page.waitForResponse((r) => r.url().includes('/api/state.php'));
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.querySelector('#poll-options button').dataset.mark)).toBe('1');
    // A real vote still goes through and shows the confirmation.
    await page.locator('#poll-options button').first().click();
    await expect(page.locator('#poll-options')).toContainText('You picked: Yes');
  } finally {
    await teacher(request, { action: 'endPoll' });
  }
});
