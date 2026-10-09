# SpellToSlay: Debug Derby Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give SpellToSlay's student game page and teacher page the same look as the Debug Derby student pages: navy background, gradient top bar, rounded panels, chips, yellow and blue buttons, dark inputs.

**Architecture:** Debug Derby's shared theme file is copied into `public/theme.css` byte for byte and loaded ahead of `public/style.css` on both pages. `style.css` is rewritten to hold only SpellToSlay's own layout and components (typing box, word-size slider, word pool, hub launch notice), expressed in the theme's colour variables. The two HTML pages take the theme's markup (`header.top`, `.panel`, `.chip`, `button.go`, `button.blue`) and lose their inline `style` attributes. Every element id, every state class the scripts toggle and all visible wording stay as they are.

**Tech Stack:** Hand-written HTML, CSS and vanilla JS served from `public/` (no build step), PHP API, Playwright for end-to-end tests, PHPUnit for the API.

**Spec:** There is no separate spec document. The request is Dave's, relayed by Switchboard on 2026-10-08: "I want the same styling that is on the DebugDerby layout pages for the students copied to the teacher pages and student games for slay and slaytospell", clarified as "pages like: https://spelltoslay.lockersoft.games/teacher.html". The source look is `src/shared/theme.css` in the Debug Derby repo at commit `64a641e` (branch `course/intro-python-5-8`, checkout `/Users/davejones/Documents/GitHub/DebugDerby-course`). The sister plan for SLAY is `docs/superpowers/plans/2026-10-08-debug-derby-theme.md` in that game's repo.

## Decisions this plan assumes (Dave to confirm)

These three questions went to Dave through Switchboard on 2026-10-08. The plan is written on the defaults marked below. A different answer to 1 or 2 changes the plan; a different answer to 3 changes only the release steps.

1. **Which look is the source?**
   - (a) The Debug Derby game theme as committed on the course branch (`course.html`, `turtle.html` and the rest on debugderby.com). **Assumed.**
   - (b) The same plus the sticky top bar that is still uncommitted work in the `DebugDerby` master checkout.
   - (c) The hub's light grey and white student join pages (class code, name, PIN).
2. **How close a match?**
   - (a) Page chrome only: top bar, panels, buttons, inputs, modals, lists, colours. **Assumed.**
   - (b) Also repaint what the game draws on the canvas to the new palette.
3. **Neither game has a staging host** (`deploy.php` defines production only, so a deploy is live).
   - (a) Dave reviews locally from before-and-after screenshots of every page and state, then confirms production. **Assumed.**
   - (b) Create staging hosts for both games on DreamHost first, as a separate item.
   - (c) Added after Gauntlet's review, not in the list first sent to Dave: as well as (a), before the merge Dave serves the branch on his own machine and opens it on one real classroom Chromebook and one tablet. That is the only way to settle the two device questions under "Known and unconfirmed" below.

## What was proven before this plan was written

Every file in this plan was applied to a scratch copy of `main` at `35949e3` and run, on 2026-10-08:

- Unchanged `main`: `npx playwright test` gave 59 passed; `vendor/bin/phpunit` gave OK (189 tests, 7380 assertions).
- With this plan applied: `npx playwright test` gave 70 passed (59 existing + 11 new).
- The new `theme.spec.js` run against the unchanged pages: 9 of 11 failed. The two that pass there are "student page: no inline style attributes" (the old `index.html` has none) and "the typing box keeps its own big, bright style" (true before and after; it is there to stop the theme flattening it).
- The screenshot run produced 15 pictures on both the unchanged pages and the restyled pages.

- Every break in Task 3 was run on the scratch copy and failed the test named there.
- Gauntlet reviewed the first draft adversarially on 2026-10-08, applied it to its own scratch copy and measured old against new. Its findings are fixed in this version: a cascade bug that shrank the typing box to an ordinary small field (and the roster rename box); the join screen's name box dropping from 16px to 13px text; and three checks that still passed with the thing they named broken (pointer, Chromebook screen, narrow teacher window). Gauntlet also compared every id, attribute and piece of visible text in the old and new HTML and found no difference beyond the added classes.

## Known and unconfirmed

- **Real Chromebook height is unmeasured.** Nobody has read `window.innerHeight` off a classroom Chromebook. At an estimated 657px-high window the typing box is below the fold (about 673 to 710px). That is already true on `main`; the theme adds 6 to 7px. The test holds the top bar to one line (56px) so it cannot get worse unnoticed. Picture 13 shows this window size.
- **Phone width:** picture 14 shows the page at 390px wide. The typing box is 18px text, so iPhone Safari will not zoom on focus.
- **Input text size:** the name box is 16px and the teacher's inputs are 15px. Debug Derby's own inputs inside labels are 13px; this plan does not follow that, because 13px is small for a first box a ten-year-old types into and makes phones zoom.
- **`.secondary` buttons** keep the class in the markup (a script builds one) but no longer have their own rule: a secondary button is the theme's plain button. Primary actions are `go` (yellow) or `blue`.
- **Disabled buttons** take the theme's half-opacity and not-allowed cursor.
- Nothing was opened on the live host.

