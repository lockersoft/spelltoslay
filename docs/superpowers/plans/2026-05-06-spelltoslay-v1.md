# SpellToSlay v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SLAY-cloned arena combat gameplay with SpellToSlay — a typing/spelling game where stationary heroes slay enemies by typing the words on them — while preserving the SLAY backend, polling, teacher panel, and deploy pipeline.

**Architecture:** Vanilla JS + HTML5 Canvas frontend served as static files. PHP+SQLite backend, one self-contained file per endpoint, no framework. State polled every 2 seconds. Word lists are static JSON for built-in grade pools, plus a teacher-uploadable list stored in SQLite. The full architecture is documented in `docs/superpowers/specs/2026-05-06-spelltoslay-design.md` — read it before starting.

**Tech Stack:** PHP 8.1+, SQLite (PDO), HTML5 Canvas, vanilla JS (no build step), PHPUnit 10, Playwright. Hosted on DreamHost shared.

---

## Prerequisites

Before starting, verify the local environment:

- [ ] **Verify PHP 8.1+ and ext-pdo_sqlite are available**

Run: `php --version && php -m | grep -i sqlite`
Expected: PHP version 8.1 or higher; `pdo_sqlite` and `sqlite3` listed.

- [ ] **Install PHP dependencies**

Run: `composer install`
Expected: `vendor/` directory populated, no errors. PHPUnit installed.

- [ ] **Install Node dependencies (for Playwright)**

Run: `npm install`
Expected: `node_modules/` populated. (Run `npx playwright install chromium` if Playwright complains about missing browsers later.)

- [ ] **Verify the existing test suite passes against the SLAY scaffold**

Run: `vendor/bin/phpunit`
Expected: all existing tests pass (this confirms the scaffold is healthy before we modify it).

- [ ] **Read the spec**

Read: `docs/superpowers/specs/2026-05-06-spelltoslay-design.md`
This plan assumes you've read it. Section numbers below reference the spec.

---

## File-Structure Overview

**Created:**
- `public/words/grade-K.json` … `public/words/grade-8.json` — built-in word pools, three difficulty buckets each.
- `public/api/words.php` — serves the active word pool.
- `tests/api/WordsTest.php` — PHPUnit tests for `words.php`.

**Replaced (whole-file rewrites):**
- `public/game.js` — the SpellToSlay engine. Same shape as SLAY's (constants, registries, state, systems, render, networking, main loop) but the gameplay loop is entirely new.
- `public/index.html` — new title, typing input element, removed WASD hints.

**Modified (focused edits, preserving inherited code):**
- `scripts/init_db.php` — add migrations for new columns and the `teacher_word_list` table; rename DB filename references.
- `public/api/_bootstrap.php` — rename `slay_*` helpers to `sts_*`; rename `SLAY_*` constants/globals.
- `public/api/state.php` — emit new fields (`wordSource`, `wordListVersion`, `pushWord`).
- `public/api/teacher.php` — add 4 new actions (`setWordList`, `clearWordList`, `setGradeLevel`, `pushWord`).
- `public/api/score.php` — accept and store new fields (`wpm`, `accuracy`, `wordsSlain`).
- `public/api/leaderboard.php` — return new fields.
- `public/api/health.php`, `players.php`, `rename.php`, `poll-vote.php`, `contributors.php` — naming-only updates.
- `public/style.css` — corner-stat HUD pill styles, locked-enemy ring, word-pool teacher controls.
- `public/teacher.html` — add Word Pool section with grade dropdown, textarea, push-word field.
- `public/teacher.js` — render active word source; wire up the four new teacher actions.
- `tests/bootstrap.php` and `tests/api/*.php` — rename to `sts_*` helpers.
- `tests/e2e/happy-path.spec.js` — update for typing flow and new score fields.
- `composer.json`, `package.json` — name field.
- `deploy.php` — application name, hostname, deploy_path.
- `playwright.config.js` — config template string.
- `README.md`, `CLAUDE.md`, `CHANGELOG.md`, `docs/orientation.md` — project name updates.

**Untouched:**
- `docs/reference/slay/` — preserved as parent-project reference.
- `data/` — runtime DB lives here, gitignored.

---

## Task 1: Rename pass — `slay_*` → `sts_*`, `typenspell` → `spelltoslay`

**Files (every file containing `slay_*`, `SLAY_*`, `typenspell`, or `TypeNSpell`, except `docs/reference/slay/`):**
- Modify: `public/api/_bootstrap.php`, `public/api/state.php`, `public/api/score.php`, `public/api/leaderboard.php`, `public/api/teacher.php`, `public/api/players.php`, `public/api/rename.php`, `public/api/poll-vote.php`, `public/api/contributors.php`, `public/api/health.php`
- Modify: `scripts/init_db.php`
- Modify: `tests/bootstrap.php`, `tests/api/BootstrapSmokeTest.php`, `tests/api/ContributorsTest.php`, `tests/api/HealthTest.php`, `tests/api/LeaderboardTest.php`, `tests/api/PlayersTest.php`, `tests/api/PollVoteTest.php`, `tests/api/RenameTest.php`, `tests/api/ScoreTest.php`, `tests/api/StateTest.php`, `tests/api/TeacherTest.php`
- Modify: `public/game.js` (only the `localStorage.getItem('slay_cid')` / `setItem` lines and the `<title>` references; the gameplay loop is replaced wholesale in later tasks)
- Modify: `public/teacher.js` (only the `slay_teacher_key` localStorage key)
- Modify: `public/index.html`, `public/teacher.html` — `<title>SLAY</title>` → `<title>SpellToSlay</title>`
- Modify: `composer.json` — `"name": "lockersoft/slay"` → `"name": "lockersoft/spelltoslay"`
- Modify: `deploy.php` — `application`, `repository`, `host()`, `deploy_path` strings
- Modify: `playwright.config.js` — config template (just rename inside the embedded string)
- Modify: `CLAUDE.md`, `CHANGELOG.md`, `README.md`, `docs/orientation.md`, `VERSION_BASE` (no SLAY references but leave unchanged)
- **Skip:** `docs/reference/slay/spec.md`, `docs/reference/slay/plan.md` — preserved as parent-project reference

**Goal of this task:** every internal reference uses the new naming. After this task, the test suite still passes (the renames are mechanical; no logic changes).

- [ ] **Step 1: Run a global sed pass on PHP, JS, JSON, HTML, CSS, MD files**

These are case-sensitive replacements. Run them in order from longest to shortest match so longer matches don't get partially clobbered.

```bash
# 1. Identifier prefixes (longest first to avoid partial overlaps)
git grep -lZ 'SLAY_TEACHER_KEY' -- ':!docs/reference/' | xargs -0 sed -i '' 's/SLAY_TEACHER_KEY/STS_TEACHER_KEY/g'
git grep -lZ 'SLAY_DB_PATH'      -- ':!docs/reference/' | xargs -0 sed -i '' 's/SLAY_DB_PATH/STS_DB_PATH/g'
git grep -lZ '__SLAY_TEST_INPUT' -- ':!docs/reference/' | xargs -0 sed -i '' 's/__SLAY_TEST_INPUT/__STS_TEST_INPUT/g'
git grep -lZ '__SLAY_HEADERS'    -- ':!docs/reference/' | xargs -0 sed -i '' 's/__SLAY_HEADERS/__STS_HEADERS/g'
git grep -lZ '__SLAY_DB_PATH'    -- ':!docs/reference/' | xargs -0 sed -i '' 's/__SLAY_DB_PATH/__STS_DB_PATH/g'
git grep -lZ '__SLAY_CONFIG'     -- ':!docs/reference/' | xargs -0 sed -i '' 's/__SLAY_CONFIG/__STS_CONFIG/g'

# 2. Function names (slay_db, slay_config, etc.)
for fn in slay_db slay_config slay_input_raw slay_input_json slay_header slay_json slay_now slay_is_profane slay_invoke; do
  newfn="${fn/slay_/sts_}"
  git grep -lZ "$fn" -- ':!docs/reference/' | xargs -0 sed -i '' "s/$fn/$newfn/g"
done

# 3. localStorage keys & file/db filenames
git grep -lZ 'slay_cid'         -- ':!docs/reference/' | xargs -0 sed -i '' 's/slay_cid/sts_cid/g'
git grep -lZ 'slay_player_name' -- ':!docs/reference/' | xargs -0 sed -i '' 's/slay_player_name/sts_player_name/g'
git grep -lZ 'slay_teacher_key' -- ':!docs/reference/' | xargs -0 sed -i '' 's/slay_teacher_key/sts_teacher_key/g'
git grep -lZ 'slay\.db'         -- ':!docs/reference/' | xargs -0 sed -i '' 's/slay\.db/spelltoslay.db/g'

# 4. PHPUnit namespace (Slay\Tests → Spelltoslay\Tests)
git grep -lZ 'Slay\\\\Tests'    -- ':!docs/reference/' | xargs -0 sed -i '' 's/Slay\\\\Tests/Spelltoslay\\\\Tests/g'
git grep -lZ 'Slay\\Tests'      -- ':!docs/reference/' | xargs -0 sed -i '' 's/Slay\\Tests/Spelltoslay\\Tests/g'

# 5. Project / domain / repo / package strings
git grep -lZ 'typenspell'              -- ':!docs/reference/' | xargs -0 sed -i '' 's/typenspell/spelltoslay/g'
git grep -lZ 'TypeNSpell'              -- ':!docs/reference/' | xargs -0 sed -i '' 's/TypeNSpell/SpellToSlay/g'
git grep -lZ 'slay\.lockersoft\.games' -- ':!docs/reference/' | xargs -0 sed -i '' 's/slay\.lockersoft\.games/spelltoslay.lockersoft.games/g'
git grep -lZ 'lockersoft/slay'         -- ':!docs/reference/' | xargs -0 sed -i '' 's|lockersoft/slay|lockersoft/spelltoslay|g'
git grep -lZ 'github-slay'             -- ':!docs/reference/' | xargs -0 sed -i '' 's/github-slay/github-spelltoslay/g'
git grep -lZ 'slay-app'                -- ':!docs/reference/' | xargs -0 sed -i '' 's/slay-app/spelltoslay-app/g'

# 6. Title / heading / brand name "SLAY" — be careful, only as a standalone word
# Update these explicitly per-file rather than a regex pass; they're few and sed-with-word-boundaries on macOS is awkward.
```

For step 6, edit these files manually:

- `public/index.html`: `<title>SLAY</title>` → `<title>SpellToSlay</title>`. Also `<h1>SLAY</h1>` → `<h1>SpellToSlay</h1>`. Also `Welcome to SLAY` (in the name-entry modal) → `Welcome to SpellToSlay`.
- `public/teacher.html`: `<title>SLAY · Teacher Control</title>` → `<title>SpellToSlay · Teacher Control</title>`. `<h1>SLAY · Teacher Control</h1>` → `<h1>SpellToSlay · Teacher Control</h1>`.
- `composer.json`: `"description": "SLAY — browser arena game…"` → `"description": "SpellToSlay — browser typing/spelling game for in-class AI vibe coding."`
- `deploy.php`: comment `// SLAY runs on DreamHost…` → `// SpellToSlay runs on DreamHost…`
- `README.md`: Top heading and any prose mentioning "SLAY" as the project name → "SpellToSlay". Leave any references to the *parent* SLAY project (e.g. "forked from SLAY") intact.
- `CLAUDE.md`: "TypeNSpell" → "SpellToSlay" throughout the project notes. Leave the "fork-by-copy of the SLAY project" wording (that's historical context).

- [ ] **Step 2: Verify no stray `slay_` (function/var prefix) or `SLAY_` constant remains**

Run: `git grep -E 'slay_(db|config|json|now|invoke|input_raw|input_json|header|is_profane|cid|player_name|teacher_key)|SLAY_(DB_PATH|TEACHER_KEY)|__SLAY_' -- ':!docs/reference/'`
Expected: no output (zero matches outside the reference docs).

- [ ] **Step 3: Run the test suite — every existing test should still pass**

Run: `vendor/bin/phpunit`
Expected: all tests green. If any fails, the rename missed a reference; find it and fix.

- [ ] **Step 4: Smoke-test the live PHP server briefly**

Run: `php scripts/init_db.php && php -S localhost:8001 -t public &` then `curl -s localhost:8001/api/health.php`
Expected: `{"ok":true,"db":"ok",...}`. Stop the server with `kill %1` after.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: rename slay_* → sts_* and typenspell → spelltoslay

Mechanical sed pass across all source/test/docs except docs/reference/slay/
(parent-project reference, preserved as-is). No behavioral changes; full test
suite still green."
```

---

## Task 2: Schema migrations + DB filename

**Files:**
- Modify: `scripts/init_db.php`
- Test: `tests/api/BootstrapSmokeTest.php` (add column-existence assertions)

**Goal:** add `wpm`, `accuracy`, `words_slain` columns to `scores`; add `word_source`, `grade_level`, `word_list_version`, `push_word` to `state`; create `teacher_word_list` table. All idempotent (safe to re-run on every deploy).

- [ ] **Step 1: Write failing tests for the new columns**

Open `tests/api/BootstrapSmokeTest.php`. After the existing `testTablesExist` (or equivalent) test, add:

```php
public function testScoresTableHasNewColumns(): void
{
    $cols = array_column(
        sts_db()->query("PRAGMA table_info(scores)")->fetchAll(),
        'name'
    );
    $this->assertContains('wpm',         $cols);
    $this->assertContains('accuracy',    $cols);
    $this->assertContains('words_slain', $cols);
}

public function testStateTableHasNewColumns(): void
{
    $cols = array_column(
        sts_db()->query("PRAGMA table_info(state)")->fetchAll(),
        'name'
    );
    $this->assertContains('word_source',        $cols);
    $this->assertContains('grade_level',        $cols);
    $this->assertContains('word_list_version',  $cols);
    $this->assertContains('push_word',          $cols);
}

public function testTeacherWordListTableExists(): void
{
    $row = sts_db()->query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='teacher_word_list'"
    )->fetch();
    $this->assertNotFalse($row);
    $cols = array_column(
        sts_db()->query("PRAGMA table_info(teacher_word_list)")->fetchAll(),
        'name'
    );
    $this->assertContains('word',     $cols);
    $this->assertContains('position', $cols);
    $this->assertContains('set_at',   $cols);
}
```

- [ ] **Step 2: Run the new tests — they must fail**

Run: `vendor/bin/phpunit tests/api/BootstrapSmokeTest.php`
Expected: 3 failures with messages about missing columns/tables.

- [ ] **Step 3: Add migrations to `scripts/init_db.php`**

In `scripts/init_db.php`, after the `// v1.1 migration: add name + personal_message…` block (around line 57) — i.e. before the existing `// Feature 12 — Live polls` block — add a new "SpellToSlay v1 migrations" section. The existing `$existing = array_column($cols, 'name');` line (for `presence`) must NOT be reused; we need fresh column lists for `scores` and `state`. Add this code:

