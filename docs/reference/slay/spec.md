# SLAY — Browser Game Design Spec

**Date:** 2026-05-06
**Author:** Dave Jones (with Claude)
**Status:** Approved for implementation planning
**Domain:** slay.lockersoft.games

---

## 1. Purpose

SLAY is a browser-based top-down arena combat game built for an in-class "AI vibe coding" exercise with 10–14 year olds. Each student suggests a feature; the teacher (Dave) implements it via AI assistance and deploys to production immediately. The class plays the live game and watches it grow feature-by-feature in real time.

The baseline shipped on day one is intentionally minimal so that students have abundant room to suggest enhancements. The architecture optimizes for: (a) trivial deploys (seconds), (b) AI-friendly code edits (one-file engine, registry-based extension points), (c) classroom flow control (a teacher panel that can pause everyone's game).

## 2. Genre and Gameplay

**Genre:** Top-down arena (Vampire Survivors style, auto-attack).

**Core loop:**
- Player controls a hero in a fixed-size arena using WASD/arrow keys.
- Hero auto-attacks the nearest enemy on a fixed cooldown — the player only controls movement.
- Enemies spawn in waves; spawn rate and difficulty ramp with elapsed time.
- Enemies walk toward the hero and deal contact damage.
- Run ends when the hero's HP reaches zero.
- On death, player enters a name and submits to a class leaderboard.

**Why this genre:** every "add a new weapon / enemy / powerup" student suggestion fits the same shape — a record appended to a registry. The engine never changes. Auto-attack also removes mouse-aim, making the game work on any school keyboard device (Chromebooks, iPads with keyboards).

## 3. Visual Style

**Emoji-based.** Every character, enemy, weapon, projectile, and powerup is rendered as a Unicode emoji via `ctx.fillText` on an HTML5 Canvas. No sprite sheets, no image assets, no asset pipeline.

Day-one casting:
- Hero: 🛡️
- Starter weapon: ⚔️ (thrown sword)
- Starter enemy: 👻 (ghost)

This choice exists primarily to remove the asset bottleneck from student feature additions. "Add a banana boss" 🍌 is a one-character code change.

## 4. System Architecture

```
slay.lockersoft.games  (single VPS, deployed via Deployer)

  /                          /api/*  (PHP)              data/slay.db
  ┌──────────────┐  HTTP    ┌─────────────────────┐    ┌──────────┐
  │ Static SPA   │ ◀─────▶  │ state.php           │    │ scores   │
  │ index.html   │          │ score.php           │ ─▶ │ state    │
  │ game.js      │          │ leaderboard.php     │    │ presence │
  │ teacher.html │          │ teacher.php (auth)  │    │ (SQLite) │
  └──────────────┘          │ health.php          │    └──────────┘
                            └─────────────────────┘
```

**Frontend:** Single static page, no build step, no bundler, no npm. Vanilla JS + HTML5 Canvas. Browser fetches `.js` files directly. A student-feature deploy is "edit one JS file, `dep deploy`, refresh."

**Backend:** Five small PHP files in `/api/`. SQLite (single file, no MySQL/Postgres). PHP-FPM behind nginx is the assumed runtime; Apache + mod_php would also work without code changes.

**Realtime mechanism:** clients poll `GET /api/state.php` every 2 seconds for `{paused, message, version, forceReload, playerCount}`. Server returns ETag based on `version` so unchanged polls return `304 Not Modified`. No WebSockets, no SSE.

**Hosting trade-off:** single VPS, no redundancy. If the VPS is down, the game is down. Acceptable for a single-classroom use case.

**Deployment trade-off (explicit, by user request):** **No staging environment.** All deploys go straight to production during class. Mitigation: rollback is a 1-second symlink swap (`dep rollback`); the SQLite DB lives in `shared/data/` and is never touched by deploys, so rollback never loses scores or state. We rely on quick local smoke tests before each push.

## 5. Frontend Game Engine

A single file `public/game.js` (~600 lines) with a flat, predictable structure. The shape is deliberately AI-friendly: extension points are arrays at the top of the file.

```
constants & tuning
registries:        WEAPONS[], ENEMIES[], POWERUPS[]   ← students add here
state:             hero, projectiles, enemies, particles, score, hp, gameOver
behaviors:         { thrown, orbit, aura, beam, ... } ← functions for weapon types
systems (per frame):
  updateInput, updateHero, updateWeapons, updateProjectiles,
  updateEnemies, updateSpawner, updateParticles
render:            render(ctx), renderHUD(ctx)
networking:        pollServerState, submitScore, loadLeaderboard
main loop:         requestAnimationFrame tick with fixed dt cap
```

**Key design choices:**

- **Emoji as sprites** — `ctx.font = '32px serif'; ctx.fillText(entity.emoji, x, y)` with a subtle drop shadow for legibility.
- **Registries over classes** — weapons, enemies, powerups are plain JS objects in arrays. The engine reads the registry; it doesn't know how many weapons exist. To add a weapon: append a record.
- **Named behaviors** — a weapon has `behavior: 'thrown' | 'orbit' | 'aura' | 'beam'`. Each behavior is one function in a `behaviors` map. New weapons reuse existing behaviors when possible; novel mechanics add a new behavior entry.
- **Pause is a single boolean** — when `state.paused === true`, systems early-return (no movement, no spawns, no cooldowns). Render still runs so the overlay is visible. The teacher's flag from `/api/state.php` flips this.
- **No physics engine** — circle-circle distance checks for collision, AABB for arena bounds. That's the entire physics layer.
- **Deterministic-ish tick** — `requestAnimationFrame` for render; logic uses fixed `dt` capped at 1/30s so a backgrounded tab doesn't dump catch-up frames on resume.

**Day-one baseline (what's in the engine before any student adds anything):**

- One arena (fixed size, walls bound the hero).
- One hero (🛡️), WASD/arrow keys to move.
- One weapon (a thrown sword), auto-fires at the nearest enemy on a fixed cooldown.
- One enemy type (👻 ghosts) that spawns in waves and chases the hero.
- HP bar. Contact with an enemy deals damage. HP = 0 → game-over.
- Wave ramp: spawn rate and enemy count grow with elapsed time.
- Score = (enemies slain × point value) + (seconds survived).
- Game-over screen: enter name → submit to leaderboard → see your rank.
- Leaderboard view: top 20 all-time + top 10 today.

**Explicitly left for student additions:**

Additional weapons, additional enemy types, powerups/pickups, XP gems and level-up screens, sound effects and music, cosmetic heroes, multiple levels or biomes, dash/special abilities, bosses — and anything else they invent.

## 6. Backend API

Four functional endpoints + one health endpoint, all JSON, all in `/api/`. No framework — each `.php` file is self-contained, opens SQLite via PDO, does its thing.

### `GET /api/state.php`

Polled every 2 seconds by every game client.

Response:
```json
{
  "paused": false,
  "message": "",
  "version": 47,
  "forceReload": false,
  "playerCount": 23
}
```

- `version` increments on every state change. Client compares against last-seen version.
- Sends `ETag: "47"` and respects `If-None-Match` → returns `304 Not Modified` when nothing changed.
- Side effect: writes a row to `presence` (client UUID + `last_seen = now()`). Rows older than 10s are considered offline; `playerCount` is `COUNT(*)` of fresh rows.
- Client UUIDs are generated client-side and persisted in `localStorage`.

### `POST /api/score.php`

Submitted at game-over.

Request:
```json
{ "name": "Dave", "score": 423, "wave": 7, "duration": 184 }
```

Response:
```json
{ "rank": 12, "topScore": 891 }
```

Validation:
- `name` ≤ 16 chars, alphanumeric + spaces, profanity-checked against a small wordlist.
- `score`, `wave`, `duration` are non-negative integers within plausible ranges.
- Rate limit: 1 submission per 10 seconds per IP (sufficient anti-spam for a classroom).

### `GET /api/leaderboard.php`

Response:
```json
{
  "allTime": [{"name":"Ava","score":891,"wave":12,"submittedAt":"2026-05-06T14:01:33Z"}, ...],
  "today":   [...]
}
```

`allTime` is top 20. `today` is top 10 from the last 24 hours. Both ordered by score descending.

### `POST /api/teacher.php?key=<secret>`

Single endpoint, dispatches on `action`.

Requests:
```json
{ "action": "pause" }
{ "action": "resume" }
{ "action": "message", "text": "Look at the new fireball!" }
{ "action": "broadcastReload" }
{ "action": "clearLeaderboard" }
```

- `key` is a long random string in `config/config.php` (in `shared/` on server, never in git). Bad/missing key → `403`.
- Each action bumps `state.version` so clients see the change within ~2s on next poll.
- `forceReload` flag auto-clears after 10 seconds (so latecomers don't get reload-looped).
- `clearLeaderboard` requires `confirm: true` in the request body to prevent accidental fires.

### `GET /api/health.php`

Returns `{"ok":true,"db":"ok","version":"<git-sha>"}`. Used for post-deploy verification (per CLAUDE.md "always verify the health endpoint after deploy"). No auth.

### Error contract (all endpoints)

JSON body with HTTP status:
- `400` for validation failures: `{"error":"name too long"}`
- `403` for bad teacher key
- `429` for score-submit rate limit
- `500` for unexpected errors (logged to PHP error log; client shows a generic "couldn't reach server" toast)

### Database schema (SQLite)

```sql
CREATE TABLE scores (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  wave INTEGER NOT NULL,
  duration INTEGER NOT NULL,
  ip TEXT,
  submitted_at INTEGER NOT NULL  -- unix timestamp
);
CREATE INDEX idx_scores_score ON scores(score DESC);
CREATE INDEX idx_scores_recent ON scores(submitted_at DESC);

CREATE TABLE state (
  id INTEGER PRIMARY KEY CHECK (id = 1),  -- single-row table
  paused INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  force_reload INTEGER NOT NULL DEFAULT 0,
  force_reload_set_at INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 0
);
INSERT INTO state (id) VALUES (1);

CREATE TABLE presence (
  client_id TEXT PRIMARY KEY,  -- UUID generated client-side, in localStorage
  last_seen INTEGER NOT NULL
);
CREATE INDEX idx_presence_seen ON presence(last_seen);
```

## 7. Teacher Control Panel

A separate static page at `public/teacher.html`. No SPA framework, just one HTML page with a small JS file.

**Access:** Loaded with `?key=<secret>` in the URL. The page reads the key into `sessionStorage` (clears on tab close — not `localStorage`) and includes it on every action request. With no key, the page shows "Access required" and nothing else.

**Layout:**

- Header: "SLAY — Teacher Control" + live player count (●N players).
- Big primary button: **PAUSE EVERYONE** (red) / **RESUME EVERYONE** (green when paused). State is pulled from `/api/state.php` so multiple teacher tabs stay synced.
- Message field with Send button. Pressing Enter sends. A "Clear" button next to the field sends an empty message.
- Action row:
  - **🔄 Force everyone to reload** — pushes `forceReload=true`.
  - **🗑 Clear leaderboard** — confirm dialog before fire.
- Live top-5 of the leaderboard, refreshes every 5 seconds.

**Player-side pause overlay** (what students see when paused):

Full-screen translucent dark overlay. Centered: "⏸ PAUSED BY TEACHER" plus the optional message. Inputs ignored, animations frozen. On resume, overlay fades and play continues from exactly where it was — enemy positions, projectiles in flight, HP, all preserved.

## 8. Project Layout

```
slay/
├── public/                       # web root (nginx DocumentRoot)
│   ├── index.html
│   ├── teacher.html
│   ├── style.css
│   ├── game.js                   # the engine — students extend this
│   ├── teacher.js
│   └── api/
│       ├── _bootstrap.php        # shared: open DB, helpers, JSON response
│       ├── state.php
│       ├── score.php
│       ├── leaderboard.php
│       ├── teacher.php
│       └── health.php
│
├── data/                         # gitignored; lives in shared/ on server
│   └── slay.db                   # SQLite, persists across deploys
│
├── config/
│   ├── config.example.php        # in git; placeholder TEACHER_KEY
│   └── config.php                # NOT in git; lives in shared/ on server
│
├── scripts/
│   └── init_db.php               # idempotent schema init (CREATE IF NOT EXISTS)
│
├── deploy.php                    # Deployer recipe
├── .gitignore
├── CHANGELOG.md
├── README.md
└── docs/
    └── superpowers/specs/2026-05-06-slay-game-design.md
```

## 9. Deployment

**Tool:** Deployer (consistent with Dave's other PHP projects per global CLAUDE.md).

**Deployer recipe outline (`deploy.php`):**

```php
namespace Deployer;
require 'recipe/common.php';

set('repository', 'git@github.com:lockersoft/slay.git');
set('keep_releases', 5);
set('shared_files', ['config/config.php']);
set('shared_dirs',  ['data']);
set('writable_dirs', ['data']);

host('slay.lockersoft.games')
    ->set('deploy_path', '/var/www/slay')
    ->set('remote_user', 'deploy');

task('deploy:init_db', function () {
    run('cd {{release_path}} && php scripts/init_db.php');
});

task('deploy', [
    'deploy:prepare',
    'deploy:vendors',          // no-op for now (no composer deps)
    'deploy:init_db',          // idempotent CREATE TABLE IF NOT EXISTS
    'deploy:publish',
]);

after('deploy:failed', 'deploy:unlock');
```

**Key points:**

- `dep deploy` from laptop → ~5 seconds end-to-end (git fetch on server + symlink swap).
- No build step, no asset pipeline, no docker, no migrations beyond idempotent `init_db.php`.
- SQLite DB is in `shared/data/`, symlinked into each release. Deploys never touch scores or paused state.
- Atomic rollback via `dep rollback` (~1s symlink swap). DB unaffected.
- `public/` is the web root. Nothing above it (config, db, deploy scripts) is web-accessible.

**Initial server setup (one-time, captured in `README.md`):**

1. nginx + PHP-FPM 8.x.
2. nginx vhost: `slay.lockersoft.games` → `/var/www/slay/current/public`.
3. SSL via Let's Encrypt / certbot.
4. `apt install php-sqlite3`.
5. `deploy` user with SSH key, write access to `/var/www/slay`.
6. First `dep deploy` creates the directory structure; copy `config/config.example.php` → `shared/config/config.php` on the server and edit `TEACHER_KEY`.

**Daily classroom workflow:**

1. Student suggests a feature.
2. Dave prompts AI: "add a fire-burst-on-death behavior to the dragon enemy."
3. AI edits `public/game.js`, adds 8 lines.
4. `git commit -am "feat: dragons explode in fire (idea by Maya)" && dep deploy`.
5. Teacher panel: click **Force everyone to reload**.
6. All 23 browsers reload, class keeps playing with the new feature.
7. Total: ~60 seconds idea-to-live.

**No staging.** Trade-off accepted by user. Mitigation: 1-second rollback, DB in shared volume (rollback never loses data), and a 30-second pre-deploy local smoke test.

**CHANGELOG.md** updated with each deploy. Per CLAUDE.md — and useful for crediting student ideas. Each entry: one line, with the student's first name credited.

## 10. Testing & Verification

Light-touch, classroom-pragmatic. Just enough to catch obvious breakage before pushing.

**Local smoke test (before every deploy):**

1. Run `php -S localhost:8000 -t public` to serve the game locally.
2. Open in browser, play 30 seconds: hero moves, weapon fires, enemies spawn, dying triggers game-over, score submits.
3. Catches the great majority of "I just typoed and broke the loop."

**Automated tests (limited, only where the cost-benefit is clear):**

- **API tests (PHPUnit, ~10 tests).** Each endpoint with valid + invalid input. Validates status codes, response shapes, DB writes. Backend is hardest to "see is broken" so it gets the most discipline.
- **One Playwright happy-path test.** Boots local PHP server, opens the game, scripts a few seconds of input, asserts game-over flow submits a score and the leaderboard renders it. Run before deploys that touch engine internals (skip for trivial emoji tweaks).
- **No unit tests on `game.js` v1.** The engine is small, hand-edited every class period, and a test like "the sword does 25 damage" rots immediately when a student says "make swords stronger." Smoke testing covers it.

**Production verification (after every deploy):**

1. Open `slay.lockersoft.games`, play 10 seconds, complete one game-over flow.
2. `curl https://slay.lockersoft.games/api/health.php` → expect `{"ok":true,...}`.
3. If anything looks off → `dep rollback`. Don't debug in front of 23 students.

**Logging:**

- PHP errors → standard PHP error log on the VPS.
- Client errors → swallowed silently in v1. Add `/api/log.php` later only if a baffling intermittent issue forces it.

**Out of scope (deliberate non-goals):**

- Game balance and weapon feel — subjective and constantly tuned by student suggestions.
- Pixel-perfect visual rendering — emoji, will look fine.
- Cross-browser perfection beyond modern Chrome/Edge/Firefox/Safari. (No IE, no ancient Android browsers.)
- Authoritative server-side game logic / anti-cheat. Scores are client-submitted; rate-limit + plausibility check is the only enforcement. This is a classroom, not a leaderboard with stakes.

## 11. Open Questions / Risks

- **Profanity wordlist.** Need a small starter list for name-validation. Not researched yet — will assemble during implementation.
- **Player-count race conditions.** Two clients polling at the same instant could each see a count off by one. Tolerable; not worth synchronizing.
- **Browser tab focus loss.** Pause-overlay covers all input regardless of focus. Resumed games correctly preserve state via the fixed-dt cap. Untested at this point but a known concern.
- **HTTPS for development.** Local PHP dev server is HTTP only. Game over → score submit will need to go to the local server, fine. No need for local HTTPS.
- **Initial SSH/Deployer credentials.** The first `dep deploy` requires SSH access to the VPS to be already configured. Not in scope for this design but should be noted in README.

## 12. Out of Scope for v1

Explicitly NOT in v1; saved for student additions or future iterations:

- Multiple weapons, enemies, powerups beyond the starter set.
- XP gems and Vampire-Survivors-style level-up choice screens.
- Sound effects, music, audio toggles.
- Multiple selectable heroes / cosmetics.
- Multiple levels, biomes, or rooms.
- Dash, special abilities, blocking, dodging.
- Boss enemies.
- Mobile touch controls. (Keyboard-only is fine for the classroom.)
- Account system, persistent profiles.
- Real-time multiplayer / shared world.
- Replay system, recording, sharing.

The whole point: leave room for kids to add things.