## Global Constraints

- Work on a new branch `feature/debug-derby-theme` cut from `main`. Never commit on `main`.
- No pull requests. Plain commit messages with no Claude or AI attribution lines.
- Stage files by explicit path and read the full `git diff --cached --name-status` before every commit.
- Do not start or stop a dev server or database by hand. Playwright starts and stops its own PHP server on port 8001; if 8001 is already in use, stop and report it as blocked.
- `public/theme.css` must stay byte-identical to Debug Derby's file. SHA-256: `2d92b6d8a97404556a82d151b39981c78342893efe25f9092fb6c1bc6725631a`. Never edit it; SpellToSlay-specific rules go in `public/style.css`.
- Keep every element `id`, and these state classes the scripts toggle: `hidden`, `stalled`, `resumed`, `paused`, `warn`, `green`, `yellow`, `red`, `editable`.
- Do not change any wording a user sees. Several tests assert exact text (`#launch-label`, `#active-source`, `#auth-gate` messages).
- No new fonts, images or dependencies. No build step.
- Do not touch the hub repo or the Debug Derby repo. The `DebugDerby` master checkout has uncommitted work; read only.
- No production deploy without Dave's explicit confirmation relayed by the GAMES lead.


## Review Focus

Things the request implies that are easy to get wrong. Each has a test in Task 2's `theme.spec.js` unless it says otherwise.

1. The new top bar must stay one line high in a Chromebook-sized window so it does not push the arena and the typing box further down. Test: "the top bar stays one line high". Task 3 break D.
2. The typing box is the control the whole game is played through and is a bare `<input>`, so the theme rule for bare inputs must not flatten it. Test: "the typing box keeps its own big, bright style". Task 3 break E.
3. A teacher with the panel in a narrow window and a long student name in the roster: no sideways scrolling, in the page or inside the roster box. Test: "narrow teacher window". Task 3 break C.
4. Bare `<input>` elements (no `type`) are not matched by the theme's `input[type=text]` rule and would fall back to white browser boxes; inputs inside a `<label>` would inherit the label's 13px. Tests: the `FIELD` background and font-size checks. Task 3 breaks B and F.
5. Plain `<button>`s with no class used to fall back to the grey browser default on the teacher page. Test: "every teacher button, roster rows included, has a theme background", which reads every button in the panel. Task 3 break G.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `public/theme.css` | Create | Debug Derby's theme, copied unchanged |
| `public/style.css` | Rewrite | SpellToSlay's own layout and components, in theme variables |
| `public/index.html` | Modify | Student page: theme link, `header.top`, primary buttons |
| `public/teacher.html` | Rewrite body | Teacher page: theme link, `header.top`, sections as panels, no inline styles |
| `public/teacher.js` | Modify 2 lines | Inline grey colours become classes |
| `public/js/poll.js` | Modify 3 lines | Inline poll styles become classes |
| `tests/e2e/theme.spec.js` | Create | Checks the computed look and layout |
| `playwright.screens.config.js` | Create | Runs the screenshot script outside the test suite |
| `tests/screens/pages.screens.js` | Create | Captures every page and state as PNGs |

| `.gitignore` | Modify | Ignore `/screens/` (root only, so `tests/screens/` stays tracked) |
| `CHANGELOG.md`, `CLAUDE.md` | Modify | Record the change and the theme-copy rule |

Everything inside the arena is painted by `public/js/render.js` and `public/js/effects.js`: the background, the HUD pills (HP, wave, score, time, WPM, accuracy, streak), the word labels, the lock ring and the pause screen. Under decision 2(a) none of that changes, so the arena keeps its current blue and green palette inside the new navy page. The screenshots in Task 3 show exactly how that looks; decision 2(b) would be a follow-up plan.

---

### Task 1: Branch, screenshot tooling, and the "before" pictures

**Files:**
- Create: `playwright.screens.config.js`
- Create: `tests/screens/pages.screens.js`
- Modify: `.gitignore`

- Add: `docs/superpowers/plans/2026-10-08-debug-derby-theme.md` (this plan, already on disk, untracked)

**Interfaces:**
- Produces: `SCREENS_LABEL=<label> npx playwright test -c playwright.screens.config.js`, which writes 15 PNGs to `screens/<label>/`. Task 3 runs it again with `after`.

- [ ] **Step 1: Read the repo rules and cut the branch**

Read `CLAUDE.md` in full. Then:

