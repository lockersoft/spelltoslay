# Changelog

## [Unreleased]

### Added
- `public/favicon.svg` — sword-on-dark icon, referenced from index.html and teacher.html.

### Changed
- `deploy.php` repository URL switched from `github-spelltoslay:` (alias never set up server-side) to `github.com:lockersoft/spelltoslay.git`, which uses the server's existing github.com SSH config.
- `composer.lock` content-hash refreshed against composer.json so production `composer install` no longer warns.

## [0.1.0] — 2026-05-06

Initial SpellToSlay v1 release. Forked from SLAY's infrastructure;
gameplay layer is new.

### Added
- Spell-to-Slay arena: stationary hero, prefix-lock-on typing, letter-by-letter damage.
- Built-in word lists for grades K–8 with three difficulty buckets.
- Teacher-uploadable word list (paste this week's spelling words, override the built-in pool).
- "Spell this now" push-word feature.
- New score columns: wpm, accuracy, words_slain.
- Corner-stat HUD (HP+wave, score+time, WPM+ACC+streak).

### Changed
- Renamed slay_* helpers to sts_*; project name SpellToSlay; domain spelltoslay.lockersoft.games.
- localStorage keys migrated from slay_* to sts_*.

### Inherited unchanged
- Teacher panel (pause, message, force reload, polls, contributors, per-student controls).
- Polling architecture (2s, ETag-based 304s).
- Score submission and leaderboard endpoints (extended, not replaced).

### Post-merge cleanup (manual, run after this branch lands on main)

- Rename the local checkout: `mv ~/Documents/GitHub/typenspell ~/Documents/GitHub/spelltoslay`.
- If a remote was added before the rename, fix it: `git remote set-url origin git@github.com:lockersoft/spelltoslay.git`.
- Update any local SSH config aliases that referenced the old name.
