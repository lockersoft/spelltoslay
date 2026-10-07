<?php
declare(strict_types=1);

// Settings precedence: PHP constant (PHPUnit bootstrap) > environment variable
// (Playwright's throwaway server) > on-disk default (production).
$envDb  = getenv('STS_DB_PATH');
$envKey = getenv('STS_TEACHER_KEY');

$dbPath = defined('STS_DB_PATH')
    ? STS_DB_PATH
    : ($envDb ?: __DIR__ . '/../../data/spelltoslay.db');

$config = ['teacher_key' => null];
$configFile = __DIR__ . '/../../config/config.php';
if (defined('STS_TEACHER_KEY')) {
    $config['teacher_key'] = STS_TEACHER_KEY;
} elseif ($envKey) {
    $config['teacher_key'] = $envKey;
} elseif (file_exists($configFile)) {
    $config = array_merge($config, require $configFile);
}

$GLOBALS['__STS_DB_PATH']   = $dbPath;
$GLOBALS['__STS_CONFIG']    = $config;

function sts_db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO('sqlite:' . $GLOBALS['__STS_DB_PATH']);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec('PRAGMA journal_mode=WAL');
        $pdo->exec('PRAGMA foreign_keys=ON');
    }
    return $pdo;
}

function sts_config(): array {
    return $GLOBALS['__STS_CONFIG'];
}

/**
 * Read the request body. Honors the PHPUnit-provided override.
 */
function sts_input_raw(): string {
    if (isset($GLOBALS['__STS_TEST_INPUT'])) {
        return $GLOBALS['__STS_TEST_INPUT'];
    }
    return file_get_contents('php://input') ?: '';
}

function sts_input_json(): array {
    $raw = sts_input_raw();
    if ($raw === '') return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

/**
 * Emit a header. In test mode, captured to $GLOBALS['__STS_HEADERS'] instead
 * of being sent — PHP's CLI SAPI silently drops header() but we want assertions.
 */
function sts_header(string $line): void {
    if (PHP_SAPI === 'cli') {
        $GLOBALS['__STS_HEADERS'][] = $line;
        return;
    }
    header($line);
}

/**
 * Write a JSON response with a status code and exit (in non-test mode).
 */
function sts_json(int $status, array|string $body): void {
    http_response_code($status);
    sts_header('Content-Type: application/json; charset=utf-8');
    echo is_string($body) ? $body : json_encode($body);
    if (PHP_SAPI !== 'cli') {
        exit;
    }
}

function sts_now(): int { return time(); }

/**
 * Shared name profanity check.
 *
 * Two lists, because substring matching alone blocks innocent names
 * ("Dickens", "Cassie"): strong words are matched anywhere, including across
 * spaces ("f u c k"); the rest only as a whole space-separated word. Common
 * digit-for-letter swaps are normalised first ("sh1t", "a55").
 */
function sts_is_profane(string $name): bool {
    static $anywhere = ['fuck','shit','bitch','cunt','asshole','nigger','nigga','faggot',
                        'whore','slut','pussy','penis','vagina'];
    static $wholeWord = ['ass','arse','damn','dick','cock','piss','crap','fag','tit','tits',
                         'sex','porn','hoe','wtf','stfu','poop','butt'];

    $norm = strtr(strtolower($name), ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', '7' => 't']);
    $joined = preg_replace('/[^a-z]/', '', $norm);
    foreach ($anywhere as $w) {
        if (str_contains($joined, $w)) return true;
    }
    foreach (preg_split('/[^a-z]+/', $norm, -1, PREG_SPLIT_NO_EMPTY) as $token) {
        if (in_array($token, $wholeWord, true)) return true;
    }
    return false;
}

/**
 * One rule for every place a player name enters the system.
 * Returns null when acceptable, otherwise the message to show the user.
 */
function sts_name_error(string $name): ?string {
    if (!preg_match('/^[A-Za-z0-9 ]{1,16}$/', $name)) {
        return 'name must be 1–16 letters, numbers, or spaces';
    }
    if (sts_is_profane($name)) {
        return 'name not allowed';
    }
    return null;
}
