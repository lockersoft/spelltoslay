# SLAY v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the v1 baseline of SLAY — a top-down arena emoji-combat browser game with a PHP+SQLite backend, leaderboard, and teacher control panel — to slay.lockersoft.games.

**Architecture:** Static frontend (vanilla JS + Canvas) + thin PHP API + SQLite. Single VPS via Deployer. No build step, no framework. Realtime classroom control via 2-second polling.

**Tech Stack:** Vanilla JavaScript (ES2020+), HTML5 Canvas, PHP 8.x, SQLite (PDO), PHPUnit (API tests), Playwright (one E2E happy path), Deployer (deploy).

**Source spec:** [`docs/superpowers/specs/2026-05-06-slay-game-design.md`](../specs/2026-05-06-slay-game-design.md)

**Test strategy reminder (from spec §10):** Full TDD on the PHP API. **No unit tests on `game.js`** — the engine is hand-edited every class period, unit tests would rot too fast. Game logic is verified via one Playwright happy-path test (Task 20) plus manual smoke testing.

---

## File Structure

```
slay/
├── public/                       # nginx DocumentRoot
│   ├── index.html                # Task 11
│   ├── teacher.html              # Task 19
│   ├── style.css                 # Task 11
│   ├── game.js                   # Tasks 12–18
│   ├── teacher.js                # Task 19
│   └── api/
│       ├── _bootstrap.php        # Task 3
│       ├── health.php            # Task 4
│       ├── score.php             # Task 5
│       ├── leaderboard.php       # Task 6
│       ├── state.php             # Tasks 7, 8
│       └── teacher.php           # Tasks 9, 10
│
├── config/
│   ├── config.example.php        # Task 1
│   └── config.php                # gitignored, lives in shared/ on server
│
├── scripts/
│   └── init_db.php               # Task 2
│
├── tests/
│   ├── bootstrap.php             # Task 1 (PHPUnit harness)
│   ├── api/
│   │   ├── HealthTest.php        # Task 4
│   │   ├── ScoreTest.php         # Task 5
│   │   ├── LeaderboardTest.php   # Task 6
│   │   ├── StateTest.php         # Tasks 7, 8
│   │   └── TeacherTest.php       # Tasks 9, 10
│   └── e2e/
│       └── happy-path.spec.js    # Task 20
│
├── data/                         # gitignored; lives in shared/data on server
├── deploy.php                    # Task 21
├── composer.json                 # Task 1
├── package.json                  # Task 20
├── playwright.config.js          # Task 20
├── phpunit.xml                   # Task 1
├── .gitignore                    # already in repo
├── CHANGELOG.md                  # Task 1
└── README.md                     # Task 1, expanded in Task 21
```

---

## Task 1: PHP toolchain & project scaffolding

**Files:**
- Create: `composer.json`
- Create: `phpunit.xml`
- Create: `tests/bootstrap.php`
- Create: `config/config.example.php`
- Create: `README.md`
- Create: `CHANGELOG.md`

- [ ] **Step 1: Write `composer.json`**

```json
{
  "name": "lockersoft/slay",
  "description": "SLAY — browser arena game for in-class AI vibe coding.",
  "type": "project",
  "license": "proprietary",
  "require": {
    "php": ">=8.1",
    "ext-pdo_sqlite": "*"
  },
  "require-dev": {
    "phpunit/phpunit": "^10.5"
  },
  "autoload-dev": {
    "psr-4": { "Slay\\Tests\\": "tests/" }
  }
}
```

- [ ] **Step 2: Run `composer install`**

Run: `composer install`
Expected: creates `vendor/` and `composer.lock`. PHPUnit available at `vendor/bin/phpunit`.

- [ ] **Step 3: Write `phpunit.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="tests/bootstrap.php"
         colors="true"
         cacheDirectory=".phpunit.cache">
  <testsuites>
    <testsuite name="api">
      <directory>tests/api</directory>
    </testsuite>
  </testsuites>
</phpunit>
```

- [ ] **Step 4: Write `tests/bootstrap.php`**

This sets up a temporary SQLite DB per test run and exposes a helper to invoke endpoints in-process.

```php
<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

// Force test mode: temp SQLite DB, predictable teacher key.
$tmpDb = tempnam(sys_get_temp_dir(), 'slay_test_') . '.sqlite';
register_shutdown_function(fn() => @unlink($tmpDb));

define('SLAY_DB_PATH', $tmpDb);
define('SLAY_TEACHER_KEY', 'test-teacher-key-xyz');

// Initialize schema by including the init script.
require __DIR__ . '/../scripts/init_db.php';

/**
 * Invoke a PHP endpoint in-process, returning [status, headers, decoded JSON].
 *
 * Sets $_SERVER, $_GET, $_POST, php://input as the endpoint expects, then
 * captures output. PHPUnit running this is single-threaded so globals are safe.
 */
function slay_invoke(string $relPath, string $method = 'GET', array $query = [], $body = null, array $headers = []): array {
    $_SERVER = array_merge($_SERVER, [
        'REQUEST_METHOD' => $method,
        'REMOTE_ADDR'    => '127.0.0.1',
        'HTTP_HOST'      => 'localhost',
    ]);
    foreach ($headers as $k => $v) {
        $_SERVER['HTTP_' . strtoupper(str_replace('-', '_', $k))] = $v;
    }
    $_GET  = $query;
    $_POST = is_array($body) ? $body : [];

    // Stub php://input for JSON-body endpoints.
    if (is_string($body)) {
        $GLOBALS['__SLAY_TEST_INPUT'] = $body;
    } elseif (is_array($body) && $method !== 'GET') {
        $GLOBALS['__SLAY_TEST_INPUT'] = json_encode($body);
    } else {
        $GLOBALS['__SLAY_TEST_INPUT'] = '';
    }

    http_response_code(200);
    ob_start();
    $captured = [];
    $captureHeader = function($h) use (&$captured) { $captured[] = $h; };
    // We can't actually intercept header() in CLI/PHPUnit cleanly without runkit,
    // so endpoints in test mode also append headers to a $GLOBALS['__SLAY_HEADERS'] array.
    $GLOBALS['__SLAY_HEADERS'] = [];
    $exitCode = 0;
    try {
        require __DIR__ . '/../public/api/' . $relPath;
    } catch (\Throwable $e) {
        ob_end_clean();
        throw $e;
    }
    $out = ob_get_clean();
    $status = http_response_code() ?: 200;

    $json = json_decode($out, true);
    return [$status, $GLOBALS['__SLAY_HEADERS'], $json, $out];
}
```

- [ ] **Step 5: Write `config/config.example.php`**

```php
<?php
// Copy this to /var/www/slay/shared/config/config.php on the server.
// Generate a real key with: php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'

return [
    'teacher_key' => 'change-me-to-a-long-random-string',
];
```

- [ ] **Step 6: Write `README.md` (skeleton — expanded in Task 21)**

```markdown
# SLAY

Browser-based top-down arena game (Vampire Survivors-style auto-attack) built
for in-class AI vibe coding with 10–14 year olds. Each student suggests a
feature; teacher implements via AI and deploys to production immediately.

- **Live:** https://slay.lockersoft.games
- **Spec:** [docs/superpowers/specs/2026-05-06-slay-game-design.md](docs/superpowers/specs/2026-05-06-slay-game-design.md)
- **Plan:** [docs/superpowers/plans/2026-05-06-slay-v1.md](docs/superpowers/plans/2026-05-06-slay-v1.md)

## Local development

```bash
composer install
php scripts/init_db.php          # create local data/slay.db
php -S localhost:8000 -t public  # serve the game
```

Open http://localhost:8000.

## Tests

```bash
vendor/bin/phpunit               # PHP API tests
npx playwright test              # one E2E happy path
```

## Deploy

See "Server setup" below (added in Task 21).
```

- [ ] **Step 7: Write `CHANGELOG.md`**

```markdown
# Changelog

## [Unreleased]

- Initial v1 baseline.
```

- [ ] **Step 8: Commit**

```bash
git add composer.json composer.lock phpunit.xml tests/bootstrap.php \
        config/config.example.php README.md CHANGELOG.md
git commit -m "chore: PHP toolchain, PHPUnit harness, scaffolding"
```

---

## Task 2: Database schema & init script

**Files:**
- Create: `scripts/init_db.php`

- [ ] **Step 1: Write `scripts/init_db.php`**

```php
<?php
declare(strict_types=1);

/**
 * Idempotent SQLite schema initializer.
 *
 * Reads SLAY_DB_PATH if defined (test bootstrap sets this), otherwise
 * falls back to the production location. Creates tables IF NOT EXISTS,
 * so it's safe to run on every deploy.
 */

$dbPath = defined('SLAY_DB_PATH')
    ? SLAY_DB_PATH
    : __DIR__ . '/../data/slay.db';

@mkdir(dirname($dbPath), 0775, recursive: true);

$pdo = new PDO('sqlite:' . $dbPath);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->exec('PRAGMA journal_mode=WAL');
$pdo->exec('PRAGMA foreign_keys=ON');

$pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS scores (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL,
    score        INTEGER NOT NULL,
    wave         INTEGER NOT NULL,
    duration     INTEGER NOT NULL,
    ip           TEXT,
    submitted_at INTEGER NOT NULL
);
SQL);
$pdo->exec('CREATE INDEX IF NOT EXISTS idx_scores_score  ON scores(score DESC)');
$pdo->exec('CREATE INDEX IF NOT EXISTS idx_scores_recent ON scores(submitted_at DESC)');

$pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS state (
    id                  INTEGER PRIMARY KEY CHECK (id = 1),
    paused              INTEGER NOT NULL DEFAULT 0,
    message             TEXT    NOT NULL DEFAULT '',
    force_reload        INTEGER NOT NULL DEFAULT 0,
    force_reload_set_at INTEGER NOT NULL DEFAULT 0,
    version             INTEGER NOT NULL DEFAULT 0
);
SQL);
$pdo->exec('INSERT OR IGNORE INTO state (id) VALUES (1)');

$pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS presence (
    client_id TEXT PRIMARY KEY,
    last_seen INTEGER NOT NULL
);
SQL);
$pdo->exec('CREATE INDEX IF NOT EXISTS idx_presence_seen ON presence(last_seen)');

if (PHP_SAPI === 'cli' && !defined('SLAY_DB_PATH')) {
    echo "Initialized SLAY DB at $dbPath\n";
}
```

