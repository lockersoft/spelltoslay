import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';

const SECRET = 'e2e-hub-secret-0123456789';
const b64 = (v) => Buffer.from(v).toString('base64url');

// Mint a launch token the way the hub does (HS256 JWT; see LaunchTokenIssuer
// in the lockersoft.games repo), including a roster and a word list so it is
// realistically large.
function launchToken(overrides = {}, secret = SECRET) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'hub', sub: 'class:42', iat: now, exp: now + 3600,
    jti: crypto.randomUUID(), game: 'spelltoslay',
    teacher: { id: 7, name: 'Mrs Smith' },
    class: { id: 42, name: 'Period 3', grade_level: 4, join_code: 'ABC4' },
    students: Array.from({ length: 30 }, (_, i) => ({ id: 100 + i, name: `Student ${i}` })),
    wordlist: { id: 88, name: 'Unit 2', words: Array.from({ length: 300 }, (_, i) => `union${i}select`) },
    hub_callback: 'https://lockersoft.games/api/v1',
    ...overrides,
  };
  const head = `${b64(JSON.stringify({ typ: 'JWT', alg: 'HS256' }))}.${b64(JSON.stringify(payload))}`;
  return `${head}.${crypto.createHmac('sha256', secret).update(head).digest('base64url')}`;
}

test('a hub launch opens the panel with no key', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const api = [];
  page.on('request', (r) => { if (r.url().includes('/api/')) api.push(r); });
  const token = launchToken();

  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/players.php') && r.status() === 200),
    page.goto(`/teacher.html#session=${token}`),
  ]);
  await expect(page.locator('#control-panel')).toBeVisible();
  await expect(page.locator('#auth-gate')).toBeHidden();
  await expect(page).toHaveURL(/\/teacher\.html$/);            // token gone from the address bar
  await expect(page.locator('#launch-label')).toHaveText('Period 3 · Mrs Smith');

  // The big launch token is sent once, in a body; afterwards only the short ticket travels.
  for (const r of api) expect(r.url(), r.url()).not.toContain(token.slice(0, 40));
  const players = api.find((r) => r.url().includes('/api/players.php'));
  expect(players.headers()['x-teacher-session']).toMatch(/^v1\.\d+\.[\w-]+\.[\w-]+$/);
  expect(players.headers()['x-teacher-key']).toBeUndefined();

  // A teacher action works on the ticket alone.
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/teacher.php')),
    page.locator('#send-msg').click(),
  ]);
  expect(resp.status()).toBe(200);
  expect(resp.request().headers()['x-teacher-session']).toBeTruthy();

  // Reloading the tab keeps the session (the fragment is gone, the ticket is stored).
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/players.php') && r.status() === 200),
    page.reload(),
  ]);
  await expect(page.locator('#control-panel')).toBeVisible();
  await expect(page.locator('#launch-label')).toHaveText('Period 3 · Mrs Smith');
  expect(errors).toEqual([]);
});

for (const [name, token] of [
  ['forged', launchToken({}, 'not-the-real-secret-000000')],
  ['expired', launchToken({ exp: Math.floor(Date.now() / 1000) - 10 })],
  ['for another game', launchToken({ game: 'slay' })],
  ['garbage', 'abc.def.ghi'],
]) {
  test(`a ${name} launch link shows the gate`, async ({ page }) => {
    await page.goto(`/teacher.html#session=${token}`);
    await expect(page.locator('#auth-gate')).toBeVisible();
    await expect(page.locator('#auth-gate')).toContainText('Launch SpellToSlay again from the hub');
    await expect(page.locator('#control-panel')).toBeHidden();
    await expect(page).toHaveURL(/\/teacher\.html$/);
    // Nothing usable was kept: a plain reload stays on the gate.
    await page.reload();
    await expect(page.locator('#auth-gate')).toBeVisible();
    await expect(page.locator('#control-panel')).toBeHidden();
  });
}

test('a refused launch link does not fall back to a key saved earlier in the tab', async ({ page }) => {
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/players.php') && r.status() === 200),
    page.goto('/teacher.html#key=e2e-key'),
  ]);
  await page.goto('about:blank');
  await page.goto(`/teacher.html#session=${launchToken({}, 'not-the-real-secret-000000')}`);
  await expect(page.locator('#auth-gate')).toBeVisible();
  await expect(page.locator('#control-panel')).toBeHidden();
});

test('when the session ticket stops being accepted the panel returns to the gate', async ({ page }) => {
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/players.php') && r.status() === 200),
    page.goto(`/teacher.html#session=${launchToken()}`),
  ]);
  await expect(page.locator('#control-panel')).toBeVisible();
  // Simulate expiry: the server starts answering 403 to the ticket.
  await page.route('**/api/players.php', (route) => route.fulfill({ status: 403, json: { error: 'forbidden' } }));
  await expect(page.locator('#auth-gate')).toBeVisible({ timeout: 6000 });
  await expect(page.locator('#auth-gate')).toContainText('hub session has ended');
  await expect(page.locator('#control-panel')).toBeHidden();
});

test('opening with a key replaces an earlier hub session in the same tab', async ({ page }) => {
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/players.php') && r.status() === 200),
    page.goto(`/teacher.html#session=${launchToken()}`),
  ]);
  await page.goto('about:blank');
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/api/players.php')),
    page.goto('/teacher.html#key=e2e-key'),
  ]);
  expect(req.headers()['x-teacher-key']).toBe('e2e-key');
  expect(req.headers()['x-teacher-session']).toBeUndefined();
  await expect(page.locator('#launch-label')).toHaveText('');
});
