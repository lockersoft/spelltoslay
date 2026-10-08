# SpellToSlay — Project Notes for Claude Code

This is a **fork-by-copy of the SLAY project** (top-down arena combat
game, currently live at https://slay.lockersoft.games). Everything in
this repo started life as a SLAY file. The infrastructure layer is
intentionally identical; the gameplay layer has been replaced for a
typing-and-spelling arena game.

## Workflow inherited from the user's preferences

The user's global CLAUDE.md (loaded on every session) already covers:
- Always start a feature/fix branch.
- Use `gh` CLI for GitHub.
- Don't create pull requests.
- Update CHANGELOG before merging.
- Verify health endpoint after deploy.
- Brainstorm → write-plan → review → implement → verification-before-completion.

The SLAY workflow that worked well during classroom iteration:
- One feature per branch, merged to main, push, deploy via SSH+git pull.
- `dep deploy` is configured but not strictly required — direct SSH
  deploy works equivalently.
- Force-reload broadcast from the teacher panel after each deploy so
  kids pick up new code immediately.
- Each commit auto-bumps the version number (`git rev-list --count HEAD`).

## Hosting

DreamHost shared at `lockersoft.games`, SSH user `lockersoft`. Domain:
`spelltoslay.lockersoft.games`. The pattern: clone the repo to
`~/spelltoslay-app/`, symlink `~/spelltoslay.lockersoft.games/` →
`~/spelltoslay-app/public/`. No sudo, no nginx config, no certbot —
DreamHost manages all that.

## What the user has already invested in (don't redo)

- The PHP+SQLite backend with health/score/leaderboard/state/teacher/
  players/rename/poll-vote/contributors/words endpoints.
- The teacher control panel UX (live roster + word-pool controls).
- The classroom-iteration workflow (push, deploy, force reload).
- 1Password entry for the teacher key.
- The day-one word lists in public/words/grade-*.json.

## What might surprise you

- The user's email in `git config user.email` was previously
  `dave@lockersoft.coms` (typo); fixed during SLAY setup.
- DreamHost's default 30-day cache on static assets bit us; `.htaccess`
  in `public/` disables caching on `.js`/`.html`/`.css`. Keep that file.
- WASD keys can't be intercepted globally with `preventDefault()` — it
  blocks typing in inputs. The `isTyping` guard pattern in
  `public/js/typing.js` solves it. **For a typing game this is even more
  load-bearing.**
- The polling cadence is 2 seconds. If you change it, also change the
  client polling intervals.
- Name validation is centralized in `public/api/_bootstrap.php`:
  `sts_name_error()` (shape + profanity) wraps `sts_is_profane()` and is
  used by `score.php`, `rename.php`, `teacher.php` and `state.php`.
- The game client is ES modules under `public/js/` (entry `main.js`), loaded
  with `<script type="module">` — no build step. `window.state` and the
  other test hooks exist only when the hostname is `localhost`.
- JSON POST bodies are sent as `{"z": base64url(JSON)}` (`public/js/api.js`,
  unwrapped in `sts_input_json()`), because DreamHost's mod_security rejects
  SQL-looking free text. Plain JSON bodies are still accepted.
- The teacher key is sent as an `X-Teacher-Key` header
  (`sts_require_teacher()`); `?key=` still works server-side. The panel reads
  the key from `teacher.html#key=…` or `?key=…` and strips it from the URL.
- Hub launches: lockersoft.games opens `teacher.html#session=<HS256 JWT>`.
  `public/api/session-init.php` verifies it against `hub_secret` in
  `config/config.php` (same value as the hub's `LSG_HUB_SECRET_SPELLTOSLAY`)
  and returns a short stateless ticket, sent as `X-Teacher-Session`. The
  launching teacher's hub user id must also be in `hub_teacher_ids`: the hub
  has open teacher registration and this game is one shared classroom.
  Nothing is stored server-side, so ending a launch in the hub does not end
  the ticket early; it expires with the launch token (8h). The token's
  `wordlist.words` are applied as the teacher word list once per launch
  (table `hub_launches_applied` records each one until its token expires); the roster and
  `hub_callback` are ignored for now.
- `public/api/score.php` cross-checks score/wave/kills/duration against
  bounds mirrored from `public/js/constants.js`. Raising a
  `pointMultiplier` above 4 or changing `WAVE_DURATION_S` needs the server
  bound raised too, or honest scores get rejected.
- Playwright runs with one worker against a temp SQLite file and the key
  `e2e-key` (env vars `STS_DB_PATH` / `STS_TEACHER_KEY`); it does not touch
  `data/` or `config/config.php`.

## Files unique to this fork (not in SLAY)

- `docs/reference/slay/` — parent project's spec and plan.
- `public/words/grade-*.json` — built-in spelling lists.
- `CLAUDE.md` — this file.
- `CHANGELOG.md` — see v0.1.0 for the SpellToSlay v1 release.
