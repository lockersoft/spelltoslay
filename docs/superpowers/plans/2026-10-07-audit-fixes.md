# October 2026 Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the seven reproduced gameplay/classroom bugs found in the 2026-10-07 audit, the smaller defects found by reading, and implement all nine audit suggestions.

**Architecture:** No new infrastructure. Server stays plain PHP + SQLite with shared helpers in `public/api/_bootstrap.php`; the client stays build-free vanilla JS. Behaviour fixes land first, each behind a failing test, while `public/game.js` is still one file; the file is then split into ES modules under `public/js/` as a move-only refactor guarded by the enlarged test suite; the two features that need a shared client module (encoded POST bodies, teacher-key header) come after the split.

**Tech Stack:** PHP 8.1+ (local 8.5), PDO SQLite, PHPUnit 10.5, vanilla JS (ES modules, no bundler), Playwright 1.48+.

**Spec:** There is no separate spec document. The "Audit findings" section below is the spec; it records what was observed on 2026-10-07 against commit `6a579f3`.

## Audit findings (the spec)

Reproduced with a throwaway Playwright spec against the local server:

| ID | Finding | Observation |
|----|---------|-------------|
| B1 | Force-reload loops: server holds `forceReload` true for 10s, client guard `state.forceReloadHandled` is in-memory and lost on reload | 296 page loads from one `broadcastReload` |
| B2 | `#submit-score` is disabled on click and never re-enabled after success | disabled on second game |
| B3 | When the enemy being typed reaches the hero, `typedBuffer` is left matching nothing; every later key is a typo | typed `do`, dog hit hero, typing `cat` cost 3 HP, 0 kills |
| B4 | Two live enemies with the same word: completing the word does not slay (needs exactly one exact match) | two `cat`, typed `cat`, 0 kills |
| B5 | `e.typedLen` (green letters) is never reset when the buffer shrinks or the lock moves | buffer empty, `door` still had `typedLen` 1 |
| B6 | `#change-name` link has no handler; `rename.php` is never called by the game | grep: no reference in `game.js` |
| B7 | `state.php` stores the `name` param without `sts_is_profane()`; `score.php` then rejects it | `shithead` on roster; score submit 400; student stuck on game-over modal |

Found by reading (not reproduced):

- S1: word labels are centred on the enemy with no clamping; enemies spawn at x in [20, 940], so labels clip at the side walls.
- S2: `.stalled` class on `#type-input` is not cleared by "Play again" or when the input is cleared by select-all + delete.
- S3: a rejected poll vote (HTTP 4xx) is still rendered as "You picked".
- S4: message bar starts with `  •  ` when only a personal message exists; teacher message is drawn at 11px on the canvas over the HUD while `#message-bar` in the DOM is never filled.
- S5: leaderboard rows are built with `innerHTML`.
- S6: dead code: `_origTick`, `#hud-*` spans, `#overlay`, stale `/var/www/slay` path in `config/config.example.php`, `words.php` regex `[K0-8]|[1-8]`.

Suggestions accepted by Dave on 2026-10-07 ("do all suggestions"):

- G1: teacher key out of the URL (strip it, send as header).
- G2: free-text POST bodies encoded so DreamHost mod_security cannot 418 them.
- G3: scores less trivially forged; `window.state` not global in production.
- G4: a way to skip score submission.
- G5: e2e tests stop sharing the dev DB and stop overwriting `config/config.php`.
- G6: do not spawn a word that is already on screen; labels do not overlap.
- G7: profanity filter: whole-word matching and a longer list.
- G8: teacher panel: wrong key shows the gate; unsent drafts survive the 2s refresh.
- G9: `game.js` split into modules; game-over detection inside the main loop.

Decision recorded: for B4 Dave was offered "slay closest copy" versus "only prevent duplicates"; he answered "do all suggestions", so this plan does both (B4 fix in Task 4 and G6 duplicate avoidance in Task 4).

## Global Constraints

- No build step, no bundler, no new runtime dependencies. Assets are served as written.
- DreamHost shared hosting: no Redis/queues/websockets. Polling cadence stays 2 seconds.
- `public/.htaccess` must keep disabling caching on `.js`/`.html`/`.css`.
- The `isTyping`-style guard (never `preventDefault()` on letters globally) must keep working: letters typed in `#entry-name` must never land in `#type-input`.
- Profanity logic stays centralized in `public/api/_bootstrap.php` (`sts_is_profane()`).
- Name rule everywhere: `/^[A-Za-z0-9 ]{1,16}$/`.
- Commit messages are plain: no Claude/AI attribution lines or session trailers.
- Stage with explicit paths (`git add <paths>`), check `git diff --cached --name-status` before each commit.
- No pull requests. No deploy in this plan (there is no staging host for this project; deploy is Dave's call after review).
- Do not start or stop any long-running dev server by hand; Playwright's own `webServer` block is the only server used.
- Every regression test must be seen to FAIL before its fix is written (break-the-code proof).

## Review Focus

Inputs no task's happy path covers but a classroom will produce:

1. A browser with `sessionStorage` blocked (managed Chromebook policy / private mode): a teacher reload broadcast must still reload the page once and must not loop. Covered by Task 2 Step 5 test.
2. A teacher pastes a word list from Word/Google Docs: CRLF line endings, a trailing blank line, and the words `union` / `select` on adjacent lines. The list must arrive intact through the encoded body. Covered by Task 9 Step 1 test.
3. A student whose name is a clean word containing a banned substring (`Dickens`, `Cassie`, `Hancock`) must be accepted; `sh1t` and `f u c k` must be rejected. Covered by Task 5 Step 1 test.
4. A student changes name while paused by the teacher, or submits an empty/invalid name: the modal must show an error and keep the old name. Covered by Task 5 Step 6 test.
5. A long word (32 letters) at the largest word size (40px) is wider than half the arena: the label must stay fully inside the canvas and must not throw. Covered by Task 7 Step 1 test.

## File Structure

Created:

- `public/js/constants.js` — tuning constants and the `ENEMIES` registry.
- `public/js/state.js` — the single mutable `state` object and `resetRun()`.
- `public/js/dom.js` — element lookups used by more than one module.
- `public/js/words.js` — prefix index, word pool fetch, `pickWordFor`.
- `public/js/spawner.js` — `updateSpawner`, `spawnOne`, `updateEnemies`.
- `public/js/typing.js` — input handling, lock/commit logic, slay, stats (`currentWpm`, `currentAccuracy`, `elapsedMMSS`).
- `public/js/effects.js` — orb/ring update and drawing.
- `public/js/labels.js` — pure label layout (`layoutLabels`).
- `public/js/render.js` — canvas rendering and HUD.
- `public/js/api.js` — `postJson`, `encodeBody` (shared by game and teacher panel).
- `public/js/net.js` — state polling, reload handling, health/version display.
- `public/js/poll.js` — poll overlay.
- `public/js/ui.js` — name modal, game-over modal, leaderboard, word-size slider.
- `public/js/main.js` — main loop, init, localhost-only test hooks.
- `tests/api/EnvOverrideTest.php`, `tests/api/ProfanityTest.php`, `tests/api/EncodedBodyTest.php`, `tests/api/TeacherAuthTest.php`
- `tests/e2e/helpers.js`, `tests/e2e/force-reload.spec.js`, `tests/e2e/game-over-flow.spec.js`, `tests/e2e/typing-edge-cases.spec.js`, `tests/e2e/name-change.spec.js`, `tests/e2e/labels.spec.js`, `tests/e2e/teacher-panel.spec.js`, `tests/e2e/production-surface.spec.js`

Modified: `public/api/_bootstrap.php`, `public/api/state.php`, `public/api/score.php`, `public/api/rename.php`, `public/api/teacher.php`, `public/api/players.php`, `public/api/contributors.php`, `public/api/words.php`, `scripts/init_db.php`, `public/index.html`, `public/teacher.html`, `public/teacher.js`, `public/style.css`, `playwright.config.js`, `config/config.example.php`, `tests/api/ScoreTest.php`, `tests/api/StateTest.php`, `README.md`, `CLAUDE.md`, `CHANGELOG.md`.

Deleted: `public/game.js` (Task 8, after its contents are moved).

Commands used throughout:

- PHP suite: `vendor/bin/phpunit` (expect the summary line `OK (N tests, M assertions)`; read the summary line, not the tail).
- One PHP test: `vendor/bin/phpunit --filter <name>`
- E2E suite: `npx playwright test`
- One spec: `npx playwright test tests/e2e/<file> --workers=1`

---

### Task 1: Test isolation (G5)

E2E must stop writing to `data/spelltoslay.db` and `config/config.php`.

**Files:**
- Modify: `public/api/_bootstrap.php:4-15`, `scripts/init_db.php:12-14`, `playwright.config.js`, `README.md` (testing section)
- Create: `tests/api/EnvOverrideTest.php`

**Interfaces:**
- Produces: env vars `STS_DB_PATH` and `STS_TEACHER_KEY` honoured by `_bootstrap.php` and `init_db.php`. Precedence: PHP constant (PHPUnit) > env var > file default. Later e2e tasks rely on teacher key `e2e-key`.

- [ ] **Step 1: Write the failing test** — `tests/api/EnvOverrideTest.php`

```php
<?php
declare(strict_types=1);

namespace Spelltoslay\Tests\Api;

use PHPUnit\Framework\TestCase;

class EnvOverrideTest extends TestCase
{
    public function test_init_db_honours_env_db_path(): void
    {
        $path = sys_get_temp_dir() . '/sts_env_' . bin2hex(random_bytes(4)) . '.sqlite';
        $root = dirname(__DIR__, 2);
        $cmd  = 'env STS_DB_PATH=' . escapeshellarg($path) . ' ' . escapeshellarg(PHP_BINARY)
              . ' ' . escapeshellarg($root . '/scripts/init_db.php') . ' 2>&1';
        exec($cmd, $out, $code);
        try {
            $this->assertSame(0, $code, implode("\n", $out));
            $this->assertFileExists($path);
        } finally {
            @unlink($path); @unlink($path . '-wal'); @unlink($path . '-shm');
        }
    }

    public function test_bootstrap_honours_env_db_path_and_key(): void
    {
        $path = sys_get_temp_dir() . '/sts_env_' . bin2hex(random_bytes(4)) . '.sqlite';
        $root = dirname(__DIR__, 2);
        $code = 'require ' . var_export($root . '/public/api/_bootstrap.php', true) . ';'
              . 'echo $GLOBALS["__STS_DB_PATH"], "|", sts_config()["teacher_key"];';
        $cmd  = 'env STS_DB_PATH=' . escapeshellarg($path) . ' STS_TEACHER_KEY=envkey '
              . escapeshellarg(PHP_BINARY) . ' -r ' . escapeshellarg($code) . ' 2>&1';
        $this->assertSame($path . '|envkey', trim((string)shell_exec($cmd)));
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `vendor/bin/phpunit --filter EnvOverrideTest`
Expected: 2 failures (file not created at the env path; output is the default path and the local config key).

- [ ] **Step 3: Implement.** In `public/api/_bootstrap.php` replace lines 4-15 with:

```php
// Settings precedence: PHP constant (PHPUnit bootstrap) > environment variable
// (Playwright's throwaway server) > on-disk default (production).
$envDb  = getenv('STS_DB_PATH');
$envKey = getenv('STS_TEACHER_KEY');

$dbPath = defined('STS_DB_PATH')
    ? STS_DB_PATH
    : ($envDb ?: __DIR__ . '/../../data/spelltoslay.db');

$config = ['teacher_key' => null];
$configFile = __DIR__ . '/../../config/config.php';
if (defined('STS_TEACHER_KEY')) {
    $config['teacher_key'] = STS_TEACHER_KEY;
} elseif ($envKey) {
    $config['teacher_key'] = $envKey;
} elseif (file_exists($configFile)) {
    $config = array_merge($config, require $configFile);
}
```

In `scripts/init_db.php` replace lines 12-14 with:

```php
$dbPath = defined('STS_DB_PATH')
    ? STS_DB_PATH
    : (getenv('STS_DB_PATH') ?: __DIR__ . '/../data/spelltoslay.db');
```

Replace `playwright.config.js` with:

```js
import { defineConfig } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

// A fresh SQLite file per run, outside the repo, so e2e never touches the
// developer's data/spelltoslay.db or config/config.php.
const dbPath = path.join(os.tmpdir(), `sts_e2e_${process.pid}.sqlite`);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  // One worker: every spec shares one server and one database, and several
  // specs change class-wide state (reload broadcast, polls) that would leak
  // into pages another worker is testing.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:8001',
    headless: true,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'php scripts/init_db.php && php -S localhost:8001 -t public',
      url: 'http://localhost:8001/api/health.php',
      reuseExistingServer: false,
      timeout: 10_000,
      env: { STS_DB_PATH: dbPath, STS_TEACHER_KEY: 'e2e-key' },
    },
  ],
});
```

Note: Playwright's `webServer.env` is merged over `process.env` by Playwright; if the server fails to find `php`, add `...process.env` first in that object.

- [ ] **Step 4: Verify.**

Run: `vendor/bin/phpunit` — expect `OK (99 tests, ...)`.
Run: `stat -f '%m' data/spelltoslay.db config/config.php > /tmp/sts_mtimes_before; npx playwright test; stat -f '%m' data/spelltoslay.db config/config.php | diff - /tmp/sts_mtimes_before && echo UNTOUCHED`
Expected: `8 passed` and `UNTOUCHED`.

- [ ] **Step 5: Update `README.md`** testing section: state that e2e uses a temp DB and the key `e2e-key` via environment variables and no longer needs `config/config.php`. Leave the dev-server instructions (line 25) as they are.

- [ ] **Step 6: Commit**

```bash
git add public/api/_bootstrap.php scripts/init_db.php playwright.config.js tests/api/EnvOverrideTest.php README.md
git diff --cached --name-status
git commit -m "test: isolate e2e from the dev database and config via env overrides"
```

---

### Task 2: Force-reload fires once (B1)

**Files:**
- Modify: `public/api/state.php` (payload), `public/game.js:537-541`, `tests/api/StateTest.php`
- Create: `tests/e2e/helpers.js`, `tests/e2e/force-reload.spec.js`

**Interfaces:**
- Produces: `state.php` JSON gains `forceReloadAt` (int: `force_reload_set_at` while the flag is active, else `0`) and `serverTime` (int, server `time()`). Client function `shouldReload(s)` in `game.js` (moved to `net.js` in Task 8).
- Produces: `tests/e2e/helpers.js` exporting `boot(page, name)`, `seedEnemies(page, seeds)`, `teacher(request, payload)`; used by every later e2e task.

- [ ] **Step 1: Write `tests/e2e/helpers.js`**

```js
// Shared helpers for e2e specs. The game exposes its internals on window
// only on localhost (see main.js test hooks).
export async function boot(page, name = 'TST') {
  await page.addInitScript((n) => localStorage.setItem('sts_player_name', n), name);
  await page.goto('/');
  await page.waitForFunction(() => window.state && window.state.running);
}

