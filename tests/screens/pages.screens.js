import { test, expect } from '@playwright/test';
import path from 'node:path';
import crypto from 'node:crypto';
import { seedEnemies } from '../e2e/helpers.js';

const LABEL = process.env.SCREENS_LABEL || 'current';
const shot = (page, name) => page.screenshot({ path: path.join('screens', LABEL, `${name}.png`), fullPage: true });
const VIEW = { viewport: { width: 1280, height: 900 } };

test.use(VIEW);

test('student page states', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#name-entry')).toBeVisible();
  await shot(page, '01-student-join');

  await page.fill('#entry-name', 'Ada');
  await page.click('#start-playing');
  await expect(page.locator('#name-entry')).toBeHidden();
  await page.waitForFunction(() => window.state && window.state.running);
  await seedEnemies(page, [
    { id: 9001, x: 300, y: 220, word: 'planet' },
    { id: 9002, x: 640, y: 360, word: 'bridge' },
  ]);
  await page.locator('#type-input').type('pla');
  await shot(page, '02-student-playing');

  await page.evaluate(() => { window.state.hero.hp = 0; window.state.gameOver = true; });
  await expect(page.locator('#game-over')).toBeVisible();
  await shot(page, '03-student-game-over');

  await page.click('#change-name');
  await expect(page.locator('#cancel-name')).toBeVisible();
  await shot(page, '04-student-change-name');
  await page.click('#cancel-name');

  await page.click('#submit-score');
  await expect(page.locator('#leaderboard')).toBeVisible();
  await shot(page, '05-student-leaderboard');
});

for (const [name, size] of [['13-student-chromebook-window', { width: 1366, height: 657 }], ['14-student-phone', { width: 390, height: 844 }]]) {
  test(`student page playing: ${name}`, async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: size })).newPage();
    await page.addInitScript(() => localStorage.setItem('sts_player_name', 'Ada'));
    await page.goto('/');
    await page.waitForFunction(() => window.state && window.state.running);
    await seedEnemies(page, [{ id: 9001, x: 300, y: 220, word: 'planet' }]);
    await page.screenshot({ path: path.join('screens', LABEL, `${name}.png`) });   // the window, not the full page
    await page.context().close();
  });
}

// A launch from the hub: the class label in the top bar and the notice about
// the class word list. This list has nothing the game can use, so the notice
// is the warning form and the word pool is left alone.
test('teacher page opened from the hub', async ({ browser }) => {
  const b64 = (v) => Buffer.from(v).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'hub', sub: 'class:42', iat: now, exp: now + 3600,
    jti: crypto.randomUUID(), game: 'spelltoslay',
    teacher: { id: 7, name: 'Mrs Smith' },
    class: { id: 42, name: 'Period 3', grade_level: 4, join_code: 'ABC4' },
    students: [{ id: 100, name: 'Student 0' }],
    wordlist: { id: 1, name: 'Phrases', words: ['ice cream', "can't"] },
    hub_callback: 'https://lockersoft.games/api/v1',
  };
  const head = `${b64(JSON.stringify({ typ: 'JWT', alg: 'HS256' }))}.${b64(JSON.stringify(payload))}`;
  const token = `${head}.${crypto.createHmac('sha256', 'e2e-hub-secret-0123456789').update(head).digest('base64url')}`;
  const page = await (await browser.newContext(VIEW)).newPage();
  await page.goto(`/teacher.html#session=${token}`);
  await expect(page.locator('#control-panel')).toBeVisible();
  await expect(page.locator('#launch-notice')).toHaveClass(/warn/);
  await expect(page.locator('#launch-label')).toHaveText('Period 3 · Mrs Smith');
  await shot(page, '15-teacher-hub-launch-warning');
});

test('teacher page states, and what the class sees', async ({ browser }) => {
  const gate = await (await browser.newContext(VIEW)).newPage();
  await gate.goto('/teacher.html');
  await expect(gate.locator('#auth-gate')).toBeVisible();
  await shot(gate, '06-teacher-access-gate');

  const student = await (await browser.newContext(VIEW)).newPage();
  await student.goto('/');
  await student.fill('#entry-name', 'Grace');
  await student.click('#start-playing');
  await expect(student.locator('#name-entry')).toBeHidden();

  const teacher = await (await browser.newContext(VIEW)).newPage();
  await teacher.goto('/teacher.html#key=e2e-key');
  await expect(teacher.locator('#control-panel')).toBeVisible();
  // Students from the earlier pictures may still be listed as online.
  await expect(teacher.locator('.roster-row')).not.toHaveCount(0, { timeout: 10_000 });
  await shot(teacher, '07-teacher-panel');

  await teacher.fill('#msg-input', 'Eyes up front');
  await teacher.click('#send-msg');
  await teacher.fill('#poll-question-input', 'Ready for the quiz?');
  await teacher.locator('.poll-opt').nth(0).fill('Yes');
  await teacher.locator('.poll-opt').nth(1).fill('Not yet');
  await teacher.click('#start-poll-btn');
  await expect(student.locator('#poll-overlay')).toBeVisible({ timeout: 10_000 });
  await expect(student.locator('#message-bar')).toContainText('Eyes up front');
  await shot(student, '08-student-poll-and-message');
  await expect(teacher.locator('#poll-active')).toBeVisible();
  await shot(teacher, '09-teacher-poll-running');
  await student.locator('#poll-options button').first().click();
  await expect(student.locator('#poll-options')).toContainText('You picked');
  await shot(student, '12-student-poll-answered');
  await teacher.click('#end-poll-btn');
  await expect(teacher.locator('#poll-form')).toBeVisible();

  await teacher.click('#pause-btn');
  await expect(teacher.locator('#pause-btn')).toHaveClass(/resumed/);
  await student.waitForFunction(() => window.state.paused === true, null, { timeout: 10_000 });
  await shot(student, '10-student-paused');
  await shot(teacher, '11-teacher-paused');
  await teacher.click('#pause-btn');
  await student.waitForFunction(() => window.state.paused === false, null, { timeout: 10_000 });
  await teacher.click('#clear-msg');
});
