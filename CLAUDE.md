# SpellToSlay — Project Notes for Claude Code

This is a **fork-by-copy of the SLAY project** (top-down arena combat
game, currently live at https://slay.lockersoft.games). Everything in
this repo started life as a SLAY file. The infrastructure layer is
intentionally identical; only the gameplay layer is being replaced for
a typing & spelling game.

## First action when the user resumes this project

**Read [docs/orientation.md](docs/orientation.md) and invoke the
brainstorming skill (`superpowers:brainstorming`).**

The orientation doc lays out:
- Which files are reusable as-is vs. need replacing.
- Reference material in `docs/reference/slay/` (the parent project's
  spec and plan).
- Concrete design questions to surface during brainstorming so the user
  doesn't have to think them up cold.

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

DreamHost shared at `lockersoft.games`, SSH user `lockersoft`. New
domain: `spelltoslay.lockersoft.games` (assumed; confirm with user).
The pattern: clone the repo to `~/spelltoslay-app/`, symlink
`~/spelltoslay.lockersoft.games/` → `~/spelltoslay-app/public/`. No
sudo, no nginx config, no certbot — DreamHost manages all that.

## What the user has already invested in (don't redo)

- The PHP+SQLite backend with health/score/leaderboard/state/teacher/
  players/rename/poll-vote/contributors endpoints.
- The teacher control panel UX (live roster with activity dots, per-
  student pause, personal messages, polls, contributors).
- The classroom-iteration workflow (push, deploy, force reload).
- 1Password entry for the teacher key — the spelltoslay deploy will need
  its OWN teacher key generated and stored alongside.

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
  `teacher.php`. Rename to `tns_is_profane()` or similar when you do
  the gameplay rewrite, but keep the function.

## Files unique to this fork (not in SLAY)

- `docs/orientation.md` — your brief.
- `docs/reference/slay/` — parent project's spec and plan.
- `CLAUDE.md` — this file.
- `CHANGELOG.md` — reset to `[Unreleased]`.

## Open decisions (defer to brainstorming)

- Production domain (assume `spelltoslay.lockersoft.games` until told
  otherwise).
- Whether the SLAY function-name prefix (`slay_*`) gets renamed
  globally or kept as a "shared library" name. Renaming is cleaner;
  keeping is faster.
- Whether to keep the `sts_cid` / `sts_player_name` localStorage keys
  or migrate them to `tns_*` (probably migrate, since the same browser
  could be used to play both games on the same domain hierarchy).