// Freeze the spawner, clear the arena, inject deterministic stationary enemies.
export async function seedEnemies(page, seeds) {
  await page.evaluate((list) => {
    window.state.spawn.nextAt = 1e12;
    for (const e of [...window.state.enemies]) window.removeEnemyFromIndex(e);
    window.state.enemies.length = 0;
    window.state.typedBuffer = '';
    window.state.lockedEnemyId = null;
    document.getElementById('type-input').value = '';
    const def = { speed: 0, contactDamage: 1, size: 16, pointMultiplier: 1 };
    for (const s of list) {
      const e = { id: s.id, def, x: s.x, y: s.y, hp: s.word.length, word: s.word };
      window.state.enemies.push(e);
      window.addEnemyToIndex(e);
    }
  }, seeds);
}

export async function teacher(request, payload) {
  const r = await request.post('/api/teacher.php?key=e2e-key', { data: payload });
  if (!r.ok()) throw new Error(`teacher action failed: ${r.status()}`);
  return r.json();
}
```

- [ ] **Step 2: Write the failing tests.** Add to `tests/api/StateTest.php`:

```php
    public function test_force_reload_exposes_set_at_and_server_time(): void
    {
        $t = time() - 3;
        sts_db()->exec("UPDATE state SET force_reload=1, force_reload_set_at=$t WHERE id=1");
        [, , $json] = sts_invoke('state.php');
        $this->assertSame($t, $json['forceReloadAt']);
        $this->assertEqualsWithDelta(time(), $json['serverTime'], 2);
    }

    public function test_force_reload_at_is_zero_when_expired(): void
    {
        $t = time() - 30;
        sts_db()->exec("UPDATE state SET force_reload=1, force_reload_set_at=$t WHERE id=1");
        [, , $json] = sts_invoke('state.php');
        $this->assertSame(0, $json['forceReloadAt']);
    }
```

Create `tests/e2e/force-reload.spec.js`:

```js
import { test, expect } from '@playwright/test';
import { boot, teacher } from './helpers.js';

async function countLoadsAfterBroadcast(page, request) {
  let loads = 0;
  page.on('load', () => { loads += 1; });
  await teacher(request, { action: 'broadcastReload' });
  // The flag stays set server-side for 10s; watch past that window.
  await page.waitForTimeout(13_000);
  return loads;
}

test('one broadcast reloads the page exactly once', async ({ page, request }) => {
  await boot(page);
  expect(await countLoadsAfterBroadcast(page, request)).toBe(1);
});

test('still exactly one reload when sessionStorage is unavailable', async ({ page, request }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      get() { throw new DOMException('blocked', 'SecurityError'); },
    });
  });
  await boot(page);
  // The storage-free fallback ignores a broadcast stamped with the same
  // second as this page's first poll; step past that second first.
  await page.waitForTimeout(1100);
  expect(await countLoadsAfterBroadcast(page, request)).toBe(1);
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `vendor/bin/phpunit --filter force_reload` — expect 2 errors (undefined key `forceReloadAt`).
Run: `npx playwright test tests/e2e/force-reload.spec.js --workers=1` — expect both to fail with a load count in the hundreds.

- [ ] **Step 4: Implement server.** In `public/api/state.php` add to `$payload` after `'forceReload'`:

```php
    'forceReloadAt'   => $forceReload ? (int)$row['force_reload_set_at'] : 0,
    'serverTime'      => $now,
```

- [ ] **Step 5: Implement client.** In `public/game.js` remove `forceReloadHandled: false,` from `state`, and replace the block at lines 537-541 with:

```js
  if (shouldReload(s)) {
    location.reload();
    return;
  }
```

Add above `pollServerState`:

```js
// A reload broadcast stays visible in /api/state.php for 10 seconds, and the
// page we reload INTO polls inside that window. Remember which broadcast this
// tab already obeyed. sessionStorage survives the reload; where it is blocked,
// fall back to "only obey broadcasts issued after this page first heard from
// the server".
const RELOAD_KEY = 'sts_reload_handled';
let bootServerTime = 0;
function shouldReload(s) {
  const at = s.forceReloadAt | 0;
  if (!bootServerTime) bootServerTime = s.serverTime | 0;
  if (!s.forceReload || !at) return false;
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === String(at)) return false;
    sessionStorage.setItem(RELOAD_KEY, String(at));
    return true;
  } catch (_) {
    return at > bootServerTime;
  }
}
```

Known limit of the fallback, accepted: with storage blocked, a broadcast issued in the same second as the page's first poll is ignored; the teacher clicks again.

- [ ] **Step 6: Verify**

Run: `vendor/bin/phpunit --filter force_reload` — expect OK.
Run: `npx playwright test tests/e2e/force-reload.spec.js --workers=1` — expect `2 passed`.

- [ ] **Step 7: Commit**

```bash
git add public/api/state.php public/game.js tests/api/StateTest.php tests/e2e/helpers.js tests/e2e/force-reload.spec.js
git diff --cached --name-status
git commit -m "fix: force-reload broadcast reloads each tab once instead of looping for 10s"
```

---

### Task 3: Game-over flow (B2, G4, S2)

**Files:**
- Modify: `public/game.js` (game-over section, play-again handler, main loop), `public/index.html:41-47`
- Create: `tests/e2e/game-over-flow.spec.js`

**Interfaces:**
- Produces: `resetRun()` in `game.js` (moved to `state.js`/`ui.js` in Task 8); button `#skip-submit` in the game-over modal.

- [ ] **Step 1: Write the failing tests** — `tests/e2e/game-over-flow.spec.js`

```js
import { test, expect } from '@playwright/test';
import { boot } from './helpers.js';

const die = (page) => page.evaluate(() => { window.state.hero.hp = 0; window.state.gameOver = true; });

test('score can be submitted again on a second game', async ({ page }) => {
  await boot(page, 'Again');
  await die(page);
  await expect(page.locator('#game-over')).toBeVisible();
  await page.locator('#submit-score').click();
  await expect(page.locator('#leaderboard')).toBeVisible();
  await page.locator('#play-again').click();
  await expect(page.locator('#leaderboard')).toBeHidden();
  await die(page);
  await expect(page.locator('#game-over')).toBeVisible();
  await expect(page.locator('#submit-score')).toBeEnabled();
});

test('a player can skip submitting and play again', async ({ page }) => {
  await boot(page, 'Skipper');
  await die(page);
  await expect(page.locator('#game-over')).toBeVisible();
  await page.locator('#skip-submit').click();
  await expect(page.locator('#game-over')).toBeHidden();
  const s = await page.evaluate(() => ({ running: window.state.running, hp: window.state.hero.hp,
    over: window.state.gameOver, focus: document.activeElement?.id }));
  expect(s).toEqual({ running: true, hp: 100, over: false, focus: 'type-input' });
});

test('the red "stalled" input style does not survive into the next game', async ({ page }) => {
  await boot(page, 'Stall');
  await page.locator('#type-input').focus();
  await page.evaluate(() => { window.state.hero.hp = 1; });
  // Wait for an enemy so a non-matching key is a typo rather than ignored.
  await page.waitForFunction(() => window.state.enemies.length > 0, null, { timeout: 8000 });
  const wrong = await page.evaluate(() => {
    const firsts = new Set(window.state.enemies.map(e => e.word[0]));
    return 'abcdefghijklmnopqrstuvwxyz'.split('').find(c => !firsts.has(c));
  });
  await page.keyboard.type(wrong);
  await expect(page.locator('#game-over')).toBeVisible();
  await page.locator('#skip-submit').click();
  await expect(page.locator('#type-input')).not.toHaveClass(/stalled/);
  await expect(page.locator('#type-input')).toHaveValue('');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx playwright test tests/e2e/game-over-flow.spec.js --workers=1`
Expected: test 1 fails at `toBeEnabled`; tests 2 and 3 fail waiting for `#skip-submit`.

- [ ] **Step 3: Implement markup.** In `public/index.html` replace the `#game-over` modal's button line with:

```html
        <button id="submit-score">Submit score</button>
        <button id="skip-submit" class="secondary">Play again without submitting</button>
```

- [ ] **Step 4: Implement script.** In `public/game.js`:

In `showGameOver()` add before `gameOverEl.classList.remove('hidden')`:

```js
  submitScoreBtn.disabled = false;
```

Replace the whole `playAgainBtn.addEventListener(...)` block with:

```js
function resetRun() {
  state.enemies.length = 0;
  state.effects.length = 0;
  prefixIndex.clear();
  state.score = 0; state.kills = 0; state.streak = 0; state.bestStreak = 0;
  state.keystrokes = { correct: 0, total: 0 };
  state.wpmLog.length = 0;
  state.hero.hp = MAX_HP;
  state.time = 0;
  state.spawn = { nextAt: 0, wave: 1, waveStartedAt: 0 };
  state.gameOver = false;
  gameOverShown = false;
  state.typedBuffer = '';
  state.lockedEnemyId = null;
  typeInput.value = '';
  typeInput.classList.remove('stalled');
  gameOverEl.classList.add('hidden');
  leaderboardEl.classList.add('hidden');
  state.running = true;
  typeInput.focus();
}
playAgainBtn.addEventListener('click', resetRun);
document.getElementById('skip-submit').addEventListener('click', resetRun);
```

Delete the `const _origTick = tick;` line and the `window._gameOverHook = setInterval(...)` block. In `tick()` add, immediately before `render();`:

```js
  if (state.gameOver && !gameOverShown) {
    state.running = false;
    showGameOver();
  }
```

`gameOverShown` and `showGameOver` are declared further down the file with `let`/`function`; `tick` only runs after `init()` at the bottom has executed, so the `let` is initialized by then.

- [ ] **Step 5: Verify**

Run: `npx playwright test` — expect all passed (8 original + 2 + 3).

- [ ] **Step 6: Commit**

```bash
git add public/game.js public/index.html tests/e2e/game-over-flow.spec.js
git diff --cached --name-status
git commit -m "fix: submit works on every game, add skip-submit, clear stalled input on restart"
```

---

### Task 4: Typing edge cases (B3, B4, B5, S2, G6 duplicates)

**Files:**
- Modify: `public/game.js` (word pool, `updateEnemies`, typing section, render word block)
- Create: `tests/e2e/typing-edge-cases.spec.js`

**Interfaces:**
- Produces (all in `game.js`, moved in Task 8): `closestToHero(enemies) -> enemy|null`, `dropOrphanedBuffer() -> void`, `typedLenFor(enemy) -> number`, `pickWordFor(def) -> string` (now avoids live words). `e.typedLen` is removed everywhere.

- [ ] **Step 1: Write the failing tests** — `tests/e2e/typing-edge-cases.spec.js`