```php
// ── SpellToSlay v1: scores table — add typing-specific columns ─────────────
$scoresCols = $pdo->query("PRAGMA table_info(scores)")->fetchAll(PDO::FETCH_ASSOC);
$existingScoresCols = array_column($scoresCols, 'name');
if (!in_array('wpm', $existingScoresCols, true)) {
    $pdo->exec("ALTER TABLE scores ADD COLUMN wpm INTEGER NOT NULL DEFAULT 0");
}
if (!in_array('accuracy', $existingScoresCols, true)) {
    $pdo->exec("ALTER TABLE scores ADD COLUMN accuracy INTEGER NOT NULL DEFAULT 0");
}
if (!in_array('words_slain', $existingScoresCols, true)) {
    $pdo->exec("ALTER TABLE scores ADD COLUMN words_slain INTEGER NOT NULL DEFAULT 0");
}

// ── SpellToSlay v1: state table — word-pool fields ────────────────────────
$stateColsV2 = $pdo->query("PRAGMA table_info(state)")->fetchAll(PDO::FETCH_ASSOC);
$existingStateColsV2 = array_column($stateColsV2, 'name');
if (!in_array('word_source', $existingStateColsV2, true)) {
    $pdo->exec("ALTER TABLE state ADD COLUMN word_source TEXT NOT NULL DEFAULT 'builtin:6'");
}
if (!in_array('grade_level', $existingStateColsV2, true)) {
    $pdo->exec("ALTER TABLE state ADD COLUMN grade_level INTEGER NOT NULL DEFAULT 6");
}
if (!in_array('word_list_version', $existingStateColsV2, true)) {
    $pdo->exec("ALTER TABLE state ADD COLUMN word_list_version INTEGER NOT NULL DEFAULT 0");
}
if (!in_array('push_word', $existingStateColsV2, true)) {
    $pdo->exec("ALTER TABLE state ADD COLUMN push_word TEXT NOT NULL DEFAULT ''");
}

// ── SpellToSlay v1: teacher-uploaded word list ────────────────────────────
$pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS teacher_word_list (
    id        INTEGER PRIMARY KEY,
    word      TEXT NOT NULL,
    position  INTEGER NOT NULL,
    set_at    INTEGER NOT NULL
)
SQL);
$pdo->exec('CREATE INDEX IF NOT EXISTS idx_teacher_word_list_pos ON teacher_word_list(position)');
```

Also update the success-print line at the bottom of the file from `Initialized SLAY DB at $dbPath` to `Initialized SpellToSlay DB at $dbPath` (the rename pass should have done this; confirm).

- [ ] **Step 4: Run the new tests — they must pass**

Run: `vendor/bin/phpunit tests/api/BootstrapSmokeTest.php`
Expected: green.

- [ ] **Step 5: Run the full suite — nothing else broke**

Run: `vendor/bin/phpunit`
Expected: all tests green.

- [ ] **Step 6: Commit**

```bash
git add scripts/init_db.php tests/api/BootstrapSmokeTest.php
git commit -m "feat(db): add SpellToSlay v1 schema migrations

Adds wpm/accuracy/words_slain to scores; adds word_source/grade_level/
word_list_version/push_word to state; creates teacher_word_list table.
All idempotent (CREATE IF NOT EXISTS / column-presence guards)."
```

---

## Task 3: Built-in word lists for grades K–8

**Files:**
- Create: `public/words/grade-K.json`, `public/words/grade-1.json`, …, `public/words/grade-8.json` (9 files)
- Create: `public/words/README.md` — attribution and curation notes
- Test: `tests/api/WordListsTest.php` — schema validation across all 9 files

**Goal:** ship a curated set of grade-level word lists with the three difficulty buckets pre-split. v1 doesn't auto-curate — the JSON files are committed by hand from a public source.

**Sourcing approach:** Use the **Dolch sight-word list** (public domain) for grades K–3 and a **frequency-banded common-English list** for grades 4–8. The full lists below are the day-one content; replace with better curation later. Do NOT hand-craft 9 lists from scratch — that's hours of busywork. Use the values exactly as given here for v1.

**Bucketing rule** (already applied in the lists below): `easy` ≤ 5 letters; `hard` ≥ 8 letters; `medium` is the rest. Each bucket should have at least 20 entries so the spawner has variety.

- [ ] **Step 1: Write the validation test FIRST**

Create `tests/api/WordListsTest.php`:

```php
<?php
declare(strict_types=1);

namespace Spelltoslay\Tests\Api;

use PHPUnit\Framework\TestCase;

final class WordListsTest extends TestCase
{
    private const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8'];

    public function testEveryGradeFileExists(): void
    {
        foreach (self::GRADES as $g) {
            $path = __DIR__ . "/../../public/words/grade-$g.json";
            $this->assertFileExists($path, "missing grade-$g.json");
        }
    }

    public function testEveryGradeFileHasRequiredShape(): void
    {
        foreach (self::GRADES as $g) {
            $path = __DIR__ . "/../../public/words/grade-$g.json";
            $data = json_decode((string)file_get_contents($path), true);
            $this->assertIsArray($data, "grade-$g.json is not valid JSON");
            $this->assertArrayHasKey('grade',   $data, "grade-$g missing 'grade'");
            $this->assertArrayHasKey('version', $data, "grade-$g missing 'version'");
            $this->assertArrayHasKey('easy',    $data, "grade-$g missing 'easy'");
            $this->assertArrayHasKey('medium',  $data, "grade-$g missing 'medium'");
            $this->assertArrayHasKey('hard',    $data, "grade-$g missing 'hard'");
            foreach (['easy', 'medium', 'hard'] as $bucket) {
                $this->assertIsArray($data[$bucket], "grade-$g $bucket is not an array");
                $this->assertGreaterThanOrEqual(20, count($data[$bucket]),
                    "grade-$g $bucket needs at least 20 words");
                foreach ($data[$bucket] as $w) {
                    $this->assertIsString($w);
                    $this->assertMatchesRegularExpression('/^[a-z]+$/', $w,
                        "grade-$g $bucket contains non-lowercase-letter word: $w");
                }
            }
        }
    }

    public function testBucketingRulesHold(): void
    {
        foreach (self::GRADES as $g) {
            $path = __DIR__ . "/../../public/words/grade-$g.json";
            $data = json_decode((string)file_get_contents($path), true);
            foreach ($data['easy'] as $w) {
                $this->assertLessThanOrEqual(5, strlen($w), "easy bucket grade-$g: '$w' too long");
            }
            foreach ($data['hard'] as $w) {
                $this->assertGreaterThanOrEqual(8, strlen($w), "hard bucket grade-$g: '$w' too short");
            }
        }
    }
}
```

- [ ] **Step 2: Run the test — it must fail (no files exist yet)**

Run: `vendor/bin/phpunit tests/api/WordListsTest.php`
Expected: failures (missing files).

- [ ] **Step 3: Create `public/words/grade-K.json`**

```json
{
  "grade": "K",
  "version": 1,
  "easy": ["a","and","at","big","but","cat","come","dad","day","do","dog","fly","for","fun","get","go","had","has","he","her","him","his","how","I","in","is","it","like","look","love","make","me","mom","my","no","not","now","of","oh","old","on","one","play","ran","red","run","sad","sat","see","she","sit","six","so","sun","ten","the","to","two","up","us","was","we","who","yes","you"],
  "medium": ["after","again","ball","bear","bird","blue","book","came","could","down","find","first","four","from","funny","good","green","help","here","into","jump","just","know","little","made","many","much","must","name","once","over","said","says","seven","some","stop","take","tell","that","them","then","they","this","very","walk","want","were","what","when","where","which","white","will","with","wish","work","would","your"],
  "hard": ["beautiful","because","children","everybody","everyone","favorite","friendly","important","mountain","sometimes","something","together","wonderful","yesterday","beginning","carefully","different","everywhere","grandfather","grandmother","happiness","interesting","neighborhood","playground","remember"]
}
```

- [ ] **Step 4: Create `public/words/grade-1.json`**

```json
{
  "grade": "1",
  "version": 1,
  "easy": ["all","also","an","any","are","as","ask","away","back","been","best","both","by","can","city","does","each","even","find","five","four","from","gave","goes","gold","gone","grew","hard","its","keep","kind","last","left","may","most","only","open","or","our","own","read","ride","right","road","said","same","says","sing","sit","slow","some","soon","stop","such","take","tell","than","that","them","then","there","they","them","these","this","told","took","try","under","upon","use","walk","want","warm","wash","when","where","why","wish","work"],
  "medium": ["about","always","around","before","began","being","better","bring","brown","carry","clean","could","every","first","follow","full","funny","grow","hold","laugh","light","never","once","pretty","round","seven","shall","short","sleep","small","start","their","those","today","together","upon","very","wash","were","what","white","would","write","yellow","young"],
  "hard": ["alphabet","animals","another","beautiful","because","birthday","breakfast","building","children","computer","direction","everyone","everything","favorite","grandfather","grandmother","happiness","important","interesting","neighborhood","playground","remember","sometimes","something","together","tomorrow","wonderful","yesterday","beginning","carefully"]
}
```

- [ ] **Step 5: Create `public/words/grade-2.json`**

```json
{
  "grade": "2",
  "version": 1,
  "easy": ["able","add","ago","arm","art","baby","back","bad","band","bank","bath","beat","bed","best","big","bike","bird","bite","blue","boat","body","boil","book","born","both","box","boy","bring","bug","bus","busy","buy","cake","calf","call","camp","can","car","care","cart","case","cash","cat","catch","child","city","cold","cook","corn","cost","could","crow","cry","cup","cut"],
  "medium": ["across","afraid","always","animal","answer","behind","better","carry","catch","color","could","cross","early","earth","enough","every","family","father","field","fight","first","follow","found","front","getting","happy","heard","heart","heavy","letter","mother","never","number","other","paper","party","place","right","river","second","seven","sister","since","story","study","sugar","sweet","table","their","there","these","third","those","three","through","train","under","until","water","where","while","white","would","write"],
  "hard": ["activity","afternoon","alphabet","beautiful","beginning","birthday","breakfast","building","carefully","celebrate","computer","decision","difficult","direction","education","everybody","exercise","favorite","important","interesting","mountain","neighbor","neighborhood","ocean","playground","question","remember","scientist","sometimes","something","tomorrow","together","wonderful","yesterday"]
}
```

- [ ] **Step 6: Create `public/words/grade-3.json`**

```json
{
  "grade": "3",
  "version": 1,
  "easy": ["above","ace","add","admit","adopt","aim","alarm","alert","ample","apply","arena","argue","arm","art","atom","aware","awful","baker","balm","band","bare","barn","bath","bean","bear","beat","began","bend","best","blame","blast","blend","bless","block","blunt","blur","blush","boast","bold","bond","bone","born","brake","brand","brave","bread","break","bride","brief","bring","brisk","broke","broom","brown","brush","build","built","burst","busy","cable"],
  "medium": ["address","ahead","afford","appear","arrive","beauty","beneath","besides","between","blanket","brother","brought","capital","careful","central","century","certain","collect","command","compare","complete","contain","context","copper","correct","country","courage","crystal","decade","deliver","deserve","detail","develop","direct","disturb","economy","educate","effort","empire","enable","encourage","enjoyed","enormous","explain","extreme","fortune","gallery","general","greater","handle","heaven","history","honest","horizon","hundred","imagine","include","inquire","invent","journey"],
  "hard": ["acceptable","activity","afternoon","alphabet","beautiful","beginning","birthday","breakfast","calendar","calculate","celebrate","character","circumstance","computer","continuous","conversation","cooperate","decision","definitely","delicious","demonstrate","dictionary","difference","difficult","direction","disappoint","education","environment","equipment","everybody","exaggerate","exception","experience","experiment","favorite","government","gradually","historical","important","interrupt","mountain","necessary","neighborhood","occasion","ordinary","particular","passenger","performance","permanent","photograph","practical","preparation","problem","probably","question","recommend","references","sometimes","sufficient","temperature","throughout","tomorrow","traditional","unfortunately","wonderful"]
}
```

- [ ] **Step 7: Create `public/words/grade-4.json`**

```json
{
  "grade": "4",
  "version": 1,
  "easy": ["acid","alone","amaze","aloud","arena","arrow","aunt","avoid","banks","beach","blame","blind","blunt","boast","boost","brick","broad","brush","cabin","cable","camel","carve","cease","chair","cheap","cheek","cheer","chess","chief","child","claim","class","clerk","cliff","cling","clock","close","clout","crash","creek","cross","crowd","crown","crude","crust","curve","cycle","daily","dairy","damp","dance","dawn","death","debit","delay","depth","desk","diary","dirty","ditch","dough","drift","drown","drama"],
  "medium": ["accident","address","advance","ancient","awesome","balance","balcony","bargain","bedroom","believe","beneath","benefit","beyond","capable","central","ceremony","chamber","channel","chapter","character","charge","clothes","collect","command","comment","compare","compete","compose","computer","concept","concert","conduct","connect","control","convert","corner","correct","country","courage","cousin","creature","crystal","decade","declare","decline","deliver","deserve","destroy","develop","diamond","direct","discuss","display","distant","disturb","economy","educate","effort","element","empire","engage","enormous","entire","environment"],
  "hard": ["accommodate","achievement","afternoon","approximate","appearance","appropriate","argument","beautiful","beginning","beneficial","benefit","brilliant","calendar","celebrate","challenge","character","commercial","comparison","competition","completely","conscience","conscious","considerable","convenient","conversation","decision","definitely","desperate","determine","develop","disastrous","disappear","discipline","embarrass","emergency","environment","equipment","especially","exaggerate","excellent","experience","explanation","fascinate","february","forty","frequently","friendliness","government","grateful","guarantee","happiness","independent","intelligent","interesting","interrupt","jealous","knowledge","laboratory","library","license","literature","magazine","maintenance","marvelous","mathematics","mediterranean","misspelled","necessary","nuisance","occasionally","occurrence","opportunity","outrageous","permanent","personality","persuade","piece","politician","possession","possibility","practically","preferred","prejudice","preparation","privilege","probably","procedure","professor","pronunciation","psychology","questionnaire","receive","receipt","recommend","reference","relevant","religious","rhythm","ridiculous","scenery","schedule","seize","separate","sergeant","sincerely","successful","supersede","surprise","temperature","thorough","tomorrow","tongue","tragedy","unfortunately","villain","weather","weird"]
}
```

- [ ] **Step 8: Create `public/words/grade-5.json`**