```bash
cd /Users/davejones/Documents/GitHub/spelltoslay
git status --short
git checkout main && git pull --ff-only
git checkout -b feature/debug-derby-theme
```

Expected: `git status --short` shows only untracked files (this plan and `excalidraw.log`); the branch is created from `35949e3` or later. If `main` has moved past `35949e3`, run `git diff 35949e3 main -- public/ tests/e2e/ playwright.config.js` and stop to report if it prints anything, because the file contents below were written against `35949e3`.

- [ ] **Step 2: Baseline, before any change**

```bash
lsof -nP -iTCP:8001 -sTCP:LISTEN || echo "8001 free"
npx playwright test --reporter=line 2>&1 | tail -3
vendor/bin/phpunit 2>&1 | tail -3
```

Expected: `8001 free`; `59 passed`; `OK (189 tests, 7380 assertions)`. If port 8001 is in use, stop and report it as blocked. Read the count from the summary line.

- [ ] **Step 3: Add the screenshot config**

Create `playwright.screens.config.js`:

````js
import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

// Screenshots of every page and state, for reviewing a visual change by eye.
// Not part of the test suite: run with
//   SCREENS_LABEL=before npx playwright test -c playwright.screens.config.js
// Pictures land in screens/<label>/ (gitignored).
export default defineConfig({
  ...base,
  testDir: './tests/screens',
  testMatch: /.*\.screens\.js/,
});
````

- [ ] **Step 4: Add the screenshot script**

Create `tests/screens/pages.screens.js`. It uses element ids only, so it runs on the old markup and the new.

````js
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
````

- [ ] **Step 5: Ignore the pictures**

Append to `.gitignore`:

```
# Review screenshots (npx playwright test -c playwright.screens.config.js).
# Anchored to the repo root: a bare "screens/" would also ignore tests/screens/.
/screens/
```

- [ ] **Step 6: Capture the "before" pictures**

```bash
SCREENS_LABEL=before npx playwright test -c playwright.screens.config.js --reporter=line 2>&1 | tail -3
ls screens/before | wc -l
git status --short
```

Expected: `5 passed`; `15`; `screens/` does not appear in `git status`.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/plans/2026-10-08-debug-derby-theme.md playwright.screens.config.js tests/screens/pages.screens.js .gitignore
git diff --cached --name-status
git commit -m "Add a screenshot run for reviewing visual changes"
```

Expected name-status: exactly 4 paths: `A` for the plan, the config and the script, `M` for `.gitignore`.

---

### Task 2: The theme and the restyle

**Files:**
- Create: `public/theme.css`
- Create: `tests/e2e/theme.spec.js`
- Rewrite: `public/style.css`
- Modify: `public/index.html`
- Modify: `public/teacher.html`
- Modify: `public/teacher.js`
- Modify: `public/js/poll.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: classes the scripts now set: `poll-picked`, `poll-closing` (student poll), `poll-tally-total`, `muted` (teacher). Markup classes from the theme: `top`, `spacer`, `sub`, `chip`, `panel`, `go`, `blue`; from `style.css`: `grow`, `inline`.

- [ ] **Step 1: Write the failing test**

Create `tests/e2e/theme.spec.js`:

````js
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
````

- [ ] **Step 2: Run it and watch it fail**

```bash
npx playwright test tests/e2e/theme.spec.js --reporter=line 2>&1 | tail -14
```

Expected: `9 failed`, `2 passed`. The two passes are "student page: no inline style attributes" (the old `index.html` has none) and "the typing box keeps its own big, bright style" (true before and after; it is there to stop the theme flattening it).

- [ ] **Step 3: Copy the theme, unchanged**

```bash
git -C /Users/davejones/Documents/GitHub/DebugDerby-course show 64a641e:src/shared/theme.css > public/theme.css
shasum -a 256 public/theme.css
```

Expected: `2d92b6d8a97404556a82d151b39981c78342893efe25f9092fb6c1bc6725631a  public/theme.css`. This reads a commit; it does not touch the Debug Derby working tree. If the hash differs, stop and report.

- [ ] **Step 4: Replace `public/style.css`**

Replace the whole file with:

````css
/* SpellToSlay page rules. The colours, fonts, top bar, panels, chips, buttons
   and inputs come from theme.css, which is the Debug Derby theme copied
   unchanged (DebugDerby src/shared/theme.css). Keep theme.css identical to its
   source; anything SpellToSlay-specific belongs in this file. */

html, body { height: 100%; }

/* The theme styles inputs by type; these pages use bare <input> for text. */
input:not([type]) {
  font: inherit; padding: 7px 8px; background: #0e1430; color: var(--ink);
  border: 1px solid var(--line); border-radius: 8px;
}

