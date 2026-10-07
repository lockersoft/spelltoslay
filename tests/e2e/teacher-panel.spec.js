import { test, expect } from '@playwright/test';
import { teacher } from './helpers.js';

const stateResponse = (page) =>
  page.waitForResponse((r) => r.url().includes('/api/state.php') && r.status() === 200);
const playersResponse = (page) =>
  page.waitForResponse((r) => r.url().includes('/api/players.php') && r.status() === 200);

test('the key is removed from the address bar and sent as a header', async ({ page }) => {
  const seen = [];
  page.on('request', (r) => { if (r.url().includes('/api/')) seen.push(r); });
  await Promise.all([playersResponse(page), page.goto('/teacher.html?key=e2e-key')]);
  await expect(page.locator('#control-panel')).toBeVisible();
  await expect(page).toHaveURL(/\/teacher\.html$/);
  for (const r of seen) expect(r.url(), r.url()).not.toContain('e2e-key');
  const players = seen.find((r) => r.url().includes('/api/players.php'));
  expect(players.headers()['x-teacher-key']).toBe('e2e-key');
  // A teacher action works with the key only in the header.
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/teacher.php')),
    page.locator('#send-msg').click(),
  ]);
  expect(resp.status()).toBe(200);
  expect(resp.url()).not.toContain('key=');
});

test('the key also works from the URL fragment and survives a reload', async ({ page }) => {
  await page.goto('/teacher.html#key=e2e-key');
  await expect(page.locator('#control-panel')).toBeVisible();
  await expect(page).toHaveURL(/\/teacher\.html$/);
  await Promise.all([playersResponse(page), page.reload()]);
  await expect(page.locator('#control-panel')).toBeVisible();
});

test('a wrong key shows the gate, not an empty panel', async ({ page }) => {
  await page.goto('/teacher.html?key=wrong');
  await expect(page.locator('#auth-gate')).toBeVisible();
  await expect(page.locator('#auth-gate')).toContainText('not accepted');
  await expect(page.locator('#control-panel')).toBeHidden();
  // The bad key is forgotten: reloading without one stays on the gate.
  await page.goto('/teacher.html');
  await expect(page.locator('#auth-gate')).toBeVisible();
  await expect(page.locator('#control-panel')).toBeHidden();
});

test('an unsent class message draft survives the refresh', async ({ page, request }) => {
  await teacher(request, { action: 'message', text: '' });
  await Promise.all([stateResponse(page), page.goto('/teacher.html?key=e2e-key')]);
  await expect(page.locator('#control-panel')).toBeVisible();
  await page.locator('#msg-input').fill('half-written note');
  await page.locator('#poll-question-input').click();   // move focus away
  await stateResponse(page);
  await stateResponse(page);
  await expect(page.locator('#msg-input')).toHaveValue('half-written note');

  // Sending makes it the server value...
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/teacher.php')),
    page.locator('#send-msg').click(),
  ]);
  await stateResponse(page);
  await expect(page.locator('#msg-input')).toHaveValue('half-written note');
  // ...and Clear empties it for good.
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/teacher.php')),
    page.locator('#clear-msg').click(),
  ]);
  await stateResponse(page);
  await stateResponse(page);
  await expect(page.locator('#msg-input')).toHaveValue('');
});

test('a field focused before the first refresh still syncs later', async ({ page, request }) => {
  await teacher(request, { action: 'message', text: 'first value' });
  try {
    // Hold the first state response until the field has focus.
    let release;
    const held = new Promise((r) => { release = r; });
    let first = true;
    await page.route('**/api/state.php', async (route) => {
      if (first) { first = false; await held; }
      await route.continue();
    });
    await page.goto('/teacher.html?key=e2e-key');
    await page.locator('#msg-input').focus();
    release();
    await stateResponse(page);
    await page.locator('#poll-question-input').click();   // blur without typing
    await stateResponse(page);
    await stateResponse(page);
    await expect(page.locator('#msg-input')).toHaveValue('first value');
    // And a later change on the server shows up too.
    await teacher(request, { action: 'message', text: 'second value' });
    await expect(page.locator('#msg-input')).toHaveValue('second value', { timeout: 6000 });
  } finally {
    await teacher(request, { action: 'message', text: '' });
  }
});

test('an unsent personal message draft survives the refresh', async ({ page, browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL });
  try {
    const student = await ctx.newPage();
    await student.addInitScript(() => localStorage.setItem('sts_player_name', 'Rosa'));
    await student.goto('/');
    await page.goto('/teacher.html?key=e2e-key');
    const row = page.locator('.roster-row', { hasText: 'Rosa' });
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.locator('.roster-msg').fill('draft for Rosa');
    await page.locator('#poll-question-input').click();
    await playersResponse(page);
    await playersResponse(page);
    await expect(row.locator('.roster-msg')).toHaveValue('draft for Rosa');
  } finally {
    await ctx.close();
  }
});