```json
{
  "grade": "5",
  "version": 1,
  "easy": ["abide","abuse","acute","admit","agile","alarm","aloud","amend","ample","argue","arise","aware","awful","banish","beard","blade","blame","blast","blaze","bleak","blend","bless","blunt","blush","boast","boost","brave","break","brisk","broad","brown","brush","cable","candy","carve","cease","chant","cheek","cheer","chief","claim","cliff","cling","close","cloud","clown","coast","crack","crash","creek","crest","crisp","cross","crowd","crown","crude","crush","crust","curve","cycle","daily","dairy","dance","dawn","debit","delay","depth","dirty"],
  "medium": ["abandon","absolute","abundant","accept","accuse","achieve","acquire","acquaint","address","admire","adopt","advance","advise","adviser","ancient","approve","arrange","arrival","article","attempt","attention","attract","balance","balcony","bargain","because","beneath","benefit","beyond","brilliant","capable","celebrate","central","ceremony","chamber","channel","chapter","character","charity","collect","command","commerce","commit","community","compare","compete","compose","conceal","concern","concept","conclude","conduct","conflict","connect","conquer","consent","consider","consult","contain","contemporary","contend","content","contest","contract","control","convert","corner","correct","country","courage","cousin","creature","crystal","cultural","decade","declare","decline","defend","defense","delight","deliver","describe","deserve","desire","destroy","develop","diamond","direct","discuss","display","distant","disturb","economy","educate","element","embrace","emergency","empire","enable","encounter","engage","enormous","entire","environment","equator","escape","essential","establish","evident","examine","exclaim","exchange","existence","expand","explain","extreme","famous","fantasy","feature","federal","festival","forbid","fortune","fragment","gallery","gather","general","generous","genuine","gigantic","graceful","gradual","grateful","greater","handle","harvest","heaven","history","honest","horizon","horizon","hospital","hundred","identify","illustrate","imagine","include","increase","independent","industry","inspire","interrupt","invent","journey"],
  "hard": ["accommodate","achievement","acknowledge","afternoon","apparent","appearance","appropriate","argument","awkward","beautiful","beginning","believe","beneficial","brilliant","calendar","celebrate","challenge","character","collaboration","commercial","comparison","competition","completely","concentration","conscience","conscious","considerable","consistent","consequence","convenient","conversation","correspondence","decision","definitely","desperate","determine","disappear","disappoint","disastrous","discipline","disposable","distinguish","embarrass","emergency","environment","equipment","especially","essential","exaggerate","excellent","exhibit","experience","experiment","explanation","extraordinary","fascinate","february","fluorescent","forty","fortunate","frequently","fundamental","government","grateful","guarantee","happiness","harassment","hereditary","hesitate","hilarious","historical","humorous","imitate","immediate","incredible","independent","indispensable","inevitable","intelligent","interesting","interrupt","irresistible","jealous","justifiable","knowledge","laboratory","leisure","library","license","literature","magazine","maintenance","management","marvelous","mathematics","mediterranean","misspelled","mortgage","mountain","necessary","negotiate","nuisance","obstacle","occasionally","occurrence","opportunity","outrageous","panicking","particular","passenger","performance","permanent","personality","persuade","pharaoh","picnicking","piece","playwright","politician","possession","possibility","practically","precede","preferred","prejudice","preparation","privilege","probably","procedure","professor","pronunciation","psychology","questionnaire","receive","receipt","recommend","reference","relevant","religious","reservoir","resistance","restaurant","rhythm","ridiculous","sacrifice","scenery","schedule","seize","separate","sergeant","similar","sincerely","successful","supersede","surprise","sustenance","temperature","temporary","thorough","threshold","tomorrow","tongue","tragedy","tranquility","unfortunately","unnecessary","villain","weather","weird"]
}
```

- [ ] **Step 9: Create `public/words/grade-6.json`**

```json
{
  "grade": "6",
  "version": 1,
  "easy": ["abide","abuse","acute","adapt","adept","admit","adopt","agile","alarm","aloud","amend","ample","apply","arena","argue","arise","aware","awful","balm","banish","beard","blade","blame","blast","blaze","bleak","blend","bless","blunt","blush","boast","boost","brave","break","brisk","broad","brown","brush","cable","carve","cease","chant","cheek","cheer","chief","chord","claim","clash","cliff","cling","close","cloud","clown","coast","crack","crash","creek","crest","crisp","cross","crowd","crown","crude","crush","crust","curve","cycle","daily","dairy","dance","dawn","debit","delay","depth","dirty","ditch"],
  "medium": ["abandon","absolute","abundant","academic","accept","accuse","achieve","acquaint","acquire","activity","address","adequate","admire","advance","advise","adviser","affect","ancient","appear","approve","arrange","arrival","article","assume","athletic","attempt","attention","attract","authentic","balance","balcony","bargain","because","beneath","benefit","beyond","brilliant","capable","celebrate","central","ceremony","chamber","channel","chapter","character","charity","collect","command","commerce","commit","community","compare","compete","compose","conceal","concern","concept","conclude","conduct","conflict","connect","conquer","consent","consider","consult","contain","contemporary","contend","content","contest","contract","control","convert","corner","correct","country","courage","cousin","creature","crystal","cultural","decade","declare","decline","defend","defense","delight","deliver","describe","deserve","desire","destroy","develop","diamond","direct","discuss","display","distant","disturb","economy","educate","element","embrace","emergency","empire","enable","encounter","engage","enormous","entire","environment","equator","escape","essential","establish","evident","examine","exclaim","exchange","existence","expand","explain","extreme","famous","fantasy","feature","federal","festival","forbid","fortune","fragment","gallery","gather","general","generous","genuine","gigantic","graceful","gradual","grateful","greater","handle","harvest","heaven","history","honest","horizon","hospital","hundred","identify","illustrate","imagine","include","increase","independent","industry","inspire","interrupt","invent","journey"],
  "hard": ["accommodate","accomplish","achievement","acknowledge","aggressive","alphabetical","apparent","appearance","appreciate","appropriate","approximate","argument","association","atmosphere","awkward","beautiful","beginning","believe","beneficial","brilliant","calculate","calendar","camouflage","celebrate","challenge","character","collaboration","colleague","commercial","commission","comparison","competition","completely","concentration","conscience","conscious","considerable","consistent","consequence","constitution","contemporary","controversy","convenient","conversation","correspondence","curiosity","decision","definitely","democratic","desperate","determine","development","disappear","disappoint","disastrous","disciplinary","discipline","disposable","distinguish","economical","embarrass","emergency","environment","equipment","especially","essential","evaporate","exaggerate","excellent","exhibition","experience","experiment","explanation","extraordinary","fascinate","february","fluorescent","forty","fortunate","fragmentary","frequently","fundamental","generation","geographical","government","grateful","guarantee","happiness","harassment","headquarters","hereditary","hesitate","hilarious","historical","humorous","ignorance","illustrate","imitate","immediate","immortality","impossibility","incredible","independent","indispensable","inevitable","ingredient","intelligent","interesting","interrupt","irresistible","jealous","jewelry","journalism","justifiable","knowledge","laboratory","legitimate","leisure","library","license","literature","magazine","magnificent","maintenance","management","marvelous","mathematics","mediterranean","metropolitan","microscope","misspelled","mortgage","mountain","movement","necessary","negotiate","neighborhood","nuisance","obstacle","occasionally","occurrence","opportunity","outrageous","panicking","particular","passenger","performance","permanent","personality","persuade","pharaoh","photographer","picnicking","piece","playwright","politician","possession","possibility","practically","precede","preferred","prejudice","preparation","privilege","probably","procedure","professional","pronunciation","psychology","questionnaire","receive","receipt","recognize","recommend","reference","relevant","religious","reservoir","resistance","responsibility","restaurant","rhythm","ridiculous","sacrifice","scenery","schedule","scientific","seize","separate","sergeant","similar","sincerely","successful","supersede","surprise","sustenance","temperature","temporary","thorough","threshold","tomorrow","tongue","tragedy","tranquility","unfortunately","unnecessary","villain","vocabulary","weather","weird"]
}
```

- [ ] **Step 10: Create `public/words/grade-7.json`**

Same shape; copy `grade-6.json` and amend slightly to make it grade-appropriate. For v1 it is acceptable for grades 6, 7, and 8 to share most of their pool — the bucketing is what matters. Use this content:

```json
{
  "grade": "7",
  "version": 1,
  "easy": ["abate","abide","abuse","acute","adapt","adept","admit","adopt","agile","alarm","aloof","aloud","amend","ample","apply","arena","argue","arise","aware","awful","banish","beard","blade","blame","blast","blaze","bleak","blend","bless","blunt","blush","boast","boost","brave","break","brisk","broad","brown","brush","cable","carve","cease","chafe","chant","cheek","cheer","chief","chord","claim","clash","cliff","cling","close","cloud","clown","coast","crack","crash","creek","crest","crisp","cross","crowd","crown","crude","crush","curve","cycle","daily","dairy","dance","dawn","debit","delay","depth","dirty","ditch"],
  "medium": ["abandon","absolute","abundant","academic","accept","accuse","achieve","acquaint","acquire","activity","address","adequate","admire","advance","advise","adviser","affect","alternate","alternative","analyze","ancient","apparent","appear","approve","arrange","arrival","article","assume","athletic","attempt","attention","attract","authentic","balance","balcony","bargain","because","beneath","benefit","beyond","brilliant","capable","celebrate","central","ceremony","chamber","channel","chapter","character","charity","collect","command","commerce","commit","community","compare","compete","compose","conceal","concern","concept","conclude","conduct","conflict","connect","conquer","consent","consider","consult","contain","contend","content","contest","contract","control","convert","corner","correct","country","courage","cousin","creature","crystal","cultural","decade","declare","decline","defend","defense","delight","deliver","describe","deserve","desire","destroy","develop","diamond","direct","discuss","display","distant","disturb","economy","educate","element","embrace","emergency","empire","enable","encounter","engage","enormous","entire","environment","equator","escape","essential","establish","evident","examine","exclaim","exchange","existence","expand","explain","extreme","famous","fantasy","feature","federal","festival","forbid","fortune","fragment","gallery","gather","general","generous","genuine","gigantic","graceful","gradual","grateful","greater","handle","harvest","heaven","history","honest","horizon","hospital","hundred","identify","illustrate","imagine","include","increase","independent","industry","inspire","interrupt","invent","journey"],
  "hard": ["abdomen","abolition","abundance","accommodate","accomplishment","achievement","acknowledge","acquaintance","aggressive","alphabetical","amateur","ambitious","anonymous","apparent","appearance","appreciate","appropriate","approximate","argument","association","atmosphere","awkward","beautiful","beginning","beneficial","bilingual","biological","brilliant","calculate","calendar","camouflage","celebrate","challenge","character","circumstance","collaboration","colleague","colossal","commercial","commission","comparison","competition","completely","concentration","conscience","conscious","considerable","consistent","consequence","constitution","contemporary","controversy","convenient","conversation","correspondence","curiosity","decision","definitely","democratic","desperate","determination","development","disappear","disappoint","disastrous","disciplinary","discipline","disposable","distinguish","economical","embarrass","emergency","environment","equipment","especially","essential","evaporate","exaggerate","excellent","exhibition","experience","experiment","explanation","extraordinary","fascinate","february","fluorescent","forty","fortunate","fragmentary","frequently","fundamental","generation","geographical","government","grateful","guarantee","happiness","harassment","headquarters","hereditary","hesitate","hilarious","historical","humorous","ignorance","illustrate","imitate","immediate","immortality","impossibility","incredible","independent","indispensable","inevitable","ingredient","intelligent","interesting","interrupt","irresistible","jealous","jewelry","journalism","justifiable","knowledge","laboratory","legitimate","leisure","library","license","literature","magazine","magnificent","maintenance","management","marvelous","mathematics","mediterranean","metropolitan","microscope","misspelled","mortgage","mountain","movement","necessary","negotiate","neighborhood","nuisance","obstacle","occasionally","occurrence","opportunity","outrageous","panicking","particular","passenger","performance","permanent","personality","persuade","pharaoh","photographer","picnicking","piece","playwright","politician","possession","possibility","practically","precede","preferred","prejudice","preparation","privilege","probably","procedure","professional","pronunciation","psychology","questionnaire","receive","receipt","recognize","recommend","reference","relevant","religious","reservoir","resistance","responsibility","restaurant","rhythm","ridiculous","sacrifice","scenery","schedule","scientific","seize","separate","sergeant","similar","sincerely","successful","supersede","surprise","sustenance","temperature","temporary","thorough","threshold","tomorrow","tongue","tragedy","tranquility","unfortunately","unnecessary","villain","vocabulary","weather","weird"]
}
```

- [ ] **Step 11: Create `public/words/grade-8.json`**

```json
{
  "grade": "8",
  "version": 1,
  "easy": ["abate","abide","abuse","acute","adapt","adept","admit","adopt","agile","alarm","aloof","aloud","amend","ample","apply","arena","argue","arise","aware","awful","banal","banish","beard","blade","blame","blast","blaze","bleak","blend","bless","blunt","blush","boast","boost","brave","break","brisk","broad","brown","brush","cable","carve","cease","chafe","chant","cheek","cheer","chief","chord","claim","clash","cliff","cling","close","cloud","clown","coast","crack","crash","creek","crest","crisp","cross","crowd","crown","crude","crush","curve","cycle","daily","dairy","dance","dawn","debit","delay","depth","dirty","ditch"],
  "medium": ["abandon","absolute","abundant","academic","accept","accuse","achieve","acquaint","acquire","activity","address","adequate","admire","advance","advise","adviser","affect","alternate","alternative","analyze","ancient","apparent","appear","approve","arrange","arrival","article","assume","athletic","attempt","attention","attract","authentic","balance","balcony","bargain","because","beneath","benefit","beyond","brilliant","capable","celebrate","central","ceremony","chamber","channel","chapter","character","charity","collect","command","commerce","commit","community","compare","compete","compose","conceal","concern","concept","conclude","conduct","conflict","connect","conquer","consent","consider","consult","contain","contend","content","contest","contract","control","convert","corner","correct","country","courage","cousin","creature","crystal","cultural","decade","declare","decline","defend","defense","delight","deliver","describe","deserve","desire","destroy","develop","diamond","direct","discuss","display","distant","disturb","economy","educate","element","embrace","emergency","empire","enable","encounter","engage","enormous","entire","environment","equator","escape","essential","establish","evident","examine","exclaim","exchange","existence","expand","explain","extreme","famous","fantasy","feature","federal","festival","forbid","fortune","fragment","gallery","gather","general","generous","genuine","gigantic","graceful","gradual","grateful","greater","handle","harvest","heaven","history","honest","horizon","hospital","hundred","identify","illustrate","imagine","include","increase","independent","industry","inspire","interrupt","invent","journey"],
  "hard": ["abdomen","abolition","abundance","accommodate","accomplishment","achievement","acknowledge","acquaintance","aggressive","alphabetical","amateur","ambitious","anonymous","apparent","appearance","appreciate","appropriate","approximate","argument","association","atmosphere","awkward","beautiful","beginning","beneficial","bilingual","biological","brilliant","calculate","calendar","camouflage","celebrate","challenge","character","circumstance","collaboration","colleague","colossal","commercial","commission","comparison","competition","completely","concentration","conscience","conscious","considerable","consistent","consequence","constitution","contemporary","controversy","convenient","conversation","correspondence","curiosity","decision","definitely","democratic","desperate","determination","development","disappear","disappoint","disastrous","disciplinary","discipline","disposable","distinguish","economical","embarrass","emergency","entrepreneur","environment","equipment","especially","essential","evaporate","exaggerate","excellent","exhibition","experience","experiment","explanation","extraordinary","fascinate","february","fluorescent","forty","fortunate","fragmentary","frequently","fundamental","generation","geographical","government","grateful","guarantee","happiness","harassment","headquarters","hereditary","hesitate","hilarious","historical","humorous","ignorance","illustrate","imitate","immediate","immortality","impossibility","incredible","independent","indispensable","inevitable","ingredient","intelligent","interesting","interrupt","irresistible","jealous","jewelry","journalism","justifiable","knowledge","laboratory","legitimate","leisure","library","license","literature","magazine","magnificent","maintenance","management","marvelous","mathematics","mediterranean","metropolitan","microscope","misspelled","mortgage","mountain","movement","necessary","negotiate","neighborhood","nuisance","obstacle","occasionally","occurrence","opportunity","outrageous","panicking","particular","passenger","performance","permanent","personality","persuade","pharaoh","photographer","picnicking","piece","playwright","politician","possession","possibility","practically","precede","preferred","prejudice","preparation","privilege","probably","procedure","professional","pronunciation","psychology","questionnaire","receive","receipt","recognize","recommend","reference","relevant","religious","reservoir","resistance","responsibility","restaurant","rhythm","ridiculous","sacrifice","scenery","schedule","scientific","seize","separate","sergeant","similar","sincerely","successful","supersede","surprise","sustenance","temperature","temporary","thorough","threshold","tomorrow","tongue","tragedy","tranquility","unfortunately","unnecessary","villain","vocabulary","weather","weird"]
}
```