```js
import { test, expect } from '@playwright/test';
import { boot, seedEnemies } from './helpers.js';

test('buffer is dropped when the enemy being typed reaches the hero', async ({ page }) => {
  await boot(page);
  await seedEnemies(page, [{ id: 'dog', word: 'dog', x: 200, y: 200 }]);
  await page.locator('#type-input').focus();
  await page.keyboard.type('do');
  await page.evaluate(() => {
    const e = window.state.enemies[0];
    e.x = window.state.hero.x; e.y = window.state.hero.y;
  });
  await page.waitForFunction(() => window.state.enemies.length === 0);
  expect(await page.evaluate(() => window.state.typedBuffer)).toBe('');
  await expect(page.locator('#type-input')).toHaveValue('');

  const hpBefore = await page.evaluate(() => window.state.hero.hp);
  await seedEnemies(page, [{ id: 'cat', word: 'cat', x: 200, y: 200 }]);
  await page.keyboard.type('cat');
  const s = await page.evaluate(() => ({ hp: window.state.hero.hp, kills: window.state.kills }));
  expect(s.hp).toBe(hpBefore);   // no typo penalty for typing correctly
  expect(s.kills).toBe(1);
});

test('buffer survives when another live enemy still matches it', async ({ page }) => {
  await boot(page);
  await seedEnemies(page, [
    { id: 'cat', word: 'cat', x: 200, y: 200 },
    { id: 'carry', word: 'carry', x: 300, y: 200 },
  ]);
  await page.locator('#type-input').focus();
  await page.keyboard.type('ca');
  await page.evaluate(() => {
    const e = window.state.enemies.find(en => en.id === 'cat');
    e.x = window.state.hero.x; e.y = window.state.hero.y;
  });
  await page.waitForFunction(() => window.state.enemies.length === 1);
  expect(await page.evaluate(() => window.state.typedBuffer)).toBe('ca');
});

test('typing a word shared by two enemies slays the closest one', async ({ page }) => {
  await boot(page);
  // Hero sits at bottom-centre (480, 540): "near" is the closer copy.
  await seedEnemies(page, [
    { id: 'far',  word: 'cat', x: 100, y: 100 },
    { id: 'near', word: 'cat', x: 480, y: 400 },
  ]);
  await page.locator('#type-input').focus();
  await page.keyboard.type('cat');
  const s = await page.evaluate(() => ({
    kills: window.state.kills, buf: window.state.typedBuffer,
    far:  window.state.enemies.find(e => e.id === 'far'),
    near: window.state.enemies.find(e => e.id === 'near') || null,
  }));
  expect(s.kills).toBe(1);
  expect(s.buf).toBe('');
  expect(s.far.dying).toBeFalsy();
  expect(s.near === null || s.near.dying === true).toBe(true);
});

test('green typed letters follow the buffer, including backspace', async ({ page }) => {
  await boot(page);
  await seedEnemies(page, [
    { id: 'dog',  word: 'dog',  x: 200, y: 200 },
    { id: 'door', word: 'door', x: 400, y: 300 },
    { id: 'cat',  word: 'cat',  x: 600, y: 300 },
  ]);
  const lens = () => page.evaluate(() =>
    Object.fromEntries(window.state.enemies.map(e => [e.id, window.typedLenFor(e)])));
  await page.locator('#type-input').focus();
  await page.keyboard.type('do');
  expect(await lens()).toEqual({ dog: 2, door: 2, cat: 0 });
  await page.keyboard.press('Backspace');
  expect(await lens()).toEqual({ dog: 1, door: 1, cat: 0 });
  await page.keyboard.press('Backspace');
  expect(await lens()).toEqual({ dog: 0, door: 0, cat: 0 });
});

test('clearing the whole input at once removes the stalled style', async ({ page }) => {
  await boot(page);
  await seedEnemies(page, [{ id: 'dog', word: 'dog', x: 200, y: 200 }]);
  const input = page.locator('#type-input');
  await input.focus();
  await page.keyboard.type('dx');
  await expect(input).toHaveClass(/stalled/);
  await input.fill('');
  await expect(input).not.toHaveClass(/stalled/);
  expect(await page.evaluate(() => window.state.typedBuffer)).toBe('');
});

test('spawner avoids a word that is already on screen', async ({ page }) => {
  await boot(page);
  await seedEnemies(page, [{ id: 'cat', word: 'cat', x: 200, y: 200 }]);
  const picks = await page.evaluate(() => {
    window.state.wordPool = ['cat', 'dog'];
    const def = { difficultyClass: 'easy' };
    return Array.from({ length: 40 }, () => window.pickWordFor(def));
  });
  expect(new Set(picks)).toEqual(new Set(['dog']));
});

test('spawner still returns a word when every pool word is on screen', async ({ page }) => {
  await boot(page);
  await seedEnemies(page, [{ id: 'cat', word: 'cat', x: 200, y: 200 }]);
  const pick = await page.evaluate(() => {
    window.state.wordPool = ['cat'];
    return window.pickWordFor({ difficultyClass: 'easy' });
  });
  expect(pick).toBe('cat');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx playwright test tests/e2e/typing-edge-cases.spec.js --workers=1`
Expected: tests 1, 3, 4, 5, 6 fail (4 with `window.typedLenFor is not a function`); tests 2 and 7 pass already (they pin behaviour that must not regress).

- [ ] **Step 3: Implement helpers.** In `public/game.js`, add after `removeEnemyFromIndex`:

```js
// Closest enemy to the hero from a list (Euclidean). null for an empty list.
function closestToHero(list) {
  let best = null, bestDist = Infinity;
  for (const e of list) {
    const d = Math.hypot(e.x - state.hero.x, e.y - state.hero.y);
    if (d < bestDist) { bestDist = d; best = e; }
  }
  return best;
}

// Live enemies whose word starts with the given prefix.
function enemiesForPrefix(prefix) {
  const ids = prefixIndex.get(prefix);
  if (!ids) return [];
  return state.enemies.filter(e => ids.has(e.id));
}

// The buffer can stop matching anything without the player touching a key:
// the enemy they were typing walked into the hero. Left alone, every later
// keystroke would be scored as a typo, so drop it.
function dropOrphanedBuffer() {
  if (state.typedBuffer === '' || prefixIndex.has(state.typedBuffer)) return;
  state.typedBuffer = '';
  state.lockedEnemyId = null;
  typeInput.value = '';
  typeInput.classList.remove('stalled');
}

// How many leading letters of this enemy's word to draw as "typed".
function typedLenFor(e) {
  const buf = state.typedBuffer;
  return (!e.dying && buf !== '' && e.word.startsWith(buf)) ? buf.length : 0;
}
```

`typeInput` is declared with `const` later in the file; these functions are only called at runtime after the whole script has evaluated, so that is safe.

- [ ] **Step 4: Implement word picking.** In `pickWordFor`, replace the last two lines (`const source = ...; return source[...]`) with:

```js
  const source = matches.length >= 3 ? matches : pool;
  // Prefer a word no live enemy is already carrying.
  const live = new Set(state.enemies.filter(e => !e.dying).map(e => e.word));
  const fresh = source.filter(w => !live.has(w));
  const from = fresh.length > 0 ? fresh : source;
  return from[(Math.random() * from.length) | 0];
```

In `spawnOne` delete the `typedLen: 0,` property.

- [ ] **Step 5: Implement orphan drop.** In `updateEnemies`, replace `state.enemies = survivors;` with:

```js
  state.enemies = survivors;
  dropOrphanedBuffer();
```

- [ ] **Step 6: Implement typing logic.** In `onType`, replace the "Pure backspace" block with:

```js
  // Buffer shrank (backspace, or the whole field cleared at once).
  if (raw.length < prev.length) {
    // Only keep what is still a real prefix; a paste-over could be anything.
    state.typedBuffer = (raw === '' || prefixIndex.has(raw)) ? raw : '';
    typeInput.value = state.typedBuffer;
    typeInput.classList.remove('stalled');
    refreshLock();
    return;
  }
```

Replace the body of the Space/Enter `keydown` handler from `const candidates = ...` to the end with:

```js
  const exact = enemiesForPrefix(state.typedBuffer).filter(e => e.word === state.typedBuffer);
  if (exact.length === 0) {
    // Buffer isn't a complete word of any live enemy — premature commit = typo.
    state.hero.hp = Math.max(0, state.hero.hp - TYPO_HP_PENALTY);
    if (state.hero.hp === 0) state.gameOver = true;
    state.streak = 0;
    typeInput.classList.add('stalled');
    flashLockedRed();
    return;
  }
  onEnemySlain(closestToHero(exact));
```

Replace `refreshLock` with:

```js
function refreshLock() {
  const best = closestToHero(enemiesForPrefix(state.typedBuffer));
  state.lockedEnemyId = (state.typedBuffer !== '' && best) ? best.id : null;
}
```

Replace `commitOrLock` (keep its leading comment, amended as shown) with:

```js
// Decide what (if anything) to do after the buffer has been extended by one
// valid keystroke. Damage is deferred while the prefix matches multiple live
// enemies. When the buffer exactly matches at least one live enemy's word and
// no live enemy could extend the buffer further, the closest exact match is
// slain immediately (two enemies may carry the same word).
function commitOrLock() {
  const buf = state.typedBuffer;
  const candidates = enemiesForPrefix(buf);
  if (candidates.length === 0) return;

  const exact = candidates.filter(e => e.word === buf);
  const extending = candidates.length - exact.length;

  if (exact.length >= 1 && extending === 0) {
    onEnemySlain(closestToHero(exact));
    return;
  }

  if (candidates.length === 1) {
    const e = candidates[0];
    const remaining = e.word.length - buf.length;
    if (remaining < e.hp) e.hp = remaining;   // monotone: backspace doesn't heal
    state.lockedEnemyId = e.id;
    return;
  }

  // Ambiguous — no damage. Visual lock on the closest prefix-matcher.
  state.lockedEnemyId = closestToHero(candidates).id;
}
```

At the top of `onEnemySlain(e)` add `e.hp = 0;` (callers no longer set it).

- [ ] **Step 7: Implement render.** In `render()`, in the word block replace

```js
      const typed = word.slice(0, e.typedLen);
      const rest  = word.slice(e.typedLen);
```

with

```js
      const n = typedLenFor(e);
      const typed = word.slice(0, n);
      const rest  = word.slice(n);
```

Then confirm no `typedLen` property remains: `grep -n "typedLen" public/game.js` must show only `typedLenFor`.

- [ ] **Step 8: Verify**

Run: `npx playwright test`
Expected: all pass, including the six original `typing-prefix-collision` tests (they assert `carry.hp === 5` etc., which the rewritten `commitOrLock` preserves).

- [ ] **Step 9: Break-the-code proof for B3.** Temporarily comment out the `dropOrphanedBuffer();` call in `updateEnemies`, run `npx playwright test tests/e2e/typing-edge-cases.spec.js -g "reaches the hero" --workers=1`, confirm it FAILS, restore the line, re-run, confirm it passes.

- [ ] **Step 10: Commit**

```bash
git add public/game.js tests/e2e/typing-edge-cases.spec.js
git diff --cached --name-status
git commit -m "fix: typing edge cases - orphaned buffer, duplicate words, stale typed letters"
```

---

### Task 5: Names — shared validation, profanity, change name (B6, B7, G7)

**Files:**
- Modify: `public/api/_bootstrap.php:79-89`, `public/api/state.php:28-30`, `public/api/score.php:20-52`, `public/api/rename.php:21-30`, `public/api/teacher.php:97-105`, `public/game.js` (name entry), `public/index.html` (name modal)
- Create: `tests/api/ProfanityTest.php`, `tests/e2e/name-change.spec.js`
- Modify: `tests/api/StateTest.php`

**Interfaces:**
- Produces (PHP): `sts_is_profane(string $name): bool` (new matching rules), `sts_name_error(string $name): ?string` — returns `null` when the name is acceptable, otherwise the user-facing message: `'name must be 1–16 letters, numbers, or spaces'` or `'name not allowed'`.
- Produces (JS): `openNameModal(mode)` where mode is `'first'` or `'change'`; `submitName()`.
- Consumes: `POST /api/rename.php` `{cid, name}` → 200 `{ok, name}` or 400 `{error}` (existing contract).

- [ ] **Step 1: Write the failing PHP tests** — `tests/api/ProfanityTest.php`

```php
<?php
declare(strict_types=1);

namespace Spelltoslay\Tests\Api;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class ProfanityTest extends TestCase
{
    public static function blocked(): array
    {
        return [['shit'], ['Shithead'], ['xfuckx'], ['sh1t'], ['f u c k'], ['FUCK'],
                ['ass'], ['big ass'], ['dick'], ['Damn'], ['a55'], ['bitch1'], ['asshole']];
    }

    public static function allowed(): array
    {
        return [['Dickens'], ['Cassie'], ['Hancock'], ['Amsterdam'], ['Ava'], ['Player 1'],
                ['Bass'], ['Dickson'], ['Class 5'], ['Matthew'], ['Grass Hopper']];
    }

    #[DataProvider('blocked')]
    public function test_blocks(string $name): void
    {
        $this->assertTrue(sts_is_profane($name), $name);
        $this->assertSame('name not allowed', sts_name_error($name));
    }

    #[DataProvider('allowed')]
    public function test_allows(string $name): void
    {
        $this->assertFalse(sts_is_profane($name), $name);
        $this->assertNull(sts_name_error($name));
    }

    public function test_name_error_shape_rules(): void
    {
        $shape = 'name must be 1–16 letters, numbers, or spaces';
        $this->assertSame($shape, sts_name_error(''));
        $this->assertSame($shape, sts_name_error(str_repeat('x', 17)));
        $this->assertSame($shape, sts_name_error('A<b>'));
    }
}
```

Add to `tests/api/StateTest.php`:

```php
    public function test_state_does_not_store_profane_name(): void
    {
        sts_invoke('state.php', 'GET', ['cid' => 'uuid-prof', 'name' => 'shithead']);
        $row = sts_db()->query("SELECT name FROM presence WHERE client_id='uuid-prof'")->fetch();
        $this->assertNotFalse($row);            // presence is still recorded
        $this->assertNull($row['name']);        // but without the name
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: `vendor/bin/phpunit --filter 'ProfanityTest|profane_name'`
Expected: errors for undefined `sts_name_error`, failures for `ass`, `sh1t`, `f u c k`, `a55`, `Dickens`, `Dickson`, and the state test (name stored as `shithead`).

- [ ] **Step 3: Implement PHP.** In `public/api/_bootstrap.php` replace the `sts_is_profane` function and its doc comment with:

```php
/**
 * Shared name profanity check.
 *
 * Two lists, because substring matching alone blocks innocent names
 * ("Dickens", "Cassie"): strong words are matched anywhere, including across
 * spaces ("f u c k"); the rest only as a whole space-separated word. Common
 * digit-for-letter swaps are normalised first ("sh1t", "a55").
 */
