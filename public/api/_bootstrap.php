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

/**
 * Shared profanity wordlist. Returns true if the name contains a banned word.
 */
function slay_is_profane(string $name): bool {
    static $bannedWords = ['shit','fuck','bitch','cunt','asshole','damn','dick'];
    $lc = strtolower($name);
    foreach ($bannedWords as $w) {
        if (str_contains($lc, $w)) return true;
    }
    return false;
}