.hidden { display: none !important; }
.error { color: var(--pink); }
.chip:empty { display: none; }
.hud { display: flex; gap: 8px; flex-wrap: wrap; font-variant-numeric: tabular-nums; }

button.danger { background: #c92a2a; color: #fff; }

/* ── Student game page ─────────────────────────────── */
#game-root {
  display: flex; flex-direction: column;
  align-items: center;
  padding: 12px;
  gap: 12px;
}

.stage {
  position: relative;
  width: 960px; max-width: 100%;
}
/* The canvas paints its own background (public/js/render.js). */
#arena {
  display: block; width: 100%; height: auto;
  background: #0b1220;
  border: 1px solid var(--line); border-radius: 8px;
}

.modal {
  position: absolute; inset: 50% auto auto 50%;
  transform: translate(-50%,-50%);
  background: var(--panel); border: 1px solid var(--line);
  padding: 22px; border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0,0,0,.6);
  min-width: 320px; max-width: 90%;
}
.modal h2 { margin: 0 0 8px; font-size: 20px; color: #fff; }
.modal h3 { margin: 12px 0 4px; font-size: 15px; color: var(--yellow); }
.modal label { display: block; margin: 12px 0; }
/* The theme makes labels 13px and inputs inherit it. The name box is the first
   thing a student types into: keep it 16px (also stops phones zooming in). */
.modal input { font-size: 16px; }
.modal > button + button { margin-left: 8px; }
/* The name modal can open on top of the game-over modal (Change name). */
#name-entry { z-index: 20; }

.footer-row {
  display: flex; align-items: center; gap: 8px;
  width: 960px; max-width: 100%;
}
.message-bar {
  flex: 1;
  min-height: 24px;
  background: var(--panel-2);
  color: var(--yellow);
  padding: 6px 12px; border-radius: 8px;
  margin: 0;
}
.message-bar:empty { visibility: hidden; }
.build-version {
  color: var(--muted);
  font: 12px ui-monospace, Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  padding: 6px 8px;
  user-select: all;
}
.word-size {
  display: inline-flex; align-items: center; gap: 6px;
  font: 12px ui-monospace, Menlo, Consolas, monospace;
  padding: 6px 8px;
  user-select: none;
}
.word-size input[type="range"] { width: 100px; accent-color: var(--blue); }
.word-size span { min-width: 2ch; text-align: right; color: var(--ink); }

#leaderboard ol { padding-left: 20px; max-height: 220px; overflow-y: auto; }
#leaderboard li { padding: 2px 0; }

/* Poll overlay on the game canvas */
.poll-overlay {
  position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
  background: var(--panel); border: 2px solid var(--yellow);
  border-radius: var(--radius); padding: 14px 18px; min-width: 320px; max-width: 600px;
  box-shadow: 0 8px 30px rgba(0,0,0,.45);
  z-index: 10;
}
.poll-overlay h3 { margin: 0 0 10px; font-size: 16px; }
.poll-overlay .poll-options { display: flex; flex-direction: column; gap: 6px; }
.poll-overlay button {
  padding: 8px 12px; border: 1px solid var(--line);
  background: #0e1430; font-weight: 600; text-align: left;
}
.poll-overlay button:hover:not(:disabled) { border-color: var(--yellow); }
.poll-overlay .poll-picked { margin: 0; font-weight: 700; }
.poll-overlay .poll-closing { margin: 4px 0 0; font-size: 12px; color: var(--muted); }

/* Typing input pinned beneath the canvas */
input.type-input {
  display: block;
  width: 60%;
  max-width: 480px;
  margin: 8px auto 0;
  padding: 10px 14px;
  background: #0e1430;
  color: var(--ink);
  border: 2px solid var(--blue);
  border-radius: 10px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 18px;
  letter-spacing: 1px;
  outline: none;
  text-align: center;
}
input.type-input:focus { border-color: var(--green); }
input.type-input.stalled {
  border-color: var(--pink);
  background: #5c2330;
  animation: stall-shake 0.3s;
}
@keyframes stall-shake {
  0%, 100% { transform: translateX(0); }
  25%      { transform: translateX(-4px); }
  75%      { transform: translateX(4px); }
}

/* ── Teacher page ──────────────────────────────────── */
#teacher-root {
  max-width: 860px; margin: 0 auto;
  padding: 14px 16px 40px;
}
#control-panel { display: flex; flex-direction: column; gap: 12px; }
.big-button {
  display: block; width: 100%;
  padding: 28px;
  font-size: 22px; font-weight: 800; letter-spacing: 1px;
  border-radius: var(--radius);
  background: #c92a2a; color: #fff;
}
.big-button.resumed { background: #2b8a3e; }
.row { align-items: end; margin: 10px 0; }
.row .grow { flex: 1; display: flex; flex-direction: column; gap: 3px; }
/* Inputs inside a label would inherit the label's 13px; match the others. */
.row label input, .row label select { font-size: 15px; }
.row .inline { display: flex; align-items: center; gap: 8px; }
.poll-opt { flex: 1; min-width: 140px; }
#poll-active-question { font-weight: 700; margin: 0 0 8px; }
#end-poll-btn { margin-top: 8px; }
#live-top { margin: 0; padding-left: 20px; }
.muted { color: var(--muted); }

#word-list-textarea {
  width: 100%;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 13px;
}
.launch-notice {
  margin: 0; padding: 8px 12px; border-radius: 8px;
  background: var(--panel); border: 1px solid var(--green); color: var(--ink);
}
.launch-notice.warn { border-color: var(--orange); background: #2a2112; }
.active-source {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--muted);
  margin-left: 12px;
}