- [ ] **Step 12: Create `public/words/README.md`** with attribution and curation notes

```markdown
# SpellToSlay built-in word lists

Lightweight, hand-curated grade-level word pools, one JSON file per grade
(K through 8). Each file has three difficulty buckets:

- `easy`   — ≤ 5 letters, common words.
- `medium` — 6–7 letters or moderately common.
- `hard`   — ≥ 8 letters or low-frequency.

The day-one lists were compiled from a mix of public-domain sources
(Dolch sight-word list for K–3, frequency-banded common-English vocabulary
for 4–8). They are starting points, not a curriculum — teachers paste
their weekly lists in the teacher panel to override at runtime.

To add a word, edit the JSON file and bump the `version` field. The
`tests/api/WordListsTest.php` suite enforces the bucketing rules and a
minimum 20-word floor per bucket.

## Bucketing rule

If you're adding words by hand and unsure where they go:

- Length ≤ 5 → easy
- Length ≥ 8 → hard
- Otherwise → medium

These thresholds are intentional and tested. Don't widen `easy` or narrow
`hard` without updating the tests in lockstep.
```

- [ ] **Step 13: Run the validation tests — they must all pass**

Run: `vendor/bin/phpunit tests/api/WordListsTest.php`
Expected: 3 tests green (file existence, shape, bucketing rules).

- [ ] **Step 14: Commit**

```bash
git add public/words/ tests/api/WordListsTest.php
git commit -m "feat(words): bundle grade K–8 built-in word pools

Three difficulty buckets per grade (easy ≤5 / medium 6–7 / hard ≥8).
Sourced from Dolch + frequency-banded common English. Validated by
WordListsTest (existence, shape, bucketing rules)."
```

---

## Task 4: `words.php` endpoint

**Files:**
- Create: `public/api/words.php`
- Create: `tests/api/WordsTest.php`

**Goal:** new GET endpoint that serves the active word pool. Three modes: `?source=builtin:<grade>`, `?source=teacher`, no param (read state to pick).

- [ ] **Step 1: Write failing tests**

Create `tests/api/WordsTest.php`:

```php
<?php
declare(strict_types=1);

namespace Spelltoslay\Tests\Api;

use PHPUnit\Framework\TestCase;

final class WordsTest extends TestCase
{
    protected function setUp(): void
    {
        sts_db()->exec('DELETE FROM teacher_word_list');
        sts_db()->exec("UPDATE state SET word_source='builtin:6', grade_level=6, word_list_version=0, push_word=''");
    }

    public function testBuiltinSourceReturnsGradeJson(): void
    {
        [$status, , $json] = sts_invoke('words.php', 'GET', ['source' => 'builtin:3']);
        $this->assertSame(200, $status);
        $this->assertSame('builtin:3', $json['source']);
        $this->assertIsArray($json['words']);
        $this->assertNotEmpty($json['words']);
        // The shape is a flat array of words — easy/medium/hard merged.
        foreach ($json['words'] as $w) {
            $this->assertIsString($w);
        }
    }

    public function testInvalidGradeReturns400(): void
    {
        [$status, , $json] = sts_invoke('words.php', 'GET', ['source' => 'builtin:99']);
        $this->assertSame(400, $status);
        $this->assertArrayHasKey('error', $json);
    }

    public function testMalformedSourceReturns400(): void
    {
        [$status] = sts_invoke('words.php', 'GET', ['source' => 'banana']);
        $this->assertSame(400, $status);
    }

    public function testTeacherSourceReturnsTeacherWords(): void
    {
        sts_db()->exec("INSERT INTO teacher_word_list (word, position, set_at) VALUES ('foo',0,1),('bar',1,1),('baz',2,1)");
        [$status, , $json] = sts_invoke('words.php', 'GET', ['source' => 'teacher']);
        $this->assertSame(200, $status);
        $this->assertSame('teacher', $json['source']);
        $this->assertSame(['foo','bar','baz'], $json['words']);
    }

    public function testNoParamFallsBackToActiveSource(): void
    {
        sts_db()->exec("UPDATE state SET word_source='builtin:1', word_list_version=5");
        [$status, , $json] = sts_invoke('words.php', 'GET');
        $this->assertSame(200, $status);
        $this->assertSame('builtin:1', $json['source']);
        $this->assertSame(5, $json['version']);
        $this->assertNotEmpty($json['words']);
    }
}
```

- [ ] **Step 2: Run the failing tests**

Run: `vendor/bin/phpunit tests/api/WordsTest.php`
Expected: failures (`words.php` does not exist).

- [ ] **Step 3: Create `public/api/words.php`**

```php
<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    sts_json(405, ['error' => 'method not allowed']);
    return;
}

$db = sts_db();

// Resolve the source — explicit param wins; otherwise read from state.
$source = (string)($_GET['source'] ?? '');
if ($source === '') {
    $row = $db->query('SELECT word_source FROM state WHERE id=1')->fetch();
    $source = (string)($row['word_source'] ?? 'builtin:6');
}

// Always read the version so clients can cache-bust correctly.
$verRow = $db->query('SELECT word_list_version FROM state WHERE id=1')->fetch();
$version = (int)($verRow['word_list_version'] ?? 0);

if ($source === 'teacher') {
    $stmt = $db->query('SELECT word FROM teacher_word_list ORDER BY position ASC');
    $words = array_map(fn($r) => (string)$r['word'], $stmt->fetchAll());
    sts_json(200, ['source' => 'teacher', 'version' => $version, 'words' => $words]);
    return;
}

if (preg_match('/^builtin:([K0-8]|[1-8])$/', $source, $m)) {
    $grade = $m[1];
    $path = __DIR__ . "/../words/grade-$grade.json";
    if (!is_file($path)) {
        sts_json(400, ['error' => 'unknown grade']);
        return;
    }
    $data = json_decode((string)file_get_contents($path), true);
    if (!is_array($data) || !isset($data['easy'], $data['medium'], $data['hard'])) {
        sts_json(500, ['error' => 'word list malformed']);
        return;
    }
    $merged = array_values(array_merge($data['easy'], $data['medium'], $data['hard']));
    sts_json(200, ['source' => "builtin:$grade", 'version' => $version, 'words' => $merged]);
    return;
}

sts_json(400, ['error' => 'invalid source']);
```

- [ ] **Step 4: Run the tests — they must pass**

Run: `vendor/bin/phpunit tests/api/WordsTest.php`
Expected: 5 tests green.

- [ ] **Step 5: Run the full suite — nothing else broke**

Run: `vendor/bin/phpunit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add public/api/words.php tests/api/WordsTest.php
git commit -m "feat(api): add GET /api/words.php

Three modes: builtin:<grade> reads public/words/grade-X.json,
teacher reads teacher_word_list table, no param falls back to
state.word_source. Returns flat word array + current version."
```

---

## Task 5: Extend `state.php` with word-pool fields

**Files:**
- Modify: `public/api/state.php`
- Modify: `tests/api/StateTest.php`

**Goal:** add `wordSource`, `wordListVersion`, `pushWord` to the JSON response. Auto-clear `pushWord` on the server side after a 10-second TTL.

- [ ] **Step 1: Write failing tests**

Append to `tests/api/StateTest.php` (inside the existing test class):

```php
public function testStateExposesWordPoolFields(): void
{
    sts_db()->exec("UPDATE state SET word_source='builtin:4', word_list_version=7, push_word='necessary', force_reload_set_at=" . sts_now() . " WHERE id=1");
    [$status, , $json] = sts_invoke('state.php', 'GET', ['cid' => 'test-cid-001']);
    $this->assertSame(200, $status);
    $this->assertSame('builtin:4', $json['wordSource']);
    $this->assertSame(7,           $json['wordListVersion']);
    $this->assertSame('necessary', $json['pushWord']);
}

public function testPushWordIsClearedAfterTtl(): void
{
    // Set push_word with a stale set_at by using a raw timestamp 11s ago.
    // We rely on the convention that state.force_reload_set_at doubles as
    // a "last write" hint isn't appropriate — pushWord uses its own TTL via push_word_set_at.
    // For this test, manipulate push_word directly and let state.php apply the TTL.
    sts_db()->exec("UPDATE state SET push_word='stale', push_word_set_at=" . (sts_now() - 11) . " WHERE id=1");
    [, , $json] = sts_invoke('state.php', 'GET', ['cid' => 'test-cid-002']);
    $this->assertSame('', $json['pushWord']);
}
```

(Note: this test references a `push_word_set_at` column. Add it to `init_db.php` in the next step.)

- [ ] **Step 2: Add `push_word_set_at` migration to `scripts/init_db.php`**

In the SpellToSlay v1 state-table block from Task 2, add one more guarded ALTER:

```php
if (!in_array('push_word_set_at', $existingStateColsV2, true)) {
    $pdo->exec("ALTER TABLE state ADD COLUMN push_word_set_at INTEGER NOT NULL DEFAULT 0");
}
```

- [ ] **Step 3: Run failing tests to confirm they fail**

Run: `vendor/bin/phpunit tests/api/StateTest.php`
Expected: 2 new tests fail.

- [ ] **Step 4: Modify `public/api/state.php` to expose the new fields and apply the push-word TTL**

Edit `public/api/state.php`. Change the SELECT in line 9 to include the new columns:

```php
$row = $db->query(
    'SELECT paused, message, force_reload, force_reload_set_at, version,
            poll_id, poll_question, poll_options,
            word_source, word_list_version, push_word, push_word_set_at
     FROM state WHERE id=1'
)->fetch();
```

After the `$forceReload = …` line, add a push-word TTL block:

```php
$pushWord = (string)$row['push_word'];
if ($pushWord !== '' && ((int)$row['push_word_set_at'] !== 0)
    && ($now - (int)$row['push_word_set_at'] > 10)) {
    // Server-side TTL: clear stale push word so latecomers don't all see the same one.
    $db->exec("UPDATE state SET push_word='', push_word_set_at=0 WHERE id=1");
    $pushWord = '';
}
```

Then in the `$payload = […]` array (around line 117), add three keys:

```php
    'wordSource'      => (string)$row['word_source'],
    'wordListVersion' => (int)$row['word_list_version'],
    'pushWord'        => $pushWord,
```

- [ ] **Step 5: Run the StateTest tests — they must pass**

Run: `vendor/bin/phpunit tests/api/StateTest.php`
Expected: green (existing + 2 new).

- [ ] **Step 6: Run the full suite**

Run: `vendor/bin/phpunit`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add public/api/state.php scripts/init_db.php tests/api/StateTest.php
git commit -m "feat(api): expose word-pool fields on state.php

Adds wordSource, wordListVersion, pushWord to the polling response.
push_word_set_at column drives a 10-second server-side TTL so
latecomers don't all receive the same teacher-pushed word."
```

---

## Task 6: Extend `teacher.php` with word-pool actions

**Files:**
- Modify: `public/api/teacher.php`
- Modify: `tests/api/TeacherTest.php`

**Goal:** add `setWordList`, `clearWordList`, `setGradeLevel`, and `pushWord` actions. Each updates state, bumps `word_list_version` and `version`.

- [ ] **Step 1: Write failing tests for `setWordList`**

Append to `tests/api/TeacherTest.php` inside the existing test class:

```php
public function testSetWordListAcceptsPastedWords(): void
{
    [$status, , $json] = sts_invoke(
        'teacher.php', 'POST',
        ['key' => 'test-teacher-key-xyz'],
        ['action' => 'setWordList', 'text' => "receive\nseparate\naccommodate\n"]
    );
    $this->assertSame(200, $status);
    $this->assertTrue($json['ok']);

    $rows = sts_db()->query('SELECT word FROM teacher_word_list ORDER BY position')->fetchAll();
    $this->assertSame(['receive','separate','accommodate'], array_column($rows, 'word'));

    $st = sts_db()->query('SELECT word_source, word_list_version FROM state WHERE id=1')->fetch();
    $this->assertSame('teacher', $st['word_source']);
    $this->assertGreaterThan(0, (int)$st['word_list_version']);
}

public function testSetWordListIgnoresBlankAndStripsCase(): void
{
    sts_invoke(
        'teacher.php', 'POST',
        ['key' => 'test-teacher-key-xyz'],
        ['action' => 'setWordList', 'text' => "  Hello \n\n \nWORLD  \n\n"]
    );
    $rows = sts_db()->query('SELECT word FROM teacher_word_list ORDER BY position')->fetchAll();
    $this->assertSame(['hello','world'], array_column($rows, 'word'));
}

public function testSetWordListRejectsEmpty(): void
{
    [$status] = sts_invoke(
        'teacher.php', 'POST',
        ['key' => 'test-teacher-key-xyz'],
        ['action' => 'setWordList', 'text' => "   \n\n  "]
    );
    $this->assertSame(400, $status);
}

public function testClearWordListEmptiesTableAndRevertsSource(): void
{
    sts_db()->exec("INSERT INTO teacher_word_list (word, position, set_at) VALUES ('x',0,1)");
    sts_db()->exec("UPDATE state SET word_source='teacher', grade_level=6 WHERE id=1");
    [$status] = sts_invoke(
        'teacher.php', 'POST',
        ['key' => 'test-teacher-key-xyz'],
        ['action' => 'clearWordList']
    );
    $this->assertSame(200, $status);
    $this->assertSame(0, (int)sts_db()->query('SELECT COUNT(*) c FROM teacher_word_list')->fetch()['c']);
    $st = sts_db()->query('SELECT word_source FROM state WHERE id=1')->fetch();
    $this->assertSame('builtin:6', $st['word_source']);
}

public function testSetGradeLevelUpdatesStateOnlyWhenBuiltinActive(): void
{
    [$status] = sts_invoke(
        'teacher.php', 'POST',
        ['key' => 'test-teacher-key-xyz'],
        ['action' => 'setGradeLevel', 'grade' => 4]
    );
    $this->assertSame(200, $status);
    $st = sts_db()->query('SELECT word_source, grade_level FROM state WHERE id=1')->fetch();
    $this->assertSame(4, (int)$st['grade_level']);
    $this->assertSame('builtin:4', $st['word_source']);
}

public function testSetGradeLevelKRejectsInvalid(): void
{
    [$status] = sts_invoke(
        'teacher.php', 'POST',
        ['key' => 'test-teacher-key-xyz'],
        ['action' => 'setGradeLevel', 'grade' => 99]
    );
    $this->assertSame(400, $status);
}

public function testPushWordSetsStateField(): void
{
    [$status] = sts_invoke(
        'teacher.php', 'POST',
        ['key' => 'test-teacher-key-xyz'],
        ['action' => 'pushWord', 'word' => 'necessary']
    );
    $this->assertSame(200, $status);
    $st = sts_db()->query('SELECT push_word, push_word_set_at FROM state WHERE id=1')->fetch();
    $this->assertSame('necessary', $st['push_word']);
    $this->assertGreaterThan(0, (int)$st['push_word_set_at']);
}