- [ ] **Step 2: Smoke-test it**

Run: `php scripts/init_db.php`
Expected: `Initialized SLAY DB at .../data/slay.db` and a `data/slay.db` file appears.

Then: `sqlite3 data/slay.db '.schema'`
Expected: prints all three CREATE TABLE statements.

- [ ] **Step 3: Commit**

```bash
git add scripts/init_db.php
git commit -m "feat(api): SQLite schema and idempotent init script"
```

---

## Task 3: PHP bootstrap helper

**Files:**
- Create: `public/api/_bootstrap.php`

This file is `require`'d at the top of every endpoint. It opens the DB, loads config, and provides JSON helpers. It must work both under PHP-FPM/CLI server (real requests) and under the PHPUnit harness (`tests/bootstrap.php`).

- [ ] **Step 1: Write the test**

Create `tests/api/HealthTest.php` skeleton — but actually we'll write that in Task 4. For Task 3 the test is implicit: the next task's tests fail unless `_bootstrap.php` works. We'll verify Task 3 by running Task 4's tests.

For now, write a minimal smoke test in `tests/api/BootstrapSmokeTest.php`:

```php
<?php
declare(strict_types=1);

namespace Slay\Tests\Api;

use PHPUnit\Framework\TestCase;

class BootstrapSmokeTest extends TestCase
{
    public function test_bootstrap_opens_db_and_returns_pdo(): void
    {
        require_once __DIR__ . '/../../public/api/_bootstrap.php';

        $pdo = slay_db();
        $this->assertInstanceOf(\PDO::class, $pdo);

        // The state row from init_db must exist.
        $row = $pdo->query('SELECT * FROM state WHERE id = 1')->fetch(\PDO::FETCH_ASSOC);
        $this->assertNotFalse($row);
        $this->assertSame(0, (int)$row['paused']);
    }
}
```

- [ ] **Step 2: Run the test, see it fail**

Run: `vendor/bin/phpunit --filter BootstrapSmoke`
Expected: FAIL — `slay_db` undefined / file not found.

- [ ] **Step 3: Write `public/api/_bootstrap.php`**

```php
<?php
declare(strict_types=1);

// Detect test mode (constants defined by tests/bootstrap.php).
$dbPath = defined('SLAY_DB_PATH')
    ? SLAY_DB_PATH
    : __DIR__ . '/../../data/slay.db';

$config = ['teacher_key' => null];
$configFile = __DIR__ . '/../../config/config.php';
if (defined('SLAY_TEACHER_KEY')) {
    $config['teacher_key'] = SLAY_TEACHER_KEY;
} elseif (file_exists($configFile)) {
    $config = array_merge($config, require $configFile);
}

$GLOBALS['__SLAY_DB_PATH']   = $dbPath;
$GLOBALS['__SLAY_CONFIG']    = $config;

function slay_db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO('sqlite:' . $GLOBALS['__SLAY_DB_PATH']);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec('PRAGMA journal_mode=WAL');
        $pdo->exec('PRAGMA foreign_keys=ON');
    }
    return $pdo;
}

function slay_config(): array {
    return $GLOBALS['__SLAY_CONFIG'];
}

/**
 * Read the request body. Honors the PHPUnit-provided override.
 */
function slay_input_raw(): string {
    if (isset($GLOBALS['__SLAY_TEST_INPUT'])) {
        return $GLOBALS['__SLAY_TEST_INPUT'];
    }
    return file_get_contents('php://input') ?: '';
}

function slay_input_json(): array {
    $raw = slay_input_raw();
    if ($raw === '') return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

/**
 * Emit a header. In test mode, captured to $GLOBALS['__SLAY_HEADERS'] instead
 * of being sent — PHP's CLI SAPI silently drops header() but we want assertions.
 */
function slay_header(string $line): void {
    if (PHP_SAPI === 'cli') {
        $GLOBALS['__SLAY_HEADERS'][] = $line;
        return;
    }
    header($line);
}

/**
 * Write a JSON response with a status code and exit (in non-test mode).
 */
function slay_json(int $status, array|string $body): void {
    http_response_code($status);
    slay_header('Content-Type: application/json; charset=utf-8');
    echo is_string($body) ? $body : json_encode($body);
    if (PHP_SAPI !== 'cli') {
        exit;
    }
}

function slay_now(): int { return time(); }
```

- [ ] **Step 4: Run the test, see it pass**

Run: `vendor/bin/phpunit --filter BootstrapSmoke`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/api/_bootstrap.php tests/api/BootstrapSmokeTest.php
git commit -m "feat(api): bootstrap helper (DB, config, JSON helpers)"
```

---

## Task 4: Health endpoint

**Files:**
- Create: `public/api/health.php`
- Create: `tests/api/HealthTest.php`

- [ ] **Step 1: Write the test**

```php
<?php
declare(strict_types=1);

namespace Slay\Tests\Api;

use PHPUnit\Framework\TestCase;

class HealthTest extends TestCase
{
    public function test_returns_ok_with_db_status(): void
    {
        [$status, $headers, $json] = slay_invoke('health.php');

        $this->assertSame(200, $status);
        $this->assertTrue($json['ok']);
        $this->assertSame('ok', $json['db']);
        $this->assertArrayHasKey('version', $json);
    }
}
```

- [ ] **Step 2: Run the test, see it fail**

Run: `vendor/bin/phpunit --filter HealthTest`
Expected: FAIL — `health.php` doesn't exist.

- [ ] **Step 3: Write `public/api/health.php`**

```php
<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

try {
    $row = slay_db()->query('SELECT 1 AS ok')->fetch();
    $dbOk = ($row['ok'] ?? null) == 1;
} catch (\Throwable $e) {
    $dbOk = false;
}

// Version: read from a VERSION file written by deploy if present, else "dev".
$verFile = __DIR__ . '/../../VERSION';
$version = file_exists($verFile) ? trim(file_get_contents($verFile)) : 'dev';

slay_json(200, [
    'ok'      => $dbOk,
    'db'      => $dbOk ? 'ok' : 'error',
    'version' => $version,
]);
```

- [ ] **Step 4: Run the test, see it pass**

Run: `vendor/bin/phpunit --filter HealthTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/api/health.php tests/api/HealthTest.php
git commit -m "feat(api): health endpoint"
```

---

## Task 5: Score submission endpoint

**Files:**
- Create: `public/api/score.php`
- Create: `tests/api/ScoreTest.php`

- [ ] **Step 1: Write the tests**

```php
<?php
declare(strict_types=1);

namespace Slay\Tests\Api;

use PHPUnit\Framework\TestCase;

class ScoreTest extends TestCase
{
    protected function setUp(): void
    {
        slay_db()->exec('DELETE FROM scores');
    }

    public function test_accepts_valid_submission(): void
    {
        [$status, , $json] = slay_invoke('score.php', 'POST', [], [
            'name' => 'Ava', 'score' => 423, 'wave' => 7, 'duration' => 184,
        ]);
        $this->assertSame(200, $status);
        $this->assertSame(1, $json['rank']);
        $this->assertSame(423, $json['topScore']);
    }

    public function test_rejects_long_name(): void
    {
        [$status, , $json] = slay_invoke('score.php', 'POST', [], [
            'name' => str_repeat('x', 17), 'score' => 1, 'wave' => 1, 'duration' => 1,
        ]);
        $this->assertSame(400, $status);
        $this->assertStringContainsString('name', $json['error']);
    }

    public function test_rejects_non_alnum_name(): void
    {
        [$status] = slay_invoke('score.php', 'POST', [], [
            'name' => 'A<script>v', 'score' => 1, 'wave' => 1, 'duration' => 1,
        ]);
        $this->assertSame(400, $status);
    }

    public function test_rejects_negative_score(): void
    {
        [$status] = slay_invoke('score.php', 'POST', [], [
            'name' => 'A', 'score' => -1, 'wave' => 1, 'duration' => 1,
        ]);
        $this->assertSame(400, $status);
    }

    public function test_rejects_implausible_score(): void
    {
        [$status] = slay_invoke('score.php', 'POST', [], [
            'name' => 'A', 'score' => 10_000_000, 'wave' => 1, 'duration' => 1,
        ]);
        $this->assertSame(400, $status);
    }

    public function test_returns_correct_rank(): void
    {
        slay_invoke('score.php', 'POST', [], ['name'=>'A','score'=>500,'wave'=>5,'duration'=>60]);
        slay_invoke('score.php', 'POST', [], ['name'=>'B','score'=>900,'wave'=>9,'duration'=>120]);
        sleep(11); // bypass rate limit
        [, , $json] = slay_invoke('score.php', 'POST', [], [
            'name'=>'C','score'=>700,'wave'=>7,'duration'=>90,
        ]);
        $this->assertSame(2, $json['rank']);     // 900, 700, 500
        $this->assertSame(900, $json['topScore']);
    }

    public function test_rate_limits_same_ip_within_10s(): void
    {
        slay_invoke('score.php', 'POST', [], ['name'=>'A','score'=>1,'wave'=>1,'duration'=>1]);
        [$status, , $json] = slay_invoke('score.php', 'POST', [], [
            'name'=>'A','score'=>2,'wave'=>1,'duration'=>1,
        ]);
        $this->assertSame(429, $status);
        $this->assertStringContainsString('rate', strtolower($json['error']));
    }
}
```

Note: the `sleep(11)` in `test_returns_correct_rank` is ugly but cheap. If we want a faster test, we can mock `slay_now()` — but YAGNI: this whole test file runs in <15s.

- [ ] **Step 2: Run, see them fail**

Run: `vendor/bin/phpunit --filter ScoreTest`
Expected: 7 failures, "score.php not found."

- [ ] **Step 3: Write `public/api/score.php`**

```php
<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    slay_json(405, ['error' => 'method not allowed']);
    return;
}

$body = slay_input_json();
$name     = trim((string)($body['name']     ?? ''));
$score    = $body['score']    ?? null;
$wave     = $body['wave']     ?? null;
$duration = $body['duration'] ?? null;

