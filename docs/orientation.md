# TypeNSpell — Orientation for the Brainstorming Session

You (Claude) have just been opened in the `typenspell` project. The user
wants to brainstorm a typing & spelling game for their classroom (10–14
year olds), built on the same architecture as their existing SLAY
project.

## What you're inheriting

This repo was scaffolded by copying SLAY (a top-down arena combat game).
**The infrastructure is reusable; the gameplay layer is what will
change.**

Reusable as-is (touch lightly if at all):
- PHP API endpoints under `public/api/` — `_bootstrap.php`, `health.php`,
  `score.php`, `leaderboard.php`, `state.php`, `teacher.php`,
  `players.php`, `rename.php`, `poll-vote.php`, `contributors.php`.
- SQLite schema in `scripts/init_db.php` — `scores`, `state`, `presence`,
  `poll_responses` tables. May need new columns (typing-specific stats)
  but the migration pattern is established.
- Teacher panel (`public/teacher.html` + `public/teacher.js`) — roster
  with activity dots, per-student pause, personal messages, polls,
  contributors. Already great; mostly reusable.
- Test harness (PHPUnit + Playwright), composer setup, .gitignore,
  Deployer recipe, .htaccess cache headers, VERSION_BASE pattern.
- Player-side scaffolding in `public/index.html` and `public/game.js`:
  name-entry modal, polling, pause overlay, message bar, build-version
  display, score submission, leaderboard view.

Will be REPLACED for the typing game:
- `public/game.js`'s gameplay loop (arena combat → typing mechanics).
- HUD elements specific to combat (HP, wave) → typing equivalents (WPM,
  accuracy, streak).
- Possibly the `scores` table fields (currently `score, wave, duration`
  — may want WPM, words spelled correctly, accuracy %).
- Maybe `index.html` layout (canvas-centric → text-input-centric? or
  hybrid?).

## Reference materials

- [docs/reference/slay/spec.md](reference/slay/spec.md) — the full SLAY
  design spec. Read it to understand the architectural decisions
  (single-VPS-via-Deployer, polling, registry-based extension points,
  emoji as sprites). Most of those decisions still apply.
- [docs/reference/slay/plan.md](reference/slay/plan.md) — the SLAY
  implementation plan. Useful as a template for what a typenspell plan
  should look like once gameplay is decided.

## What the user wants from you (initially)

1. **Brainstorm the gameplay.** Use the `/brainstorming` skill (or the
   `superpowers:brainstorming` skill, depending on what's available).
   Cover the same kinds of decisions SLAY did: genre/feel, visual style,
   controls, MVP scope, what's left for student additions, tech stack
   notes (mostly inherited), persistence (mostly inherited), teacher
   features (mostly inherited).

2. **Identify what changes vs. what stays.** Don't reinvent the
   teacher panel or the polling infrastructure — those work. Focus on
   the gameplay specifics.

3. **Write the spec to** `docs/superpowers/specs/<YYYY-MM-DD>-typenspell-design.md`.

4. **Then writing-plans** to produce `docs/superpowers/plans/<YYYY-MM-DD>-typenspell-v1.md`.

5. **Then subagent-driven-development** to execute the plan. Reuse the
   server provisioning approach (DreamHost shared, ~/<domain> symlink to
   `~/typenspell-app/public/`) — see `docs/reference/slay/plan.md` for
   the "Server setup" section.

## Key design questions to bring up during brainstorm

(Save the user time by asking these directly.)

- **Genre/feel:** Word-attack falling-letters (Typer Shark / ZType)?
  Spelling bee with multiple choice? Type-the-monster's-name combat?
  Speed-typing race? Sentence dictation? Vocabulary
  match-the-definition? Timed spelling sprint?
- **Single mechanic vs. mode menu?** SLAY went with one mechanic and
  let students add weapons. Is the typing game one mechanic with
  layered words/themes, or a pick-from-modes setup?
- **Word list:** Static built-in dictionary? Teacher-uploadable list
  (huge value — the teacher can match the spelling words for their
  current curriculum)? Both?
- **Scoring model:** WPM? Accuracy%? Combined "score" like SLAY?
  Streak-based? Per-word points based on length/difficulty?
- **Difficulty:** Per-grade level word lists? Adjustable spawn rate
  / time pressure? Ramp like SLAY's wave system?
- **Visual style:** Still emoji-friendly? Pixel? Plain text? The
  asset-free emoji approach worked beautifully in SLAY — likely worth
  preserving for the same fast-iteration reasons.
- **Teacher-specific:** Does the teacher want to push a specific word
  for everyone to spell (poll-style)? Run a class-wide spelling bee?
  See per-student current word in the roster?
- **Mobile:** SLAY now has touch controls. A typing game on phones is
  rough — accept on-screen keyboard, or scope mobile to "view only" /
  multiple-choice mode?
- **Domain:** assume `typenspell.lockersoft.games`. Confirm.

## Hand-off note

The user will open Claude Code in this directory and ask you to
continue. Be ready to invoke the brainstorming skill immediately. The
parent project (SLAY) is fully working and shipping classroom features
— don't spend time re-justifying its architectural choices unless the
user wants to revisit them.
