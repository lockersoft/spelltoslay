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
  `public/game.js` solves it. **For a typing game this is even more
  load-bearing.**
- The polling cadence is 2 seconds. If you change it, also change the
  client polling intervals.
- Profanity check is centralized in `public/api/_bootstrap.php` as
  `sts_is_profane()` — used by `score.php`, `rename.php`, and
  `teacher.php`.

## Files unique to this fork (not in SLAY)

- `docs/reference/slay/` — parent project's spec and plan.
- `public/words/grade-*.json` — built-in spelling lists.
- `CLAUDE.md` — this file.
- `CHANGELOG.md` — see v0.1.0 for the SpellToSlay v1 release.