// Validation.
if ($name === '' || mb_strlen($name) > 16) {
    slay_json(400, ['error' => 'name must be 1–16 characters']);
    return;
}
if (!preg_match('/^[A-Za-z0-9 ]+$/', $name)) {
    slay_json(400, ['error' => 'name must be alphanumeric (with spaces)']);
    return;
}
foreach (['score' => $score, 'wave' => $wave, 'duration' => $duration] as $f => $v) {
    if (!is_int($v) || $v < 0) {
        slay_json(400, ['error' => "$f must be a non-negative integer"]);
        return;
    }
}
// Plausibility ceilings (anti-spam, anti-cheat-lite).
if ($score > 1_000_000)   { slay_json(400, ['error' => 'score implausible']); return; }
if ($wave > 1000)         { slay_json(400, ['error' => 'wave implausible']); return; }
if ($duration > 7200)     { slay_json(400, ['error' => 'duration implausible']); return; }

// Profanity check (small starter list — extend over time).
static $bannedWords = ['shit','fuck','bitch','cunt','asshole','damn','dick'];
$lc = strtolower($name);
foreach ($bannedWords as $w) {
    if (str_contains($lc, $w)) {
        slay_json(400, ['error' => 'name not allowed']); return;
    }
}

$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

// Rate limit: 1 submission per IP per 10s.
$db = slay_db();
$recent = $db->prepare(
    'SELECT COUNT(*) AS c FROM scores WHERE ip = :ip AND submitted_at > :since'
);
$recent->execute([':ip' => $ip, ':since' => slay_now() - 10]);
$count = (int)$recent->fetch()['c'];
if ($count > 0) {
    slay_json(429, ['error' => 'rate limit — wait a few seconds']);
    return;
}

$ins = $db->prepare(
    'INSERT INTO scores (name, score, wave, duration, ip, submitted_at)
     VALUES (:name, :score, :wave, :duration, :ip, :ts)'
);
$ins->execute([
    ':name'     => $name,
    ':score'    => $score,
    ':wave'     => $wave,
    ':duration' => $duration,
    ':ip'       => $ip,
    ':ts'       => slay_now(),
]);

$rank   = (int)$db->query("SELECT COUNT(*) AS c FROM scores WHERE score > $score")->fetch()['c'] + 1;
$topRow = $db->query('SELECT MAX(score) AS top FROM scores')->fetch();
$top    = (int)($topRow['top'] ?? 0);

slay_json(200, ['rank' => $rank, 'topScore' => $top]);
```

- [ ] **Step 4: Run, see them pass**

Run: `vendor/bin/phpunit --filter ScoreTest`
Expected: 7 passing.

- [ ] **Step 5: Commit**

```bash
git add public/api/score.php tests/api/ScoreTest.php
git commit -m "feat(api): score submission with validation and rate limiting"
```

---

## Task 6: Leaderboard endpoint

**Files:**
- Create: `public/api/leaderboard.php`
- Create: `tests/api/LeaderboardTest.php`

- [ ] **Step 1: Write the tests**

```php
<?php
declare(strict_types=1);

namespace Slay\Tests\Api;

use PHPUnit\Framework\TestCase;

class LeaderboardTest extends TestCase
{
    protected function setUp(): void
    {
        slay_db()->exec('DELETE FROM scores');
    }

    private function insert(string $name, int $score, int $secondsAgo): void
    {
        $stmt = slay_db()->prepare(
            'INSERT INTO scores (name, score, wave, duration, ip, submitted_at)
             VALUES (:n, :s, 1, 60, "127.0.0.1", :t)'
        );
        $stmt->execute([':n' => $name, ':s' => $score, ':t' => time() - $secondsAgo]);
    }

    public function test_returns_alltime_top_20_and_today_top_10(): void
    {
        // 25 historic scores, 5 from today.
        for ($i = 0; $i < 25; $i++) {
            $this->insert("Old$i", 100 + $i, 86400 * 2); // 2 days ago
        }
        for ($i = 0; $i < 5; $i++) {
            $this->insert("New$i", 500 + $i, 60); // 1 minute ago
        }

        [$status, , $json] = slay_invoke('leaderboard.php');
        $this->assertSame(200, $status);
        $this->assertCount(20, $json['allTime']);
        $this->assertCount(5,  $json['today']);

        // allTime is sorted desc; top entry is highest "New" score.
        $this->assertSame('New4', $json['allTime'][0]['name']);
        $this->assertSame(504,    $json['allTime'][0]['score']);

        // Each entry has expected shape.
        $first = $json['allTime'][0];
        foreach (['name','score','wave','submittedAt'] as $k) {
            $this->assertArrayHasKey($k, $first);
        }
        // submittedAt is ISO8601.
        $this->assertNotFalse(strtotime($first['submittedAt']));
    }

    public function test_empty_leaderboard(): void
    {
        [$status, , $json] = slay_invoke('leaderboard.php');
        $this->assertSame(200, $status);
        $this->assertSame([], $json['allTime']);
        $this->assertSame([], $json['today']);
    }
}
```

- [ ] **Step 2: Run, see them fail**

Run: `vendor/bin/phpunit --filter LeaderboardTest`
Expected: 2 failures.

- [ ] **Step 3: Write `public/api/leaderboard.php`**

```php
<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    slay_json(405, ['error' => 'method not allowed']);
    return;
}

$db = slay_db();

$mapRow = function(array $r): array {
    return [
        'name'        => $r['name'],
        'score'       => (int)$r['score'],
        'wave'        => (int)$r['wave'],
        'submittedAt' => gmdate('Y-m-d\TH:i:s\Z', (int)$r['submitted_at']),
    ];
};

$allTime = $db->query(
    'SELECT name, score, wave, submitted_at
       FROM scores
   ORDER BY score DESC, submitted_at ASC
      LIMIT 20'
)->fetchAll();

$cutoff = slay_now() - 86400;
$today = $db->prepare(
    'SELECT name, score, wave, submitted_at
       FROM scores
      WHERE submitted_at >= :cutoff
   ORDER BY score DESC, submitted_at ASC
      LIMIT 10'
);
$today->execute([':cutoff' => $cutoff]);

slay_json(200, [
    'allTime' => array_map($mapRow, $allTime),
    'today'   => array_map($mapRow, $today->fetchAll()),
]);
```

- [ ] **Step 4: Run, see them pass**

Run: `vendor/bin/phpunit --filter LeaderboardTest`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add public/api/leaderboard.php tests/api/LeaderboardTest.php
git commit -m "feat(api): leaderboard endpoint (top 20 all-time + top 10 today)"
```

---

## Task 7: State endpoint (basic)

**Files:**
- Create: `public/api/state.php`
- Create: `tests/api/StateTest.php`

- [ ] **Step 1: Write the tests**

```php
<?php
declare(strict_types=1);

namespace Slay\Tests\Api;

use PHPUnit\Framework\TestCase;

class StateTest extends TestCase
{
    protected function setUp(): void
    {
        slay_db()->exec('UPDATE state SET paused=0, message="", force_reload=0, force_reload_set_at=0, version=0 WHERE id=1');
        slay_db()->exec('DELETE FROM presence');
    }

    public function test_returns_default_state(): void
    {
        [$status, , $json] = slay_invoke('state.php');
        $this->assertSame(200, $status);
        $this->assertFalse($json['paused']);
        $this->assertSame('',  $json['message']);
        $this->assertSame(0,   $json['version']);
        $this->assertFalse($json['forceReload']);
        $this->assertSame(0,   $json['playerCount']);
    }

    public function test_etag_returns_304_when_version_matches(): void
    {
        // Bump version so the ETag is non-trivial.
        slay_db()->exec('UPDATE state SET version=5 WHERE id=1');

        [$status, $headers] = slay_invoke('state.php');
        $this->assertSame(200, $status);
        $etag = null;
        foreach ($headers as $h) if (stripos($h, 'ETag:') === 0) $etag = trim(substr($h, 5));
        $this->assertNotNull($etag);

        [$status2] = slay_invoke('state.php', 'GET', [], null, ['If-None-Match' => $etag]);
        $this->assertSame(304, $status2);
    }

    public function test_force_reload_auto_clears_after_10s(): void
    {
        slay_db()->exec(
            'UPDATE state SET force_reload=1, force_reload_set_at='
            . (time() - 11) . ' WHERE id=1'
        );
        [, , $json] = slay_invoke('state.php');
        $this->assertFalse($json['forceReload']);
    }

    public function test_force_reload_active_within_10s(): void
    {
        slay_db()->exec(
            'UPDATE state SET force_reload=1, force_reload_set_at='
            . (time() - 3) . ' WHERE id=1'
        );
        [, , $json] = slay_invoke('state.php');
        $this->assertTrue($json['forceReload']);
    }
}
```

- [ ] **Step 2: Run, see them fail**

Run: `vendor/bin/phpunit --filter StateTest`
Expected: 4 failures.

- [ ] **Step 3: Write `public/api/state.php`** (basic — presence handled in Task 8)

```php
<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$db  = slay_db();
$now = slay_now();

$row = $db->query(
    'SELECT paused, message, force_reload, force_reload_set_at, version FROM state WHERE id=1'
)->fetch();

$forceReload = ((int)$row['force_reload'] === 1)
    && ($now - (int)$row['force_reload_set_at'] <= 10);

// Presence side-effect (Task 8 will fill this in; placeholder for now).
$playerCount = 0;

$payload = [
    'paused'      => (int)$row['paused'] === 1,
    'message'     => (string)$row['message'],
    'version'     => (int)$row['version'],
    'forceReload' => $forceReload,
    'playerCount' => $playerCount,
];

$etag = '"v' . (int)$row['version'] . '"';
$ifNone = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
if ($ifNone !== '' && $ifNone === $etag) {
    http_response_code(304);
    slay_header('ETag: ' . $etag);
    if (PHP_SAPI !== 'cli') exit;
    return;
}

slay_header('ETag: ' . $etag);
slay_json(200, $payload);
```

- [ ] **Step 4: Run, see them pass**