function sts_is_profane(string $name): bool {
    static $anywhere = ['fuck','shit','bitch','cunt','asshole','nigger','nigga','faggot',
                        'whore','slut','pussy','penis','vagina'];
    static $wholeWord = ['ass','arse','damn','dick','cock','piss','crap','fag','tit','tits',
                         'sex','porn','hoe','wtf','stfu','poop','butt'];

    $norm = strtr(strtolower($name), ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', '7' => 't']);
    $joined = preg_replace('/[^a-z]/', '', $norm);
    foreach ($anywhere as $w) {
        if (str_contains($joined, $w)) return true;
    }
    foreach (preg_split('/[^a-z]+/', $norm, -1, PREG_SPLIT_NO_EMPTY) as $token) {
        if (in_array($token, $wholeWord, true)) return true;
    }
    return false;
}

/**
 * One rule for every place a player name enters the system.
 * Returns null when acceptable, otherwise the message to show the user.
 */
function sts_name_error(string $name): ?string {
    if (!preg_match('/^[A-Za-z0-9 ]{1,16}$/', $name)) {
        return 'name must be 1–16 letters, numbers, or spaces';
    }
    if (sts_is_profane($name)) {
        return 'name not allowed';
    }
    return null;
}
```

Check against the test lists before moving on: `Class 5` normalises to `class s` (tokens `class`, `s`) → allowed; `bitch1` → `bitchi` contains `bitch` → blocked; `Bass` is one token `bass` → allowed.

In `public/api/state.php` replace line 30 with:

```php
$validName = sts_name_error($nameParam) === null ? $nameParam : '';
```

In `public/api/score.php` replace the two name `if` blocks (lines 21-28) and the profanity block (lines 49-52) with a single block placed where lines 21-28 were:

```php
if (($nameError = sts_name_error($name)) !== null) {
    sts_json(400, ['error' => $nameError]);
    return;
}
```

In `public/api/rename.php` replace lines 21-30 with the same four-line block. In `public/api/teacher.php` `renameStudent` case, replace lines 98-105 with:

```php
        if (($nameError = sts_name_error($newName)) !== null) {
            sts_json(400, ['error' => $nameError]);
            return;
        }
```

- [ ] **Step 4: Verify PHP**

Run: `vendor/bin/phpunit`
Expected: OK. `ScoreTest::test_rejects_long_name` asserts the error contains `name` — still true.

- [ ] **Step 5: Write the failing e2e tests** — `tests/e2e/name-change.spec.js`

```js
import { test, expect } from '@playwright/test';
import { boot } from './helpers.js';

test('a profane first name is refused with a message', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#name-entry')).toBeVisible();
  await page.locator('#entry-name').fill('shithead');
  await page.locator('#start-playing').click();
  await expect(page.locator('#entry-error')).toContainText('not allowed');
  await expect(page.locator('#name-entry')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('sts_player_name'))).toBeNull();
});

test('Enter submits the name form', async ({ page }) => {
  await page.goto('/');
  await page.locator('#entry-name').fill('Quinn');
  await page.keyboard.press('Enter');
  await expect(page.locator('#name-entry')).toBeHidden();
  expect(await page.evaluate(() => window.state.playerName)).toBe('Quinn');
});

test('Change name on the game-over screen renames the player', async ({ page }) => {
  await boot(page, 'Before');
  // Let one poll create the presence row under the old name.
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.state.hero.hp = 0; window.state.gameOver = true; });
  await expect(page.locator('#game-over')).toBeVisible();
  await page.locator('#change-name').click();
  await expect(page.locator('#name-entry')).toBeVisible();
  await expect(page.locator('#entry-name')).toHaveValue('Before');

  await page.locator('#entry-name').fill('damn');
  await page.locator('#start-playing').click();
  await expect(page.locator('#entry-error')).toContainText('not allowed');
  await expect(page.locator('#game-over-name')).toHaveText('Before');

  await page.locator('#entry-name').fill('');
  await page.locator('#start-playing').click();
  await expect(page.locator('#entry-error')).toBeVisible();

  await page.locator('#entry-name').fill('After');
  await page.locator('#start-playing').click();
  await expect(page.locator('#name-entry')).toBeHidden();
  await expect(page.locator('#game-over')).toBeVisible();     // still on game over
  await expect(page.locator('#game-over-name')).toHaveText('After');
  expect(await page.evaluate(() => window.state.running)).toBe(false);

  // The server agrees, so the next poll does not revert it.
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => window.state.playerName)).toBe('After');
  expect(await page.url()).not.toContain('#');
});
```

- [ ] **Step 6: Run to verify they fail**

Run: `npx playwright test tests/e2e/name-change.spec.js --workers=1`
Expected: all three fail (profane name accepted; Enter does nothing; `#name-entry` never appears after clicking Change name).

- [ ] **Step 7: Implement markup.** In `public/index.html` change the name modal heading and paragraph to carry ids so the script can retitle it:

```html
        <h2 id="name-entry-title">Welcome to SpellToSlay</h2>
        <p>What's your name? (1–16 letters/numbers/spaces)</p>
        <label><input id="entry-name" maxlength="16" autocomplete="off" placeholder="Your name"></label>
        <button id="start-playing">Start playing</button>
        <button id="cancel-name" class="secondary hidden">Cancel</button>
```

- [ ] **Step 8: Implement script.** In `public/game.js` replace everything from `if (!state.playerName) {` through the end of the `startPlayingBtn.addEventListener('click', ...)` block with:

```js
const nameTitleEl   = document.getElementById('name-entry-title');
const cancelNameBtn = document.getElementById('cancel-name');
let nameModalMode = 'first';   // 'first' = welcome screen, 'change' = from game over

function openNameModal(mode) {
  nameModalMode = mode;
  nameTitleEl.textContent = mode === 'first' ? 'Welcome to SpellToSlay' : 'Change your name';
  startPlayingBtn.textContent = mode === 'first' ? 'Start playing' : 'Save name';
  cancelNameBtn.classList.toggle('hidden', mode === 'first');
  entryNameInput.value = mode === 'first' ? '' : state.playerName;
  entryErrorEl.classList.add('hidden');
  nameEntryEl.classList.remove('hidden');
  entryNameInput.focus();
}

function showNameError(msg) {
  entryErrorEl.textContent = msg;
  entryErrorEl.classList.remove('hidden');
}

async function submitName() {
  const v = entryNameInput.value.trim();
  if (!/^[A-Za-z0-9 ]{1,16}$/.test(v)) {
    showNameError('Name must be 1–16 letters, numbers, or spaces.');
    return;
  }
  // The server owns the "is this name allowed" rule. If it cannot be reached,
  // let the student play; score submission re-checks the name later.
  startPlayingBtn.disabled = true;
  try {
    const r = await fetch('/api/rename.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cid: state.clientId, name: v }),
    });
    if (r.status === 400) {
      const j = await r.json().catch(() => ({}));
      showNameError(j.error === 'name not allowed'
        ? 'That name is not allowed. Please pick another.'
        : 'Name must be 1–16 letters, numbers, or spaces.');
      return;
    }
  } catch (_) {
    /* offline: fall through */
  } finally {
    startPlayingBtn.disabled = false;
  }

  state.playerName = v;
  localStorage.setItem('sts_player_name', v);
  nameEntryEl.classList.add('hidden');
  entryErrorEl.classList.add('hidden');
  if (nameModalMode === 'first') {
    state.running = true;
    typeInput.focus();
  } else {
    goNameEl.textContent = v;
  }
}

startPlayingBtn.addEventListener('click', submitName);
entryNameInput.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') { ev.preventDefault(); submitName(); }
});
cancelNameBtn.addEventListener('click', () => nameEntryEl.classList.add('hidden'));
document.getElementById('change-name').addEventListener('click', (ev) => {
  ev.preventDefault();
  openNameModal('change');
});

if (!state.playerName) {
  openNameModal('first');
  state.running = false; // engine stays idle until they submit
} else {
  nameEntryEl.classList.add('hidden');
}
```

`goNameEl` is declared with `const` further down; it is only read inside `submitName` at click time. The name modal and the game-over modal are both `.modal` (absolutely centred); the name modal comes first in the DOM, so add to `public/style.css`:

```css
#name-entry { z-index: 20; }
```

- [ ] **Step 9: Verify**

Run: `npx playwright test`
Expected: all pass, including the original `name-entry-focus.spec.js` (focus must still land in `#type-input` after first entry) and `happy-path.spec.js`.

- [ ] **Step 10: Commit**

```bash
git add public/api/_bootstrap.php public/api/state.php public/api/score.php public/api/rename.php public/api/teacher.php public/game.js public/index.html public/style.css tests/api/ProfanityTest.php tests/api/StateTest.php tests/e2e/name-change.spec.js
git diff --cached --name-status
git commit -m "fix: one name rule everywhere, better profanity matching, working Change name"
```

---

### Task 6: Score plausibility cross-checks (G3, server half)

The client is fully trusted today. These checks do not make cheating impossible; they make `score = 999999` from the console fail.

**Files:**
- Modify: `public/api/score.php`, `tests/api/ScoreTest.php`, `public/game.js` (comment only)

**Interfaces:**
- Produces: `score.php` rejects with 400 `{error: 'score does not match the run'}` when any of these fail:
  - `score <= wordsSlain * 256` (max per word: 32 letters × multiplier 4 × streak bonus 2.0)
  - `wave <= intdiv(duration, 30) + 2` (client wave is `1 + floor(time / 30)`; +1 slack)
  - `wordsSlain <= duration * 3 + 5`
- These constants mirror `WAVE_DURATION_S = 30` and the largest `pointMultiplier` (4) in `game.js`.

- [ ] **Step 1: Write the failing tests.** In `tests/api/ScoreTest.php` add:

```php
    public function test_rejects_score_higher_than_kills_allow(): void
    {
        [$status, , $json] = sts_invoke('score.php', 'POST', [], [
            'name' => 'Hax', 'score' => 999999, 'wave' => 1, 'duration' => 20,
            'wpm' => 40, 'accuracy' => 90, 'wordsSlain' => 3,
        ]);
        $this->assertSame(400, $status);
        $this->assertSame('score does not match the run', $json['error']);
    }

    public function test_rejects_wave_beyond_elapsed_time(): void
    {
        [$status] = sts_invoke('score.php', 'POST', [], [
            'name' => 'Hax', 'score' => 10, 'wave' => 50, 'duration' => 60,
            'wpm' => 40, 'accuracy' => 90, 'wordsSlain' => 5,
        ]);
        $this->assertSame(400, $status);
    }

    public function test_rejects_more_kills_than_time_allows(): void
    {
        [$status] = sts_invoke('score.php', 'POST', [], [
            'name' => 'Hax', 'score' => 10, 'wave' => 1, 'duration' => 10,
            'wpm' => 40, 'accuracy' => 90, 'wordsSlain' => 500,
        ]);
        $this->assertSame(400, $status);
    }

    public function test_accepts_the_best_legitimate_run_shape(): void
    {
        // 10 minutes, wave 21, 300 words at the per-word ceiling.
        [$status] = sts_invoke('score.php', 'POST', [], [
            'name' => 'Legit', 'score' => 300 * 256, 'wave' => 21, 'duration' => 600,
            'wpm' => 120, 'accuracy' => 99, 'wordsSlain' => 300,
        ]);
        $this->assertSame(200, $status);
    }

    public function test_accepts_zero_score_run_with_no_kills(): void
    {
        [$status] = sts_invoke('score.php', 'POST', [], [
            'name' => 'Zero', 'score' => 0, 'wave' => 1, 'duration' => 12,
        ]);
        $this->assertSame(200, $status);
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: `vendor/bin/phpunit --filter ScoreTest`
Expected: the three `test_rejects_*` new tests fail with 200 instead of 400.

- [ ] **Step 3: Implement.** In `public/api/score.php`, after the plausibility-ceiling block add:

```php
// Cross-field checks. The run's numbers have to agree with each other; these
// bounds mirror the client's rules in public/js (WAVE_DURATION_S = 30, longest
// word 32 letters, largest pointMultiplier 4, streak bonus capped at 2.0).
// If a student contribution raises any of those, raise the matching bound here.
// (Plain variables, not `const`: the test harness requires this file many
// times per process and a constant would be redeclared.)
$maxPointsPerWord = 32 * 4 * 2;
$waveSeconds      = 30;
if ($score > $wordsSlain * $maxPointsPerWord
    || $wave > intdiv($duration, $waveSeconds) + 2
    || $wordsSlain > $duration * 3 + 5) {
    sts_json(400, ['error' => 'score does not match the run']);
    return;
}
```

Also replace the interpolated rank query with a prepared one:

```php
$rankStmt = $db->prepare('SELECT COUNT(*) AS c FROM scores WHERE score > :s');
$rankStmt->execute([':s' => $score]);
$rank = (int)$rankStmt->fetch()['c'] + 1;
```

- [ ] **Step 4: Update existing fixtures that the new rules reject.** In `tests/api/ScoreTest.php`:

- `test_accepts_valid_submission`: add `'wordsSlain' => 40` (423 ≤ 40×256; wave 7 ≤ 184/30+2 = 8).
- `test_returns_correct_rank`: change the three payloads to `['name'=>'A','score'=>500,'wave'=>3,'duration'=>60,'wordsSlain'=>20]`, `['name'=>'B','score'=>900,'wave'=>5,'duration'=>120,'wordsSlain'=>30]`, `['name'=>'C','score'=>700,'wave'=>4,'duration'=>90,'wordsSlain'=>25]`.
- `test_rate_limits_same_ip_and_name_within_10s`: second payload `'score'=>2` → add `'wordsSlain'=>1` to it; first payload `'score'=>1` → add `'wordsSlain'=>1`.
- `testAcceptsNewTypingFields`: wave 3, duration 184, score 1240, wordsSlain 38 — already valid; no change.
- `testRejectsImplausibleWpm` / `testRejectsImplausibleAccuracy` / `test_rejects_long_name` / `test_rejects_non_alnum_name` / `test_rejects_negative_score` / `test_rejects_implausible_score`: they expect 400 and still get 400 from an earlier check; no change. Confirm each still fails for its own reason by asserting nothing new — the earlier checks run first in the file.
- Replace `testLegacyPayloadStillAccepted` with:

```php
    public function testLegacyPayloadWithoutTypingFieldsIsRejectedWhenItClaimsPoints(): void
    {
        // A payload with no wordsSlain claims zero kills, so it cannot carry points.
        [$status] = sts_invoke(
            'score.php', 'POST', [],
            ['name' => 'Legacy', 'score' => 100, 'wave' => 2, 'duration' => 30]
        );
        $this->assertSame(400, $status);
    }
