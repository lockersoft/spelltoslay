# Changelog

## [Unreleased]

### Added
- `public/favicon.svg` — sword-on-dark icon, referenced from index.html and teacher.html.
- E2E regression test for the name-entry focus-steal bug.
- Space / Enter as an explicit "commit current buffer" key. Needed when one live enemy's word is a prefix of another's (e.g. `a` and `and` both alive): typing `a` alone is ambiguous, so the player presses Space to commit the slay.
- Laser-kill visual: an orb projectile flies from the hero to the enemy on word-slay, detonating as a ring shockwave at impact. The enemy freezes (`e.dying = true`) on commit and is removed when the orb lands. `prefers-reduced-motion` skips the orb and plays a brief ring.

### Fixed
- Name-entry sign-in: typing your name now works. The gameplay typing input's blur-recapture (refocus 50ms after losing focus) was unconditional and stole focus from `#entry-name` mid-keystroke. Recapture now requires `state.running`, which is false while any modal is up.
- Prefix-collision typing: when two enemies shared a prefix (e.g. `cat` + `carry`), per-keystroke "lock to closest" damage meant typing the full word of one didn't slay it — the early letters landed on the wrong enemy and only the last letter hit the intended target. Damage is now deferred while the prefix is ambiguous and flushed in one shot when the buffer commits to a single enemy. Typing the full word always slays it; backspace no longer heals (damage is monotone).

### Changed
- `deploy.php` repository URL switched from `github-spelltoslay:` (alias never set up server-side) to `github.com:lockersoft/spelltoslay.git`, which uses the server's existing github.com SSH config.
- `composer.lock` content-hash refreshed against composer.json so production `composer install` no longer warns.
- Enemy word labels are 25% larger (font 14→17.5 px, pill 22→27.5 px tall) so words are easier to read across the room.

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
