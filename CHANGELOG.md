# Changelog

## [Unreleased]

### Added
- `public/favicon.svg` — sword-on-dark icon, referenced from index.html and teacher.html.
- E2E regression test for the name-entry focus-steal bug.
- Space / Enter as an explicit "commit current buffer" key. Needed when one live enemy's word is a prefix of another's (e.g. `a` and `and` both alive): typing `a` alone is ambiguous, so the player presses Space to commit the slay.
- Laser-kill visual: an orb projectile flies from the hero to the enemy on word-slay, detonating as a ring shockwave at impact. The enemy freezes (`e.dying = true`) on commit and is removed when the orb lands. `prefers-reduced-motion` skips the orb and plays a brief ring.
- Per-player word-size slider in the footer (range 12–40 px, default 22). Persists per browser in `localStorage` under `sts_word_font_size`. The pill background scales proportionally with the font.
- "Play again without submitting" on the game-over screen.
- Teacher message now shows in the bar under the arena instead of 11px text over the HUD.
- Server cross-checks submitted scores against kills, wave and duration (`score does not match the run`).
- Teacher key is sent as an `X-Teacher-Key` header and removed from the address bar; `teacher.html#key=…` is the preferred link form (`?key=` still works).
- POST bodies are base64url-wrapped (`{"z": …}`) so the host's request filter cannot reject free text such as a pasted spelling list.
- Enter submits the name form.
- Hub launch: "Open game console" from lockersoft.games (`teacher.html#session=<token>`) now opens the teacher panel with no key. The game verifies the hub's signed launch token (`POST /api/session-init.php`) and hands the panel a short session ticket (`X-Teacher-Session`). Needs two settings in `config/config.php`: `hub_secret` (equal to the hub's `LSG_HUB_SECRET_SPELLTOSLAY`) and `hub_teacher_ids` (the hub user ids allowed to control this game — the hub has open teacher registration and this game is one shared classroom, so a valid launch alone is not enough). Without both, hub launches are refused and the teacher key works as before. Request bodies are now capped at 512 KB. The launch token's class roster is not used yet.
- Hub launch applies the class's active word list: it becomes the game's teacher list as the panel opens, and a notice says how many words were applied and how many could not be used (the game takes a–z only, so entries with spaces, apostrophes or hyphens are skipped). It is applied once per launch — reopening the same link does not overwrite a list chosen in the panel since — and a launch with no list leaves the word pool alone. Adds a `hub_launches_applied` table (`scripts/init_db.php` must run on deploy; until it has, launches still log in and say the list could not be applied).

### Fixed
- Name-entry sign-in: typing your name now works. The gameplay typing input's blur-recapture (refocus 50ms after losing focus) was unconditional and stole focus from `#entry-name` mid-keystroke. Recapture now requires `state.running`, which is false while any modal is up.
- Prefix-collision typing: when two enemies shared a prefix (e.g. `cat` + `carry`), per-keystroke "lock to closest" damage meant typing the full word of one didn't slay it — the early letters landed on the wrong enemy and only the last letter hit the intended target. Damage is now deferred while the prefix is ambiguous and flushed in one shot when the buffer commits to a single enemy. Typing the full word always slays it; backspace no longer heals (damage is monotone).
- "Force everyone to reload" reloaded each tab continuously for 10 seconds (hundreds of reloads per tab); it now reloads once.
- Score could only be submitted once per page load; the button stayed disabled on later games.
- When the enemy being typed reached the hero, the half-typed letters stayed in the buffer and every following key counted as a typo.
- Two enemies carrying the same word could not be slain by typing the word; the closest one is now slain. The spawner also avoids words already on screen.
- Green "typed" letters stayed on an enemy after Backspace; they now follow the buffer on every matching enemy.
- "Change name" on the game-over screen did nothing.
- A profane name was accepted at name entry and shown on the teacher roster, then rejected at score submit with no way out. Names are now checked at entry, and a browser already carrying a rejected name is asked for a new one.
- Word labels were cut off near the arena walls and could cover each other.
- Smaller: red input style persisting into the next game, rejected poll votes shown as accepted (and the poll then auto-dismissing), poll buttons rebuilt every 2 seconds, stray bullet in the message bar, wrong teacher key showing an empty panel, teacher message drafts wiped by the 2-second refresh.

### Changed
- `deploy.php` repository URL switched from `github-spelltoslay:` (alias never set up server-side) to `github.com:lockersoft/spelltoslay.git`, which uses the server's existing github.com SSH config.
- `composer.lock` content-hash refreshed against composer.json so production `composer install` no longer warns.
- Enemy word labels enlarged twice in succession (compound 1.25×): font 14→17.5→21.875 px, pill 22→27.5→34.375 px tall. Easier to read across the room.
- `public/game.js` split into ES modules under `public/js/`; game internals are no longer global outside localhost.
- Profanity filter: whole-word matching for mild words (no more false hits on names like "Dickens"), longer list, digit-swap normalisation ("sh1t").
- A score payload that claims points with no `wordsSlain` is now rejected.
- E2E tests run with one worker against a temporary database and no longer write `config/config.php`.
- Leaderboard heading "Today" renamed "Last 24 hours" to match the query.
- **New look** — the student game page and the teacher page now use the Debug
  Derby theme: navy background, gradient top bar, rounded panels, chips, yellow
  and blue buttons. `public/theme.css` is Debug Derby's `src/shared/theme.css`
  copied unchanged; SpellToSlay's own rules stay in `public/style.css`. The teacher
  page's sections are panels and its buttons no longer fall back to the
  browser's grey default.

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
