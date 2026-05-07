# SpellToSlay — Browser Game Design Spec

**Date:** 2026-05-06
**Author:** Dave Jones (with Claude)
**Status:** Approved for implementation planning
**Domain:** spelltoslay.lockersoft.games
**Parent project:** SLAY (slay.lockersoft.games)

---

## 1. Purpose

SpellToSlay is a browser-based spelling and typing game built for an in-class "AI vibe coding" exercise with 10–14 year olds. It is a fork-by-copy of the SLAY arena combat game; the infrastructure layer (PHP+SQLite backend, polling, teacher panel, deploy pipeline) is reused unchanged, while the gameplay layer is replaced.

The mechanic: enemies walk toward a stationary hero, each carrying a word. The player types the word's prefix to lock onto an enemy, then types the rest letter-by-letter to slay it. Long words = mechanically tougher enemies. Misspellings cost HP; survival depends on typing the words on screen correctly under time pressure.

The classroom hook is the same as SLAY's — students suggest features, the teacher implements them via AI assistance and deploys mid-class. The added killer feature for SpellToSlay specifically: the teacher can paste this week's spelling words into the teacher panel and have them become the live word pool for the class within two seconds.

## 2. Genre and gameplay

**Genre:** Spell-to-slay arena. Stationary hero, words-on-enemies, prefix-lock typing, letter-by-letter damage.

**Core loop:**
- Player loads the page, enters a name, sees a fixed-size canvas arena with a single hero (🛡️) at the bottom.
- Enemies spawn from the top edge in waves and walk toward the hero. Each enemy carries a visible word drawn from the current word pool.
- Player starts typing → the enemy whose word begins with those letters becomes locked (highlighted with a blue ring). One enemy locks at a time; among enemies whose word matches the typed prefix, the one closest to the hero (smallest distance, in pixels) wins.
- Each correct keystroke does 1 damage to the locked enemy and reveals the next letter as green. Word complete = enemy slain. After a kill, the next prefix typed picks the next target.
- A wrong letter shows red, stalls progress, and costs a small HP nick. Player presses Backspace to retry from the last correct letter.
- Enemies that reach the hero deal contact damage. HP=0 → game over → name entry → score submit → leaderboard.

**Why this shape:** typing is the entire input language, so it works on any keyboard device. The "students add a new enemy" loop that worked in SLAY transfers directly — a new enemy is `{ emoji, difficultyClass, speed, contactDamage, pointMultiplier }` appended to a registry. The word pool is independent of the registry, so adding monsters and adding words are separate axes of extension.

**Key feel decisions:**
- **Stationary hero, no movement keys.** WASD does nothing. Typing IS the gameplay. Movement would conflict with typing on the same keyboard.
- **Prefix lock-on, not auto-target.** The player chooses which enemy to kill first by leading with its first letter. This is strategic — kill the closest one to relieve pressure, or kill the easy one to clear a slot.
- **Backspace allowed with small HP penalty per typo.** Spelling matters mechanically (typos cost HP), but a slip isn't catastrophic. Forgiving enough to flow; punishes carelessness.

## 3. Visual style

Emoji-based, identical philosophy to SLAY. Every entity (hero, enemy, projectile, effect) is rendered as a Unicode emoji via `ctx.fillText` on an HTML5 Canvas. No sprite sheets, no asset pipeline.

Day-one casting (intentionally minimal — three enemies, one per difficulty class):
- Hero: 🛡️
- Easy enemy: 👻 ghost
- Medium enemy: 🐲 dragon
- Hard / boss enemy: 🍌 banana boss

Adding a new enemy (e.g. 🐍 snake, 🦴 bones, 🐉 hydra) is a one-record code change to the registry. Day-one keeps the cast small so students have abundant room to suggest additions.

## 4. System architecture

