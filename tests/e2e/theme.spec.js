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
const GREEN = 'rgb(43, 138, 62)';      // resumed / un-pause

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
  expect(typing.y - (arena.y + arena.height)).toBeLessThanOrEqual(12);
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
});

test('narrow teacher window: no sideways scroll with a student in the roster', async ({ browser }) => {
  const student = await (await browser.newContext()).newPage();
  await student.addInitScript(() => localStorage.setItem('sts_player_name', 'A Sixteen Letter'));
  await student.goto('/');
  await student.waitForFunction(() => window.state && window.state.running);
  const teacher = await (await browser.newContext({ viewport: { width: 700, height: 768 } })).newPage();
  await teacher.goto('/teacher.html#key=e2e-key');
  await expect(teacher.locator('.roster-row')).not.toHaveCount(0, { timeout: 10_000 });
  expect(await noSideScroll(teacher)).toBe(true);
  // The roster is its own scroll box, so a row that is too wide scrolls inside
  // it without widening the page: check the box as well.
  expect(await teacher.locator('#roster').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test('every teacher button, roster rows included, has a theme background', async ({ browser }) => {
  const student = await (await browser.newContext()).newPage();
  await student.addInitScript(() => localStorage.setItem('sts_player_name', 'Rosa'));
  await student.goto('/');
  await student.waitForFunction(() => window.state && window.state.running);
  const teacher = await (await browser.newContext()).newPage();
  await teacher.goto('/teacher.html#key=e2e-key');
  await expect(teacher.locator('.roster-row')).not.toHaveCount(0, { timeout: 10_000 });
  const allowed = [PANEL_2, BLUE, RED, GREEN, 'rgba(0, 0, 0, 0)'];   // transparent: the ✏️ rename button
  const odd = await teacher.locator('#control-panel button').evaluateAll(
    (els, ok) => els.map((el) => [el.id || el.className, getComputedStyle(el).backgroundColor]).filter(([, c]) => !ok.includes(c)),
    allowed,
  );
  expect(odd).toEqual([]);
  // The rename box keeps its compact size inside a roster row.
  await teacher.locator('.rename-btn').first().click();
  expect(await css(teacher, '.roster-name-input', 'paddingTop')).toBe('4px');
  await teacher.keyboard.press('Escape');
});