.roster { display: flex; flex-direction: column; gap: 6px; max-height: 320px; overflow-y: auto; padding-right: 8px; }
.roster-row { display: flex; align-items: center; gap: 8px; background: #0e1430; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--line); }
.roster-name { min-width: 110px; font-weight: 600; }
.roster-msg { flex: 1; min-width: 0; }
.roster-row button { padding: 6px 10px; font-size: 13px; }
.pause-personal { background: #c92a2a; color: #fff; }
.pause-personal.paused { background: #2b8a3e; }

.activity-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.activity-dot.green  { background: var(--green); }
.activity-dot.yellow { background: var(--yellow); }
.activity-dot.red    { background: var(--pink); }

.roster-stat { font: 12px ui-monospace, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; min-width: 40px; text-align: right; opacity: .85; }

.roster-name.editable { cursor: pointer; }
.roster-name.editable:hover { text-decoration: underline; }
.roster-row input.roster-name-input { width: 100px; padding: 4px 6px; }
.roster-row .rename-btn {
  background: transparent; border: 1px solid var(--line);
  padding: 2px 6px; font-size: 12px; line-height: 1;
  opacity: .55; transition: opacity .15s;
  flex: none;
}
.roster-row .rename-btn:hover { opacity: 1; border-color: var(--yellow); }

.poll-tally-bar { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
.poll-tally-label { min-width: 100px; }
.poll-tally-fill { background: var(--yellow); height: 16px; border-radius: 6px; }
.poll-tally-count { min-width: 30px; text-align: right; font-variant-numeric: tabular-nums; }
.poll-tally-total { margin: 8px 0 0; font-size: 12px; color: var(--muted); }

.contributors-list { margin: 0; padding-left: 0; list-style: none; }
.contributors-list li { padding: 4px 0; border-bottom: 1px solid var(--line); }
.contributors-list .contrib-name { font-weight: 700; color: var(--yellow); }
.contributors-list .contrib-version { font: 11px ui-monospace, Menlo, Consolas, monospace; color: var(--muted); }
````

- [ ] **Step 5: Update `public/index.html`**

Replace the whole file with:

````html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SpellToSlay</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="stylesheet" href="/theme.css">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <header class="top">
    <h1>SpellToSlay</h1>
    <span class="spacer"></span>
    <div class="hud" id="hud"></div>
  </header>

  <main id="game-root">

    <div class="stage">
      <canvas id="arena" width="960" height="600"></canvas>

      <!-- Feature 12: Poll overlay (non-blocking, stays over game) -->
      <div id="poll-overlay" class="poll-overlay hidden">
        <h3 id="poll-question"></h3>
        <div id="poll-options" class="poll-options"></div>
      </div>

      <div id="name-entry" class="modal hidden">
        <h2 id="name-entry-title">Welcome to SpellToSlay</h2>
        <p>What's your name? (1–16 letters/numbers/spaces)</p>
        <label><input id="entry-name" maxlength="16" autocomplete="off" placeholder="Your name"></label>
        <button id="start-playing" class="go">Start playing</button>
        <button id="cancel-name" class="secondary hidden">Cancel</button>
        <p id="entry-error" class="error hidden"></p>
      </div>

      <div id="game-over" class="modal hidden">
        <h2>You died</h2>
        <p id="game-over-summary"></p>
        <p>Submitting as <strong id="game-over-name"></strong> · <a href="#" id="change-name">Change name</a></p>
        <button id="submit-score" class="go">Submit score</button>
        <button id="skip-submit" class="secondary">Play again without submitting</button>
        <p id="submit-error" class="error hidden"></p>
      </div>

      <div id="leaderboard" class="modal hidden">
        <h2>Leaderboard</h2>
        <p id="rank-summary"></p>
        <h3>Last 24 hours</h3>
        <ol id="lb-today"></ol>
        <h3>All time</h3>
        <ol id="lb-alltime"></ol>
        <button id="play-again" class="go">Play again</button>
      </div>

      <input id="type-input"
             class="type-input"
             autocomplete="off"
             autocorrect="off"
             autocapitalize="off"
             spellcheck="false"
             aria-label="Type the word on the closest enemy"
             placeholder="type a word…">
    </div>

    <div class="footer-row">
      <p class="message-bar" id="message-bar"></p>
      <label class="word-size" title="Adjust the size of the word labels above enemies. Saved per browser.">
        Word size
        <input id="word-size-slider" type="range" min="12" max="40" step="1">
        <span id="word-size-value">22</span>
      </label>
      <span class="build-version" id="build-version" title="Build version (auto-bumps on each deploy)">v…</span>
    </div>
  </main>

  <script type="module" src="/js/main.js"></script>
</body>
</html>
````

What changed: the `theme.css` link; the header moved out of `<main>` and became `header.top`; `class="go"` on `#start-playing`, `#submit-score` and `#play-again`. Nothing else.

- [ ] **Step 6: Update `public/teacher.html`**

Replace the whole file with:

````html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SpellToSlay · Teacher Control</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="stylesheet" href="/theme.css">
  <link rel="stylesheet" href="/style.css">
</head>
<body class="teacher">
  <header class="top">
    <h1>SpellToSlay · Teacher Control</h1>
    <span id="launch-label" class="sub"></span>
    <span class="spacer"></span>
    <span id="player-count" class="chip">● 0 players</span>
  </header>

  <main id="teacher-root">
    <section id="auth-gate" class="panel">
      <h2>Access required</h2>
      <p id="auth-gate-message">Launch SpellToSlay from the hub, or open this page with <code>#key=&lt;your-teacher-key&gt;</code> at the end of the address.</p>
    </section>

    <section id="control-panel" class="hidden">
      <p id="launch-notice" class="launch-notice hidden" role="status"></p>
      <button id="pause-btn" class="big-button">⏸ PAUSE EVERYONE</button>

      <section class="panel">
        <div class="row">
          <label class="grow">
            Message shown to class:
            <input id="msg-input" maxlength="200" placeholder="Eyes up front…">
          </label>
          <button id="send-msg" class="blue">Send</button>
          <button id="clear-msg" class="secondary">Clear</button>
        </div>

        <div class="row">
          <button id="reload-all" class="secondary">🔄 Force everyone to reload</button>
          <button id="clear-board" class="danger">🗑 Clear leaderboard</button>
        </div>
      </section>

      <section class="panel" id="word-pool-section">
        <h2>Word pool</h2>
        <div class="row">
          <label class="inline">
            Default grade:
            <select id="grade-select">
              <option value="0">K</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
              <option value="6" selected>6</option>
              <option value="7">7</option>
              <option value="8">8</option>
            </select>
          </label>
          <span id="active-source" class="active-source">Active: built-in (grade 6)</span>
        </div>
        <textarea id="word-list-textarea" rows="6"
                  placeholder="Paste this week's spelling words here, one per line…"></textarea>
        <div class="row">
          <button id="use-list-btn" class="blue">Use this list</button>
          <button id="revert-list-btn" class="secondary">Revert to built-in</button>
        </div>
        <div class="row">
          <label class="grow">
            Spell this now:
            <input id="push-word-input" maxlength="32" placeholder="single word">
          </label>
          <button id="push-word-btn" class="blue">Push</button>
        </div>
      </section>

      <section class="panel">
        <h2>Players online (<span id="roster-count">0</span>)</h2>
        <div id="roster" class="roster"></div>
      </section>

      <section class="panel">
        <h2>Live top-5</h2>
        <ol id="live-top"></ol>
      </section>

      <section class="panel" id="poll-section">
        <h2>Live Poll</h2>
        <div id="poll-form">
          <div class="row">
            <label class="grow">
              Question:
              <input id="poll-question-input" maxlength="200" placeholder="Ask the class a question…">
            </label>
          </div>
          <div class="row">
            <input class="poll-opt" maxlength="40" placeholder="Option A">
            <input class="poll-opt" maxlength="40" placeholder="Option B">
            <input class="poll-opt" maxlength="40" placeholder="Option C">
            <input class="poll-opt" maxlength="40" placeholder="Option D">
          </div>
          <button id="start-poll-btn" class="blue">▶ Start poll</button>
        </div>
        <div id="poll-active" class="hidden">
          <p id="poll-active-question"></p>
          <div id="poll-tally"></div>
          <button id="end-poll-btn" class="secondary">■ End poll</button>
        </div>
      </section>

      <section class="panel">
        <h2>Contributors</h2>
        <ul id="contributors-list" class="contributors-list"></ul>
      </section>

      <p id="teacher-error" class="error hidden"></p>
    </section>
  </main>

  <script type="module" src="/teacher.js"></script>
</body>
</html>
````

What changed: the `theme.css` link; `header.top` with `#player-count` as a chip and `#launch-label` as the sub-title; `#auth-gate` is a `.panel` instead of a re-positioned `.modal`; each `<h3>` section is now a `<section class="panel">` with an `<h2>`; the message and reload rows share one panel; `class="blue"` on the main action buttons; every `style="…"` attribute is gone (replaced by `.grow`, `.inline` and id rules in `style.css`). All ids and all wording are the same.

- [ ] **Step 7: Move the inline colours in `public/teacher.js` into classes**

Replace

```js
  totalLine.style.cssText = 'margin:8px 0 0;font-size:12px;color:#6e7681';
```

with

```js
  totalLine.className = 'poll-tally-total';
```

and replace

```js
      li.style.color = '#6e7681';
```

with

```js
      li.className = 'muted';
```

Leave `fill.style.width = …` alone; it is a computed bar width, not a colour.

- [ ] **Step 8: Move the inline poll styles in `public/js/poll.js` into classes**

Replace

```js
    thanks.style.fontWeight = '700';
    thanks.style.margin = '0';
```

with

```js
    thanks.className = 'poll-picked';
```

and replace

```js
    fade.style.cssText = 'margin: 4px 0 0; font-size: 12px; color: #6e7681;';
```

with

```js
    fade.className = 'poll-closing';
```

- [ ] **Step 9: Check nothing inline is left**

```bash
grep -n ' style=' public/index.html public/teacher.html
grep -rn '6e7681\|cssText' public --include='*.js'
```

Expected: both print nothing.

- [ ] **Step 10: Run the new test, then everything**

```bash
npx playwright test tests/e2e/theme.spec.js --reporter=line 2>&1 | tail -3
npx playwright test --reporter=line 2>&1 | tail -3
vendor/bin/phpunit 2>&1 | tail -3
```

Expected: `11 passed`; `70 passed`; `OK (189 tests, 7380 assertions)`. Any failure is reported with its output, not worked around by editing an existing spec.

- [ ] **Step 11: Commit**

```bash
git add public/theme.css public/style.css public/index.html public/teacher.html public/teacher.js public/js/poll.js tests/e2e/theme.spec.js
git diff --cached --name-status
git commit -m "Restyle the student and teacher pages with the Debug Derby theme"
```

Expected name-status: `A public/theme.css`, `A tests/e2e/theme.spec.js`, and `M` for the other five.

---

### Task 3: Prove the checks bite, take the "after" pictures, write it up

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Task 1's screenshot run; Task 2's committed restyle.
- Produces: `screens/before/` and `screens/after/` (15 PNGs each, not committed) for Dave's review.

- [ ] **Step 1: Confirm the tree is clean before breaking anything**

```bash
git status --short
mkdir -p screens/keep
```

Expected: nothing tracked is modified. Each break below copies the file aside into `screens/keep/` (gitignored) first and copies it back afterwards; do not use `git checkout` to undo.

- [ ] **Step 2: Run each break, one at a time**

For every row: copy the file aside, make the one edit, run the command, confirm the named test fails, copy the file back.

```bash
cp public/style.css screens/keep/style.css && cp public/teacher.html screens/keep/teacher.html
# ...make ONE edit from the table...
npx playwright test tests/e2e/theme.spec.js --reporter=line 2>&1 | tail -8
cp screens/keep/style.css public/style.css && cp screens/keep/teacher.html public/teacher.html
git status --short
```

| Break | Edit | Test that must fail |
|---|---|---|
| A | In `public/teacher.html` delete the line `<link rel="stylesheet" href="/theme.css">` | 3 fail: teacher "navy body and the gradient top bar", "every section is a panel", the gate test |
| B | In `public/style.css` delete the whole `input:not([type]) { … }` rule | 2 fail: "join modal uses the theme panel, field and primary button", "every section is a panel" |
| C | Change `.roster-msg { flex: 1; min-width: 0; }` to `.roster-msg { flex: none; width: 900px; }` | "narrow teacher window" |
| D | Change `header.top` height by adding the rule `header.top {{ padding: 30px 16px; }}` at the end of `style.css` | "the top bar stays one line high" |
| E | Change the selector `input.type-input {{` to `.type-input {{` | "the typing box keeps its own big, bright style" |
| F | Delete the line `.modal input { font-size: 16px; }` | "join modal uses the theme panel, field and primary button" |
| G | Change `.roster-row input.roster-name-input` to `.roster-name-input` | "every teacher button, roster rows included, has a theme background" |

Expected after the last restore: `git status --short` shows no tracked changes, and `npx playwright test tests/e2e/theme.spec.js --reporter=line 2>&1 | tail -1` prints `11 passed`. A break whose test still passes is reported in the hand-back, not explained away.

- [ ] **Step 3: Full suite once more, then the "after" pictures**

```bash
npx playwright test --reporter=line 2>&1 | tail -3
SCREENS_LABEL=after npx playwright test -c playwright.screens.config.js --reporter=line 2>&1 | tail -3
ls screens/after | wc -l
```

Expected: `70 passed`; `5 passed`; `15`.

- [ ] **Step 4: Look at every picture**

Open all 15 files in `screens/after/` next to their `screens/before/` twins. Check on each: the gradient top bar spans the full width; no white or grey browser-default button or input anywhere; text is readable on its background; nothing overlaps or is cut off. Write down anything that looks wrong; do not fix by eye without reporting it.

- [ ] **Step 5: Changelog**

In `CHANGELOG.md`, under `## [Unreleased]`, add to the existing `### Changed` list:

```markdown
- **New look** — the student game page and the teacher page now use the Debug
  Derby theme: navy background, gradient top bar, rounded panels, chips, yellow
  and blue buttons. `public/theme.css` is Debug Derby's `src/shared/theme.css`
  copied unchanged; SpellToSlay's own rules stay in `public/style.css`. The teacher
  page's sections are panels and its buttons no longer fall back to the
  browser's grey default.
```

- [ ] **Step 6: Project note**

Add to `CLAUDE.md`, as a new section at the end:

```markdown
## Styling

Both pages load `public/theme.css` and then `public/style.css`. `theme.css` is
the Debug Derby theme (`src/shared/theme.css` in the DebugDerby repo), copied
byte for byte: do not edit it here. To pick up a newer Debug Derby theme, copy
the file again from a commit (`git -C <DebugDerby checkout> show <commit>:src/shared/theme.css > public/theme.css`)
and run `npx playwright test`. Everything specific to this game belongs in
`style.css`, written in the theme's variables (`--bg`, `--panel`, `--panel-2`,
`--line`, `--ink`, `--muted`, `--yellow`, `--pink`, `--blue`, `--green`,
`--purple`, `--orange`). The theme styles inputs by `type`, so `style.css` carries a rule
for bare `<input>`; that rule out-ranks a plain class selector, so a class
that restyles an input must be written `input.name`.

To see a visual change before it ships:
`SCREENS_LABEL=after npx playwright test -c playwright.screens.config.js`
writes a picture of every page and state to `screens/after/` (gitignored).
```

- [ ] **Step 7: Commit**

```bash
git add CHANGELOG.md CLAUDE.md
git diff --cached --name-status
git commit -m "Changelog and project notes for the Debug Derby theme"
```

Expected name-status: `M CHANGELOG.md`, `M CLAUDE.md`.

- [ ] **Step 8: Hand back**

Report to the GAMES lead: the branch name and its three commit hashes; the exact summary lines from the final `npx playwright test` and `vendor/bin/phpunit`; the result of each break A to G; the paths `screens/before/` and `screens/after/`; and anything from Step 4 that looked wrong. Do not push, merge or deploy.

---

## After implementation (not Sprite's tasks)

1. **Review.** Gauntlet reviews the committed branch diff (`git diff main...feature/debug-derby-theme`) with the suite results in hand, and a Codex review of the same committed diff is run (`/codex:review --base main`), as Dave's rule requires before a deploy. Real findings are fixed on the branch and the suites re-run; any finding left alone is named with the reason.
2. **Dave's look.** The GAMES lead sends Dave the `screens/before/` and `screens/after/` folders through Switchboard. This stands in for staging under decision 3(a); under 3(c) Dave also opens the branch on a real Chromebook and a tablet.
3. **Release, only after Dave confirms production, and outside class time** ("Force everyone to reload" restarts every student's run). Launchpad: push the branch; merge it into `main` with a merge commit (no pull request); `git push`; `dep deploy`; then run `/post-deploy-verify`, which must cover at least:

```bash
curl -fsS https://spelltoslay.lockersoft.games/api/health.php
curl -sI https://spelltoslay.lockersoft.games/theme.css | grep -iE '^HTTP|cache-control'
curl -s https://spelltoslay.lockersoft.games/theme.css | shasum -a 256
```

   Expected: the health endpoint answers 200 with its JSON; `theme.css` is `200` with `Cache-Control: no-store`; the hash is `2d92b6d8a97404556a82d151b39981c78342893efe25f9092fb6c1bc6725631a`. Then press "Force everyone to reload" on the teacher page.
4. **Rollback.** There is no staging, so this is the safety net: `dep rollback to=35949e3` returns the host to the commit that is live-ready today (`deploy.php`, task `rollback`). If `main` has moved since this plan was written, use the commit `main` was on just before the merge.