Run: `vendor/bin/phpunit --filter StateTest`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add public/api/state.php tests/api/StateTest.php
git commit -m "feat(api): state endpoint with ETag and auto-clearing forceReload"
```

---

## Task 8: State endpoint — presence tracking

**Files:**
- Modify: `public/api/state.php`
- Modify: `tests/api/StateTest.php`

- [ ] **Step 1: Add tests**

Append to `tests/api/StateTest.php`:

```php
    public function test_presence_increments_player_count(): void
    {
        slay_invoke('state.php', 'GET', ['cid' => 'uuid-A']);
        slay_invoke('state.php', 'GET', ['cid' => 'uuid-B']);
        [, , $json] = slay_invoke('state.php', 'GET', ['cid' => 'uuid-A']); // re-poll same client
        $this->assertSame(2, $json['playerCount']);
    }

    public function test_presence_drops_stale_clients(): void
    {
        // Insert a stale presence directly.
        slay_db()->exec(
            "INSERT INTO presence (client_id, last_seen) VALUES ('uuid-stale', "
            . (time() - 30) . ")"
        );
        [, , $json] = slay_invoke('state.php', 'GET', ['cid' => 'uuid-A']);
        $this->assertSame(1, $json['playerCount']); // only uuid-A counted
    }

    public function test_no_cid_query_does_not_create_presence_row(): void
    {
        [, , $json] = slay_invoke('state.php');
        $this->assertSame(0, $json['playerCount']);
    }
```

- [ ] **Step 2: Run, see new ones fail**

Run: `vendor/bin/phpunit --filter StateTest`
Expected: 3 new failures (existing 4 still pass).

- [ ] **Step 3: Add presence logic to `state.php`**

Replace the `$playerCount = 0;` placeholder block with:

```php
// Presence: upsert this client's last_seen, then count fresh clients.
$cid = (string)($_GET['cid'] ?? '');
if ($cid !== '' && preg_match('/^[A-Za-z0-9\-]{1,64}$/', $cid)) {
    $up = $db->prepare(
        'INSERT INTO presence (client_id, last_seen) VALUES (:cid, :ts)
         ON CONFLICT(client_id) DO UPDATE SET last_seen = :ts'
    );
    $up->execute([':cid' => $cid, ':ts' => $now]);
}

// Opportunistic GC: prune presence rows older than 60s.
$db->exec('DELETE FROM presence WHERE last_seen < ' . ($now - 60));

$cntRow = $db->query(
    'SELECT COUNT(*) AS c FROM presence WHERE last_seen >= ' . ($now - 10)
)->fetch();
$playerCount = (int)$cntRow['c'];
```

- [ ] **Step 4: Run, see all pass**

Run: `vendor/bin/phpunit --filter StateTest`
Expected: 7 passing.

- [ ] **Step 5: Commit**

```bash
git add public/api/state.php tests/api/StateTest.php
git commit -m "feat(api): presence tracking and live player count"
```

---

## Task 9: Teacher endpoint — pause/resume

**Files:**
- Create: `public/api/teacher.php`
- Create: `tests/api/TeacherTest.php`

- [ ] **Step 1: Write the tests**

```php
<?php
declare(strict_types=1);

namespace Slay\Tests\Api;

use PHPUnit\Framework\TestCase;

class TeacherTest extends TestCase
{
    private const KEY = 'test-teacher-key-xyz';

    protected function setUp(): void
    {
        slay_db()->exec('UPDATE state SET paused=0, message="", force_reload=0, force_reload_set_at=0, version=0 WHERE id=1');
        slay_db()->exec('DELETE FROM scores');
    }

    public function test_rejects_missing_key(): void
    {
        [$status] = slay_invoke('teacher.php', 'POST', [], ['action' => 'pause']);
        $this->assertSame(403, $status);
    }

    public function test_rejects_wrong_key(): void
    {
        [$status] = slay_invoke('teacher.php', 'POST', ['key' => 'bogus'], ['action' => 'pause']);
        $this->assertSame(403, $status);
    }

    public function test_pause_sets_state_and_bumps_version(): void
    {
        [$status, , $json] = slay_invoke('teacher.php', 'POST', ['key' => self::KEY], ['action' => 'pause']);
        $this->assertSame(200, $status);
        $this->assertTrue($json['ok']);

        $row = slay_db()->query('SELECT paused, version FROM state WHERE id=1')->fetch();
        $this->assertSame(1, (int)$row['paused']);
        $this->assertSame(1, (int)$row['version']);
    }

    public function test_resume_clears_paused_and_bumps_version(): void
    {
        slay_db()->exec('UPDATE state SET paused=1, version=5 WHERE id=1');
        [$status] = slay_invoke('teacher.php', 'POST', ['key' => self::KEY], ['action' => 'resume']);
        $this->assertSame(200, $status);

        $row = slay_db()->query('SELECT paused, version FROM state WHERE id=1')->fetch();
        $this->assertSame(0, (int)$row['paused']);
        $this->assertSame(6, (int)$row['version']);
    }

    public function test_unknown_action_400(): void
    {
        [$status] = slay_invoke('teacher.php', 'POST', ['key' => self::KEY], ['action' => 'destroy_world']);
        $this->assertSame(400, $status);
    }
}
```

- [ ] **Step 2: Run, see them fail**

Run: `vendor/bin/phpunit --filter TeacherTest`
Expected: 5 failures.

- [ ] **Step 3: Write `public/api/teacher.php`**

```php
<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    slay_json(405, ['error' => 'method not allowed']);
    return;
}

$config = slay_config();
$expected = $config['teacher_key'] ?? null;
$provided = $_GET['key'] ?? '';
if (!$expected || !is_string($provided) || !hash_equals($expected, $provided)) {
    slay_json(403, ['error' => 'forbidden']);
    return;
}

$body   = slay_input_json();
$action = $body['action'] ?? '';

$db = slay_db();

switch ($action) {
    case 'pause':
        $db->exec('UPDATE state SET paused=1, version=version+1 WHERE id=1');
        break;

    case 'resume':
        $db->exec('UPDATE state SET paused=0, version=version+1 WHERE id=1');
        break;

    // message / broadcastReload / clearLeaderboard handled in Task 10.
    default:
        slay_json(400, ['error' => 'unknown action']);
        return;
}

slay_json(200, ['ok' => true]);
```

- [ ] **Step 4: Run, see them pass**

Run: `vendor/bin/phpunit --filter TeacherTest`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add public/api/teacher.php tests/api/TeacherTest.php
git commit -m "feat(api): teacher pause/resume with key auth"
```

---

## Task 10: Teacher endpoint — message, force-reload, clear-leaderboard

**Files:**
- Modify: `public/api/teacher.php`
- Modify: `tests/api/TeacherTest.php`

- [ ] **Step 1: Append tests**

```php
    public function test_message_sets_text_and_bumps_version(): void
    {
        [$status] = slay_invoke('teacher.php', 'POST', ['key' => self::KEY], [
            'action' => 'message', 'text' => 'Eyes up front',
        ]);
        $this->assertSame(200, $status);
        $row = slay_db()->query('SELECT message, version FROM state WHERE id=1')->fetch();
        $this->assertSame('Eyes up front', $row['message']);
        $this->assertSame(1, (int)$row['version']);
    }

    public function test_message_truncates_at_200_chars(): void
    {
        $long = str_repeat('x', 250);
        slay_invoke('teacher.php', 'POST', ['key' => self::KEY], ['action' => 'message', 'text' => $long]);
        $row = slay_db()->query('SELECT message FROM state WHERE id=1')->fetch();
        $this->assertSame(200, mb_strlen($row['message']));
    }

    public function test_broadcast_reload_sets_flag_and_timestamp(): void
    {
        [$status] = slay_invoke('teacher.php', 'POST', ['key' => self::KEY], ['action' => 'broadcastReload']);
        $this->assertSame(200, $status);
        $row = slay_db()->query('SELECT force_reload, force_reload_set_at FROM state WHERE id=1')->fetch();
        $this->assertSame(1, (int)$row['force_reload']);
        $this->assertGreaterThan(time() - 5, (int)$row['force_reload_set_at']);
    }

    public function test_clear_leaderboard_requires_confirm(): void
    {
        slay_db()->exec("INSERT INTO scores (name, score, wave, duration, ip, submitted_at) VALUES ('A', 1, 1, 1, '1.1.1.1', " . time() . ")");
        [$status] = slay_invoke('teacher.php', 'POST', ['key' => self::KEY], ['action' => 'clearLeaderboard']);
        $this->assertSame(400, $status);
        $this->assertSame(1, (int)slay_db()->query('SELECT COUNT(*) AS c FROM scores')->fetch()['c']);
    }

    public function test_clear_leaderboard_with_confirm_wipes_scores(): void
    {
        slay_db()->exec("INSERT INTO scores (name, score, wave, duration, ip, submitted_at) VALUES ('A', 1, 1, 1, '1.1.1.1', " . time() . ")");
        [$status] = slay_invoke('teacher.php', 'POST', ['key' => self::KEY], [
            'action' => 'clearLeaderboard', 'confirm' => true,
        ]);
        $this->assertSame(200, $status);
        $this->assertSame(0, (int)slay_db()->query('SELECT COUNT(*) AS c FROM scores')->fetch()['c']);
    }
```

- [ ] **Step 2: Run, see new ones fail**

Run: `vendor/bin/phpunit --filter TeacherTest`
Expected: 5 new failures.

- [ ] **Step 3: Extend `teacher.php` switch**

Replace the `// message / broadcastReload / clearLeaderboard handled in Task 10.` comment + `default` case with:

```php
    case 'message':
        $text = (string)($body['text'] ?? '');
        if (mb_strlen($text) > 200) $text = mb_substr($text, 0, 200);
        $stmt = $db->prepare('UPDATE state SET message=:m, version=version+1 WHERE id=1');
        $stmt->execute([':m' => $text]);
        break;

    case 'broadcastReload':
        $stmt = $db->prepare(
            'UPDATE state SET force_reload=1, force_reload_set_at=:t, version=version+1 WHERE id=1'
        );
        $stmt->execute([':t' => slay_now()]);
        break;

    case 'clearLeaderboard':
        if (empty($body['confirm'])) {
            slay_json(400, ['error' => 'confirm required']);
            return;
        }
        $db->exec('DELETE FROM scores');
        // Note: don't bump version — clients don't need to react.
        break;

    default:
        slay_json(400, ['error' => 'unknown action']);
        return;
```

- [ ] **Step 4: Run, see all pass**

Run: `vendor/bin/phpunit`
Expected: all green across all suites.

- [ ] **Step 5: Commit**

```bash
git add public/api/teacher.php tests/api/TeacherTest.php
git commit -m "feat(api): teacher message, broadcastReload, clearLeaderboard"
```

---

## Task 11: Player HTML/CSS skeleton

**Files:**
- Create: `public/index.html`
- Create: `public/style.css`

No tests — verified by manual smoke. Goal: a black canvas on the page, ready for `game.js` to draw into.

