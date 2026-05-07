<?php
declare(strict_types=1);

/**
 * Idempotent SQLite schema initializer.
 *
 * Reads STS_DB_PATH if defined (test bootstrap sets this), otherwise
 * falls back to the production location. Creates tables IF NOT EXISTS,
 * so it's safe to run on every deploy.
 */

$dbPath = defined('STS_DB_PATH')
    ? STS_DB_PATH
    : __DIR__ . '/../data/spelltoslay.db';

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

// v1.1 migration: add name + personal_message to presence (idempotent).
$cols = $pdo->query("PRAGMA table_info(presence)")->fetchAll(PDO::FETCH_ASSOC);
$existing = array_column($cols, 'name');
if (!in_array('name', $existing, true)) {
    $pdo->exec("ALTER TABLE presence ADD COLUMN name TEXT");
}
if (!in_array('personal_message', $existing, true)) {
    $pdo->exec("ALTER TABLE presence ADD COLUMN personal_message TEXT NOT NULL DEFAULT ''");
}
if (!in_array('personal_paused', $existing, true)) {
    $pdo->exec("ALTER TABLE presence ADD COLUMN personal_paused INTEGER NOT NULL DEFAULT 0");
}
// Feature 1 — Live stats per student.
if (!in_array('current_score', $existing, true)) {
    $pdo->exec("ALTER TABLE presence ADD COLUMN current_score INTEGER NOT NULL DEFAULT 0");
}
if (!in_array('current_wave', $existing, true)) {
    $pdo->exec("ALTER TABLE presence ADD COLUMN current_wave INTEGER NOT NULL DEFAULT 1");
}
if (!in_array('current_hp', $existing, true)) {
    $pdo->exec("ALTER TABLE presence ADD COLUMN current_hp INTEGER NOT NULL DEFAULT 0");
}
// Feature 2 — Activity indicator.
if (!in_array('is_playing', $existing, true)) {
    $pdo->exec("ALTER TABLE presence ADD COLUMN is_playing INTEGER NOT NULL DEFAULT 0");
}
if (!in_array('is_visible', $existing, true)) {
    $pdo->exec("ALTER TABLE presence ADD COLUMN is_visible INTEGER NOT NULL DEFAULT 1");
}

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
if (!in_array('push_word_set_at', $existingStateColsV2, true)) {
    $pdo->exec("ALTER TABLE state ADD COLUMN push_word_set_at INTEGER NOT NULL DEFAULT 0");
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

// Feature 12 — Live polls: columns on state singleton.
$stateCols = $pdo->query("PRAGMA table_info(state)")->fetchAll(PDO::FETCH_ASSOC);
$existing_state = array_column($stateCols, 'name');
if (!in_array('poll_id', $existing_state, true)) {
    $pdo->exec("ALTER TABLE state ADD COLUMN poll_id INTEGER NOT NULL DEFAULT 0");
}
if (!in_array('poll_question', $existing_state, true)) {
    $pdo->exec("ALTER TABLE state ADD COLUMN poll_question TEXT NOT NULL DEFAULT ''");
}
if (!in_array('poll_options', $existing_state, true)) {
    $pdo->exec("ALTER TABLE state ADD COLUMN poll_options TEXT NOT NULL DEFAULT '[]'");
}

$pdo->exec("CREATE TABLE IF NOT EXISTS poll_responses (
    poll_id      INTEGER NOT NULL,
    client_id    TEXT    NOT NULL,
    option_index INTEGER NOT NULL,
    answered_at  INTEGER NOT NULL,
    PRIMARY KEY (poll_id, client_id)
)");
$pdo->exec("CREATE INDEX IF NOT EXISTS idx_poll_responses_poll ON poll_responses(poll_id)");

if (PHP_SAPI === 'cli' && !defined('STS_DB_PATH')) {
    echo "Initialized SpellToSlay DB at $dbPath\n";
}