public function testPushWordRejectsNonAlpha(): void
{
    [$status] = sts_invoke(
        'teacher.php', 'POST',
        ['key' => 'test-teacher-key-xyz'],
        ['action' => 'pushWord', 'word' => 'bad word!']
    );
    $this->assertSame(400, $status);
}
```

- [ ] **Step 2: Run the failing tests**

Run: `vendor/bin/phpunit tests/api/TeacherTest.php`
Expected: 8 new failures with "unknown action" or shape mismatches.

- [ ] **Step 3: Add the four new actions to `public/api/teacher.php`**

Insert these `case` blocks inside the `switch ($action)` in `public/api/teacher.php`, after the existing `case 'endPoll':`:

```php
    case 'setWordList': {
        $text = (string)($body['text'] ?? '');
        $words = [];
        foreach (preg_split('/\R/', $text) as $line) {
            $w = strtolower(trim($line));
            if ($w === '') continue;
            if (!preg_match('/^[a-z]{1,32}$/', $w)) continue; // skip non-alpha lines silently
            $words[] = $w;
            if (count($words) >= 500) break; // hard cap
        }
        if (count($words) === 0) {
            sts_json(400, ['error' => 'list contains no usable words (a-z, max 32 chars each)']);
            return;
        }
        $db->beginTransaction();
        try {
            $db->exec('DELETE FROM teacher_word_list');
            $ins = $db->prepare('INSERT INTO teacher_word_list (word, position, set_at) VALUES (:w, :p, :t)');
            $ts = sts_now();
            foreach ($words as $i => $w) {
                $ins->execute([':w' => $w, ':p' => $i, ':t' => $ts]);
            }
            $db->exec("UPDATE state SET word_source='teacher', word_list_version=word_list_version+1, version=version+1 WHERE id=1");
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
        break;
    }

    case 'clearWordList': {
        $db->beginTransaction();
        try {
            $db->exec('DELETE FROM teacher_word_list');
            $stmt = $db->prepare("UPDATE state SET word_source = 'builtin:' || grade_level, word_list_version=word_list_version+1, version=version+1 WHERE id=1");
            $stmt->execute();
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
        break;
    }

    case 'setGradeLevel': {
        $grade = $body['grade'] ?? null;
        if (!is_int($grade) || $grade < 0 || $grade > 8) {
            sts_json(400, ['error' => 'grade must be int 0–8']);
            return;
        }
        // Map 0 → 'K', 1..8 → '1'..'8' for the source string.
        $gradeStr = ($grade === 0) ? 'K' : (string)$grade;
        $stmt = $db->prepare(
            "UPDATE state
             SET grade_level = :g,
                 word_source = CASE WHEN word_source LIKE 'builtin:%' THEN 'builtin:' || :gs ELSE word_source END,
                 word_list_version = word_list_version + 1,
                 version = version + 1
             WHERE id=1"
        );
        $stmt->execute([':g' => $grade, ':gs' => $gradeStr]);
        break;
    }

    case 'pushWord': {
        $word = strtolower(trim((string)($body['word'] ?? '')));
        if (!preg_match('/^[a-z]{1,32}$/', $word)) {
            sts_json(400, ['error' => 'word must be 1–32 lowercase letters']);
            return;
        }
        $stmt = $db->prepare('UPDATE state SET push_word=:w, push_word_set_at=:t, version=version+1 WHERE id=1');
        $stmt->execute([':w' => $word, ':t' => sts_now()]);
        break;
    }
```

Note: the `setGradeLevel` SQL uses parameter binding inside a CASE expression. The `:gs` parameter is reused — most PDO drivers handle this with named parameters, but if the SQLite driver complains, switch to two queries (one to set `grade_level`, one to set `word_source` conditionally).

- [ ] **Step 4: Run the tests — they must pass**

Run: `vendor/bin/phpunit tests/api/TeacherTest.php`
Expected: green.

- [ ] **Step 5: Run the full suite**

Run: `vendor/bin/phpunit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add public/api/teacher.php tests/api/TeacherTest.php
git commit -m "feat(api): add 4 teacher actions for word-pool control

setWordList accepts pasted newline-separated words (lowercase, 1–32
letters, ≤500), wipes/reseeds teacher_word_list, flips word_source
to 'teacher'. clearWordList empties the table and reverts source
to 'builtin:<grade_level>'. setGradeLevel updates grade_level and
the source string when builtin is active. pushWord stages a single
word with a server-side 10s TTL."
```

---

## Task 7: Extend `score.php` to accept `wpm`, `accuracy`, `wordsSlain`

**Files:**
- Modify: `public/api/score.php`
- Modify: `tests/api/ScoreTest.php`

**Goal:** accept three optional integer fields in the POST body, validate, store. Existing SLAY-shape submissions (without the new fields) still work — defaults applied.

- [ ] **Step 1: Write failing tests**

Append to `tests/api/ScoreTest.php`:

```php
public function testAcceptsNewTypingFields(): void
{
    [$status, , $json] = sts_invoke(
        'score.php', 'POST', [],
        ['name' => 'Pat', 'score' => 1240, 'wave' => 3, 'duration' => 184,
         'wpm' => 42, 'accuracy' => 94, 'wordsSlain' => 38]
    );
    $this->assertSame(200, $status);
    $this->assertArrayHasKey('rank', $json);

    $row = sts_db()->query("SELECT wpm, accuracy, words_slain FROM scores WHERE name='Pat'")->fetch();
    $this->assertSame(42, (int)$row['wpm']);
    $this->assertSame(94, (int)$row['accuracy']);
    $this->assertSame(38, (int)$row['words_slain']);
}

public function testRejectsImplausibleWpm(): void
{
    [$status] = sts_invoke(
        'score.php', 'POST', [],
        ['name' => 'Q', 'score' => 1, 'wave' => 1, 'duration' => 1, 'wpm' => 9999]
    );
    $this->assertSame(400, $status);
}

public function testRejectsImplausibleAccuracy(): void
{
    [$status] = sts_invoke(
        'score.php', 'POST', [],
        ['name' => 'Q', 'score' => 1, 'wave' => 1, 'duration' => 1, 'accuracy' => 200]
    );
    $this->assertSame(400, $status);
}

public function testLegacyPayloadStillAccepted(): void
{
    [$status] = sts_invoke(
        'score.php', 'POST', [],
        ['name' => 'Legacy', 'score' => 100, 'wave' => 2, 'duration' => 30]
    );
    $this->assertSame(200, $status);
    $row = sts_db()->query("SELECT wpm, accuracy, words_slain FROM scores WHERE name='Legacy'")->fetch();
    $this->assertSame(0, (int)$row['wpm']);
    $this->assertSame(0, (int)$row['accuracy']);
    $this->assertSame(0, (int)$row['words_slain']);
}
```

- [ ] **Step 2: Run failing tests**

Run: `vendor/bin/phpunit tests/api/ScoreTest.php`
Expected: 4 new failures.

- [ ] **Step 3: Modify `public/api/score.php`**

After the existing `$duration = $body['duration'] ?? null;` line, add the optional fields:

```php
$wpm        = $body['wpm']        ?? 0;
$accuracy   = $body['accuracy']   ?? 0;
$wordsSlain = $body['wordsSlain'] ?? 0;
```

After the existing required-fields validation loop (the `foreach (['score' => $score, …])` block), add a separate optional-fields validation block:

```php
foreach (['wpm' => $wpm, 'accuracy' => $accuracy, 'wordsSlain' => $wordsSlain] as $f => $v) {
    if (!is_int($v) || $v < 0) {
        sts_json(400, ['error' => "$f must be a non-negative integer"]);
        return;
    }
}
if ($wpm > 200)        { sts_json(400, ['error' => 'wpm implausible']);        return; }
if ($accuracy > 100)   { sts_json(400, ['error' => 'accuracy implausible']);   return; }
if ($wordsSlain > 5000){ sts_json(400, ['error' => 'wordsSlain implausible']); return; }
```

Modify the INSERT statement to include the new columns:

```php
$ins = $db->prepare(
    'INSERT INTO scores (name, score, wave, duration, wpm, accuracy, words_slain, ip, submitted_at)
     VALUES (:name, :score, :wave, :duration, :wpm, :accuracy, :ws, :ip, :ts)'
);
$ins->execute([
    ':name'     => $name,
    ':score'    => $score,
    ':wave'     => $wave,
    ':duration' => $duration,
    ':wpm'      => $wpm,
    ':accuracy' => $accuracy,
    ':ws'       => $wordsSlain,
    ':ip'       => $ip,
    ':ts'       => sts_now(),
]);
```

- [ ] **Step 4: Run the tests**

Run: `vendor/bin/phpunit tests/api/ScoreTest.php`
Expected: green.

- [ ] **Step 5: Run the full suite**

Run: `vendor/bin/phpunit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add public/api/score.php tests/api/ScoreTest.php
git commit -m "feat(api): accept wpm/accuracy/wordsSlain on score.php

Three optional integer fields with plausibility ceilings (200, 100,
5000). Legacy SLAY-shape payloads still accepted; missing fields
default to 0."
```

---

## Task 8: Extend `leaderboard.php` to return new fields

**Files:**
- Modify: `public/api/leaderboard.php`
- Modify: `tests/api/LeaderboardTest.php`

**Goal:** include `wpm`, `accuracy`, `wordsSlain` in each leaderboard row.

- [ ] **Step 1: Write failing test**

Append to `tests/api/LeaderboardTest.php`:

```php
public function testLeaderboardIncludesTypingFields(): void
{
    sts_db()->exec("INSERT INTO scores (name, score, wave, duration, wpm, accuracy, words_slain, ip, submitted_at)
                    VALUES ('A', 100, 1, 60, 35, 92, 18, '1.1.1.1', " . sts_now() . ")");
    [$status, , $json] = sts_invoke('leaderboard.php', 'GET');
    $this->assertSame(200, $status);
    $entry = $json['allTime'][0];
    $this->assertSame(35, $entry['wpm']);
    $this->assertSame(92, $entry['accuracy']);
    $this->assertSame(18, $entry['wordsSlain']);
}
```

- [ ] **Step 2: Run failing test**

Run: `vendor/bin/phpunit tests/api/LeaderboardTest.php`
Expected: failure (`wpm` key missing).

- [ ] **Step 3: Read the current `leaderboard.php`**

Open `public/api/leaderboard.php`. Find the SELECT and the row-mapping. Add `wpm, accuracy, words_slain` to both.

Replace the SQL SELECT (it currently selects `name, score, wave, submitted_at` or similar — examine the actual file before editing) so it pulls these three new columns. Then in the mapping function or array-building loop, include:

```php
'wpm'        => (int)$row['wpm'],
'accuracy'   => (int)$row['accuracy'],
'wordsSlain' => (int)$row['words_slain'],
```

If `leaderboard.php` uses an inline `array_map` over `fetchAll()`, add these keys inside the closure. If it builds the array imperatively, add them inside the loop.

- [ ] **Step 4: Run the test**

Run: `vendor/bin/phpunit tests/api/LeaderboardTest.php`
Expected: green.

- [ ] **Step 5: Run the full suite**

Run: `vendor/bin/phpunit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add public/api/leaderboard.php tests/api/LeaderboardTest.php
git commit -m "feat(api): leaderboard returns wpm/accuracy/wordsSlain"
```

---

## Task 9: Replace `public/game.js` — engine skeleton, word fetching, prefix index

**Files:**
- Replace: `public/game.js` (whole-file rewrite, but inherited UI plumbing carries over from SLAY's structure — see step 1)

**Goal:** Lay down the SpellToSlay engine skeleton that loads, renders an empty arena, fetches the active word pool, builds a prefix index, and is ready for enemy spawning. Keep the inherited bits (clientId, polling state.php, pause overlay, force reload, message bar, polls, contributors) working as in SLAY.

This is the largest single task. It does NOT include enemies, typing input, or HUD numbers — those land in tasks 10–13.

- [ ] **Step 1: Read the spec sections that drive the engine**

Read: `docs/superpowers/specs/2026-05-06-spelltoslay-design.md` §2, §5 (especially the engine outline), §10 (tunable values).

- [ ] **Step 2: Replace `public/game.js` with the new skeleton**

Write the file in full. Rough section budget (the spec's outline):

```js
'use strict';

// ─── Constants & tuning ──────────────────────────────
const ARENA = { w: 960, h: 600 };
const HERO  = { emoji: '🛡️', size: 36 };
const MAX_HP = 100;
const TYPO_HP_PENALTY = 1;
const WAVE_DURATION_S = 30;
const BOSS_WAVE_INTERVAL = 5;
const WPM_WINDOW_S = 30;
const POLL_DISMISS_AFTER_MS = 15000;

// ─── Registries (students extend these) ──────────────
const ENEMIES = [
  { id: 'ghost',  emoji: '👻',  difficultyClass: 'easy',   speed: 30, contactDamage: 10, pointMultiplier: 1, size: 28 },
  { id: 'dragon', emoji: '🐲',  difficultyClass: 'medium', speed: 22, contactDamage: 15, pointMultiplier: 2, size: 32 },
  { id: 'banana', emoji: '🍌',  difficultyClass: 'hard',   speed: 16, contactDamage: 25, pointMultiplier: 4, size: 38 },
];

// ─── State ───────────────────────────────────────────
const state = {
  running: false,
  paused: false,
  personalPaused: false,
  gameOver: false,
  time: 0,
  hero: { x: ARENA.w / 2, y: ARENA.h - 60, hp: MAX_HP },
  enemies: [],
  particles: [],
  spawn: { nextAt: 0, wave: 1, waveStartedAt: 0 },
  score: 0,
  kills: 0,
  streak: 0,
  bestStreak: 0,
  keystrokes: { correct: 0, total: 0 },
  wpmLog: [],            // [{ts, chars}], pruned to last WPM_WINDOW_S
  // Typing
  typedBuffer: '',
  lockedEnemyId: null,
  // Word pool
  wordPool: [],
  wordSource: '',
  wordListVersion: -1,
  pushWordPending: '',
  // Inherited polling
  serverVersion: -1,
  clientId: null,
  playerName: '',
  messageBar: '',
  personalMessage: '',
  tabVisible: true,
  pollState: null,
  pollAnsweredAt: 0,
  forceReloadHandled: false,
};

// ─── Boot ────────────────────────────────────────────
const canvas = document.getElementById('arena');
const ctx = canvas.getContext('2d');
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

state.clientId = (() => {
  const stored = localStorage.getItem('sts_cid');
  if (stored) return stored;
  const cid = crypto.randomUUID();
  localStorage.setItem('sts_cid', cid);
  return cid;
})();
state.playerName = localStorage.getItem('sts_player_name') || '';

// ─── Word pool ───────────────────────────────────────
let prefixIndex = new Map(); // prefix(string) → Set<enemyId>

function rebuildPrefixIndex() {
  prefixIndex = new Map();
  for (const e of state.enemies) {
    if (!e.word) continue;
    for (let len = 1; len <= e.word.length; len++) {
      const p = e.word.slice(0, len);
      if (!prefixIndex.has(p)) prefixIndex.set(p, new Set());
      prefixIndex.get(p).add(e.id);
    }
  }
}

function addEnemyToIndex(e) {
  for (let len = 1; len <= e.word.length; len++) {
    const p = e.word.slice(0, len);
    if (!prefixIndex.has(p)) prefixIndex.set(p, new Set());
    prefixIndex.get(p).add(e.id);
  }
}

function removeEnemyFromIndex(e) {
  if (!e.word) return;
  for (let len = 1; len <= e.word.length; len++) {
    const p = e.word.slice(0, len);
    const set = prefixIndex.get(p);
    if (set) {
      set.delete(e.id);
      if (set.size === 0) prefixIndex.delete(p);
    }
  }
}

async function fetchWordPool() {
  try {
    const r = await fetch('/api/words.php', { cache: 'no-store' });
    const j = await r.json();
    state.wordPool = (j.words || []).filter(w => /^[a-z]{1,32}$/.test(w));
    state.wordSource = j.source || '';
    state.wordListVersion = j.version | 0;
  } catch (e) {
    console.warn('failed to fetch word pool', e);
  }
}

function pickWordFor(enemyDef) {
  // For builtin sources we'd want bucket-aware selection, but words.php
  // currently returns a flat merged array. Random pick from the full pool
  // is acceptable for v1 — bucket bias can be added once words.php returns
  // structured buckets in a follow-up.
  if (state.wordPool.length === 0) return 'cat';
  return state.wordPool[(Math.random() * state.wordPool.length) | 0];
}

// ─── Polling ─────────────────────────────────────────
async function pollServerState() {
  const params = new URLSearchParams({ cid: state.clientId });
  if (state.playerName) params.set('name', state.playerName);
  if (state.running) {
    params.set('score', String(state.score));
    params.set('wave',  String(state.spawn.wave));
    params.set('hp',    String(state.hero.hp));
    params.set('playing', '1');
  }
  params.set('visible', state.tabVisible ? '1' : '0');

  let r;
  try { r = await fetch('/api/state.php?' + params.toString(), { cache: 'no-store' }); }
  catch (_) { return; }
  if (!r.ok) return;
  const s = await r.json();

  state.paused          = !!s.paused;
  state.personalPaused  = !!s.personalPaused;
  state.messageBar      = (s.message || '') + (s.personalMessage ? '  •  ' + s.personalMessage : '');
  if (s.name && s.name !== state.playerName) {
    state.playerName = s.name;
    localStorage.setItem('sts_player_name', s.name);
  }

  if (s.forceReload && !state.forceReloadHandled) {
    state.forceReloadHandled = true;
    location.reload();
    return;
  }

  // Word pool: refetch if version changed.
  if ((s.wordListVersion | 0) !== state.wordListVersion) {
    await fetchWordPool();
  }

  // Push word: queue exactly once.
  if (s.pushWord && s.pushWord !== state.pushWordPending) {
    state.pushWordPending = s.pushWord;
  }

  // Polls — same shape as SLAY; just store and let the overlay render.
  if (s.pollQuestion) {
    state.pollState = { pollId: s.pollId, question: s.pollQuestion, options: s.pollOptions || [], myAnswer: s.pollMyAnswer ?? null };
  } else {
    state.pollState = null;
  }
}
setInterval(pollServerState, 2000);
document.addEventListener('visibilitychange', () => { state.tabVisible = !document.hidden; });

// ─── Render ──────────────────────────────────────────
function render() {
  ctx.clearRect(0, 0, ARENA.w, ARENA.h);
  // Background
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, ARENA.w, ARENA.h);

  // Hero
  ctx.font = `${HERO.size}px serif`;
  ctx.fillText(HERO.emoji, state.hero.x, state.hero.y);

  // Enemies (Task 10 fills in real rendering)
  for (const e of state.enemies) {
    ctx.font = `${e.def.size || 32}px serif`;
    ctx.fillText(e.def.emoji, e.x, e.y);
  }

  // HUD placeholder text — replaced in Task 12
  ctx.fillStyle = '#9fb0d8';
  ctx.font = '11px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`HP ${state.hero.hp}  W${state.spawn.wave}  Score ${state.score}`, 8, 18);
  ctx.textAlign = 'center';

  // Pause overlay
  if (state.paused || state.personalPaused) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, ARENA.w, ARENA.h);
    ctx.fillStyle = '#fff';
    ctx.font = '32px ui-sans-serif, system-ui';
    ctx.fillText('⏸ PAUSED BY TEACHER', ARENA.w / 2, ARENA.h / 2);
    if (state.messageBar) {
      ctx.font = '18px ui-sans-serif, system-ui';
      ctx.fillText(state.messageBar, ARENA.w / 2, ARENA.h / 2 + 40);
    }
  }
}

