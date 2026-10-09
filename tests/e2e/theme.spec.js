import { test, expect } from '@playwright/test';

// The pages wear the Debug Derby theme (public/theme.css). These checks read
// what the browser actually computed, so a missing <link>, a rule that loses
// the cascade, or a leftover inline colour shows up here.
const NAVY = 'rgb(11, 16, 36)';        // --bg
const FIELD = 'rgb(14, 20, 48)';       // input background
const PANEL = 'rgb(21, 28, 59)';       // --panel
const PANEL_2 = 'rgb(27, 36, 80)';     // --panel-2, the plain button
const YELLOW = 'rgb(255, 212, 59)';    // --yellow, button.go
const BLUE = 'rgb(77, 171, 247)';      // --blue, button.blue
const RED = 'rgb(201, 42, 42)';        // pause / danger
const MUTED = 'rgb(154, 163, 199)';    // --muted
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

const bg = (page, sel) => page.locator(sel).evaluate((el) => getComputedStyle(el).backgroundColor);
const css = (page, sel, prop) => page.locator(sel).evaluate((el, p) => getComputedStyle(el)[p], prop);

const PAGES = [['student', '/'], ['teacher', '/teacher.html#key=e2e-key']];

for (const [name, url] of PAGES) {
  test(`${name} page: navy body and the gradient top bar`, async ({ page }) => {
    await page.goto(url);
    await expect(page.locator('header.top')).toBeVisible();
    expect(await bg(page, 'body')).toBe(NAVY);
    const bar = await page.locator('header.top').evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bar).toContain('linear-gradient');
    expect(bar).toContain('rgb(255, 107, 107)');
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test(`${name} page: no inline style attributes in the markup`, async ({ request }) => {
    const html = await (await request.get(url.split('#')[0])).text();
    expect(html).not.toMatch(/\sstyle=/);
  });
}

test('student page: join modal uses the theme panel, field and primary button', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#name-entry')).toBeVisible();
  expect(await bg(page, '#name-entry')).toBe(PANEL);
  expect(await bg(page, '#entry-name')).toBe(FIELD);
  expect(await bg(page, '#start-playing')).toBe(YELLOW);
  // Not the 13px a label hands down: this is the first box a student types in.
  expect(await css(page, '#entry-name', 'fontSize')).toBe('16px');
  expect(await bg(page, '#type-input')).toBe(FIELD);
});

test('teacher page: every section is a panel and the controls use the theme', async ({ page }) => {
  await page.goto('/teacher.html#key=e2e-key');
  await expect(page.locator('#control-panel')).toBeVisible();
  expect(await page.locator('#control-panel h2').count()).toBeGreaterThanOrEqual(5);
  expect(await page.locator('#control-panel h2').evaluateAll(
    (els) => els.filter((el) => !el.closest('.panel')).map((el) => el.textContent),
  )).toEqual([]);
  // Every section directly inside the control panel is a panel: all six.
  expect(await page.locator('#control-panel > section').evaluateAll(
    (els) => els.map((el) => el.classList.contains('panel')),
  )).toEqual([true, true, true, true, true, true]);
  expect(await bg(page, '#msg-input')).toBe(FIELD);
  expect(await css(page, '#msg-input', 'fontSize')).toBe('15px');
  expect(await bg(page, '#word-list-textarea')).toBe(FIELD);
  expect(await bg(page, '#grade-select')).toBe(FIELD);
  expect(await bg(page, '#send-msg')).toBe(BLUE);
  expect(await bg(page, '#use-list-btn')).toBe(BLUE);
  expect(await bg(page, '#clear-msg')).toBe(PANEL_2);
});

test('teacher page: the access gate is a panel in the page, not a floating modal', async ({ page }) => {
  await page.goto('/teacher.html');
  await expect(page.locator('#auth-gate')).toBeVisible();
  expect(await bg(page, '#auth-gate')).toBe(PANEL);
  expect(await page.locator('#auth-gate').evaluate((el) => getComputedStyle(el).position)).toBe('static');
});

const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('the top bar stays one line high; arena and typing box sit right under it', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 657 });   // a 1366x768 Chromebook less browser chrome (estimate)
  await page.addInitScript(() => localStorage.setItem('sts_player_name', 'TST'));
  await page.goto('/');
  await page.waitForFunction(() => window.state && window.state.running);
  const bar = await page.locator('header.top').boundingBox();
  const arena = await page.locator('#arena').boundingBox();
  const typing = await page.locator('#type-input').boundingBox();
  expect(bar.height).toBeLessThanOrEqual(56);
  expect(arena.y).toBeLessThanOrEqual(70);
  const gap = typing.y - (arena.y + arena.height);
  expect(gap).toBeLessThanOrEqual(12);
  expect(gap).toBeGreaterThanOrEqual(0);   // under the arena, not over its bottom edge
  expect(await noSideScroll(page)).toBe(true);
});

test('the typing box keeps its own big, bright style', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sts_player_name', 'TST'));
  await page.goto('/');
  await page.waitForFunction(() => window.state && window.state.running);
  expect(await css(page, '#type-input', 'fontSize')).toBe('18px');
  expect(await css(page, '#type-input', 'borderTopWidth')).toBe('2px');
  expect(await css(page, '#type-input', 'paddingTop')).toBe('10px');
  expect(await css(page, '#type-input', 'fontFamily')).toContain('monospace');
  // No taller than it was before the theme: the bare-input rule's "font: inherit"
  // would hand it the body's line height and push the page down.
  expect((await page.locator('#type-input').boundingBox()).height).toBeLessThanOrEqual(45);
});

