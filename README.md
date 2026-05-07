# SpellToSlay

Browser-based typing-and-spelling arena game for in-class AI vibe coding
with 10–14 year olds. The hero stands at the center of the screen,
enemies stream in carrying spelling words, and the player slays them by
typing letter-by-letter. Damage is dealt as each correct letter lands,
prefix-lock-on chooses the closest matching enemy, and the next correct
letter switches targets if a closer match appears.

**Killer classroom feature:** the teacher pastes this week's spelling
words into the teacher panel and clicks "Use this list" — every enemy in
the live game immediately starts spawning with the class's words. No
upload step, no compile, no redeploy. The kids practise the exact words
they're being tested on.

Forked from [SLAY](https://slay.lockersoft.games) — same backend
architecture, teacher control panel, presence/roster/messaging/polls/
per-student pause, deploy story. The gameplay layer (typing/spelling
mechanics) replaces SLAY's arena combat.

## Local development

```bash
composer install
echo '<?php return ["teacher_key" => "dev"];' > config/config.php
php scripts/init_db.php && php -S localhost:8001 -t public
```

Open <http://localhost:8001>. The teacher panel is at
<http://localhost:8001/teacher.html?key=dev>.

Run the test suite:

```bash
vendor/bin/phpunit          # PHPUnit (API + core PHP)
npx playwright test         # Playwright happy-path E2E
```

## What's wired up

- PHP API: `health.php`, `score.php`, `leaderboard.php`, `state.php`,
  `teacher.php`, `players.php`, `rename.php`, `poll-vote.php`,
  `contributors.php`, `words.php`. SQLite via PDO.
- Teacher panel at `/teacher.html?key=<KEY>` with: pause everyone,
  per-student pause, broadcast message, per-student message, force
  reload, clear leaderboard, live roster (name, activity dot, WPM,
  accuracy, current word, streak), live polls, contributor tracker,
  paste-a-word-list + "Spell this now" push-word controls.
- Player infrastructure: name entry on first load, polling every 2s,
  pause overlay, message bar, version display in bottom corner.
- Built-in word lists for grades K–8 in `public/words/grade-*.json`
  with three difficulty buckets per grade.
- Score schema captures WPM, accuracy, and words slain per run.
- Tests: 96 PHPUnit tests covering all API endpoints, 1 Playwright
  happy-path E2E.
- Deployer recipe in `deploy.php` (configured for
  `spelltoslay.lockersoft.games`).
- VERSION display: `vSEMVER.COUNT` (semver from `VERSION_BASE`, count
  from `git rev-list --count HEAD` written by deploy).

## Server setup

Same DreamHost shared-hosting pattern as SLAY: clone to
`~/spelltoslay-app/`, symlink `~/spelltoslay.lockersoft.games/` to
`~/spelltoslay-app/public/`, deploy via `git fetch && reset --hard`
plus `composer install --no-dev`. See **First-time SpellToSlay deploy**
below for the full one-off provisioning checklist.

## Daily classroom workflow

1. Student suggests a feature.
2. Teacher pairs with Claude Code on a feature branch, lands the change,
   pushes to `main`.
3. Deploy: either `dep deploy` from the laptop, or SSH to DreamHost and
   `cd ~/spelltoslay-app && git pull && composer install --no-dev`.
4. From the teacher panel, click **Force reload** so every connected
   student tab picks up the new code on the next 2-second poll.
5. Class plays the new build live.

## First-time SpellToSlay deploy (manual, one-off)

These are the steps to run **once** to bring SpellToSlay online.
Subsequent deploys use `dep deploy` or a direct SSH `git pull`.

1. **Create the GitHub repo** (one-time):

   ```bash
   gh repo create lockersoft/spelltoslay --public --source=. --push
   ```

2. **SSH to DreamHost and clone**:

   ```bash
   ssh lockersoft@<your-dreamhost-host>
   cd ~
   git clone git@github.com:lockersoft/spelltoslay.git spelltoslay-app
   cd spelltoslay-app
   mkdir -p data
   ```

3. **Generate a fresh teacher key and store it**:

   In 1Password, create a new entry "spelltoslay teacher key" with a
   long random string. Then on the server:

   ```bash
   cp config/config.example.php config/config.php
   # Edit config.php and paste the key from 1Password into the teacher_key field.
   chmod 600 config/config.php
   ```

4. **Initialize the SQLite DB**:

   ```bash
   php scripts/init_db.php
   ```

   Expected output: `Initialized SpellToSlay DB at /home/lockersoft/spelltoslay-app/data/spelltoslay.db`.

5. **Symlink the web root**:

   ```bash
   ln -s ~/spelltoslay-app/public ~/spelltoslay.lockersoft.games
   ```

6. **In the DreamHost panel**: add `spelltoslay.lockersoft.games` as a
   hosted subdomain pointing to the symlink, enable HTTPS via Let's
   Encrypt.

7. **Verify health**:

   ```bash
   curl https://spelltoslay.lockersoft.games/api/health.php
   ```

   Expected: `{"ok":true,"db":"ok",...}`.

8. **Smoke-test the live site**:

   - Open `https://spelltoslay.lockersoft.games/` — name entry, type a
     word, see score.
   - Open
     `https://spelltoslay.lockersoft.games/teacher.html?key=<your-key>`
     — paste a 3-word list, hit "Use this list", play, see your words
     on enemies.

After this one-time setup, all subsequent deploys are `dep deploy` from
your laptop OR `cd ~/spelltoslay-app && git pull` over SSH.