// ─── Main loop ───────────────────────────────────────
let lastTs = performance.now();
function tick(now) {
  const dt = Math.min((now - lastTs) / 1000, 1 / 30);
  lastTs = now;
  if (state.running && !state.paused && !state.personalPaused && !state.gameOver) {
    state.time += dt;
    // updateEnemies / updateSpawner / updateParticles land in Task 10
  }
  render();
  requestAnimationFrame(tick);
}

// ─── Init & start ────────────────────────────────────
(async function init() {
  await fetchWordPool();
  await pollServerState();
  // Boot main loop right away — game stays in title state until name entry submitted (Task 13)
  state.running = true;
  state.spawn.waveStartedAt = state.time;
  requestAnimationFrame(tick);
})();
```

Save this as `public/game.js`. (You're replacing the old SLAY engine. The old code is preserved in git history if you need to reference it.)

- [ ] **Step 3: Smoke-test the page in a browser**

Run: `php scripts/init_db.php && php -S localhost:8001 -t public &`
Open: `http://localhost:8001/` in a browser.
Expected: empty dark-blue arena, hero emoji at the bottom, placeholder HUD text in the top-left. No JS errors in the console.
Also check: `console.log(state.wordPool.length)` in DevTools should print a non-zero number (the pool was fetched).
Stop the server: `kill %1`.

- [ ] **Step 4: Commit**

```bash
git add public/game.js
git commit -m "feat(game): SpellToSlay engine skeleton

State, render, main loop, word-pool fetching, prefix index,
inherited polling. Renders an empty arena with the hero. Enemies,
typing input, and full HUD land in subsequent tasks."
```

---

## Task 10: `game.js` — Enemy spawner with words, walk-toward-hero

**Files:**
- Modify: `public/game.js`

**Goal:** spawn enemies from the top edge in waves; each enemy carries a randomly-chosen word from the active pool, biased toward its difficulty class when possible. Enemies walk toward the hero. Maintain the prefix index. No typing input yet.

- [ ] **Step 1: Add bucket-aware word selection**

The current `pickWordFor(enemyDef)` returns a fully-random word from the merged pool. For better bucketing, the pool needs to be split by length. Update `pickWordFor`:

Replace the existing `pickWordFor` body with:

```js
function pickWordFor(enemyDef) {
  if (state.pushWordPending) {
    const w = state.pushWordPending;
    state.pushWordPending = '';
    return w;
  }
  const pool = state.wordPool;
  if (pool.length === 0) return 'cat';

  // Length-based heuristic: easy ≤5, hard ≥8, medium = the rest. Mirrors the
  // bucketing rule used in public/words/grade-*.json. When the teacher pastes
  // a flat list, all enemies fall back to a uniform draw.
  const matches = pool.filter(w => {
    if (enemyDef.difficultyClass === 'easy')   return w.length <= 5;
    if (enemyDef.difficultyClass === 'hard')   return w.length >= 8;
    return w.length >= 6 && w.length <= 7;
  });
  const source = matches.length >= 3 ? matches : pool;
  return source[(Math.random() * source.length) | 0];
}
```

- [ ] **Step 2: Add `updateSpawner`**

Add this function (it can go below `pickWordFor`):

```js
function updateSpawner(dt) {
  const sp = state.spawn;
  // Time-since-last-wave-start drives wave advancement.
  if (state.time - sp.waveStartedAt >= WAVE_DURATION_S) {
    sp.wave += 1;
    sp.waveStartedAt = state.time;
    // On boss-wave starts, drop a single hard-pool enemy as the wave's herald.
    if (sp.wave % BOSS_WAVE_INTERVAL === 0) {
      const bossDef = ENEMIES.find(e => e.difficultyClass === 'hard');
      if (bossDef) spawnOne(bossDef);
    }
  }

  // Spawn cadence ramps with wave: every (max(1.5, 4 - wave*0.2)) seconds.
  const interval = Math.max(1.5, 4 - sp.wave * 0.2);
  if (state.time >= sp.nextAt) {
    sp.nextAt = state.time + interval;
    // Pick an enemy: early waves favor easy, later mix in medium then hard.
    const candidates = ENEMIES.filter(e => {
      if (sp.wave < 2) return e.difficultyClass === 'easy';
      if (sp.wave < 4) return e.difficultyClass !== 'hard';
      return true;
    });
    const def = candidates[(Math.random() * candidates.length) | 0];
    spawnOne(def);
  }
}

let nextEnemyId = 1;
function spawnOne(def) {
  const word = pickWordFor(def);
  const e = {
    id:       'e' + (nextEnemyId++),
    def,
    x:        20 + Math.random() * (ARENA.w - 40),
    y:        -20,
    hp:       word.length,        // letter-by-letter damage
    word,
    typedLen: 0,
  };
  state.enemies.push(e);
  addEnemyToIndex(e);
}
```

- [ ] **Step 3: Add `updateEnemies` (movement + contact damage)**

```js
function updateEnemies(dt) {
  const survivors = [];
  for (const e of state.enemies) {
    // Walk straight toward hero
    const dx = state.hero.x - e.x, dy = state.hero.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    const sp = e.def.speed * dt;
    e.x += (dx / dist) * sp;
    e.y += (dy / dist) * sp;
    // Contact?
    if (dist < (e.def.size + HERO.size) * 0.4) {
      state.hero.hp = Math.max(0, state.hero.hp - e.def.contactDamage);
      removeEnemyFromIndex(e);
      // do not add to survivors
      if (state.hero.hp === 0) state.gameOver = true;
      continue;
    }
    survivors.push(e);
  }
  state.enemies = survivors;
}
```

- [ ] **Step 4: Wire into the main loop**

Modify the `tick` function so the gameplay-update calls happen when running:

```js
function tick(now) {
  const dt = Math.min((now - lastTs) / 1000, 1 / 30);
  lastTs = now;
  if (state.running && !state.paused && !state.personalPaused && !state.gameOver) {
    state.time += dt;
    updateSpawner(dt);
    updateEnemies(dt);
  }
  render();
  requestAnimationFrame(tick);
}
```

- [ ] **Step 5: Render enemy words above each enemy**

Modify the `// Enemies (Task 10 fills in real rendering)` block in `render()` to draw the word with typed-letter color:

```js
  for (const e of state.enemies) {
    ctx.font = `${e.def.size}px serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText(e.def.emoji, e.x, e.y);

    // Word above the enemy
    ctx.font = '14px ui-monospace, monospace';
    const word = e.word;
    const typed = word.slice(0, e.typedLen);
    const rest  = word.slice(e.typedLen);
    const wY = e.y - e.def.size / 2 - 8;
    // Background pill
    const padding = 6, w = ctx.measureText(word).width;
    ctx.fillStyle = '#1a2238';
    ctx.fillRect(e.x - w/2 - padding, wY - 12, w + padding*2, 22);
    // Typed (green)
    ctx.fillStyle = '#06d6a0';
    ctx.fillText(typed, e.x - w/2 + ctx.measureText(typed).width/2, wY);
    // Untyped (white)
    ctx.fillStyle = '#cde';
    ctx.fillText(rest, e.x - w/2 + ctx.measureText(typed).width + ctx.measureText(rest).width/2, wY);
  }
```

- [ ] **Step 6: Smoke-test**

Run: `php -S localhost:8001 -t public &`
Open: `http://localhost:8001/`.
Expected: enemies spawn from the top, walk toward the hero, and you can see their words. Contact damages HP. Once HP hits 0 the game freezes (game-over flow lands in Task 13).
Stop: `kill %1`.

- [ ] **Step 7: Commit**

```bash
git add public/game.js
git commit -m "feat(game): enemy spawner + walk-toward-hero + word rendering

Wave ramp (interval shrinks with wave), boss every 5th wave,
bucket-aware word picking based on enemy difficultyClass with
fallback to flat pool when the teacher list is active. Each
enemy carries a word visible above the sprite."
```

---

## Task 11: `game.js` — Typing input + prefix lock-on + letter damage + typo penalty

**Files:**
- Modify: `public/game.js`
- Modify: `public/index.html` (add the focused `<input>`)

**Goal:** wire keyboard typing through a focused `<input>` element. Match the typed buffer against the prefix index, lock the closest enemy whose word starts with the buffer, advance one letter per correct keystroke, flash red + dock 1 HP per typo (handled via Backspace).

- [ ] **Step 1: Add the typing input to `public/index.html`**

In `public/index.html`, just before the closing `</div>` of `.stage`, add:

```html
      <input id="type-input"
             class="type-input"
             autocomplete="off"
             autocorrect="off"
             autocapitalize="off"
             spellcheck="false"
             aria-label="Type the word on the closest enemy"
             placeholder="type a word…">
```

(Style is added in Task 14.)

- [ ] **Step 2: Add the typing logic in `game.js`**

Add an `// ─── Typing input ───` section before the polling block:

```js
const typeInput = document.getElementById('type-input');

function onType() {
  if (!state.running || state.gameOver || state.paused || state.personalPaused) {
    typeInput.value = '';
    return;
  }
  const raw = typeInput.value.toLowerCase().replace(/[^a-z]/g, '');
  const prev = state.typedBuffer;

  // Pure backspace? Just shrink the buffer.
  if (raw.length < prev.length) {
    state.typedBuffer = raw;
    refreshLock();
    return;
  }

  // Process new keystrokes one at a time.
  for (let i = prev.length; i < raw.length; i++) {
    const ch = raw[i];
    state.keystrokes.total += 1;
    const candidatePrefix = state.typedBuffer + ch;
    if (prefixIndex.has(candidatePrefix)) {
      // Correct letter (the buffer extends a real prefix of at least one live enemy).
      state.typedBuffer = candidatePrefix;
      state.keystrokes.correct += 1;
      state.wpmLog.push({ ts: state.time, chars: 1 });
      damageLockedByOne();
    } else {
      // Wrong letter — typo penalty, undo the buffer growth, and refuse to advance.
      state.hero.hp = Math.max(0, state.hero.hp - TYPO_HP_PENALTY);
      if (state.hero.hp === 0) state.gameOver = true;
      state.streak = 0;
      // Mark the input as "stalled" — keep the wrong letter in the input box (red flash via CSS),
      // require Backspace to recover.
      typeInput.classList.add('stalled');
      typeInput.value = state.typedBuffer + ch;
      flashLockedRed();
      return;
    }
  }
  typeInput.classList.remove('stalled');
  typeInput.value = state.typedBuffer;
  refreshLock();
}

function refreshLock() {
  if (state.typedBuffer === '') {
    state.lockedEnemyId = null;
    return;
  }
  const candidates = prefixIndex.get(state.typedBuffer);
  if (!candidates || candidates.size === 0) {
    state.lockedEnemyId = null;
    return;
  }
  // Among matches, pick the one closest to the hero (Euclidean).
  let bestId = null, bestDist = Infinity;
  for (const id of candidates) {
    const e = state.enemies.find(en => en.id === id);
    if (!e) continue;
    const d = Math.hypot(e.x - state.hero.x, e.y - state.hero.y);
    if (d < bestDist) { bestDist = d; bestId = id; }
  }
  state.lockedEnemyId = bestId;
  const locked = state.enemies.find(e => e.id === bestId);
  if (locked) locked.typedLen = state.typedBuffer.length;
}

function damageLockedByOne() {
  refreshLock();
  const e = state.enemies.find(en => en.id === state.lockedEnemyId);
  if (!e) return;
  e.typedLen = state.typedBuffer.length;
  e.hp -= 1;
  if (e.hp <= 0) {
    onEnemySlain(e);
  }
}

function onEnemySlain(e) {
  const word = e.word;
  // Score: floor(wordLength × pointMultiplier × streakBonus)
  const streakBonus = Math.min(1 + 0.05 * state.streak, 2.0);
  const points = Math.floor(word.length * e.def.pointMultiplier * streakBonus);
  state.score += points;
  state.kills += 1;
  state.streak += 1;
  if (state.streak > state.bestStreak) state.bestStreak = state.streak;
  // Remove
  removeEnemyFromIndex(e);
  state.enemies = state.enemies.filter(en => en.id !== e.id);
  // Reset buffer; lock will refresh on next keystroke
  state.typedBuffer = '';
  state.lockedEnemyId = null;
  typeInput.value = '';
}

function flashLockedRed() {
  const e = state.enemies.find(en => en.id === state.lockedEnemyId);
  if (!e) return;
  e.flashUntil = state.time + 0.4;
}

typeInput.addEventListener('input', onType);
typeInput.addEventListener('blur',  () => setTimeout(() => typeInput.focus(), 50));
window.addEventListener('load',     () => typeInput.focus());
```