```

Also check every other test file that posts to `score.php` (`grep -rn "score.php" tests/api`) — `LeaderboardTest.php` inserts or posts scores; if it posts, add `wordsSlain`/consistent `wave` the same way.

- [ ] **Step 5: Add the mirror comment** in `public/game.js` above `const WAVE_DURATION_S = 30;`:

```js
// NOTE: public/api/score.php cross-checks submitted runs against
// WAVE_DURATION_S, the 32-letter word cap and the largest pointMultiplier
// below. Change them here and the server will start rejecting honest scores
// until its bounds are raised too.
```

- [ ] **Step 6: Verify**

Run: `vendor/bin/phpunit` — expect OK.
Run: `npx playwright test tests/e2e/happy-path.spec.js tests/e2e/game-over-flow.spec.js --workers=1` — expect pass (a real one-kill run and zero-kill runs submit fine).

- [ ] **Step 7: Commit**

```bash
git add public/api/score.php public/game.js tests/api/ScoreTest.php tests/api/LeaderboardTest.php
git diff --cached --name-status
git commit -m "feat: cross-check submitted scores against kills, wave and duration"
```

(Leave `LeaderboardTest.php` out of `git add` if it needed no change.)

---

### Task 7: Rendering and small UI defects (S1, S3, S4, S5, S6, G6 overlap)

**Files:**
- Modify: `public/game.js` (render word block, message bar, poll overlay, leaderboard, hero draw, `elapsedHHMMSS`), `public/index.html`, `public/api/words.php:31`, `config/config.example.php`
- Create: `tests/e2e/labels.spec.js`

**Interfaces:**
- Produces: `layoutLabels(items, arena) -> rects` (pure). `items`: array of `{ id, x, y, w, h }` where `(x, y)` is the wanted label centre and `w`/`h` its pill size, ordered most-important first. `arena`: `{ w, h }`. Returns `[{ id, cx, cy, w, h }]` in the same order with centres moved so that every pill is fully inside the arena and no two pills intersect when that is possible within 8 nudges. Lives in `game.js` now, `public/js/labels.js` after Task 8.
- Produces: `elapsedMMSS()` (rename of `elapsedHHMMSS`, which never printed hours).

- [ ] **Step 1: Write the failing tests** — `tests/e2e/labels.spec.js`

```js
import { test, expect } from '@playwright/test';
import { boot } from './helpers.js';

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
  const { teacher } = await import('./helpers.js');
  await boot(page);
  await teacher(request, { action: 'startPoll', question: 'Ready?', options: ['Yes', 'No'] });
  try {
    await expect(page.locator('#poll-overlay')).toBeVisible({ timeout: 6000 });
    await page.route('**/api/poll-vote.php', (route) =>
      route.fulfill({ status: 400, json: { error: 'poll not active or wrong poll id' } }));
    await page.locator('#poll-options button').first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('#poll-options')).not.toContainText('You picked');
    await expect(page.locator('#poll-options button')).toHaveCount(2);
  } finally {
    await teacher(request, { action: 'endPoll' });
  }
});