test('narrow teacher window: no sideways scroll with a student in the roster', async ({ browser }) => {
  const student = await (await browser.newContext()).newPage();
  await student.addInitScript(() => localStorage.setItem('sts_player_name', 'A Sixteen Letter'));
  await student.goto('/');
  await student.waitForFunction(() => window.state && window.state.running);
  const teacher = await (await browser.newContext({ viewport: { width: 700, height: 768 } })).newPage();
  await teacher.goto('/teacher.html#key=e2e-key');
  // Wait for this student's own row: another test's student may already be
  // listed, and a short name would not stretch the row.
  await expect(teacher.locator('.roster-name').filter({ hasText: /^A Sixteen Letter$/ })).toHaveCount(1, { timeout: 10_000 });
  expect(await noSideScroll(teacher)).toBe(true);
  // The roster is its own scroll box, so a row that is too wide scrolls inside
  // it without widening the page: check the box as well.
  expect(await teacher.locator('#roster').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

// Each button is checked against the colour its job calls for, picked here by
// id and by the class the script gives it, not by the button's own colour class.
test('every teacher button, roster rows included, has the colour its job calls for', async ({ browser }) => {
  const student = await (await browser.newContext()).newPage();
  await student.addInitScript(() => localStorage.setItem('sts_player_name', 'Rosa'));
  await student.goto('/');
  await student.waitForFunction(() => window.state && window.state.running);
  const teacher = await (await browser.newContext()).newPage();
  await teacher.goto('/teacher.html#key=e2e-key');
  await expect(teacher.locator('.roster-row')).not.toHaveCount(0, { timeout: 10_000 });
  const want = {
    ids: {
      'pause-btn': RED, 'clear-board': RED,
      'send-msg': BLUE, 'start-poll-btn': BLUE, 'use-list-btn': BLUE, 'push-word-btn': BLUE,
    },
    classes: { 'pause-personal': RED, 'rename-btn': TRANSPARENT },
    other: PANEL_2,
  };
  const seen = await teacher.locator('#control-panel button').evaluateAll((els, w) => els.map((el) => {
    const cls = Object.keys(w.classes).find((c) => el.classList.contains(c));
    return {
      name: el.id || cls || el.textContent.trim(),
      expected: w.ids[el.id] || (cls && w.classes[cls]) || w.other,
      actual: getComputedStyle(el).backgroundColor,
    };
  }), want);
  expect(seen.filter((b) => b.actual !== b.expected)).toEqual([]);
  // Every button named above was really there to be checked.
  const names = seen.map((b) => b.name);
  for (const name of [...Object.keys(want.ids), ...Object.keys(want.classes)]) expect(names).toContain(name);
  expect(seen.filter((b) => b.expected === PANEL_2).length).toBeGreaterThanOrEqual(5);
  // The rename box keeps its compact size inside a roster row.
  await teacher.locator('.rename-btn').first().click();
  expect(await css(teacher, '.roster-name-input', 'paddingTop')).toBe('4px');
  await teacher.keyboard.press('Escape');
});

// The scripts give these poll lines a class and style.css gives the class its
// look; nothing else reads them, so a deleted rule would go unnoticed.
test('poll lines the scripts build take their look from style.css', async ({ browser }) => {
  const student = await (await browser.newContext()).newPage();
  await student.addInitScript(() => localStorage.setItem('sts_player_name', 'Polly'));
  await student.goto('/');
  await student.waitForFunction(() => window.state && window.state.running);
  const teacher = await (await browser.newContext()).newPage();
  await teacher.goto('/teacher.html#key=e2e-key');
  await expect(teacher.locator('#control-panel')).toBeVisible();
  await teacher.fill('#poll-question-input', 'Theme check?');
  await teacher.locator('.poll-opt').nth(0).fill('Yes');
  await teacher.locator('.poll-opt').nth(1).fill('No');
  await teacher.click('#start-poll-btn');
  try {
    await expect(teacher.locator('#poll-active')).toBeVisible();
    await expect(teacher.locator('.poll-tally-total')).toBeVisible();
    expect(await css(teacher, '.poll-tally-total', 'color')).toBe(MUTED);
    await expect(student.locator('#poll-overlay')).toBeVisible({ timeout: 10_000 });
    await student.locator('#poll-options button').first().click();
    await expect(student.locator('.poll-picked')).toBeVisible();
    expect(await css(student, '.poll-picked', 'fontWeight')).toBe('700');
    expect(await css(student, '.poll-closing', 'color')).toBe(MUTED);
  } finally {
    await teacher.click('#end-poll-btn');
    await expect(teacher.locator('#poll-form')).toBeVisible();
  }
});

// The hub-launch notice is hidden unless the page was opened from the hub, so
// it is shown here by hand to read its two looks: applied (green) and warning.
test('teacher page: the hub launch notice is green, and orange as a warning', async ({ page }) => {
  await page.goto('/teacher.html#key=e2e-key');
  await expect(page.locator('#control-panel')).toBeVisible();
  await page.evaluate(() => document.getElementById('launch-notice').classList.remove('hidden'));
  await expect(page.locator('#launch-notice')).toBeVisible();
  expect(await css(page, '#launch-notice', 'borderTopColor')).toBe('rgb(81, 207, 102)');
  expect(await bg(page, '#launch-notice')).toBe(PANEL);
  await page.evaluate(() => document.getElementById('launch-notice').classList.add('warn'));
  expect(await css(page, '#launch-notice', 'borderTopColor')).toBe('rgb(255, 146, 43)');
  expect(await bg(page, '#launch-notice')).toBe('rgb(42, 33, 18)');
});