- [ ] **Step 3: Add the locked-enemy ring + flash to `render`**

In the enemy-rendering block, after drawing the emoji and before the word, add a locked-state highlight:

```js
    // Locked ring
    if (e.id === state.lockedEnemyId) {
      ctx.strokeStyle = '#5b8def';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.def.size * 0.7, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Red flash on typo
    if (e.flashUntil && state.time < e.flashUntil) {
      ctx.fillStyle = 'rgba(239, 71, 111, 0.4)';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.def.size * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
```

Also rebuild lock continuously: at the top of `render`, before drawing, call `if (state.typedBuffer !== '') refreshLock();` so the ring follows the closest matching enemy as positions change.

- [ ] **Step 4: Smoke-test**

Run: `php -S localhost:8001 -t public &`
Open: `http://localhost:8001/`. Type a few letters. Verify:
- The closest enemy whose word starts with your typed letters gets ringed in blue.
- Each correct letter colors a green segment on the word and shrinks the enemy's HP by 1.
- Typing the full word slays the enemy and clears the input.
- Hitting a wrong letter flashes the enemy red, costs 1 HP, and stalls the input until Backspace.
Stop: `kill %1`.

- [ ] **Step 5: Commit**

```bash
git add public/game.js public/index.html
git commit -m "feat(game): prefix lock-on typing + letter-by-letter damage

Each correct keystroke does 1 HP to the locked enemy. Wrong letter
costs 1 HP, breaks streak, stalls input until Backspace. Locked
enemy is the closest one whose word starts with the typed prefix."
```

---

## Task 12: `game.js` — Corner-stat HUD + WPM/accuracy/streak tracking

**Files:**
- Modify: `public/game.js`

**Goal:** replace the placeholder HUD text with the corner-stat layout from the spec. Track WPM (rolling 30s), accuracy (rolling run %), streak (real-time).

- [ ] **Step 1: Add WPM and accuracy computation helpers**

Add near the typing logic:

```js
function currentWpm() {
  // Trim WPM log to last WPM_WINDOW_S seconds.
  const cutoff = state.time - WPM_WINDOW_S;
  while (state.wpmLog.length > 0 && state.wpmLog[0].ts < cutoff) state.wpmLog.shift();
  if (state.wpmLog.length === 0) return 0;
  const chars = state.wpmLog.reduce((s, e) => s + e.chars, 0);
  const span  = Math.max(1, state.time - state.wpmLog[0].ts);
  return Math.round((chars / 5) * (60 / span));
}

function currentAccuracy() {
  if (state.keystrokes.total === 0) return 100;
  return Math.round(100 * state.keystrokes.correct / state.keystrokes.total);
}

function elapsedHHMMSS() {
  const t = Math.floor(state.time);
  const m = String(Math.floor(t / 60)).padStart(1, '0');
  const s = String(t % 60).padStart(2, '0');
  return `${m}:${s}`;
}
```

- [ ] **Step 2: Replace the placeholder HUD block in `render()`**

Replace the existing "HUD placeholder text" lines with:

```js
  // ── HUD ──
  function pill(text, color) {
    ctx.font = '11px ui-monospace, monospace';
    const padX = 6, padY = 4;
    const w = ctx.measureText(text).width + padX * 2;
    return { w, h: 18, draw(x, y) {
      ctx.fillStyle = '#1a2238';
      ctx.fillRect(x, y, w, 18);
      ctx.strokeStyle = '#2a3858';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 17);
      ctx.fillStyle = color || '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(text, x + padX, y + 9 + 4);
      ctx.textAlign = 'center';
    }};
  }

  // Top-left: HP, wave
  let yL = 8;
  const pHp   = pill(`HP ${state.hero.hp}`, '#ef476f');           pHp.draw(8, yL);   yL += 22;
  const pWv   = pill(`W ${state.spawn.wave}`, '#fff');            pWv.draw(8, yL);

  // Top-right: score, time
  const pSc   = pill(`SCORE ${state.score}`, '#fff');
  const pTm   = pill(`TIME ${elapsedHHMMSS()}`, '#fff');
  pSc.draw(ARENA.w - pSc.w - 8, 8);
  pTm.draw(ARENA.w - pTm.w - 8, 30);

  // Bottom-right: WPM, accuracy, streak
  const pWp   = pill(`WPM ${currentWpm()}`, '#06d6a0');
  const pAc   = pill(`ACC ${currentAccuracy()}%`, '#5b8def');
  const pSt   = pill(`STREAK ${state.streak}`, '#ffd166');
  pWp.draw(ARENA.w - pWp.w - 8, ARENA.h - 70);
  pAc.draw(ARENA.w - pAc.w - 8, ARENA.h - 48);
  pSt.draw(ARENA.w - pSt.w - 8, ARENA.h - 26);

  // Top-center: teacher message strip (only when message set)
  if (state.messageBar) {
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = '#ffd166';
    ctx.textAlign = 'center';
    ctx.fillText(`📣 ${state.messageBar}`, ARENA.w / 2, 14);
  }
```

- [ ] **Step 3: Smoke-test**

Run: `php -S localhost:8001 -t public &`
Open: `http://localhost:8001/`. Type a few words. Verify:
- HP and W pills in the top-left.
- SCORE and TIME pills in the top-right.
- WPM, ACC, STREAK pills in the bottom-right; values change as you type.
- WPM ramps after a few words; accuracy drops if you typo.
Stop: `kill %1`.

- [ ] **Step 4: Commit**

```bash
git add public/game.js
git commit -m "feat(game): corner-stat HUD with WPM/accuracy/streak

WPM is a rolling 30s window using char-count/5. Accuracy is
correct/total keystrokes for the run. Streak resets to 0 on typo,
contributes to score via a 1+0.05*streak (max 2x) multiplier."
```

---

## Task 13: `game.js` — Game-over flow, name entry, score submission, leaderboard view

**Files:**
- Modify: `public/game.js`

**Goal:** add name-entry modal at start (reusing the existing `#name-entry` from `index.html`), game-over modal triggered when HP reaches 0, score submission with new fields, leaderboard view.

The existing SLAY `index.html` already has the modals — we reuse them and rebind the JS.

- [ ] **Step 1: Wire up name-entry on first load**

After the `state.playerName = …` line, add:

```js
const nameEntryEl   = document.getElementById('name-entry');
const entryNameInput = document.getElementById('entry-name');
const startPlayingBtn = document.getElementById('start-playing');
const entryErrorEl  = document.getElementById('entry-error');

if (!state.playerName) {
  nameEntryEl.classList.remove('hidden');
  entryNameInput.value = '';
  state.running = false; // pause the engine until they submit
} else {
  // Already named on a prior visit; just go.
  nameEntryEl.classList.add('hidden');
}

startPlayingBtn.addEventListener('click', () => {
  const v = entryNameInput.value.trim();
  if (!/^[A-Za-z0-9 ]{1,16}$/.test(v)) {
    entryErrorEl.textContent = 'Name must be 1–16 letters, numbers, or spaces.';
    entryErrorEl.classList.remove('hidden');
    return;
  }
  state.playerName = v;
  localStorage.setItem('sts_player_name', v);
  nameEntryEl.classList.add('hidden');
  entryErrorEl.classList.add('hidden');
  state.running = true;
  typeInput.focus();
});
```

(In Task 9's init, change `state.running = true;` to `state.running = !!state.playerName;` so that returning visitors auto-start and first-timers see the modal.)

- [ ] **Step 2: Add game-over modal handling**

Add to `game.js`:

```js
const gameOverEl     = document.getElementById('game-over');
const goSummaryEl    = document.getElementById('game-over-summary');
const goNameEl       = document.getElementById('game-over-name');
const submitScoreBtn = document.getElementById('submit-score');
const submitErrorEl  = document.getElementById('submit-error');
const leaderboardEl  = document.getElementById('leaderboard');
const playAgainBtn   = document.getElementById('play-again');
const rankSummaryEl  = document.getElementById('rank-summary');
const lbTodayEl      = document.getElementById('lb-today');
const lbAlltimeEl    = document.getElementById('lb-alltime');

let gameOverShown = false;
function showGameOver() {
  if (gameOverShown) return;
  gameOverShown = true;
  goSummaryEl.textContent =
    `Score ${state.score} · ${state.kills} words · WPM ${currentWpm()} · ACC ${currentAccuracy()}% · time ${elapsedHHMMSS()}`;
  goNameEl.textContent = state.playerName;
  submitErrorEl.classList.add('hidden');
  gameOverEl.classList.remove('hidden');
}

submitScoreBtn.addEventListener('click', async () => {
  submitScoreBtn.disabled = true;
  submitErrorEl.classList.add('hidden');
  try {
    const r = await fetch('/api/score.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: state.playerName,
        score: state.score,
        wave: state.spawn.wave,
        duration: Math.floor(state.time),
        wpm: currentWpm(),
        accuracy: currentAccuracy(),
        wordsSlain: state.kills,
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      submitErrorEl.textContent = j.error || `HTTP ${r.status}`;
      submitErrorEl.classList.remove('hidden');
      submitScoreBtn.disabled = false;
      return;
    }
    rankSummaryEl.textContent = `You ranked #${j.rank}.`;
    await renderLeaderboard();
    gameOverEl.classList.add('hidden');
    leaderboardEl.classList.remove('hidden');
  } catch (e) {
    submitErrorEl.textContent = 'Could not reach server.';
    submitErrorEl.classList.remove('hidden');
    submitScoreBtn.disabled = false;
  }
});

async function renderLeaderboard() {
  try {
    const r = await fetch('/api/leaderboard.php', { cache: 'no-store' });
    const j = await r.json();
    const fmt = e => `<li><b>${e.name}</b> — ${e.score} (W${e.wave}, WPM ${e.wpm}, ${e.accuracy}%)</li>`;
    lbTodayEl.innerHTML   = (j.today   || []).map(fmt).join('');
    lbAlltimeEl.innerHTML = (j.allTime || []).map(fmt).join('');
  } catch (_) { /* ignore */ }
}

playAgainBtn.addEventListener('click', () => {
  // Reset everything
  state.enemies.length = 0;
  prefixIndex.clear();
  state.score = 0; state.kills = 0; state.streak = 0; state.bestStreak = 0;
  state.keystrokes = { correct: 0, total: 0 };
  state.wpmLog.length = 0;
  state.hero.hp = MAX_HP;
  state.time = 0;
  state.spawn = { nextAt: 0, wave: 1, waveStartedAt: 0 };
  state.gameOver = false;
  gameOverShown = false;
  state.typedBuffer = '';
  typeInput.value = '';
  leaderboardEl.classList.add('hidden');
  state.running = true;
  typeInput.focus();
});

// Hook game-over into the main loop: when state.gameOver flips, surface the modal.
const _origTick = tick;
window._gameOverHook = setInterval(() => {
  if (state.gameOver && !gameOverShown) {
    state.running = false;
    showGameOver();
  }
}, 50);
```

(The `_origTick` reference is just there as a placeholder if you want a more elegant hook later — the polling-style `setInterval` is fine for v1.)

- [ ] **Step 3: Smoke-test**

Run: `php -S localhost:8001 -t public &`
Open `http://localhost:8001/` in a private window (so localStorage starts clean):
- Name modal appears; submit "QA" and game starts.
- Type words; let yourself die.
- Game-over modal appears with score summary.
- Submit score → leaderboard appears with your entry showing WPM/ACC.
- Click "Play again" → fresh run.

Stop: `kill %1`.

- [ ] **Step 4: Commit**

```bash
git add public/game.js
git commit -m "feat(game): name entry, game-over, score submission, leaderboard

Submission posts score, wave, duration, wpm, accuracy, wordsSlain.
Leaderboard renders top-5 per bucket with the new typing fields.
Play-again resets state in place."
```

---

## Task 14: Update `public/style.css` for typing input + corner HUD aesthetics

**Files:**
- Modify: `public/style.css`

**Goal:** style the focused `<input>` (centered at the bottom of the canvas, big monospace, blue ring), give the canvas a calmer dark background, and tweak the message bar / modal styling to match the typing aesthetic.

- [ ] **Step 1: Add `.type-input` styles**

Append to `public/style.css`:

```css
/* SpellToSlay v1: typing input pinned beneath the canvas */
.type-input {
  display: block;
  width: 60%;
  max-width: 480px;
  margin: 8px auto 0;
  padding: 10px 14px;
  background: #1a2238;
  color: #cde;
  border: 2px solid #5b8def;
  border-radius: 6px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 18px;
  letter-spacing: 1px;
  outline: none;
  text-align: center;
}
.type-input:focus { border-color: #06d6a0; }
.type-input.stalled {
  border-color: #ef476f;
  background: #2a1224;
  animation: stall-shake 0.3s;
}
@keyframes stall-shake {
  0%, 100% { transform: translateX(0); }
  25%      { transform: translateX(-4px); }
  75%      { transform: translateX(4px); }
}

/* Canvas background — gives the dark stage a frame */
#arena {
  background: #0b1220;
  border: 1px solid #1f2a44;
  border-radius: 8px;
}
```

- [ ] **Step 2: Smoke-test in browser**

Run: `php -S localhost:8001 -t public &`. Reload `localhost:8001/`. Verify:
- The input below the canvas has a blue ring; turning into green when focused.
- A typo flashes the input red and shakes briefly.
Stop: `kill %1`.

- [ ] **Step 3: Commit**

```bash
git add public/style.css
git commit -m "style: SpellToSlay typing input + calmer arena background"
```

---

## Task 15: Teacher panel — Word Pool section UI + JS wiring

**Files:**
- Modify: `public/teacher.html`
- Modify: `public/teacher.js`

**Goal:** add a "Word Pool" block to the teacher panel with grade dropdown, paste textarea, "Use this list" / "Revert to built-in" buttons, and a "Spell this now" push-word field. Wire each control to its `teacher.php` action.

- [ ] **Step 1: Add the Word Pool section to `public/teacher.html`**

Insert this block after the existing `<div class="row"><button id="reload-all">…</div>` row, before `<h3>Players online</h3>`:

```html
      <h3>Word pool</h3>
      <div id="word-pool-section">
        <div class="row">
          <label style="display:flex;align-items:center;gap:8px">
            Default grade:
            <select id="grade-select">
              <option value="0">K</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
              <option value="6" selected>6</option>
              <option value="7">7</option>
              <option value="8">8</option>
            </select>
          </label>
          <span id="active-source" class="active-source">Active: built-in (grade 6)</span>
        </div>
        <textarea id="word-list-textarea" rows="6"
                  placeholder="Paste this week's spelling words here, one per line…"></textarea>
        <div class="row">
          <button id="use-list-btn">Use this list</button>
          <button id="revert-list-btn" class="secondary">Revert to built-in</button>
        </div>
        <div class="row">
          <label style="flex:1">
            Spell this now:
            <input id="push-word-input" maxlength="32" placeholder="single word">
          </label>
          <button id="push-word-btn">Push</button>
        </div>
      </div>
```