test('poll buttons are not rebuilt on every state poll', async ({ page, request }) => {
  const { teacher } = await import('./helpers.js');
  await boot(page);
  await teacher(request, { action: 'startPoll', question: 'Stable?', options: ['Yes', 'No'] });
  try {
    await expect(page.locator('#poll-overlay')).toBeVisible({ timeout: 6000 });
    await page.evaluate(() => { document.querySelector('#poll-options button').dataset.mark = '1'; });
    await page.waitForTimeout(4500);   // two more polls
    expect(await page.evaluate(() => document.querySelector('#poll-options button').dataset.mark)).toBe('1');
  } finally {
    await teacher(request, { action: 'endPoll' });
  }
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx playwright test tests/e2e/labels.spec.js --workers=1`
Expected: all seven fail (`layoutLabels`/`applyMessages` undefined; `<img>` element created; "You picked" shown; mark lost).

- [ ] **Step 3: Implement `layoutLabels`.** Add to `public/game.js` above `render()`:

```js
// Place word labels so every pill is fully inside the arena and pills do not
// cover each other. Pure function: no canvas, no state. `items` are ordered
// most-important first; earlier items keep their wanted spot and later ones
// move (up first, then down) out of the way.
function layoutLabels(items, arena) {
  const placed = [];
  const clampAxis = (c, size, max) =>
    size >= max ? max / 2 : Math.min(Math.max(c, size / 2), max - size / 2);
  const hits = (a, b) => Math.abs(a.cx - b.cx) < (a.w + b.w) / 2
                      && Math.abs(a.cy - b.cy) < (a.h + b.h) / 2;
  for (const it of items) {
    const r = { id: it.id, w: it.w, h: it.h,
                cx: clampAxis(it.x, it.w, arena.w),
                cy: clampAxis(it.y, it.h, arena.h) };
    const homeY = r.cy;
    for (let n = 1; n <= 8 && placed.some(p => hits(p, r)); n++) {
      // Alternate above/below the wanted row: -1, +1, -2, +2, ...
      const step = Math.ceil(n / 2) * (n % 2 === 1 ? -1 : 1);
      r.cy = clampAxis(homeY + step * (it.h + 2), it.h, arena.h);
    }
    placed.push(r);
  }
  return placed;
}
```

- [ ] **Step 4: Use it in `render()`.** Replace the per-enemy "Word above the enemy" block inside the enemies loop with nothing (delete it), and after the enemies loop add:

```js
  // Word labels. Laid out together so they stay inside the arena and do not
  // cover one another; the enemy nearest the hero gets first pick of position.
  // Font + pill scale uniformly from state.wordFontSize (user-adjustable).
  // The 14/22 base values come from the original v1 design at 14 px font.
  {
    const fs = state.wordFontSize;
    const sc = fs / 14;
    const padding = 6;
    ctx.font = `${fs}px ui-monospace, monospace`;
    const live = state.enemies.filter(e => !e.dying)
      .map(e => ({ e, d: Math.hypot(e.x - state.hero.x, e.y - state.hero.y) }))
      .sort((a, b) => a.d - b.d)
      .map(o => o.e);
    const items = live.map(e => ({
      id: e.id,
      x: e.x,
      y: e.y - e.def.size / 2 - 8 - sc,     // pill centre: text row sits 1*sc below it
      w: ctx.measureText(e.word).width + padding * 2,
      h: 22 * sc,
    }));
    const rects = layoutLabels(items, ARENA);
    live.forEach((e, i) => {
      const r = rects[i];
      const n = typedLenFor(e);
      const typed = e.word.slice(0, n);
      const rest  = e.word.slice(n);
      const textW = r.w - padding * 2;
      const left  = r.cx - textW / 2;
      const textY = r.cy + sc;
      ctx.fillStyle = '#1a2238';
      ctx.fillRect(r.cx - r.w / 2, r.cy - r.h / 2, r.w, r.h);
      const typedW = ctx.measureText(typed).width;
      ctx.fillStyle = '#06d6a0';
      ctx.fillText(typed, left + typedW / 2, textY);
      ctx.fillStyle = '#cde';
      ctx.fillText(rest, left + typedW + ctx.measureText(rest).width / 2, textY);
    });
  }
```

(The old pill was drawn from `wY - 12*sc` with height `22*sc`, i.e. centred at `wY - sc`; the code above keeps that geometry.)

Also in `render()`: set `ctx.fillStyle = '#fff';` on the line before the hero `ctx.font = ...` line; delete the "Top-center: teacher message strip" block (the DOM bar below replaces it; keep the message line inside the pause overlay).

- [ ] **Step 5: Message bar.** Add near the polling code:

```js
const messageBarEl = document.getElementById('message-bar');
function applyMessages(classMessage, personalMessage) {
  state.messageBar = [classMessage, personalMessage].filter(Boolean).join(' • ');
  messageBarEl.textContent = state.messageBar;
}
```

In `pollServerState` replace the `state.messageBar = ...` line with `applyMessages(s.message || '', s.personalMessage || '');`. Remove `personalMessage: '',` from `state` (unused).

- [ ] **Step 6: Leaderboard as text.** Replace `renderLeaderboard` with:

```js
async function renderLeaderboard() {
  try {
    const r = await fetch('/api/leaderboard.php', { cache: 'no-store' });
    const j = await r.json();
    const fill = (ol, rows) => {
      ol.replaceChildren(...(rows || []).map((e) => {
        const li = document.createElement('li');
        const b = document.createElement('b');
        b.textContent = e.name;
        li.append(b, ` — ${e.score} (W${e.wave}, WPM ${e.wpm}, ${e.accuracy}%)`);
        return li;
      }));
    };
    fill(lbTodayEl, j.today);
    fill(lbAlltimeEl, j.allTime);
  } catch (_) { /* ignore */ }
}
```

In `public/index.html` change `<h3>Today</h3>` to `<h3>Last 24 hours</h3>` (the query is a rolling 24h window, `leaderboard.php:32`).

- [ ] **Step 7: Poll overlay.** In `updatePollOverlay`: (a) only rebuild the option buttons when what is shown would change; (b) treat a non-OK vote as failed. Replace from `pollEl.classList.remove('hidden');` to the end of the function with:

```js
  pollEl.classList.remove('hidden');
  document.getElementById('poll-question').textContent = s.pollQuestion;
  const btnsEl = document.getElementById('poll-options');
  const answered = myAnswer !== null && myAnswer !== undefined;

  if (answered) {
    const remaining = Math.max(0, Math.ceil(
      (POLL_DISMISS_AFTER_MS - (Date.now() - state.pollAnsweredAt)) / 1000
    ));
    const thanks = document.createElement('p');
    thanks.textContent = `✓ You picked: ${options[myAnswer] || myAnswer}`;
    thanks.style.fontWeight = '700';
    thanks.style.margin = '0';
    const fade = document.createElement('p');
    fade.textContent = remaining > 0 ? `(closing in ${remaining}s)` : '';
    fade.style.cssText = 'margin: 4px 0 0; font-size: 12px; color: #6e7681;';
    btnsEl.replaceChildren(thanks, fade);
    btnsEl.dataset.renderKey = '';
    return;
  }

  // Unanswered: rebuilding the buttons on every 2s poll can swallow a click
  // that lands mid-rebuild, so only rebuild when the poll itself changed.
  const renderKey = `${pollId}:${JSON.stringify(options)}`;
  if (btnsEl.dataset.renderKey === renderKey) return;
  btnsEl.dataset.renderKey = renderKey;
  btnsEl.replaceChildren(...options.map((opt, i) => {
    const btn = document.createElement('button');
    btn.textContent = opt;
    btn.addEventListener('click', async () => {
      try {
        const r = await fetch('/api/poll-vote.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cid: state.clientId, pollId, optionIndex: i }),
        });
        if (!r.ok) return;   // leave the buttons up so the student can retry
        state.pollAnsweredAt = Date.now();
        updatePollOverlay({ ...s, pollMyAnswer: i });
        setTimeout(() => pollEl.classList.add('hidden'), POLL_DISMISS_AFTER_MS);
      } catch (_) { /* network error: buttons stay */ }
    });
    return btn;
  }));
}
```

In the early `if (!s.pollQuestion)` branch add `document.getElementById('poll-options').dataset.renderKey = '';` so the next poll always renders.

- [ ] **Step 8: Dead code and nits.**

- `public/index.html`: delete the four `<span id="hud-*">` lines (keep the empty `<div class="hud" id="hud"></div>` so the topbar flex layout is unchanged) and the `<div id="overlay" ...>` line. First confirm nothing references them: `grep -n "hud-\|getElementById('overlay')" public/*.js` must print nothing.
- `public/game.js`: rename `elapsedHHMMSS` to `elapsedMMSS` (three call sites) and simplify its body to `const t = Math.floor(state.time); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;`.
- `public/api/words.php:31`: regex becomes `/^builtin:(K|[1-8])$/`.
- `config/config.example.php`: first comment line becomes `// Copy this to config/config.php (gitignored). On the server: ~/spelltoslay-app/config/config.php`.

- [ ] **Step 9: Verify**

Run: `vendor/bin/phpunit` — expect OK (`WordsTest` covers `builtin:K` and grades).
Run: `npx playwright test` — expect all pass.

- [ ] **Step 10: Look at it.** Start nothing by hand: run `npx playwright test tests/e2e/labels.spec.js -g "pulled inside" --workers=1 --trace on` is not a visual check, so additionally capture one screenshot with a seeded crowded arena:

```bash
cat > tests/e2e/_shot.spec.js <<'EOF'
import { test } from '@playwright/test';
import { boot, seedEnemies } from './helpers.js';
test('shot', async ({ page }) => {
  await boot(page);
  await seedEnemies(page, [
    { id: 'a', word: 'beautiful', x: 20, y: 120 },
    { id: 'b', word: 'necessary', x: 940, y: 120 },
    { id: 'c', word: 'because', x: 480, y: 300 },
    { id: 'd', word: 'believe', x: 490, y: 305 },
    { id: 'e', word: 'cat', x: 480, y: 10 },
  ]);
  await page.locator('#type-input').focus();
  await page.keyboard.type('be');
  await page.waitForTimeout(200);
  await page.locator('#arena').screenshot({ path: 'test-results/labels.png' });
});
EOF
npx playwright test tests/e2e/_shot.spec.js --workers=1; rm tests/e2e/_shot.spec.js
```

Open `test-results/labels.png` and confirm: all five words fully readable, none clipped, `because`/`believe` not overlapping, `be` green on `beautiful`, `because`, `believe`. Fix and repeat if not.

- [ ] **Step 11: Commit**

```bash
git add public/game.js public/index.html public/api/words.php config/config.example.php tests/e2e/labels.spec.js
git diff --cached --name-status
git commit -m "fix: keep word labels readable, DOM message bar, safer leaderboard and poll overlay"
```

---

### Task 8: Split `game.js` into ES modules; hide state in production (G9, G3 client half)

A move-only refactor. No behaviour change is allowed in this task except: (1) the game's internals are no longer global outside localhost; (2) `index.html` loads a module. Every test from Tasks 1-7 is the safety net.

**Files:**
- Create: `public/js/constants.js`, `state.js`, `dom.js`, `words.js`, `spawner.js`, `typing.js`, `effects.js`, `labels.js`, `render.js`, `net.js`, `poll.js`, `ui.js`, `main.js`
- Create: `tests/e2e/production-surface.spec.js`
- Modify: `public/index.html` (script tag)
- Delete: `public/game.js`

**Interfaces — module map (exports are exact names; move the existing code, do not rewrite it):**

| Module | Exports | Imports from |
|--------|---------|--------------|
| `constants.js` | `ARENA, HERO, MAX_HP, TYPO_HP_PENALTY, WAVE_DURATION_S, BOSS_WAVE_INTERVAL, WPM_WINDOW_S, POLL_DISMISS_AFTER_MS, PREFERS_REDUCED_MOTION, ENEMIES` | — |
| `state.js` | `state` (the object, including the `clientId`/`playerName`/`wordFontSize` localStorage boot code) | `constants.js` |
| `dom.js` | `canvas, ctx, typeInput, wordSizeSlider` (with the `ctx.textAlign/textBaseline` setup) | — |
| `words.js` | `prefixIndex` access via functions only: `addEnemyToIndex, removeEnemyFromIndex, clearPrefixIndex, hasPrefix, enemiesForPrefix, closestToHero, fetchWordPool, pickWordFor` | `state.js` |
| `typing.js` | `initTyping, dropOrphanedBuffer, typedLenFor, currentWpm, currentAccuracy, elapsedMMSS` (internal: `onType, refreshLock, commitOrLock, onEnemySlain, flashLockedRed`) | `constants.js, state.js, dom.js, words.js` |
| `spawner.js` | `updateSpawner, updateEnemies, spawnOne` | `constants.js, state.js, words.js, typing.js` (`dropOrphanedBuffer`) |
| `effects.js` | `updateEffects, drawEffects` | `state.js, dom.js` |
| `labels.js` | `layoutLabels` | — |
| `render.js` | `render` | `constants.js, state.js, dom.js, typing.js, effects.js, labels.js, words.js` |
| `poll.js` | `updatePollOverlay` | `constants.js, state.js` |
| `net.js` | `pollServerState, startPolling, applyMessages, showBuildVersion` (internal: `shouldReload`) | `state.js, words.js, poll.js` |
| `ui.js` | `initUi, showGameOver, isGameOverShown, resetRun, renderLeaderboard, openNameModal` | `constants.js, state.js, dom.js, words.js, typing.js` |
| `main.js` | — (entry point: `tick`, `init`, test hooks) | all of the above |

Rules that keep the import graph acyclic:

- `prefixIndex` is a `let` that `rebuildPrefixIndex`/reset reassigns today. Inside `words.js` make it a module-private `const prefixIndex = new Map()`; `clearPrefixIndex()` calls `.clear()`; `hasPrefix(p)` wraps `.has(p)`. Delete `rebuildPrefixIndex` (it has no callers: confirm with `grep -n rebuildPrefixIndex public tests`).
- `ui.js` must not be imported by `typing.js`, `spawner.js` or `net.js`. Game-over is surfaced by `main.js`'s `tick` calling `showGameOver()`.
- `typing.js` registers its DOM listeners inside `initTyping()`; `ui.js` inside `initUi()`; `net.js` starts its interval inside `startPolling()`. `main.js` calls them in this order: `initUi(); initTyping(); await fetchWordPool(); await pollServerState(); startPolling(); showBuildVersion();` then sets `state.running = !!state.playerName`, `state.spawn.waveStartedAt = state.time`, and requests the first frame — the same order of effects as the bottom of today's `game.js`. One difference to preserve deliberately: today the 2s interval is registered at script evaluation, before the first awaited fetches. Registering it after them is fine (the explicit `await pollServerState()` covers the first poll).
- `resetRun()` lives in `ui.js` and calls `clearPrefixIndex()`.
- `gameOverShown` becomes private to `ui.js` with `isGameOverShown()`; `resetRun()` clears it.

- [ ] **Step 1: Write the failing test** — `tests/e2e/production-surface.spec.js`

```js
import { test, expect } from '@playwright/test';

// The test hooks (window.state and friends) exist only on localhost. Reach the
// same server through 127.0.0.1 to see what a production hostname would get.
test('game internals are not global off localhost', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sts_player_name', 'Prod'));
  await page.goto('http://127.0.0.1:8001/');
  await expect(page.locator('#build-version')).not.toHaveText('v…', { timeout: 8000 });
  const surface = await page.evaluate(() => ({
    state: typeof window.state,
    pick: typeof window.pickWordFor,
    add: typeof window.addEnemyToIndex,
  }));
  expect(surface).toEqual({ state: 'undefined', pick: 'undefined', add: 'undefined' });
});

test('the game still plays off localhost', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sts_player_name', 'Prod'));
  await page.goto('http://127.0.0.1:8001/');
  // No hooks available: observe through the DOM only.
  await page.locator('#type-input').focus();
  await expect(page.locator('#type-input')).toBeFocused();
  await expect(page.locator('#name-entry')).toBeHidden();
  await expect(page.locator('#game-over')).toBeHidden();
});
```

`php -S localhost:8001` binds the name `localhost`, which on macOS resolves to `::1` and/or `127.0.0.1`. If `http://127.0.0.1:8001/` refuses the connection, change the `webServer.command` in `playwright.config.js` to `php -S 0.0.0.0:8001 -t public` (the `url` and `baseURL` stay `http://localhost:8001`) and note it in the commit.

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test tests/e2e/production-surface.spec.js --workers=1`
Expected: first test fails (`state: 'object'`).

- [ ] **Step 3: Do the move.** Create the files per the module map. For each function, cut it from `game.js` and paste it unchanged; add `export` and the imports it needs. Replace direct `prefixIndex.has/get/clear` uses with the `words.js` functions. In `public/js/main.js`:

```js
import { state } from './state.js';
import { fetchWordPool, pickWordFor, addEnemyToIndex, removeEnemyFromIndex } from './words.js';
import { updateSpawner, updateEnemies } from './spawner.js';
import { initTyping, typedLenFor } from './typing.js';
import { updateEffects } from './effects.js';
import { layoutLabels } from './labels.js';
import { render } from './render.js';
import { pollServerState, startPolling, applyMessages, showBuildVersion } from './net.js';
import { initUi, showGameOver, isGameOverShown, renderLeaderboard } from './ui.js';

// Test hooks. Playwright drives the game through these; a production hostname
// never gets them, so the console has nothing obvious to poke at.
if (location.hostname === 'localhost') {
  Object.assign(window, {
    state, pickWordFor, addEnemyToIndex, removeEnemyFromIndex,
    typedLenFor, layoutLabels, applyMessages, renderLeaderboard,
  });
}

let lastTs = performance.now();
function tick(now) {
  const dt = Math.min((now - lastTs) / 1000, 1 / 30);
  lastTs = now;
  if (state.running && !state.paused && !state.personalPaused && !state.gameOver) {
    state.time += dt;
    updateSpawner(dt);
    updateEnemies(dt);
    updateEffects(dt);
  }
  if (state.gameOver && !isGameOverShown()) {
    state.running = false;
    showGameOver();
  }
  render();
  requestAnimationFrame(tick);
}

(async function init() {
  initUi();
  initTyping();
  await fetchWordPool();
  await pollServerState();
  startPolling();
  showBuildVersion();
  // If the player submitted the name modal while the fetches above were in
  // flight, state.playerName is already set and running stays true.
  state.running = !!state.playerName && !state.gameOver;
  state.spawn.waveStartedAt = state.time;
  requestAnimationFrame(tick);
})();
```

In `public/index.html` replace `<script src="/game.js" defer></script>` with `<script type="module" src="/js/main.js"></script>`. Delete `public/game.js` with `git rm public/game.js`.

`'use strict'` is implicit in modules; do not copy it. The `if (typeof window !== 'undefined') window.state = state;` line is dropped (replaced by the localhost hook).

- [ ] **Step 4: Check nothing was lost.** `git show HEAD:public/game.js | grep -c "^function \|^async function "` gives the number of top-level functions before; `grep -hc "^export function \|^function \|^export async function \|^async function " public/js/*.js | paste -sd+ - | bc` after. The "after" count must be the "before" count minus 1 (`rebuildPrefixIndex`) plus the new small wrappers (`clearPrefixIndex`, `hasPrefix`, `initTyping`, `initUi`, `startPolling`, `showBuildVersion`, `isGameOverShown`, `drawEffects`, and `tick` now in main). List any other difference and explain it in the commit body.

- [ ] **Step 5: Verify**

Run: `npx playwright test` — every spec passes, including both `production-surface` tests.
Run: `vendor/bin/phpunit` — OK (no PHP change; confirms nothing else moved).
Check the browser console is clean: add temporarily to `tests/e2e/happy-path.spec.js` at the top of the test `page.on('pageerror', e => { throw e; });`, run it, then remove that line (or keep it — it is a cheap permanent guard; keeping it is preferred).

- [ ] **Step 6: Update the score.php mirror comment.** The comment added in Task 6 Step 5 moves with `WAVE_DURATION_S` into `public/js/constants.js`; confirm it is there.

- [ ] **Step 7: Commit**

```bash
git add public/js public/index.html tests/e2e/production-surface.spec.js tests/e2e/happy-path.spec.js playwright.config.js
git diff --cached --name-status   # must also list "D public/game.js" (staged by git rm in Step 3)
git commit -m "refactor: split game.js into ES modules; test hooks only on localhost"
```

---

### Task 9: Encoded POST bodies (G2)

DreamHost's mod_security inspects request bodies and answers HTTP 418 for text that looks like SQL. A pasted spelling list or a teacher message is free text. Send every JSON POST as `{"z": base64url(JSON)}`; the server accepts both forms.

**Files:**
- Modify: `public/api/_bootstrap.php` (`sts_input_json`), `public/js/ui.js`, `public/js/poll.js`, `public/teacher.js`, `public/teacher.html`
- Create: `public/js/api.js`, `tests/api/EncodedBodyTest.php`

**Interfaces:**
- Produces (JS): `encodeBody(payload) -> string` (JSON text of `{ z }`), `postJson(url, payload, headers = {}) -> Promise<Response>`.
- Produces (PHP): `sts_input_json()` unwraps a body that is exactly `{"z": "<base64url>"}`; any other body is treated as plain JSON as before. A `z` that does not decode to a JSON object yields `[]`.

- [ ] **Step 1: Write the failing tests** — `tests/api/EncodedBodyTest.php`

```php
<?php
declare(strict_types=1);

namespace Spelltoslay\Tests\Api;

use PHPUnit\Framework\TestCase;

class EncodedBodyTest extends TestCase
{
    private const KEY = 'test-teacher-key-xyz';

    private static function wrap(array $payload): string
    {
        $b64 = rtrim(strtr(base64_encode(json_encode($payload)), '+/', '-_'), '=');
        return json_encode(['z' => $b64]);
    }

    protected function setUp(): void
    {
        sts_db()->exec('DELETE FROM teacher_word_list');
        sts_db()->exec("UPDATE state SET message='' WHERE id=1");
    }

    public function test_encoded_word_list_arrives_intact(): void
    {
        // Pasted from a word processor: CRLF endings, trailing blank line,
        // and adjacent words that read as SQL to a WAF.
        $text = "union\r\nselect\r\ndrop\r\ntable\r\n\r\n";
        [$status] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY],
            self::wrap(['action' => 'setWordList', 'text' => $text]));
        $this->assertSame(200, $status);
        $words = array_column(
            sts_db()->query('SELECT word FROM teacher_word_list ORDER BY position')->fetchAll(), 'word');
        $this->assertSame(['union', 'select', 'drop', 'table'], $words);
    }

    public function test_encoded_message_keeps_unicode(): void
    {
        $msg = "Eyes up — ¡vamos! 🙂 'quotes' \"too\"";
        sts_invoke('teacher.php', 'POST', ['key' => self::KEY],
            self::wrap(['action' => 'message', 'text' => $msg]));
        $this->assertSame($msg, sts_db()->query('SELECT message FROM state WHERE id=1')->fetch()['message']);
    }

    public function test_plain_json_body_still_works(): void
    {
        [$status] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY],
            ['action' => 'message', 'text' => 'plain']);
        $this->assertSame(200, $status);
    }

    public function test_garbage_z_is_an_empty_payload(): void
    {
        [$status, , $json] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY],
            json_encode(['z' => '!!!not base64!!!']));
        $this->assertSame(400, $status);
        $this->assertSame('unknown action', $json['error']);
    }

    public function test_z_alongside_other_keys_is_not_unwrapped(): void
    {
        [$status] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY],
            json_encode(['action' => 'message', 'text' => 'kept', 'z' => 'x']));
        $this->assertSame(200, $status);
        $this->assertSame('kept', sts_db()->query('SELECT message FROM state WHERE id=1')->fetch()['message']);
    }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `vendor/bin/phpunit --filter EncodedBodyTest`
Expected: tests 1 and 2 fail (400 unknown action / empty message); 3, 4, 5 pass already and pin compatibility.

- [ ] **Step 3: Implement PHP.** Replace `sts_input_json` in `public/api/_bootstrap.php` with:

```php
/**
 * Decode the JSON request body.
 *
 * Clients send {"z": base64url(JSON)} because DreamHost's mod_security reads
 * request bodies and rejects free text that resembles SQL (a spelling list
 * with "union" and "select" on adjacent lines is enough). A plain JSON body
 * is still accepted, for curl and for older cached clients.
 */