- [ ] **Step 1: Write `public/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SLAY</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <main id="game-root">
    <header class="topbar">
      <h1>SLAY</h1>
      <div class="hud" id="hud">
        <span id="hud-hp"></span>
        <span id="hud-score"></span>
        <span id="hud-wave"></span>
        <span id="hud-time"></span>
      </div>
    </header>

    <div class="stage">
      <canvas id="arena" width="960" height="600"></canvas>

      <div id="overlay" class="overlay hidden" aria-live="polite"></div>

      <div id="game-over" class="modal hidden">
        <h2>You died</h2>
        <p id="game-over-summary"></p>
        <label>Name <input id="player-name" maxlength="16" autocomplete="off"></label>
        <button id="submit-score">Submit score</button>
        <p id="submit-error" class="error hidden"></p>
      </div>

      <div id="leaderboard" class="modal hidden">
        <h2>Leaderboard</h2>
        <p id="rank-summary"></p>
        <h3>Today</h3>
        <ol id="lb-today"></ol>
        <h3>All time</h3>
        <ol id="lb-alltime"></ol>
        <button id="play-again">Play again</button>
      </div>
    </div>

    <p class="message-bar" id="message-bar"></p>
  </main>

  <script src="/game.js" defer></script>
</body>
</html>
```

- [ ] **Step 2: Write `public/style.css`**

```css
:root {
  --bg: #0d1117;
  --panel: #161b22;
  --ink: #e6edf3;
  --accent: #ffd76b;
  --danger: #ff6b6b;
}

* { box-sizing: border-box; }

html, body {
  margin: 0; padding: 0;
  background: var(--bg);
  color: var(--ink);
  font: 16px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  height: 100%;
}

#game-root {
  display: flex; flex-direction: column;
  align-items: center;
  min-height: 100%;
  padding: 12px;
  gap: 12px;
}

.topbar {
  display: flex; justify-content: space-between; align-items: baseline;
  width: 100%; max-width: 960px;
}
.topbar h1 { margin: 0; font-size: 24px; letter-spacing: 2px; color: var(--accent); }
.hud { display: flex; gap: 16px; font-variant-numeric: tabular-nums; }

.stage {
  position: relative;
  width: 960px; max-width: 100%;
}
#arena {
  display: block; width: 100%; height: auto;
  background: #1a1d2e;
  border: 2px solid #2a2d3e; border-radius: 8px;
}

.overlay {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.78);
  display: flex; align-items: center; justify-content: center;
  flex-direction: column; gap: 12px;
  text-align: center; padding: 24px;
  font-size: 28px; font-weight: 700; letter-spacing: 1px;
  border-radius: 8px;
}
.overlay .sub { font-size: 18px; font-weight: 400; opacity: .9; max-width: 600px; }

.hidden { display: none !important; }

.modal {
  position: absolute; inset: 50% auto auto 50%;
  transform: translate(-50%,-50%);
  background: var(--panel);
  padding: 24px; border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.6);
  min-width: 320px; max-width: 90%;
}
.modal h2 { margin-top: 0; }
.modal label { display: block; margin: 12px 0; }
.modal input, .modal button {
  font: inherit; padding: 8px 12px;
  border-radius: 6px; border: 1px solid #444;
  background: #0d1117; color: var(--ink);
}
.modal button {
  background: var(--accent); color: #0d1117; font-weight: 700;
  cursor: pointer; border: none;
}
.error { color: var(--danger); }

.message-bar {
  width: 960px; max-width: 100%;
  min-height: 24px;
  background: #1a2332;
  color: var(--accent);
  padding: 6px 12px; border-radius: 6px;
  margin: 0;
}
.message-bar:empty { visibility: hidden; }

#leaderboard ol { padding-left: 20px; max-height: 220px; overflow-y: auto; }
#leaderboard li { padding: 2px 0; }
```

- [ ] **Step 3: Smoke-test**

Run: `php -S localhost:8000 -t public`
Open: http://localhost:8000
Expected: a dark page with "SLAY" header, an empty dark canvas, no console errors.

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/style.css
git commit -m "feat(ui): index.html skeleton with canvas, HUD, modals, message bar"
```

---

## Task 12: Game-loop scaffold

**Files:**
- Create: `public/game.js`

This task ships the empty engine: constants, registries, state, fixed-dt loop, no rendering yet. Subsequent tasks fill in features.

- [ ] **Step 1: Write `public/game.js`**

```js
'use strict';

// ─── Constants ──────────────────────────────────
const ARENA = { w: 960, h: 600 };
const HERO = {
  emoji: '🛡️',
  speed: 220,             // px/sec
  size: 28,               // hit radius for collision
  maxHp: 100,
};

const WEAPONS = [
  // populated in Task 15
];
const ENEMIES = [
  // populated in Task 14
];
const POWERUPS = [
  // empty in v1; students add
];

// ─── State ──────────────────────────────────────
const state = {
  running: false,
  paused: false,
  gameOver: false,
  time: 0,                // seconds since run start
  score: 0,
  hero: { x: ARENA.w / 2, y: ARENA.h / 2, hp: HERO.maxHp, vx: 0, vy: 0 },
  input: { up: false, down: false, left: false, right: false },
  enemies: [],
  projectiles: [],
  particles: [],
  weapons: [/* { def, cooldownLeft } pushed in Task 15 */],
  spawn: { nextAt: 0, wave: 1 },
  messageBar: '',
  serverVersion: -1,
  clientId: null,
};

// ─── Boot ───────────────────────────────────────
const canvas = document.getElementById('arena');
const ctx = canvas.getContext('2d');
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

state.clientId = (() => {
  const stored = localStorage.getItem('slay_cid');
  if (stored) return stored;
  const cid = crypto.randomUUID();
  localStorage.setItem('slay_cid', cid);
  return cid;
})();

// ─── Main loop with fixed-dt cap ────────────────
let lastTs = 0;
function tick(now) {
  const dt = Math.min(0.033, (now - lastTs) / 1000 || 0); // cap at 1/30s
  lastTs = now;

  if (state.running && !state.paused && !state.gameOver) {
    state.time += dt;
    update(dt);
  }
  render();
  requestAnimationFrame(tick);
}

function update(dt) {
  // filled in by tasks 13–18
}

function render() {
  ctx.clearRect(0, 0, ARENA.w, ARENA.h);
  // entities filled in by tasks 13–18
  renderHUD();
}

function renderHUD() {
  document.getElementById('hud-hp').textContent    = `❤️ ${Math.max(0, Math.round(state.hero.hp))}`;
  document.getElementById('hud-score').textContent = `⭐ ${state.score}`;
  document.getElementById('hud-wave').textContent  = `🌊 wave ${state.spawn.wave}`;
  document.getElementById('hud-time').textContent  = `⏱ ${state.time.toFixed(1)}s`;
}

function startRun() {
  Object.assign(state, {
    running: true, paused: false, gameOver: false,
    time: 0, score: 0,
    hero: { x: ARENA.w / 2, y: ARENA.h / 2, hp: HERO.maxHp, vx: 0, vy: 0 },
    enemies: [], projectiles: [], particles: [],
    spawn: { nextAt: 0, wave: 1 },
  });
  state.weapons = WEAPONS.map(def => ({ def, cooldownLeft: def.cooldown }));
}

