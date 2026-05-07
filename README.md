# TypeNSpell

Browser-based typing and spelling game for in-class AI vibe coding with
10–14 year olds. Each student suggests a feature; the teacher implements
via AI and deploys to production immediately. The class plays live and
watches the game grow feature-by-feature.

Forked from [SLAY](https://slay.lockersoft.games) — same backend
architecture, teacher control panel, presence/roster/messaging/polls/
per-student pause, deploy story. The gameplay layer (typing/spelling
mechanics) replaces SLAY's arena combat.

## Where to start

1. **Brainstorm gameplay** — open Claude Code in this directory and run
   `/brainstorm` to walk through the design with the user. Reference
   material lives in [docs/reference/slay/](docs/reference/slay/) (the
   parent project's spec and plan). A starter framing for the
   brainstorm is in [docs/orientation.md](docs/orientation.md).

2. **After brainstorm:** the brainstorming skill writes a spec to
   `docs/superpowers/specs/`, then writing-plans produces an
   implementation plan in `docs/superpowers/plans/`, then
   subagent-driven-development executes it.

3. **Deploy target:** `typenspell.lockersoft.games` (or whichever domain
   the user chooses during setup). Same DreamHost shared-hosting pattern
   as SLAY: clone to `~/typenspell-app/`, symlink `~/<domain>/` to
   `~/typenspell-app/public/`, deploy via `git fetch && reset --hard`
   plus `composer install --no-dev`.

## What's already wired up (inherited from SLAY)

- PHP API: `health.php`, `score.php`, `leaderboard.php`, `state.php`,
  `teacher.php`, `players.php`, `rename.php`, `poll-vote.php`,
  `contributors.php`. SQLite via PDO.
- Teacher panel at `/teacher.html?key=<KEY>` with: pause everyone,
  per-student pause, broadcast message, per-student message, force
  reload, clear leaderboard, live roster (name, activity dot, score,
  wave, HP), live polls, contributor tracker.
- Player infrastructure: name entry on first load, polling every 2s,
  pause overlay, message bar, version display in bottom corner.
- Touch/mouse controls (hold-to-move) — may not apply to a typing game
  but the wiring is there if you want hybrid mechanics.
- Tests: 68 PHPUnit tests covering all API endpoints, 1 Playwright
  happy-path E2E.
- Deployer recipe in `deploy.php` (configured for slay.lockersoft.games
  — needs hostname update for typenspell).
- VERSION display: `vSEMVER.COUNT` (semver from `VERSION_BASE`, count
  from `git rev-list --count HEAD` written by deploy).

## What needs to change for typenspell

- **Gameplay:** `public/game.js` is currently the SLAY arena combat
  engine. Replace with a typing/spelling loop. The brainstorm session
  will define the mechanics.
- **HUD/canvas:** SLAY shows HP/score/wave/time. A typing game probably
  wants WPM, accuracy, current word, streak, etc.
- **Score schema:** SLAY's `scores` table has `score, wave, duration` —
  may want different fields (words-per-minute, words-spelled, accuracy).
- **HTML:** `public/index.html` has a canvas, name entry, game-over,
  leaderboard. Most of these stay; the canvas usage will change.
- **Roster live stats:** instead of score/wave/HP, the teacher should
  see typing-specific signals (current word, WPM, accuracy, streak).
- **Domain:** update `deploy.php`, README, `slay.lockersoft.games` →
  `typenspell.lockersoft.games`.
- **Tests:** rename SLAY-specific tests, add typing-specific tests.

## Local development

Once the brainstorm settles and the spec lands:

```bash
composer install
echo '<?php return ["teacher_key" => "dev-key"];' > config/config.php
php scripts/init_db.php
php -S localhost:8000 -t public
```

Open http://localhost:8000.