function sts_input_json(): array {
    $raw = sts_input_raw();
    if ($raw === '') return [];
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) return [];
    if (count($decoded) === 1 && isset($decoded['z']) && is_string($decoded['z'])) {
        $json  = base64_decode(strtr($decoded['z'], '-_', '+/'), true);
        $inner = $json === false ? null : json_decode($json, true);
        return is_array($inner) ? $inner : [];
    }
    return $decoded;
}
```

`base64_decode` in strict mode accepts unpadded input.

- [ ] **Step 4: Implement JS** — `public/js/api.js`

```js
// Every JSON POST goes through here. The body is wrapped as
// {"z": base64url(JSON)} so the host's request-body filter (mod_security on
// DreamHost) never sees free text. The server unwraps it in sts_input_json().
export function encodeBody(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const z = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return JSON.stringify({ z });
}

export function postJson(url, payload, headers = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: encodeBody(payload),
  });
}
```

Replace the three raw `fetch(..., { method: 'POST', ... body: JSON.stringify(x) })` calls in the game with `postJson(url, x)`: score submit and rename in `public/js/ui.js`, poll vote in `public/js/poll.js` (add `import { postJson } from './api.js';` to each).

In `public/teacher.html` change the script tag to `<script type="module" src="/teacher.js"></script>`. In `public/teacher.js` delete the `'use strict';` line, add `import { postJson } from './js/api.js';` as the first line, and in `action()` replace the `fetch(...)` call with:

```js
  const r = await postJson(`/api/teacher.php?key=${encodeURIComponent(key)}`, payload);
```

`teacher.js` calls `init()` near the top, before the `const gradeSelect = ...` declarations at the bottom of the file; `init` only registers listeners and timers, and `refreshState` (which reads `gradeSelect`) is first awaited after a fetch, so the temporal-dead-zone order is the same as today. Do not reorder the file in this task.

- [ ] **Step 5: Add an e2e check that the browser really sends the wrapped form.** Append to `tests/e2e/game-over-flow.spec.js`:

```js
test('score is posted in the encoded form', async ({ page }) => {
  await boot(page, 'Enc');
  await die(page);
  const [req] = await Promise.all([
    page.waitForRequest('**/api/score.php'),
    page.locator('#submit-score').click(),
  ]);
  const body = JSON.parse(req.postData());
  expect(Object.keys(body)).toEqual(['z']);
  await expect(page.locator('#leaderboard')).toBeVisible();
});
```

- [ ] **Step 6: Verify**

Run: `vendor/bin/phpunit` — OK.
Run: `npx playwright test` — all pass.

- [ ] **Step 7: Commit**

```bash
git add public/api/_bootstrap.php public/js/api.js public/js/ui.js public/js/poll.js public/teacher.js public/teacher.html tests/api/EncodedBodyTest.php tests/e2e/game-over-flow.spec.js
git diff --cached --name-status
git commit -m "feat: send POST bodies base64url-wrapped so the host WAF cannot reject free text"
```

---

### Task 10: Teacher panel — key handling, wrong-key gate, drafts (G1, G8)

**Files:**
- Modify: `public/api/_bootstrap.php`, `public/api/teacher.php:11-17`, `public/api/players.php:10-16`, `public/api/contributors.php:11-17`, `public/teacher.js`, `public/teacher.html`
- Create: `tests/api/TeacherAuthTest.php`, `tests/e2e/teacher-panel.spec.js`

**Interfaces:**
- Produces (PHP): `sts_require_teacher(): bool` — true when the request carries the right key; otherwise emits 403 `{error: 'forbidden'}` and returns false. Key is read from the `X-Teacher-Key` header first, then `?key=`.
- Produces (JS, `teacher.js`): `teacherFetch(path, init)` adds the header; `showGate(message)`.
- The page accepts the key as `teacher.html#key=...` (preferred: a fragment is never sent to the server or written to access logs) or `teacher.html?key=...` (existing bookmarks), stores it in `sessionStorage`, and removes it from the address bar.

- [ ] **Step 1: Write the failing PHP tests** — `tests/api/TeacherAuthTest.php`

```php
<?php
declare(strict_types=1);

namespace Spelltoslay\Tests\Api;

use PHPUnit\Framework\TestCase;

class TeacherAuthTest extends TestCase
{
    private const KEY = 'test-teacher-key-xyz';

    protected function tearDown(): void
    {
        unset($_SERVER['HTTP_X_TEACHER_KEY']);
    }

    public function test_header_key_is_accepted_on_every_teacher_endpoint(): void
    {
        $h = ['X-Teacher-Key' => self::KEY];
        [$a] = sts_invoke('teacher.php', 'POST', [], ['action' => 'resume'], $h);
        [$b] = sts_invoke('players.php', 'GET', [], null, $h);
        [$c] = sts_invoke('contributors.php', 'GET', [], null, $h);
        $this->assertSame([200, 200, 200], [$a, $b, $c]);
    }

    public function test_wrong_header_key_is_rejected_even_with_right_query_key(): void
    {
        [$status] = sts_invoke('players.php', 'GET', ['key' => self::KEY], null, ['X-Teacher-Key' => 'nope']);
        $this->assertSame(403, $status);
    }

    public function test_missing_key_is_rejected(): void
    {
        [$a] = sts_invoke('teacher.php', 'POST', [], ['action' => 'resume']);
        [$b] = sts_invoke('players.php', 'GET');
        [$c] = sts_invoke('contributors.php', 'GET');
        $this->assertSame([403, 403, 403], [$a, $b, $c]);
    }

    public function test_array_valued_key_is_rejected_not_fatal(): void
    {
        [$status] = sts_invoke('players.php', 'GET', ['key' => ['a', 'b']]);
        $this->assertSame(403, $status);
    }
}
```

`sts_invoke` merges headers into `$_SERVER` and never removes them, hence the `tearDown`.

- [ ] **Step 2: Run to verify they fail**

Run: `vendor/bin/phpunit --filter TeacherAuthTest`
Expected: test 1 fails (403s), test 2 fails (200); tests 3 and 4 pass already.

- [ ] **Step 3: Implement PHP.** Add to `public/api/_bootstrap.php`:

```php
/**
 * Gate for teacher-only endpoints. Emits the 403 itself; callers just return.
 * The key travels in the X-Teacher-Key header so it stays out of URLs, browser
 * history and access logs; ?key= is still honoured for curl and old bookmarks.
 * When the header is present it is the only thing checked.
 */
function sts_require_teacher(): bool {
    $expected = sts_config()['teacher_key'] ?? null;
    $provided = $_SERVER['HTTP_X_TEACHER_KEY'] ?? ($_GET['key'] ?? '');
    if (!$expected || !is_string($provided) || !hash_equals((string)$expected, $provided)) {
        sts_json(403, ['error' => 'forbidden']);
        return false;
    }
    return true;
}
```

In `teacher.php`, `players.php` and `contributors.php` replace the `$config ... $expected ... $provided ... if (...) { sts_json(403...); return; }` block with:

```php
if (!sts_require_teacher()) {
    return;
}
```

(`teacher.php` does not use `$config` afterwards; confirm with `grep -n '\$config' public/api/teacher.php public/api/players.php public/api/contributors.php` after the edit — no remaining uses.)

- [ ] **Step 4: Verify PHP**

Run: `vendor/bin/phpunit` — OK, including all existing `TeacherTest`/`PlayersTest`/`ContributorsTest` cases that authenticate with `?key=`.

- [ ] **Step 5: Write the failing e2e tests** — `tests/e2e/teacher-panel.spec.js`

```js
import { test, expect } from '@playwright/test';

test('the key is removed from the address bar and sent as a header', async ({ page }) => {
  const seen = [];
  page.on('request', (r) => { if (r.url().includes('/api/')) seen.push(r); });
  await page.goto('/teacher.html?key=e2e-key');
  await expect(page.locator('#control-panel')).toBeVisible();
  await expect(page).toHaveURL(/\/teacher\.html$/);
  await page.waitForResponse((r) => r.url().includes('/api/players.php') && r.status() === 200);
  for (const r of seen) expect(r.url(), r.url()).not.toContain('e2e-key');
  const players = seen.find((r) => r.url().includes('/api/players.php'));
  expect(players.headers()['x-teacher-key']).toBe('e2e-key');
});

test('the key also works from the URL fragment and survives a reload', async ({ page }) => {
  await page.goto('/teacher.html#key=e2e-key');
  await expect(page.locator('#control-panel')).toBeVisible();
  await expect(page).toHaveURL(/\/teacher\.html$/);
  await page.reload();
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
});

test('an unsent class message draft survives the refresh', async ({ page }) => {
  await page.goto('/teacher.html#key=e2e-key');
  await expect(page.locator('#control-panel')).toBeVisible();
  await page.locator('#msg-input').fill('half-written note');
  await page.locator('#poll-question-input').click();   // move focus away
  await page.waitForTimeout(4500);                      // two refresh cycles
  await expect(page.locator('#msg-input')).toHaveValue('half-written note');
  // Sending it makes it the server value; Clear then empties it.
  await page.locator('#send-msg').click();
  await page.locator('#clear-msg').click();
  await page.waitForTimeout(2500);
  await expect(page.locator('#msg-input')).toHaveValue('');
});

test('an unsent personal message draft survives the refresh', async ({ page, browser }) => {
  const student = await browser.newPage();
  await student.addInitScript(() => localStorage.setItem('sts_player_name', 'Rosa'));
  await student.goto('/');
  await page.goto('/teacher.html#key=e2e-key');
  const row = page.locator('.roster-row', { hasText: 'Rosa' });
  await expect(row).toBeVisible({ timeout: 8000 });
  await row.locator('.roster-msg').fill('draft for Rosa');
  await page.locator('#poll-question-input').click();
  await page.waitForTimeout(4500);
  await expect(row.locator('.roster-msg')).toHaveValue('draft for Rosa');
  await student.close();
});
```

- [ ] **Step 6: Run to verify they fail**

Run: `npx playwright test tests/e2e/teacher-panel.spec.js --workers=1`
Expected: all five fail (URL keeps `?key=`; fragment not read; wrong key shows panel; both drafts wiped).

- [ ] **Step 7: Implement `teacher.js` key handling.** Replace lines 3-17 (from `const url = ...` through the `if (!key) {...} else {...}` block) with:

```js
// The key arrives once in the URL (fragment preferred, ?key= for old
// bookmarks), is kept for this tab in sessionStorage, and is then removed from
// the address bar so it is not on screen when the panel is projected.
function readKeyFromUrl() {
  const url = new URL(location.href);
  const fromHash = new URLSearchParams(url.hash.replace(/^#/, '')).get('key');
  const fromQuery = url.searchParams.get('key');
  if (fromHash || fromQuery) {
    url.searchParams.delete('key');
    url.hash = '';
    history.replaceState(null, '', url.pathname + url.search);
  }
  return fromHash || fromQuery || '';
}

function storedKey() {
  try { return sessionStorage.getItem('sts_teacher_key') || ''; } catch (_) { return ''; }
}

let key = readKeyFromUrl() || storedKey();
try { if (key) sessionStorage.setItem('sts_teacher_key', key); } catch (_) { /* tab-only key */ }

const gate = document.getElementById('auth-gate');
const panel = document.getElementById('control-panel');
const errEl = document.getElementById('teacher-error');
const timers = [];

function showGate(message) {
  timers.splice(0).forEach(clearInterval);
  key = '';
  try { sessionStorage.removeItem('sts_teacher_key'); } catch (_) {}
  panel.classList.add('hidden');
  gate.classList.remove('hidden');
  if (message) document.getElementById('auth-gate-message').textContent = message;
}

// All teacher-only requests go through here so the key is a header, never a URL.
async function teacherFetch(path, init = {}) {
  const r = await fetch(path, { ...init, headers: { ...(init.headers || {}), 'X-Teacher-Key': key } });
  if (r.status === 403) showGate('That key was not accepted. Open this page again with the right key.');
  return r;
}

if (key) {
  gate.classList.add('hidden');
  panel.classList.remove('hidden');
  init();
}
```

In `public/teacher.html` replace the gate paragraph with:

```html
      <p id="auth-gate-message">Open this page with <code>#key=&lt;your-teacher-key&gt;</code> at the end of the address.</p>
```

In `action()` replace the request with:

```js
  const r = await postJson('/api/teacher.php', payload, { 'X-Teacher-Key': key });
  if (r.status === 403) showGate('That key was not accepted. Open this page again with the right key.');
```