startRun();
requestAnimationFrame(tick);
```

- [ ] **Step 2: Smoke-test**

Reload http://localhost:8000.
Expected: HUD shows `❤️ 100  ⭐ 0  🌊 wave 1  ⏱ 0.0s`. The canvas is empty but the loop is running — the timer doesn't count up because we haven't started yet… actually wait: `startRun()` sets `state.running = true`. Time should tick up. Verify: after a second the HUD shows `⏱ 1.0s` etc.

- [ ] **Step 3: Commit**

```bash
git add public/game.js
git commit -m "feat(game): scaffold — constants, state, fixed-dt loop, HUD"
```

---

## Task 13: Hero — input, movement, rendering

**Files:**
- Modify: `public/game.js`

- [ ] **Step 1: Add input listeners after `startRun()`**

Right before `startRun()`:

```js
const KEYMAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
};
window.addEventListener('keydown', e => {
  const k = KEYMAP[e.code]; if (k) { state.input[k] = true; e.preventDefault(); }
});
window.addEventListener('keyup', e => {
  const k = KEYMAP[e.code]; if (k) { state.input[k] = false; e.preventDefault(); }
});
```

- [ ] **Step 2: Implement `update(dt)` for hero movement**

Replace the empty `update()`:

```js
function update(dt) {
  // Hero velocity from input.
  let vx = (state.input.right ? 1 : 0) - (state.input.left ? 1 : 0);
  let vy = (state.input.down  ? 1 : 0) - (state.input.up   ? 1 : 0);
  const mag = Math.hypot(vx, vy);
  if (mag > 0) { vx /= mag; vy /= mag; }
  state.hero.vx = vx * HERO.speed;
  state.hero.vy = vy * HERO.speed;

  state.hero.x = clamp(state.hero.x + state.hero.vx * dt, HERO.size, ARENA.w - HERO.size);
  state.hero.y = clamp(state.hero.y + state.hero.vy * dt, HERO.size, ARENA.h - HERO.size);
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
```

- [ ] **Step 3: Add hero render**

Modify `render()`:

```js
function render() {
  ctx.clearRect(0, 0, ARENA.w, ARENA.h);

  // Hero
  drawEmoji(HERO.emoji, state.hero.x, state.hero.y, 36);

  renderHUD();
}

function drawEmoji(emoji, x, y, size = 32) {
  ctx.font = `${size}px serif`;
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 6;
  ctx.fillText(emoji, x, y);
  ctx.shadowBlur = 0;
}
```

- [ ] **Step 4: Smoke-test**

Reload. Expected:
- Hero 🛡️ visible in middle of arena.
- WASD or arrow keys move it; movement is normalized so diagonals don't speed-boost.
- Hero clamps at arena edges (doesn't escape).
- HUD timer ticks up.

- [ ] **Step 5: Commit**

```bash
git add public/game.js
git commit -m "feat(game): hero movement and rendering"
```

---

## Task 14: Enemies — registry, spawner, waves, AI

**Files:**
- Modify: `public/game.js`

- [ ] **Step 1: Populate the ENEMIES registry**

Replace the empty `ENEMIES` array:

```js
const ENEMIES = [
  { id: 'ghost', emoji: '👻', hp: 30, speed: 90, damage: 10, size: 22, scoreValue: 5 },
  // students add new enemy types here
];
```

- [ ] **Step 2: Add spawner + AI to `update(dt)`**

Append inside `update(dt)`, after the hero block:

```js
  // Spawn timer.
  state.spawn.nextAt -= dt;
  if (state.spawn.nextAt <= 0) {
    spawnEnemy();
    // Spawn rate accelerates with wave: 1.4s at wave 1, ~0.3s at wave 10+.
    state.spawn.nextAt = Math.max(0.3, 1.4 - (state.spawn.wave - 1) * 0.1);
  }
  // Wave bumps every 30 seconds.
  state.spawn.wave = 1 + Math.floor(state.time / 30);

  // Enemy chase + contact damage.
  for (const e of state.enemies) {
    const dx = state.hero.x - e.x, dy = state.hero.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.x += (dx / d) * e.def.speed * dt;
    e.y += (dy / d) * e.def.speed * dt;

    if (d < HERO.size + e.def.size && e.contactCooldown <= 0) {
      state.hero.hp -= e.def.damage;
      e.contactCooldown = 0.6;
    }
    e.contactCooldown = Math.max(0, e.contactCooldown - dt);
  }
```

- [ ] **Step 3: Add `spawnEnemy()` helper**

After `clamp()`:

```js
function spawnEnemy() {
  const def = ENEMIES[Math.floor(Math.random() * ENEMIES.length)];
  // Spawn just outside one of the four arena edges.
  const side = Math.floor(Math.random() * 4);
  const margin = 40;
  let x, y;
  if (side === 0)      { x = Math.random() * ARENA.w; y = -margin; }
  else if (side === 1) { x = ARENA.w + margin; y = Math.random() * ARENA.h; }
  else if (side === 2) { x = Math.random() * ARENA.w; y = ARENA.h + margin; }
  else                 { x = -margin; y = Math.random() * ARENA.h; }
  state.enemies.push({ def, x, y, hp: def.hp, contactCooldown: 0 });
}
```

- [ ] **Step 4: Add enemy render**

Inside `render()`, before `renderHUD()`:

```js
  for (const e of state.enemies) drawEmoji(e.def.emoji, e.x, e.y, 30);
```

- [ ] **Step 5: Smoke-test**

Reload. Expected:
- Ghosts 👻 spawn from edges and walk toward the hero.
- HP ticks down as ghosts touch the hero (HUD `❤️` counts down).
- Wave number increments at 30s, and spawn rate visibly increases.
- HP can hit 0 but nothing happens yet (game-over flow is Task 16).

- [ ] **Step 6: Commit**

```bash
git add public/game.js
git commit -m "feat(game): enemy registry, spawner, wave ramp, contact damage"
```

---

## Task 15: Weapons — registry, projectiles, collision, score

**Files:**
- Modify: `public/game.js`

- [ ] **Step 1: Populate the WEAPONS registry and define behaviors**

Replace the empty `WEAPONS` array and add a `behaviors` map. Insert after `ENEMIES`:

```js
const WEAPONS = [
  {
    id: 'sword',
    name: 'Thrown Sword',
    emoji: '⚔️',
    cooldown: 0.7,        // seconds
    damage: 25,
    speed: 380,           // projectile px/sec
    range: 480,           // max travel
    behavior: 'thrown',
  },
  // students add new weapons here
];

const behaviors = {
  /** Fire one projectile straight at the nearest enemy. */
  thrown(weapon, hero, target) {
    const dx = target.x - hero.x, dy = target.y - hero.y;
    const d = Math.hypot(dx, dy) || 1;
    state.projectiles.push({
      weapon, x: hero.x, y: hero.y,
      vx: (dx / d) * weapon.speed,
      vy: (dy / d) * weapon.speed,
      remaining: weapon.range,
      size: 14,
    });
  },
  // students add new behaviors here (e.g. orbit, aura, beam)
};
```

- [ ] **Step 2: Add weapon firing to `update(dt)`**

Append after the enemy chase block:

```js
  // Weapons: tick cooldowns, fire at nearest enemy.
  for (const w of state.weapons) {
    w.cooldownLeft -= dt;
    if (w.cooldownLeft > 0) continue;
    const target = nearestEnemy(state.hero.x, state.hero.y);
    if (!target) continue;
    const fn = behaviors[w.def.behavior];
    if (fn) fn(w.def, state.hero, target);
    w.cooldownLeft = w.def.cooldown;
  }

  // Move projectiles, check collisions.
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    const stepX = p.vx * dt, stepY = p.vy * dt;
    p.x += stepX; p.y += stepY;
    p.remaining -= Math.hypot(stepX, stepY);

    let hit = false;
    for (let j = state.enemies.length - 1; j >= 0; j--) {
      const e = state.enemies[j];
      if (Math.hypot(p.x - e.x, p.y - e.y) < p.size + e.def.size) {
        e.hp -= p.weapon.damage;
        hit = true;
        if (e.hp <= 0) {
          state.score += e.def.scoreValue;
          state.enemies.splice(j, 1);
        }
        break;
      }
    }
    if (hit || p.remaining <= 0
        || p.x < -40 || p.x > ARENA.w + 40 || p.y < -40 || p.y > ARENA.h + 40) {
      state.projectiles.splice(i, 1);
    }
  }
```

- [ ] **Step 3: Add `nearestEnemy()` helper**

After `spawnEnemy()`:

```js
function nearestEnemy(x, y) {
  let best = null, bestD = Infinity;
  for (const e of state.enemies) {
    const d = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}
```

- [ ] **Step 4: Add projectile render**

Inside `render()`, after the enemy loop and before `renderHUD()`:

```js
  for (const p of state.projectiles) drawEmoji(p.weapon.emoji, p.x, p.y, 20);
```

- [ ] **Step 5: Update `startRun()` to populate weapons**

Already does this — the line `state.weapons = WEAPONS.map(def => ({ def, cooldownLeft: def.cooldown }));` was put in during Task 12. With WEAPONS now non-empty, it'll create one slot.

- [ ] **Step 6: Smoke-test**

Reload. Expected:
- Hero throws ⚔️ at the nearest 👻 every ~0.7s.
- Sword projectiles fly from the hero, hit enemies, and despawn on contact.
- Killed enemies disappear and score increments.

- [ ] **Step 7: Commit**

```bash
git add public/game.js
git commit -m "feat(game): weapon registry, behaviors, projectiles, collision, scoring"
```

---

## Task 16: HP, damage feedback, game over

**Files:**
- Modify: `public/game.js`

- [ ] **Step 1: Trigger game over when HP reaches zero**

In `update(dt)`, after the enemy block (or anywhere after damage is applied):

```js
  if (state.hero.hp <= 0 && !state.gameOver) {
    triggerGameOver();
  }
```

- [ ] **Step 2: Add `triggerGameOver()` and the modal flow**

After `nearestEnemy()`:

```js
function triggerGameOver() {
  state.gameOver = true;
  state.running = false;
  const summary =
    `Score ${state.score} · Wave ${state.spawn.wave} · ${state.time.toFixed(0)}s survived`;
  document.getElementById('game-over-summary').textContent = summary;
  document.getElementById('submit-error').classList.add('hidden');
  document.getElementById('player-name').value =
    localStorage.getItem('slay_last_name') || '';
  document.getElementById('game-over').classList.remove('hidden');
}
```

- [ ] **Step 3: Wire the Submit button (full leaderboard flow lands in Task 17)**

For now, just hook the button so the modal closes — actual leaderboard rendering is Task 17. Append at the bottom of `game.js`:

```js
document.getElementById('submit-score').addEventListener('click', async () => {
  // Task 17 fills this in.
  document.getElementById('game-over').classList.add('hidden');
});
```

- [ ] **Step 4: Smoke-test**

Reload. Stand in the middle and let ghosts hit you. When HP reaches 0, the game-over modal should appear with the summary line and a name field.

- [ ] **Step 5: Commit**

```bash
git add public/game.js
git commit -m "feat(game): game-over flow and modal"
```

---

## Task 17: Score submission + leaderboard view

**Files:**
- Modify: `public/game.js`

- [ ] **Step 1: Implement score submission**

Replace the placeholder click handler with:

```js
document.getElementById('submit-score').addEventListener('click', async () => {
  const nameInput = document.getElementById('player-name');
  const errEl = document.getElementById('submit-error');
  const name = nameInput.value.trim();

  if (!name || name.length > 16 || !/^[A-Za-z0-9 ]+$/.test(name)) {
    errEl.textContent = 'Name must be 1–16 characters, letters/numbers/spaces.';
    errEl.classList.remove('hidden');
    return;
  }

  localStorage.setItem('slay_last_name', name);

  let result;
  try {
    const r = await fetch('/api/score.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, score: state.score,
        wave: state.spawn.wave,
        duration: Math.round(state.time),
      }),
    });
    result = await r.json();
    if (!r.ok) throw new Error(result.error || `HTTP ${r.status}`);
  } catch (e) {
    errEl.textContent = `Couldn't submit: ${e.message}`;
    errEl.classList.remove('hidden');
    return;
  }

  document.getElementById('game-over').classList.add('hidden');
  await showLeaderboard(result.rank);
});

async function showLeaderboard(myRank) {
  const r = await fetch('/api/leaderboard.php');
  const data = await r.json();

  document.getElementById('rank-summary').textContent =
    `You ranked #${myRank}.`;

  const renderList = (id, rows) => {
    const el = document.getElementById(id);
    el.innerHTML = '';
    for (const row of rows) {
      const li = document.createElement('li');
      li.textContent = `${row.name} — ${row.score} (wave ${row.wave})`;
      el.appendChild(li);
    }
  };
  renderList('lb-today',   data.today);
  renderList('lb-alltime', data.allTime);

  document.getElementById('leaderboard').classList.remove('hidden');
}