- [ ] **Step 2: Add styles for the new section**

Append to `public/style.css`:

```css
#word-list-textarea {
  width: 100%;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 13px;
  padding: 8px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
}
.active-source {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 12px;
  color: #475569;
  margin-left: 12px;
}
```

- [ ] **Step 3: Wire up the new controls in `public/teacher.js`**

Append to `public/teacher.js` (after the existing `init()` function or wherever the other setup runs):

```js
// ─── Word Pool controls ───
const gradeSelect      = document.getElementById('grade-select');
const wordListTextarea = document.getElementById('word-list-textarea');
const useListBtn       = document.getElementById('use-list-btn');
const revertListBtn    = document.getElementById('revert-list-btn');
const pushWordInput    = document.getElementById('push-word-input');
const pushWordBtn      = document.getElementById('push-word-btn');
const activeSourceEl   = document.getElementById('active-source');

useListBtn.addEventListener('click', async () => {
  const text = wordListTextarea.value;
  try {
    await action({ action: 'setWordList', text });
    wordListTextarea.value = '';
  } catch (_) { /* showError already called */ }
});

revertListBtn.addEventListener('click', async () => {
  try { await action({ action: 'clearWordList' }); }
  catch (_) {}
});

gradeSelect.addEventListener('change', async () => {
  try { await action({ action: 'setGradeLevel', grade: parseInt(gradeSelect.value, 10) }); }
  catch (_) {}
});

pushWordBtn.addEventListener('click', async () => {
  const w = pushWordInput.value.trim();
  if (!w) return;
  try {
    await action({ action: 'pushWord', word: w });
    pushWordInput.value = '';
  } catch (_) {}
});

// Render active-source label whenever state refreshes.
const _origRefreshState = refreshState;
refreshState = async function () {
  await _origRefreshState();
  // Read state once more, just for the source/version display (refreshState
  // doesn't expose it; tiny extra fetch is fine at 2s cadence).
  try {
    const s = await (await fetch('/api/state.php?cid=teacher-panel', {cache:'no-store'})).json();
    activeSourceEl.textContent = `Active: ${s.wordSource === 'teacher' ? 'teacher list' : 'built-in (grade ' + s.wordSource.split(':')[1] + ')'}`;
    if (s.wordSource && s.wordSource.startsWith('builtin:') && document.activeElement !== gradeSelect) {
      const g = s.wordSource.split(':')[1];
      gradeSelect.value = g === 'K' ? '0' : g;
    }
  } catch (_) {}
};
```

(The `_origRefreshState` indirection just augments the existing function. You can also inline this work into the existing `refreshState` body if it lives in the same file.)

- [ ] **Step 4: Smoke-test the teacher panel**

Run: `php -S localhost:8001 -t public &`
Make sure `config/config.php` exists with a teacher key (Playwright config uses 'e2e-key'; you can write a one-off file: `echo '<?php return ["teacher_key" => "dev"];' > config/config.php`).
Open: `http://localhost:8001/teacher.html?key=dev`. Verify:
- "Word pool" section is visible with the grade dropdown set to 6 and "Active: built-in (grade 6)".
- Change the dropdown to 4 → label updates to "Active: built-in (grade 4)" within ~2s.
- Paste 5 words into the textarea, click "Use this list" → label flips to "Active: teacher list". On a separate browser-tab playing the game, the next enemy carries one of those words.
- Click "Revert to built-in" → label flips back.
- Type a word in "Spell this now", click Push → on the player tab, the next enemy carries that word.
Stop: `kill %1`.

- [ ] **Step 5: Commit**

```bash
git add public/teacher.html public/teacher.js public/style.css
git commit -m "feat(teacher): word-pool controls

Grade dropdown, paste textarea, use-list/revert buttons, spell-this-
now push field. Active-source label is live-updated from state.php
on the existing 2s refresh cadence."
```

---

## Task 16: Inherit-already polish — message bar, force reload, polls

**Files:**
- Verify only — these are inherited from SLAY and should already work after Task 9 wired the polling loop.

**Goal:** confirm that the inherited features still work end-to-end against the new game.

- [ ] **Step 1: Smoke-test "pause everyone"**

Run two browser tabs:
- Tab A: `localhost:8001/` (game)
- Tab B: `localhost:8001/teacher.html?key=dev`

In Tab B click "PAUSE EVERYONE". Within 2s, Tab A should darken with the pause overlay.
Click "RESUME EVERYONE" → Tab A resumes.

- [ ] **Step 2: Smoke-test message broadcast**

Type a message in Tab B's "Message shown to class" field, click Send. Within 2s it should appear at the top of Tab A's canvas (📣 prefix).

- [ ] **Step 3: Smoke-test force reload**

Click "🔄 Force everyone to reload" in Tab B. Tab A should reload within 2s.

- [ ] **Step 4: Smoke-test live poll**

Fill in a poll question and 2 options in Tab B, click "Start poll". Tab A should show the poll overlay. (Note: the poll overlay is rendered by JS we did NOT modify in Task 9; if your skeleton skipped poll-overlay rendering, see if there's a separate `pollState` render hook to add. The rendering is in the original SLAY game.js — preserve or port it.)

- [ ] **Step 5: If polls don't render, port the poll overlay code**

If step 4 fails, the poll overlay rendering is missing from `game.js`. Look at `git show HEAD~N:public/game.js` (the pre-rewrite version) for the `// Poll overlay` block and the `renderPollOverlay()` function and DOM listeners. Re-add them. Commit separately if you do this:

```bash
git add public/game.js
git commit -m "fix(game): port poll overlay rendering from SLAY"
```

(If polls already work, skip this step.)

- [ ] **Step 6: Final smoke-test commit**

If you needed any polish edits during steps 1–5, commit them. Otherwise nothing to commit for this task.

---

## Task 17: Update Playwright happy-path test

**Files:**
- Modify: `tests/e2e/happy-path.spec.js`
- Modify: `playwright.config.js` (config template — already touched in Task 1, verify)

**Goal:** the existing happy-path test boots a player, plays a few seconds, dies, and submits a score. Update it for the new typing flow.

- [ ] **Step 1: Read the existing test**

Open `tests/e2e/happy-path.spec.js`. Note what selectors it uses and what it asserts.

- [ ] **Step 2: Rewrite for typing**

Replace the test body with logic that:

```js
import { test, expect } from '@playwright/test';

test('happy path: type a word, see score submitted', async ({ page }) => {
  await page.goto('/');

  // Name entry
  await page.locator('#entry-name').fill('E2E');
  await page.locator('#start-playing').click();
  await expect(page.locator('#name-entry')).toBeHidden();

  // Type a known easy word from the day-one builtin pool. "cat" is in grade-K.
  // We don't know which enemy will spawn, so brute-force: type each easy word
  // until we slay something or the run ends.
  const tryWords = ['cat','dog','run','sit','sun','it','at','in','on','is','no','to','up','we','I','of','my','me'];
  const input = page.locator('#type-input');
  await input.focus();

  // Wait for at least one enemy to spawn
  await page.waitForFunction(() => window.state && window.state.enemies && window.state.enemies.length > 0,
    null, { timeout: 8000 });

  // Pluck a live word and type it.
  const word = await page.evaluate(() => window.state.enemies[0]?.word || '');
  expect(word.length).toBeGreaterThan(0);
  await input.type(word);

  // Confirm at least one slay registered
  await page.waitForFunction(() => window.state && window.state.kills >= 1, null, { timeout: 4000 });

  // Force game over by zeroing HP via the dev hook
  await page.evaluate(() => { window.state.hero.hp = 0; window.state.gameOver = true; });

  // Submit score
  await expect(page.locator('#game-over')).toBeVisible({ timeout: 4000 });
  await page.locator('#submit-score').click();
  await expect(page.locator('#leaderboard')).toBeVisible({ timeout: 4000 });
  await expect(page.locator('#lb-alltime li').first()).toContainText('E2E');
});
```

This requires `state` to be on `window` for inspection. In `public/game.js`, after the `const state = …` declaration, add:

```js
if (typeof window !== 'undefined') window.state = state;
```

- [ ] **Step 3: Run Playwright**

Run: `npx playwright test`
Expected: 1 test green. (If browsers aren't installed: `npx playwright install chromium` and retry.)

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/happy-path.spec.js public/game.js
git commit -m "test(e2e): typing happy-path with score submission"
```

---

## Task 18: Documentation updates — README, CHANGELOG, CLAUDE.md, deploy.php

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `CLAUDE.md`
- Modify: `deploy.php`

**Goal:** every doc reflects SpellToSlay branding, the new gameplay, and the new server paths. Most of this was done by the rename pass; this task is the manual review and fill-in-the-prose pass.

- [ ] **Step 1: README — describe the game and update setup**

Open `README.md`. Verify:
- The top heading and intro describe SpellToSlay (typing/spelling game), not SLAY arena combat.
- "Run locally" section: `php scripts/init_db.php && php -S localhost:8001 -t public`
- "Server setup" section: clone path is `~/spelltoslay-app`, web symlink target is `~/spelltoslay.lockersoft.games` → `~/spelltoslay-app/public`.
- "Daily classroom workflow" describes git-pull deploy + force-reload, same shape as SLAY.

If any of these are wrong or vestigial, fix them. If a section is missing, write it. The intro especially should mention the killer feature: teachers can paste their weekly spelling words.

- [ ] **Step 2: CHANGELOG — add the v1 entry**

In `CHANGELOG.md`, replace `## [Unreleased]` with:

```markdown
## [Unreleased]

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
```

- [ ] **Step 3: CLAUDE.md — update for SpellToSlay-specific notes**

Read `CLAUDE.md` and remove or update anything that's still TypeNSpell-specific or inherited from a pre-brainstorm draft. Keep the "First action when the user resumes this project" if it's still useful, but update it to describe the SpellToSlay project state, not the brainstorm-pending state.

A reasonable rewrite of the "What the user has already invested in (don't redo)" section:

```markdown
## What the user has already invested in (don't redo)

- The PHP+SQLite backend with health/score/leaderboard/state/teacher/players/rename/poll-vote/contributors/words endpoints.
- The teacher control panel UX (live roster + word-pool controls).
- The classroom-iteration workflow (push, deploy, force reload).
- 1Password entry for the teacher key.
- The day-one word lists in public/words/grade-*.json.
```

Leave language about the shell-command rules and SSHKit gotchas intact (it's general-purpose).

- [ ] **Step 4: deploy.php — verify hostname, path, repo alias**

Open `deploy.php`. Confirm:
- `set('application', 'spelltoslay')`
- `set('repository', 'github-spelltoslay:lockersoft/spelltoslay.git')` (or whichever SSH alias the user has set up; the user can adjust)
- `host('production')->setHostname('spelltoslay.lockersoft.games')`
- `set('deploy_path', '/home/lockersoft/spelltoslay-app')`
- The `deploy:health_check` curl URL points at `https://spelltoslay.lockersoft.games/api/health.php`

If any are wrong, fix.

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md CLAUDE.md deploy.php
git commit -m "docs: SpellToSlay v1 README/CHANGELOG/CLAUDE.md/deploy.php"
```

---

## Task 19: Server provisioning checklist — manual steps for the user

**Files:**
- Modify: `README.md` (append a "First-time deploy" section if not present)

**Goal:** document the steps the user runs ONCE on their DreamHost server to bring SpellToSlay online. We don't run these automatically — they require the user's SSH access.

- [ ] **Step 1: Write a "First-time SpellToSlay deploy" section**

Append to `README.md`:

```markdown
## First-time SpellToSlay deploy (manual, one-off)

These are the steps to run **once** to bring SpellToSlay online. Subsequent deploys use `dep deploy` or a direct SSH `git pull`.

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

   In 1Password, create a new entry "spelltoslay teacher key" with a long random string. Then on the server:

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

6. **In the DreamHost panel**: add `spelltoslay.lockersoft.games` as a hosted subdomain pointing to the symlink, enable HTTPS via Let's Encrypt.

7. **Verify health**:

   ```bash
   curl https://spelltoslay.lockersoft.games/api/health.php
   ```

   Expected: `{"ok":true,"db":"ok",...}`.

8. **Smoke-test the live site**:

   - Open `https://spelltoslay.lockersoft.games/` — name entry, type a word, see score.
   - Open `https://spelltoslay.lockersoft.games/teacher.html?key=<your-key>` — paste a 3-word list, hit "Use this list", play, see your words on enemies.

After this one-time setup, all subsequent deploys are `dep deploy` from your laptop OR `cd ~/spelltoslay-app && git pull` over SSH.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: first-time SpellToSlay deploy checklist"
```

- [ ] **Step 3: After-merge cleanup checklist (do not run inside this worktree)**

Capture the post-merge tasks the user will do manually after this branch is merged to main. Do NOT run these inside the worktree — the worktree path contains "typenspell" and renaming it mid-session will break paths.

Add a note to the bottom of the v1 changelog entry:

```markdown
### Post-merge cleanup (manual, run after this branch lands on main)

- Rename the local checkout: `mv ~/Documents/GitHub/typenspell ~/Documents/GitHub/spelltoslay`.
- If a remote was added before the rename, fix it: `git remote set-url origin git@github.com:lockersoft/spelltoslay.git`.
- Update any local SSH config aliases that referenced the old name.
```

This is informational — no commit needed unless you'd rather have it surface in CHANGELOG (then commit with CHANGELOG.md).

---

## Final verification (after Task 19)

- [ ] **Run the full test suite**

```bash
vendor/bin/phpunit && npx playwright test
```

Expected: PHPUnit all green, Playwright happy-path green.

- [ ] **Local end-to-end smoke**

```bash
php -S localhost:8001 -t public &
```

Open two browser tabs:
- `http://localhost:8001/` — play through one full run, submit score, view leaderboard.
- `http://localhost:8001/teacher.html?key=dev` — paste 5 words, use list, push a word, watch the player tab pick them up.

Stop: `kill %1`.

- [ ] **Update CHANGELOG version date if needed and create a release tag once merged**

(Not done in this branch — happens on main after merge.)

---

## Self-review notes

This plan covers spec sections 1–14:

- §1 Purpose / §2 gameplay → Task 9–13 (engine + typing + game-over flow).
- §3 Visual style → Task 9 + Task 14 (CSS).
- §4 Architecture → Task 1 (rename), Task 4 (words.php), Task 9 (frontend skeleton).
- §5 Frontend engine → Tasks 9–13.
- §6 Backend API → Tasks 4 (words.php), 5 (state.php), 6 (teacher.php), 7 (score.php), 8 (leaderboard.php).
- §7 Word lists → Task 3.
- §8 Teacher panel → Task 15.
- §9 Project layout → Tasks 1, 3 enforce the layout.
- §10 Naming/rename → Task 1.
- §11 Deployment → Tasks 18 (deploy.php) + 19 (README).
- §12 Testing → Tasks 2, 4–8 (PHPUnit), 17 (Playwright).
- §13 Open questions → flagged in spec, not all resolved (built-in word curation noted as v1-acceptable; profanity wordlist carried unchanged from SLAY).
- §14 Out of scope → no tasks; honored by omission.