In `refreshRoster` and `refreshContributors` replace the `fetch(\`/api/....php?key=${encodeURIComponent(key)}\`, { cache: 'no-store' })` calls with `teacherFetch('/api/players.php', { cache: 'no-store' })` and `teacherFetch('/api/contributors.php', { cache: 'no-store' })`.

In `init()` wrap the four `setInterval(...)` calls as `timers.push(setInterval(refreshState, 2000), setInterval(refreshLeaderboard, 5000), setInterval(refreshRoster, 2000), setInterval(refreshContributors, 30000));`.

`const timers = []` is declared before `init()` is called, so `showGate` can run from the very first response.

- [ ] **Step 8: Implement draft preservation.** Add to `teacher.js` above `refreshState`:

```js
// Mirror a server value into an input without destroying what the teacher is
// typing. The input is overwritten only while it still shows the last value we
// put there (i.e. the teacher has not edited it) and is not focused.
function syncInput(input, serverValue) {
  const untouched = input.value === (input.dataset.synced ?? '');
  if (untouched && document.activeElement !== input) input.value = serverValue;
  if (untouched || input.value === serverValue) input.dataset.synced = serverValue;
}
```

In `refreshState` replace the three-line `msg-input` block with `syncInput(document.getElementById('msg-input'), s.message || '');`. In `updateRosterRow` replace the "Personal message" block with `syncInput(row.querySelector('.roster-msg'), player.personalMessage || '');`.

So that Send/Clear hand the field back to the server value: in `sendMsg` after the `await action(...)` add `document.getElementById('msg-input').dataset.synced = v;`; in the `clear-msg` handler after setting `.value = ''` add `document.getElementById('msg-input').dataset.synced = '';`; in the roster `.send-personal` handler after the `await` add `div.querySelector('.roster-msg').dataset.synced = text;`; in `.clear-personal` after setting `.value = ''` add `div.querySelector('.roster-msg').dataset.synced = '';`.

Trace of the first refresh on a fresh page, to confirm `syncInput` is right: `value ''`, `synced` unset → `untouched` true → value becomes server value, `synced` = server value. Teacher types: `value !== synced` → never overwritten. Teacher sends: `synced = v`, next refresh server returns `v` → `untouched` true → stays `v`.

- [ ] **Step 9: Update the e2e helper** so tests exercise the header path. In `tests/e2e/helpers.js` change `teacher()` to:

```js
export async function teacher(request, payload) {
  const r = await request.post('/api/teacher.php', {
    data: payload, headers: { 'X-Teacher-Key': 'e2e-key' },
  });
  if (!r.ok()) throw new Error(`teacher action failed: ${r.status()}`);
  return r.json();
}
```

- [ ] **Step 10: Verify**

Run: `vendor/bin/phpunit` — OK.
Run: `npx playwright test` — all pass.

- [ ] **Step 11: Commit**

```bash
git add public/api/_bootstrap.php public/api/teacher.php public/api/players.php public/api/contributors.php public/teacher.js public/teacher.html tests/api/TeacherAuthTest.php tests/e2e/teacher-panel.spec.js tests/e2e/helpers.js
git diff --cached --name-status
git commit -m "feat: teacher key as a header and out of the URL; gate on a wrong key; keep drafts"
```

---

### Task 11: Docs, changelog, final verification

**Files:**
- Modify: `CHANGELOG.md`, `CLAUDE.md`, `README.md`, `docs/orientation.md`

- [ ] **Step 1: Find stale references.** Run:

```bash
grep -rn "game\.js\|?key=\|window\.state\|_gameOverHook" README.md CLAUDE.md docs/orientation.md public/words/README.md
```

For each hit in `README.md`, `CLAUDE.md` and `docs/orientation.md` (not `docs/superpowers/` or `docs/reference/`, which are historical records): update `public/game.js` → the right `public/js/*.js` module; teacher URL examples → `teacher.html#key=<key>`. In `CLAUDE.md` "What might surprise you": the `isTyping` bullet now points at `public/js/typing.js`; add three bullets, each stating only what the code does:

- POST bodies are sent as `{"z": base64url(JSON)}` (`public/js/api.js`, unwrapped in `sts_input_json()`), because DreamHost's mod_security rejects SQL-looking free text.
- `window.state` and the other test hooks exist only when the hostname is `localhost` (`public/js/main.js`).
- `public/api/score.php` cross-checks score/wave/kills/duration against constants mirrored from `public/js/constants.js`; raising a `pointMultiplier` above 4 or changing `WAVE_DURATION_S` needs the server bound changed too.

- [ ] **Step 2: Update `CHANGELOG.md`** under `## [Unreleased]`, appending to the existing `### Fixed`, `### Added`, `### Changed` lists:

Fixed:
- "Force everyone to reload" reloaded each tab continuously for 10 seconds; it now reloads once.
- Score could only be submitted once per page load; the button stayed disabled on later games.
- When the enemy being typed reached the hero, the half-typed letters stayed in the buffer and every following key counted as a typo.
- Two enemies carrying the same word could not be slain by typing the word; the closest one is now slain. The spawner also avoids words already on screen.
- Green "typed" letters stayed on an enemy after Backspace.
- "Change name" on the game-over screen did nothing.
- A profane name was accepted at name entry and shown on the teacher roster, then rejected at score submit with no way out.
- Word labels were cut off near the arena walls and could cover each other.
- Smaller: red input style persisting into the next game, rejected poll votes shown as accepted, stray bullet in the message bar, wrong teacher key showing an empty panel, teacher message drafts wiped by the 2-second refresh.

Added:
- "Play again without submitting" on the game-over screen.
- Teacher message now shows in the bar under the arena instead of 11px text over the HUD.
- Server cross-checks submitted scores against kills, wave and duration.
- Teacher key is sent as an `X-Teacher-Key` header and removed from the address bar; `teacher.html#key=…` is the preferred link form (`?key=` still works).
- POST bodies are base64url-wrapped so the host's request filter cannot reject free text.

Changed:
- `public/game.js` split into ES modules under `public/js/`; game internals are no longer global outside localhost.
- Profanity filter: whole-word matching for mild words (no more false hits on names like "Dickens"), longer list, digit-swap normalisation.
- E2E tests run against a temporary database and no longer write `config/config.php`.
- Leaderboard heading "Today" renamed "Last 24 hours" to match the query.

- [ ] **Step 3: Full verification (verification-before-completion).**

```bash
vendor/bin/phpunit 2>&1 | grep -E "^(OK|FAILURES|ERRORS|Tests:)"
npx playwright test 2>&1 | grep -v WebServer | tail -5
git status --short
```

Expected: `OK (...)`; `N passed` with 0 failed and 0 flaky; status shows only the files staged for this commit (an untracked `excalidraw.log` in the repo root predates this work and is not ours to add or delete).

- [ ] **Step 4: Fresh-clone check** (a green suite in this checkout does not prove a clone works):

```bash
tmp=$(mktemp -d) && git clone -q . "$tmp/clone" && cd "$tmp/clone" && git checkout -q fix/audit-oct-2026 \
  && composer install -q && npm ci -q && vendor/bin/phpunit 2>&1 | grep -E "^(OK|FAILURES|ERRORS)" \
  && npx playwright test 2>&1 | grep -v WebServer | tail -3; cd - >/dev/null
```

Expected: OK and all e2e passed with no `config/config.php` and no `data/` directory present in the clone.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md CLAUDE.md README.md docs/orientation.md
git diff --cached --name-status
git commit -m "docs: changelog and project notes for the October audit fixes"
```

- [ ] **Step 6: Hand back to Dave.** Do not merge, push or deploy. Report: test counts, the screenshot from Task 7 Step 10, and the checks below that only the real host can answer.

## After deploy — checks no local test can make

These are for whoever deploys (Dave's call), against `https://spelltoslay.lockersoft.games`:

1. **Header reaches PHP.** `curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Teacher-Key: <key>' https://spelltoslay.lockersoft.games/api/players.php` must print `200`. If DreamHost's Apache drops the header (403), the panel will show the gate for a correct key; the server still accepts `?key=`, so the fallback is a one-line change in `teacherFetch`/`action` to append it.
2. **mod_security passes the wrapped body.** In the teacher panel paste a list containing `union`, `select`, `drop`, `table` on adjacent lines and click "Use this list"; the active source must switch to "teacher list" with no error.
3. **Module scripts are served uncached.** `curl -sI https://spelltoslay.lockersoft.games/js/main.js | grep -i cache-control` must show `no-store` (the `.htaccess` `FilesMatch` covers `.js` in subdirectories; confirm on the real host).
4. **Old tabs.** A tab loaded before the deploy still runs the old `game.js` from memory and will loop on the first force-reload after deploy until it lands on the new code (one reload). Expected once; not a regression.

---

## Amendments from the Codex adversarial review (2026-10-07)

Codex reviewed this plan statically (read-only sandbox; it ran no tests). Its findings and what was decided. **Where an amendment conflicts with a snippet above, the amendment wins.**

| # | Finding | Decision |
|---|---------|----------|
| 1 | Task 8: `render()` calls `refreshLock()`, which the module map left private to `typing.js` — a ReferenceError that would stop the frame loop | **Accepted.** `typing.js` exports `refreshLock`; `render.js` imports it. The off-localhost gameplay test must type a real word and see the frame loop still running (score in the HUD is canvas-only, so assert through `#type-input` being cleared after a slay of the pushed word, see amendment 10b). |
| 2 | Task 10: `browser.newPage()` has no `baseURL`, so `student.goto('/')` fails | **Accepted.** Create the student with `browser.newContext({ baseURL })` (take `baseURL` from the test fixture) and close the context in `finally`. |
| 3 | Task 3: Skip stays enabled while a submit is in flight; the old callback then shows the leaderboard over a new game | **Accepted.** Disable both `#submit-score` and `#skip-submit` while the request is pending; `showGameOver()` re-enables both; the submit callback also bails out if the run was reset (`state.gameOver` no longer true). Test: delay `score.php` with `page.route`, assert Skip is disabled meanwhile. |
| 4 | Task 1: the red run of `EnvOverrideTest` initialises the developer's real database | **Accepted.** The init test runs a copy of `scripts/init_db.php` placed in a temp directory (`<tmp>/scripts/init_db.php`), so the pre-fix default path (`<tmp>/data/`) is also temporary. |
| 5 | Task 5: any non-400 failure of `rename.php` is treated as a successful save in change mode, then the next poll reverts it | **Accepted.** In `'change'` mode a save needs `r.ok`; otherwise show "Could not save the name. Try again." and keep the old one. `'first'` mode keeps the lenient path (only a 400 blocks). The Save and Cancel buttons are disabled while the request is pending. |
| 6 | Task 5: a profane name already stored (localStorage and/or presence) still plays under that name | **Accepted.** `state.php` clears a stored presence name that fails `sts_name_error()` and returns `nameRejected: true` when the `name` param it was sent fails the rule; the client then forgets its saved name, stops the run and opens the first-name modal. PHPUnit test for both server behaviours; e2e test with localStorage preseeded with `shithead`. |
| 7 | Task 4: duplicate avoidance gives up after the difficulty bucket even when the wider pool has unused words | **Accepted.** Order: fresh words in the bucket, then fresh words in the whole pool, then (only if every pool word is live) any word from the bucket. A teacher-pushed word deliberately bypasses the rule. Extra test with pool `['cat','dog','sun','elephant']`. |
| 8 | Task 10: `syncInput()` advances its baseline while the field is focused, after which an untouched field never syncs again | **Accepted.** Replacement: `const synced = input.dataset.synced ?? ''; if (input.value === serverValue) { input.dataset.synced = serverValue; return; } if (input.value === synced && document.activeElement !== input) { input.value = serverValue; input.dataset.synced = serverValue; }` Extra test: focus the field before the first refresh, blur, and see a later server message appear. |
| 9 | Task 10: draft tests open the panel with `#key=`, which today's code cannot read, so they fail for the wrong reason; Send then Clear is raced | **Accepted.** Draft tests authenticate with `?key=e2e-key`, wait on `state.php`/`players.php` responses instead of fixed sleeps where they can, and wait for the Send response before clicking Clear. |
| 10 | Review Focus promised a paused name change and a real 32-letter/40px render, neither is tested | **Accepted.** (a) e2e: teacher pauses the class, student changes name from game over, name is saved and the game is still paused/not running. (b) `render()` records the rectangles it drew in `state.labelRects`; e2e sets `wordFontSize = 40`, seeds a 32-letter word at x=20 and x=940, and asserts no page error and every rect inside the arena or centred. |
| 11 | Task 2: two broadcasts in the same second share a `forceReloadAt`, so the second is ignored | **Rejected, documented.** Two reload broadcasts inside one second are a double-click; collapsing them is the wanted behaviour. A sequence column would add a schema migration to a project whose quick-deploy path (SSH + git pull) can skip `init_db.php`, turning a nicety into a risk of 500s on every poll. |
| 12 | Task 8: falling back to `php -S 0.0.0.0` exposes the test server and its known key on the network | **Accepted.** Never bind beyond loopback. Probe which loopback address the existing `localhost` binding answers on; if the non-`localhost` hostname is unreachable, start a second loopback-only server in the config rather than widening the first. |
| 13 | Task 11: `phpunit \| grep` and `playwright \| tail` hide the runners' exit codes | **Accepted.** Run each suite unpiped (or redirect to a file and check `$?`), in the main checkout and in the fresh clone. |
| 14 | Task 9: the decoder accepts a wrapped JSON array though the contract says object | **Accepted.** Unwrap only when the decoded text starts with `{`. Test with wrapped `["x"]`. |
| 15 | After-deploy note 4: an old tab reloads twice, not once, on the first broadcast after deploy | **Accepted.** Wording corrected here: expect up to two reloads per old tab, once. |