```
spelltoslay.lockersoft.games  (DreamHost shared, deployed via git pull or Deployer)

  /                          /api/*  (PHP)              data/spelltoslay.db
  ┌──────────────┐  HTTP    ┌─────────────────────┐    ┌───────────────────┐
  │ Static SPA   │ ◀─────▶  │ state.php           │    │ scores            │
  │ index.html   │          │ score.php           │    │ state             │
  │ game.js      │          │ leaderboard.php     │ ─▶ │ presence          │
  │ teacher.html │          │ teacher.php (auth)  │    │ poll_responses    │
  │ teacher.js   │          │ players.php         │    │ teacher_word_list │
  │ words/*.json │          │ rename.php          │    │ (SQLite)          │
  └──────────────┘          │ poll-vote.php       │    └───────────────────┘
                            │ contributors.php    │
                            │ words.php  (NEW)    │
                            │ health.php          │
                            └─────────────────────┘
```

**Frontend:** Single static page, no build step, no bundler, no npm. Vanilla JS + HTML5 Canvas + a focused `<input>` element for capturing keystrokes. Browser fetches `.js` files directly. Word lists are JSON files served as static assets from `public/words/grade-*.json`.

**Backend:** Self-contained PHP files in `public/api/`. SQLite (single file). Each endpoint opens its own PDO connection via `_bootstrap.php` and returns JSON. No framework.

**Realtime mechanism:** clients poll `GET /api/state.php` every 2 seconds, identical cadence to SLAY. The state response now includes a `wordListVersion` field — when it changes, the client refetches `/api/words.php` to pick up a new pool. Polling stays at 2s; word pools are not on the polling hot path.

**Hosting:** DreamHost shared at `lockersoft.games`, SSH user `lockersoft`. The repo is cloned to `~/spelltoslay-app/`; the public directory `~/spelltoslay.lockersoft.games/` is symlinked to `~/spelltoslay-app/public/`. No nginx config, no certbot — DreamHost manages SSL and PHP-FPM.

**Deployment trade-off (inherited from SLAY):** No staging environment. All deploys go straight to production during class. Mitigation: rollback is a `git reset --hard <prev>` plus refresh; the SQLite DB lives outside the deploy path, so rolling back never loses scores.

## 5. Frontend game engine