document.getElementById('play-again').addEventListener('click', () => {
  document.getElementById('leaderboard').classList.add('hidden');
  startRun();
});
```

- [ ] **Step 2: Smoke-test**

Reload, die intentionally. Enter a name, click Submit. The game-over modal closes, the leaderboard modal opens with your rank and the lists. Click "Play again" — game resets and runs.

Then check the DB:
```sh
sqlite3 data/slay.db 'SELECT * FROM scores'
```
Your row should be there.

- [ ] **Step 3: Commit**

```bash
git add public/game.js
git commit -m "feat(game): score submission and leaderboard view"
```

---

## Task 18: Server state polling — pause overlay, message, force reload

**Files:**
- Modify: `public/game.js`

- [ ] **Step 1: Add the polling loop**

Append to `game.js`:

```js
async function pollServerState() {
  try {
    const r = await fetch(`/api/state.php?cid=${encodeURIComponent(state.clientId)}`, {
      cache: 'no-store',
    });
    if (!r.ok) return;
    const s = await r.json();

    // Pause / resume.
    state.paused = !!s.paused;
    const overlay = document.getElementById('overlay');
    if (state.paused) {
      overlay.innerHTML = `<div>⏸ PAUSED BY TEACHER</div>` +
        (s.message ? `<div class="sub">${escapeHtml(s.message)}</div>` : '');
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
    }

    // Message bar (shown also when not paused).
    document.getElementById('message-bar').textContent =
      (!state.paused && s.message) ? s.message : '';

    // Force reload (server clears the flag automatically after 10s, so we
    // only react when we see it for the first time).
    if (s.forceReload && s.version > state.serverVersion) {
      state.serverVersion = s.version;
      // Brief pause before reload so the user sees the message.
      setTimeout(() => location.reload(), 600);
      return;
    }
    state.serverVersion = s.version;
  } catch (_) {
    // Network blip — try again on next tick.
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

setInterval(pollServerState, 2000);
pollServerState();
```

- [ ] **Step 2: Smoke-test**

Reload the page. Then in another terminal, manually flip pause on:
```sh
sqlite3 data/slay.db "UPDATE state SET paused=1, message='Eyes up front', version=version+1 WHERE id=1"
```

Within 2 seconds the game should freeze (no enemy movement, no projectile movement) and the overlay should show "⏸ PAUSED BY TEACHER" + the message. Reverse it:
```sh
sqlite3 data/slay.db "UPDATE state SET paused=0, message='', version=version+1 WHERE id=1"
```

Game resumes within 2s.

Test force reload:
```sh
sqlite3 data/slay.db "UPDATE state SET force_reload=1, force_reload_set_at=$(date +%s), version=version+1 WHERE id=1"
```
Within 2s + 0.6s, the page reloads.

- [ ] **Step 3: Commit**

```bash
git add public/game.js
git commit -m "feat(game): server state polling — pause overlay, message bar, force reload"
```

---

## Task 19: Teacher control panel

**Files:**
- Create: `public/teacher.html`
- Create: `public/teacher.js`
- Modify: `public/style.css` (small additions)

- [ ] **Step 1: Write `public/teacher.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SLAY · Teacher Control</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body class="teacher">
  <main id="teacher-root">
    <header class="topbar">
      <h1>SLAY · Teacher Control</h1>
      <div class="hud"><span id="player-count">● 0 players</span></div>
    </header>

    <section id="auth-gate" class="modal" style="position:static;transform:none;margin-top:40px">
      <h2>Access required</h2>
      <p>Open this page with <code>?key=&lt;your-teacher-key&gt;</code>.</p>
    </section>

    <section id="control-panel" class="hidden">
      <button id="pause-btn" class="big-button">⏸ PAUSE EVERYONE</button>

      <div class="row">
        <label style="flex:1">
          Message shown to class:
          <input id="msg-input" maxlength="200" placeholder="Eyes up front…">
        </label>
        <button id="send-msg">Send</button>
        <button id="clear-msg" class="secondary">Clear</button>
      </div>

      <div class="row">
        <button id="reload-all" class="secondary">🔄 Force everyone to reload</button>
        <button id="clear-board" class="danger">🗑 Clear leaderboard</button>
      </div>

      <h3>Live top-5</h3>
      <ol id="live-top"></ol>

      <p id="teacher-error" class="error hidden"></p>
    </section>
  </main>

  <script src="/teacher.js" defer></script>
</body>
</html>
```

- [ ] **Step 2: Add styles to `public/style.css`**

Append:

```css
.teacher #teacher-root { width: 720px; max-width: 100%; }
.big-button {
  display: block; width: 100%;
  padding: 28px; margin: 24px 0;
  font-size: 22px; font-weight: 800; letter-spacing: 1px;
  border: none; border-radius: 12px;
  background: var(--danger); color: #fff;
  cursor: pointer;
}
.big-button.resumed { background: #2ea043; }
.row { display: flex; gap: 8px; align-items: end; margin: 16px 0; }
.row input { flex: 1; padding: 8px; border-radius: 6px; border: 1px solid #444; background:#0d1117; color: var(--ink); }
button.secondary { background: #30363d; color: var(--ink); }
button.danger    { background: var(--danger); color: #fff; }
button { padding: 8px 14px; border-radius: 6px; border: none; cursor: pointer; font: inherit; }
#live-top { padding-left: 20px; }
```

- [ ] **Step 3: Write `public/teacher.js`**

```js
'use strict';

const url = new URL(location.href);
let key = url.searchParams.get('key') || sessionStorage.getItem('slay_teacher_key') || '';
if (key) sessionStorage.setItem('slay_teacher_key', key);

const gate = document.getElementById('auth-gate');
const panel = document.getElementById('control-panel');
const errEl = document.getElementById('teacher-error');

if (!key) {
  // Stay on the gate.
} else {
  gate.classList.add('hidden');
  panel.classList.remove('hidden');
  init();
}

function showError(msg) {
  errEl.textContent = msg;
  errEl.classList.remove('hidden');
  setTimeout(() => errEl.classList.add('hidden'), 4000);
}

async function action(payload) {
  const r = await fetch(`/api/teacher.php?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    showError(j.error || `HTTP ${r.status}`);
    throw new Error(j.error || r.status);
  }
  return r.json();
}

let lastPaused = false;
function setPauseButton(paused) {
  const btn = document.getElementById('pause-btn');
  btn.textContent = paused ? '▶ RESUME EVERYONE' : '⏸ PAUSE EVERYONE';
  btn.classList.toggle('resumed', paused);
  btn.dataset.paused = paused ? '1' : '0';
  lastPaused = paused;
}

async function refreshState() {
  try {
    const r = await fetch('/api/state.php', { cache: 'no-store' });
    const s = await r.json();
    setPauseButton(!!s.paused);
    document.getElementById('player-count').textContent = `● ${s.playerCount} players`;
    if (document.getElementById('msg-input') !== document.activeElement) {
      document.getElementById('msg-input').value = s.message || '';
    }
  } catch (_) { /* ignore */ }
}

async function refreshLeaderboard() {
  try {
    const r = await fetch('/api/leaderboard.php');
    const data = await r.json();
    const ol = document.getElementById('live-top');
    ol.innerHTML = '';
    for (const row of data.allTime.slice(0, 5)) {
      const li = document.createElement('li');
      li.textContent = `${row.name} — ${row.score} (wave ${row.wave})`;
      ol.appendChild(li);
    }
  } catch (_) {}
}

function init() {
  document.getElementById('pause-btn').addEventListener('click', async () => {
    await action({ action: lastPaused ? 'resume' : 'pause' });
    refreshState();
  });

  const sendMsg = async () => {
    const v = document.getElementById('msg-input').value;
    await action({ action: 'message', text: v });
    refreshState();
  };
  document.getElementById('send-msg').addEventListener('click', sendMsg);
  document.getElementById('msg-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendMsg();
  });
  document.getElementById('clear-msg').addEventListener('click', async () => {
    document.getElementById('msg-input').value = '';
    await action({ action: 'message', text: '' });
    refreshState();
  });

  document.getElementById('reload-all').addEventListener('click', async () => {
    await action({ action: 'broadcastReload' });
  });

  document.getElementById('clear-board').addEventListener('click', async () => {
    if (!confirm('Wipe ALL leaderboard scores? This cannot be undone.')) return;
    await action({ action: 'clearLeaderboard', confirm: true });
    refreshLeaderboard();
  });

  setInterval(refreshState, 2000);
  setInterval(refreshLeaderboard, 5000);
  refreshState();
  refreshLeaderboard();
}
```

- [ ] **Step 4: Smoke-test**

Open http://localhost:8000/teacher.html — should see the access-required page.

Open http://localhost:8000/teacher.html?key=... — for local dev, the key in `config/config.php` (which we haven't created locally yet). For now, create one:

```sh
mkdir -p config
echo "<?php return ['teacher_key' => 'dev-key'];" > config/config.php
```

Then visit http://localhost:8000/teacher.html?key=dev-key.

Verify:
- Big "PAUSE EVERYONE" button.
- Click it → button flips to green "RESUME EVERYONE", and an open game tab freezes.
- Type a message, hit Send → other tab shows the banner.
- Click "Force everyone to reload" → other tab reloads in ~2-3s.
- Click "Clear leaderboard" → confirm dialog → leaderboard wiped (the `live-top` empties on next refresh).
- Player count reflects open game tabs.

- [ ] **Step 5: Commit**

```bash
git add public/teacher.html public/teacher.js public/style.css
git commit -m "feat(ui): teacher control panel"
```

---

## Task 20: Playwright E2E happy-path test

**Files:**
- Create: `package.json`
- Create: `playwright.config.js`
- Create: `tests/e2e/happy-path.spec.js`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "slay-e2e",
  "private": true,
  "scripts": {
    "test:e2e": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0"
  }
}
```

- [ ] **Step 2: Install Playwright**

Run: `npm install && npx playwright install chromium`
Expected: chromium downloads, no errors.

- [ ] **Step 3: Create `playwright.config.js`**

```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:8001',
    headless: true,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'php scripts/init_db.php && php -S localhost:8001 -t public',
      url: 'http://localhost:8001/api/health.php',
      reuseExistingServer: false,
      timeout: 10_000,
      env: {},
    },
  ],
});
```

- [ ] **Step 4: Create `tests/e2e/happy-path.spec.js`**

```js
import { test, expect } from '@playwright/test';

test('plays a run, dies, submits a score, sees leaderboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('SLAY');

  // Force the hero's HP to 0 immediately to trigger game over.
  // (We don't try to "play" the game in the test — that's brittle.)
  await page.evaluate(() => {
    state.hero.hp = 0;
  });

  // Game-over modal appears within ~1 frame.
  await expect(page.locator('#game-over')).toBeVisible({ timeout: 2000 });

  // Submit a score.
  await page.fill('#player-name', 'TestUser');
  await page.click('#submit-score');

  // Leaderboard modal appears with the entry.
  const lb = page.locator('#leaderboard');
  await expect(lb).toBeVisible({ timeout: 4000 });
  await expect(lb.locator('#lb-alltime')).toContainText('TestUser');
});

test('teacher pause freezes the game', async ({ page, context }) => {
  // Open the game in one tab.
  await page.goto('/');

  // Open teacher panel in another tab with a known key.
  // For E2E we need a config; the webServer started fresh — so we plant one.
  // Easier: hit the teacher endpoint directly with the dev key.
  // Tests assume config/config.php has teacher_key='e2e-key' (set in step 5).
  const res = await page.request.post('/api/teacher.php?key=e2e-key', {
    data: { action: 'pause' },
  });
  expect(res.ok()).toBeTruthy();

  // Within ~2s the overlay should be visible.
  await expect(page.locator('#overlay')).toBeVisible({ timeout: 4000 });
  await expect(page.locator('#overlay')).toContainText('PAUSED BY TEACHER');

  // Resume.
  await page.request.post('/api/teacher.php?key=e2e-key', {
    data: { action: 'resume' },
  });
  await expect(page.locator('#overlay')).toBeHidden({ timeout: 4000 });
});
```

- [ ] **Step 5: Plant a deterministic teacher key for E2E**

Add a one-off `config/config.php` for tests. Since this file is gitignored, the test setup needs to create it. Update `playwright.config.js`'s `webServer.command`:

```js
command: 'echo "<?php return [\\\"teacher_key\\\" => \\\"e2e-key\\\"];" > config/config.php && php scripts/init_db.php && php -S localhost:8001 -t public',
```

(One-liner because Playwright's `webServer.command` is a single shell invocation.)

- [ ] **Step 6: Run the tests**

Run: `npx playwright test`
Expected: 2 tests passing in chromium. (First run downloads browsers; subsequent runs are fast.)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json playwright.config.js tests/e2e/happy-path.spec.js
git commit -m "test(e2e): Playwright happy-path covering game-over flow and teacher pause"
```

(Note: `node_modules/` is already in `.gitignore`.)

---

## Task 21: Deployer recipe + README server-setup section

**Files:**
- Create: `deploy.php`
- Modify: `README.md`

- [ ] **Step 1: Write `deploy.php`**

```php
<?php
namespace Deployer;

require 'recipe/common.php';

set('application',  'slay');
set('repository',   'git@github.com:lockersoft/slay.git');
set('keep_releases', 5);
set('git_tty',       false);
set('default_stage', 'production');

set('shared_files', ['config/config.php']);
set('shared_dirs',  ['data']);
set('writable_dirs', ['data']);

host('production')
    ->setHostname('slay.lockersoft.games')
    ->set('remote_user', 'deploy')
    ->set('deploy_path', '/var/www/slay')
    ->set('labels', ['stage' => 'production']);

task('deploy:write_version', function () {
    $sha = trim(runLocally('git rev-parse --short HEAD'));
    run("echo {$sha} > {{release_path}}/VERSION");
});

task('deploy:init_db', function () {
    run('cd {{release_path}} && php scripts/init_db.php');
});

task('deploy', [
    'deploy:info',
    'deploy:setup',
    'deploy:lock',
    'deploy:release',
    'deploy:update_code',
    'deploy:shared',
    'deploy:writable',
    'deploy:vendors',
    'deploy:write_version',
    'deploy:init_db',
    'deploy:symlink',
    'deploy:unlock',
    'deploy:cleanup',
]);

after('deploy:failed', 'deploy:unlock');
```

- [ ] **Step 2: Replace `README.md` with the full version**

```markdown
# SLAY

Browser-based top-down arena game (Vampire Survivors-style auto-attack) built
for in-class AI vibe coding with 10–14 year olds. Each student suggests a
feature; the teacher implements via AI and deploys to production immediately.

- **Live:** https://slay.lockersoft.games
- **Spec:** [docs/superpowers/specs/2026-05-06-slay-game-design.md](docs/superpowers/specs/2026-05-06-slay-game-design.md)
- **Plan:** [docs/superpowers/plans/2026-05-06-slay-v1.md](docs/superpowers/plans/2026-05-06-slay-v1.md)

## Local development

```bash
composer install
echo '<?php return ["teacher_key" => "dev-key"];' > config/config.php
php scripts/init_db.php
php -S localhost:8000 -t public
```

Open http://localhost:8000 to play. http://localhost:8000/teacher.html?key=dev-key for the teacher panel.

## Tests

```bash
vendor/bin/phpunit              # PHP API tests
npx playwright test             # E2E happy path
```

## Daily classroom workflow

1. Student suggests a feature.
2. Prompt AI: e.g. "add a fire-burst behavior to the dragon enemy."
3. AI edits `public/game.js`.
4. Local smoke test: `php -S localhost:8000 -t public`, play 30s.
5. `git commit -am "feat: dragons explode (idea by Maya)"`
6. `dep deploy`
7. Teacher panel → "Force everyone to reload"
8. Class plays the new feature.

Total time, idea-to-live: ~60 seconds.

Update `CHANGELOG.md` with the student's first name credited.

## Server setup (one-time)

Target: Ubuntu/Debian VPS on `slay.lockersoft.games`.

1. **Install dependencies:**
   ```bash
   sudo apt update
   sudo apt install -y nginx php8.2-fpm php8.2-sqlite3 php8.2-cli php8.2-mbstring \
                       composer git certbot python3-certbot-nginx
   ```

2. **Create deploy user and directory:**
   ```bash
   sudo adduser --disabled-password deploy
   sudo mkdir -p /var/www/slay
   sudo chown deploy:deploy /var/www/slay
   sudo -u deploy ssh-keygen -t ed25519
   # Add the resulting public key as a deploy key on the GitHub repo.
   ```

3. **nginx vhost** (`/etc/nginx/sites-available/slay.lockersoft.games`):
   ```nginx
   server {
       listen 80;
       server_name slay.lockersoft.games;
       root /var/www/slay/current/public;
       index index.html;

       location / {
           try_files $uri $uri/ =404;
       }
       location ~ \.php$ {
           include snippets/fastcgi-php.conf;
           fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
       }
       location ~ /\. {
           deny all;
       }
   }
   ```
   ```bash
   sudo ln -s /etc/nginx/sites-available/slay.lockersoft.games /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d slay.lockersoft.games
   ```

4. **First deploy:**
   ```bash
   # On your laptop:
   dep deploy
   ```
   The first deploy creates `/var/www/slay/{releases,shared,current}`.

5. **Create the production config file** (one time, on the server):
   ```bash
   sudo -u deploy bash -lc '
     mkdir -p /var/www/slay/shared/config
     cat > /var/www/slay/shared/config/config.php <<PHP
   <?php
   return ["teacher_key" => "$(php -r "echo bin2hex(random_bytes(32));")"];
   PHP
     cat /var/www/slay/shared/config/config.php
   '
   ```
   Copy the generated key — you'll need it for the teacher panel URL.

6. **Re-deploy** so the symlink picks up the new shared file:
   ```bash
   dep deploy
   ```

7. **Verify:**
   ```bash
   curl https://slay.lockersoft.games/api/health.php
   # → {"ok":true,"db":"ok","version":"<sha>"}
   ```

## Daily deploy

```bash
git commit -am "feat: <thing>"
dep deploy
curl https://slay.lockersoft.games/api/health.php   # should still be ok
```

If something goes wrong: `dep rollback` (1-second symlink swap; SQLite scores are unaffected).

## Architecture

See the [design spec](docs/superpowers/specs/2026-05-06-slay-game-design.md). One-line summary: vanilla JS + Canvas frontend, four PHP endpoints, SQLite, 2-second polling for teacher pause/announce/reload.

## Extending — where to add things

Most student-suggested features are one of:

| Idea                       | Where to add                           |
|---------------------------|----------------------------------------|
| New weapon                | `WEAPONS` array + maybe a behavior     |
| New enemy                 | `ENEMIES` array                        |
| New powerup               | `POWERUPS` array                       |
| New behavior (orbit, etc.)| `behaviors` map                        |
| Tuning (faster, harder)   | constants at top of `game.js`          |
| New visuals               | swap an emoji string                   |

This intentional flatness is the whole point.
```

- [ ] **Step 3: Update CHANGELOG.md**

Replace contents:

```markdown
# Changelog

## [0.1.0] — 2026-05-06

### Added
- Initial v1 baseline.
- Top-down arena gameplay with auto-attacking 🛡️ hero, ⚔️ thrown sword weapon, 👻 ghost enemies.
- Wave-based difficulty ramp.
- Score submission and class leaderboard (top 20 all-time + top 10 today).
- Teacher control panel: pause/resume, message banner, force-reload, clear-leaderboard, live player count.
- 2-second poll-based realtime sync.
- Deployer recipe targeting slay.lockersoft.games.
```

- [ ] **Step 4: Commit**

```bash
git add deploy.php README.md CHANGELOG.md
git commit -m "chore(deploy): Deployer recipe and README server setup"
```

- [ ] **Step 5: Manual verification on the VPS** (one-time)

Follow the README "Server setup" section. After the first successful production `dep deploy` and the `curl /api/health.php` check, mark v1 complete.

---

## Spec coverage cross-check

| Spec section                      | Implemented in tasks |
|----------------------------------|----------------------|
| §2 Genre/gameplay (movement, auto-attack, waves) | 13, 14, 15 |
| §3 Visual style (emoji)          | 11, 13, 14, 15       |
| §4 System architecture            | 11–21                |
| §5 Frontend engine (registries, behaviors, fixed dt) | 12, 14, 15 |
| §6 API endpoints                  | 4, 5, 6, 7, 8, 9, 10 |
| §6 Database schema                | 2                    |
| §7 Teacher control panel          | 19                   |
| §8 Project layout                 | 1, throughout        |
| §9 Deployment (Deployer)          | 21                   |
| §10 Testing & verification         | 4–10 (PHPUnit), 20 (Playwright) |
| §11 Open questions                | acknowledged in spec; profanity wordlist seeded in Task 5 |

## Out-of-scope (per spec §12)

Not implemented in v1: additional weapons/enemies/powerups beyond starters, XP+level-up screens, sound, multiple heroes, biomes, dash, bosses, mobile touch, accounts, multiplayer, replays. These are all designated for student additions.