A single file `public/game.js` (~700 lines, similar shape to SLAY's `game.js`).

```
constants & tuning
registries:        ENEMIES[]        ← students add here
state:             hero, enemies, particles, score, hp, wpmTracker, accuracyTracker, gameOver
words:             { active pool, prefix-match index, current pushWord }
input:             focused <input>, prefix-match dispatcher
systems (per frame):
  updateInput, updateEnemies, updateSpawner, updateParticles
render:            render(ctx), renderHUD(ctx), renderLockedWord(ctx)
networking:        pollServerState, fetchWordList, submitScore, loadLeaderboard
main loop:         requestAnimationFrame tick with fixed-dt cap (1/30s)
```

**Key design choices:**

- **Emoji as sprites.** `ctx.font = '32px serif'; ctx.fillText(entity.emoji, x, y)` with a subtle drop shadow.
- **One enemy registry.** Plain JS objects: `{ emoji, difficultyClass: 'easy'|'medium'|'hard', speed, contactDamage, pointMultiplier }`. The engine reads the registry; spawner picks an enemy and assigns it a word from the matching difficulty bucket.
- **Live-enemy prefix index.** Maintain a map `prefix → [live enemies whose word starts with prefix]` keyed by every prefix length 1..N of each enemy's word. Add to the index on spawn, remove on slay/expire. Player keystroke → look up the locked enemy in O(1). Rebuilt only when the active word pool itself changes (rare); per-frame mutation is just adds and removes.
- **Pause is a single boolean.** When `state.paused === true`, `updateEnemies` and `updateSpawner` early-return; render still runs so the pause overlay is visible. Identical to SLAY.
- **No physics engine.** Distance checks for enemy-reaches-hero collision; enemies move in straight lines. That's the entire physics layer.
- **Deterministic-ish tick.** `requestAnimationFrame` for render; logic uses fixed `dt` capped at 1/30s.

**Day-one baseline (what's in the engine before any student adds anything):**

- One arena, one hero, three enemy types (one per difficulty class).
- Built-in word lists for grades K, 1, 2, 3, 4, 5, 6, 7, 8.
- Wave ramp: spawn rate, wave size, and difficulty mix grow with elapsed time. Hard-pool boss spawns at the start of every 5th wave.
- HP bar, contact damage, HP=0 → game over → score submission.
- Game-over screen: enter name → submit → see rank → view leaderboard.
- Leaderboard view: top 20 all-time + top 10 today, sortable.

**Tunable values (kept as constants at the top of `game.js` for easy tweaking):**

- `MAX_HP = 100`. Starting and max value.
- `TYPO_HP_PENALTY = 1`. HP cost per wrong keystroke.
- `CONTACT_DAMAGE` defaults: easy enemy 10, medium 15, hard/boss 25 (per registry record; engine reads from there).
- `WAVE_DURATION_S = 30`. Each wave is 30 seconds before the next ramps in.
- `BOSS_WAVE_INTERVAL = 5`. Boss spawns at start of waves 5, 10, 15, …
- `WPM_WINDOW_S = 30`. Rolling window for WPM display.
- HP does not regenerate; the only source of HP is staying alive.

**HUD layout (corner-stat pattern):**

```
┌─[HP 78]──────[📣 teacher message strip]──────[SCORE 1240]─┐
│ [WAVE 3]                                       [TIME 1:24] │
│                                                            │
│              👻 cat        🐲 dragon                       │
│                            ──── (locked, blue ring)        │
│                                                            │
│                                                            │
│                                          🍌 banana         │
│                                                            │
│                          🛡️                                │
│                                            [WPM 42]        │
│                       [ drag▌ ]            [ACC 94%]       │
│                                            [STREAK 7]      │
└────────────────────────────────────────────────────────────┘
```

- HP and wave: top-left corner pills.
- Score and elapsed time: top-right corner pills.
- WPM, accuracy, streak: bottom-right corner pills (closer to where the eye is during typing).
- Teacher message strip: thin bar across the top-center, only visible when message is non-empty.
- Locked-enemy word: rendered above the enemy itself with typed letters in green, current cursor pulsing, untyped dim. A wrong keystroke flashes the word red and shakes it briefly.
- Typing input: focused `<input>` rendered at the bottom of the canvas area; auto-refocused on resume from pause.

Center of the arena stays uncluttered for the action.

**Scoring:**

- Per-kill score: `floor(wordLength × enemy.pointMultiplier × streakBonus)`
- Per-second-alive bonus: `+1`
- `streakBonus = min(1 + 0.05 × streak, 2.0)` — each consecutive zero-typo word adds 5%, capped at 2×. Streak resets to 0 on any typo.
- Default `pointMultiplier`: easy = 1, medium = 2, hard/boss = 4.

Live tracked stats:

- **WPM** — rolling 30-second window. Each completed word counts as `wordLength / 5` "words" per the standard convention; divided by elapsed window seconds × 60.
- **Accuracy** — `100 × correctKeystrokes / totalKeystrokes` for the run, rounded to whole percent. Backspace is not counted as a keystroke; a wrong letter increments `totalKeystrokes` but not `correctKeystrokes`.
- **Streak** — count of consecutive completed words with zero typos. Resets on any typo.

These four numbers (score, WPM, accuracy, streak) are submitted with the game-over score POST and stored alongside the SLAY-inherited columns.

**Explicitly left for student additions:**

Additional enemy types, additional boss emojis, alternative word pools, sound effects and music, cosmetic heroes, on-kill effects (fireworks, particle bursts), special words ("BOSSWORDS" that affect all enemies on screen), and anything else they invent.

## 6. Backend API

All endpoints return JSON; all live in `public/api/`.

### Inherited from SLAY, mostly unchanged (all renamed `slay_*` → `sts_*` internally)

- `GET /api/leaderboard.php` — top 20 / top 10 today.
- `GET /api/health.php` — `{ ok, db, version }`.
- `GET /api/players.php` — live roster for the teacher panel.
- `POST /api/rename.php` — student rename flow.
- `POST /api/poll-vote.php` — poll voting.
- `GET /api/contributors.php` — contributors list.

### Inherited from SLAY but extended

#### `GET /api/state.php`

Polled every 2s. Inherited fields: `paused`, `message`, `version`, `forceReload`, `playerCount`, `poll`. New fields for SpellToSlay:

```json
{
  ...inherited fields...,
  "wordSource": "builtin:6",
  "wordListVersion": 12,
  "pushWord": ""
}
```

- `wordSource`: `"builtin:<grade>"` or `"teacher"`. Client compares against its locally-cached source and refetches `/api/words.php` on change.
- `wordListVersion`: bumps any time the active word list changes (teacher uploads, clears, or grade switches). Drives client refetch.
- `pushWord`: when non-empty, the next enemy spawned client-side carries this word; client clears it locally after consuming. Server clears it after a short TTL (~10s) so latecomers don't all get the same push word.

#### `POST /api/score.php`

Inherited validation rules and rate limit. Payload extended with three optional integer fields described below.

#### `POST /api/teacher.php?key=<secret>`

Inherits all SLAY actions (`pause`, `resume`, `message`, `broadcastReload`, `clearLeaderboard`, plus per-student pause/message and poll actions). Adds four new actions described below.

### New for SpellToSlay

#### `GET /api/words.php`

Returns the currently-active word pool. Client fetches whenever `state.wordListVersion` changes.

Query params:
- `source=builtin:<grade>` — returns the bundled list for that grade. Server actually proxies to the static `words/grade-<grade>.json` file but goes through this endpoint so the client uses one URL.
- `source=teacher` — returns the teacher-uploaded list from the `teacher_word_list` table.
- (no param) — returns whichever is currently active per `state.word_source`.

Response:
```json
{
  "source": "builtin:6",
  "version": 12,
  "words": ["accommodate", "separate", "necessary", ...]
}
```

#### Extended `POST /api/teacher.php?key=<secret>` actions

In addition to SLAY's pause/resume/message/broadcastReload/clearLeaderboard:

```json
{ "action": "setWordList", "text": "receive\nseparate\naccommodate\n..." }
{ "action": "clearWordList" }
{ "action": "setGradeLevel", "grade": 6 }
{ "action": "pushWord", "word": "necessary" }
```

- `setWordList`: writes the parsed list to `teacher_word_list`, bumps `state.word_list_version`, flips `state.word_source` to `"teacher"`.
- `clearWordList`: empties `teacher_word_list`, flips `word_source` back to `"builtin:<currentGrade>"`, bumps version.
- `setGradeLevel`: updates `state.grade_level`. If `word_source === "teacher"` this has no immediate effect; takes effect when the teacher list is cleared.
- `pushWord`: writes a single word into `state.push_word`, bumps version. Client engine on next poll: prepend that word to the spawn queue once, then clear the field.

### Extended `POST /api/score.php` payload

Adds three optional integer fields:

```json
{
  "name": "Dave",
  "score": 1240,
  "wave": 3,
  "duration": 184,
  "wpm": 42,
  "accuracy": 94,
  "wordsSlain": 38
}
```

Validation: `wpm` 0–200, `accuracy` 0–100, `wordsSlain` ≥ 0. Old SLAY-shape submissions (without the new fields) still accepted; defaults applied.

### Error contract

Identical to SLAY: `400` for validation, `403` for bad teacher key, `429` for score rate-limit, `500` for unexpected errors with PHP error log.

### Database schema

**Existing tables (unchanged in shape, renamed DB file):**

`scores`, `state`, `presence`, `poll_responses` — all carried over from SLAY's schema, including the live-stats columns on `presence` (`current_score`, `current_wave`, `current_hp`, `is_playing`, `is_visible`).

**Migrations on `scores`:**

```sql
ALTER TABLE scores ADD COLUMN wpm INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scores ADD COLUMN accuracy INTEGER NOT NULL DEFAULT 0;  -- whole percent 0..100
ALTER TABLE scores ADD COLUMN words_slain INTEGER NOT NULL DEFAULT 0;
```

**Migrations on `state`:**

```sql
ALTER TABLE state ADD COLUMN word_source         TEXT    NOT NULL DEFAULT 'builtin:6';
ALTER TABLE state ADD COLUMN grade_level         INTEGER NOT NULL DEFAULT 6;
ALTER TABLE state ADD COLUMN word_list_version   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE state ADD COLUMN push_word           TEXT    NOT NULL DEFAULT '';
```

**New table:**

```sql
CREATE TABLE IF NOT EXISTS teacher_word_list (
    id          INTEGER PRIMARY KEY,
    word        TEXT NOT NULL,
    position    INTEGER NOT NULL,
    set_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_teacher_word_list_pos ON teacher_word_list(position);
```

`scripts/init_db.php` is updated to apply all these migrations idempotently (matching the existing pattern).

## 7. Word lists

**Built-in lists:** `public/words/grade-K.json` … `public/words/grade-8.json`. Each file:

```json
{
  "grade": 6,
  "version": 1,
  "easy": ["bake", "calm", "ride", ...],
  "medium": ["receive", "weather", "neighbor", ...],
  "hard": ["accommodate", "necessary", "rhythm", ...]
}
```

The split-into-buckets is computed once from a frequency-rank source and committed. Total word count per grade: target 200–500 words across the three buckets. Initial bucketing rule: easy ≤ 5 letters AND high-frequency, hard ≥ 9 letters OR low-frequency, medium = the rest. This is committed JSON, not computed at runtime.

**Teacher-uploaded list:** plain newline-separated words via the textarea. Stored in `teacher_word_list` with insertion order preserved. When active, all enemies regardless of difficulty class draw from this single list (random shuffle). The teacher does not assign difficulty when uploading; this is a deliberate scope reduction.

**Push-word:** one-shot. The next enemy that spawns carries this word; then the field clears. Useful for "everyone spell *receive* right now" moments.

## 8. Teacher control panel

Same page (`public/teacher.html`), same key-based auth (`?key=<secret>`), same layout philosophy as SLAY. New controls added in a "Word Pool" section:

```
┌────────────────────────────────────────────────────┐
│ SpellToSlay — Teacher Control          ●23 players │
├────────────────────────────────────────────────────┤
│ [PAUSE EVERYONE]                                   │  (inherited)
│ Message: [____________________________] [Send]     │  (inherited)
│ [🔄 Force reload]  [🗑 Clear leaderboard]          │  (inherited)
├────────────────────────────────────────────────────┤
│ WORD POOL                                          │  (NEW)
│ Default grade: [6 ▾]                               │
│ Active: builtin grade 6                            │
│ ┌──────────────────────────────────────────────┐   │
│ │ paste this week's spelling words here…       │   │
│ │                                              │   │
│ └──────────────────────────────────────────────┘   │
│ [Use this list]   [Revert to built-in]             │
│                                                    │
│ Spell this now: [_________________] [Push]         │
├────────────────────────────────────────────────────┤
│ ROSTER (live)                                      │  (inherited)
│ ● Maya  HP 78  W3  Score 1240  [pause] [msg]       │
│ ● Leo   HP 100 W2  Score 540   [pause] [msg]       │
│ ...                                                │
├────────────────────────────────────────────────────┤
│ POLLS  •  CONTRIBUTORS  •  TOP 5                   │  (inherited)
└────────────────────────────────────────────────────┘
```

Three new buttons → three new teacher actions described in §6.

**Player-side pause overlay** — unchanged from SLAY: dark translucent overlay, "⏸ PAUSED BY TEACHER" + optional message, all input swallowed except resume.

## 9. Project layout

```
spelltoslay/
├── public/
│   ├── index.html
│   ├── teacher.html
│   ├── style.css
│   ├── game.js                     # the engine — students extend this
│   ├── teacher.js
│   ├── words/                      # NEW
│   │   ├── grade-K.json
│   │   ├── grade-1.json
│   │   ├── ...
│   │   └── grade-8.json
│   ├── .htaccess                   # cache headers (preserved verbatim)
│   └── api/
│       ├── _bootstrap.php          # shared helpers, sts_* prefix
│       ├── state.php
│       ├── score.php
│       ├── leaderboard.php
│       ├── teacher.php
│       ├── players.php
│       ├── rename.php
│       ├── poll-vote.php
│       ├── contributors.php
│       ├── words.php               # NEW
│       └── health.php
│
├── data/                           # gitignored; lives in shared/ on server
│   └── spelltoslay.db              # SQLite, persists across deploys
│
├── config/
│   ├── config.example.php
│   └── config.php                  # NOT in git
│
├── scripts/
│   └── init_db.php                 # idempotent migrations including new columns
│
├── deploy.php                      # Deployer recipe (paths updated)
├── tests/
│   ├── api/                        # PHPUnit tests for endpoints
│   ├── e2e/                        # Playwright happy-path
│   └── bootstrap.php
├── .gitignore
├── CHANGELOG.md
├── README.md
├── CLAUDE.md
└── docs/
    ├── orientation.md
    ├── reference/slay/             # parent project's spec and plan
    └── superpowers/specs/2026-05-06-spelltoslay-design.md
```

## 10. Naming conventions and rename

**Project rename pass.** Single grep-replace task in the implementation plan, run early so subsequent work doesn't accumulate stale references.

| Old (in SLAY scaffold) | New (SpellToSlay)            |
|------------------------|------------------------------|
| `typenspell` (folder)  | `spelltoslay` (folder)       |
| `TypeNSpell`           | `SpellToSlay`                |
| `typenspell.lockersoft.games` | `spelltoslay.lockersoft.games` |
| `slay_*` (functions)   | `sts_*`                      |
| `slay_cid` (localStorage) | `sts_cid`                 |
| `slay_player_name`     | `sts_player_name`            |
| `SLAY_DB_PATH` (constant) | `SPELLTOSLAY_DB_PATH`     |
| `slay.db` / `data/slay.db` | `spelltoslay.db` / `data/spelltoslay.db` |
| Repo name `typenspell` | `spelltoslay` (via `gh repo rename`) |

**Strings preserved as historical context** in `docs/reference/slay/` — that directory is the SLAY parent-project reference and stays as-is.

## 11. Deployment

**Tool:** Direct git-pull deploy from server (matching the SLAY classroom workflow that worked); Deployer recipe also configured as a fallback.

**Server setup (one-time):**
1. SSH to `lockersoft@<dreamhost>`.
2. `git clone git@github.com:lockersoft/spelltoslay.git ~/spelltoslay-app`.
3. `mkdir -p ~/spelltoslay-app/data`.
4. Copy `config/config.example.php` → `config/config.php`, fill in fresh `TEACHER_KEY` (new 1Password entry).
5. `php scripts/init_db.php` (creates DB and tables).
6. `ln -s ~/spelltoslay-app/public ~/spelltoslay.lockersoft.games`.
7. DreamHost panel: enable SSL on the new subdomain.

**Daily classroom workflow:**

1. Student suggests a feature.
2. Dave prompts AI: "add a hydra boss with 3-second word freeze on hit."
3. AI edits `public/game.js`, commits.
4. `git push`.
5. SSH `cd ~/spelltoslay-app && git pull`.
6. Teacher panel → **🔄 Force reload everyone**.
7. Class plays the new feature within ~60s of suggestion.

**Auto-versioning:** `git rev-list --count HEAD` written to `VERSION` on the server (preserved from SLAY's pattern).

**No staging.** Same trade-off SLAY accepted. Mitigation: a 30-second pre-deploy local smoke test, plus instant `git reset --hard <prev>` rollback. The DB file in `data/` is gitignored and untouched by deploys.

## 12. Testing

**Local smoke test before every deploy:**
1. `php -S localhost:8000 -t public`.
2. Open in browser, type a few words, complete a game-over flow, submit a score, check leaderboard, verify it appears.
3. Open `localhost:8000/teacher.html?key=<dev-key>`, paste a 5-word list, click "Use this list", verify next enemy on the player tab carries one of those words.

**PHPUnit (extended from SLAY's suite):**

- All inherited endpoint tests adapted for `sts_*` prefix.
- New tests for `words.php` (builtin grade source, teacher source, version bump on change).
- New tests for the four new teacher actions (`setWordList`, `clearWordList`, `setGradeLevel`, `pushWord`) with valid + invalid input.
- New tests for the three new `score.php` fields (validation ranges, defaults).

**Playwright (one happy-path test):**

Boots local PHP server, opens game, types prefixes, completes a few words, lets the timer run to game-over, asserts the score submission includes `wpm`, `accuracy`, `wordsSlain`, asserts the leaderboard renders them.

**No unit tests on `game.js` v1.** Same reasoning as SLAY.

**Production verification (after every deploy):**
1. Open `spelltoslay.lockersoft.games`, type one word and submit a 0-score game.
2. `curl https://spelltoslay.lockersoft.games/api/health.php` → expect `{"ok":true,...}`.
3. `curl https://spelltoslay.lockersoft.games/api/words.php?source=builtin:6` → expect a non-empty word array.
4. If anything looks off, `git reset --hard <prev>` on the server and force-reload from the teacher panel.

## 13. Open questions and risks

- **Built-in word-list curation.** Need real grade-level word lists. Plan: source from a public CC-licensed grade-words list (e.g., Dolch + Fry sight word lists for K-3, then a frequency-banded list for 4-8). Final curation is a chunk of work that will be its own task in the implementation plan.
- **Profanity filter and the teacher list.** The teacher's pasted list is trusted (the teacher pasted it intentionally), but built-in pools and student-name fields still need `sts_is_profane()` filtering. Carry the SLAY profanity wordlist forward unchanged.
- **Browser tab focus loss during typing.** Pause overlay swallows input; on resume, the focused `<input>` should regain focus. Needs a one-line `inputEl.focus()` in the resume path.
- **Word-pool race conditions.** A teacher uploading a new list mid-wave could leave in-flight enemies with stale words. Acceptable: client rebuilds the prefix index when version changes; existing enemies finish their current word, new enemies use the new pool.
- **Initial DreamHost SSH access.** Same as SLAY. README should capture the symlink and SSL-enable steps.

## 14. Out of scope for v1

Explicitly NOT in v1; saved for student additions or a v2 iteration:

- Mobile / phone gameplay (multiple-choice mode for phones).
- Audio: sound effects, music, audio toggles.
- Per-student current-word display in the teacher roster.
- Live class-wide WPM and accuracy averages in the teacher panel.
- Class spelling-bee mode (synchronized word, race-to-first-correct).
- Multiple selectable heroes / cosmetics.
- Difficulty modes within a single session beyond the grade dropdown.
- Account system, persistent profiles, social features.
- Real-time multiplayer / shared world.
- Replay system, recording, sharing.

The whole point: leave room for kids to add things.
