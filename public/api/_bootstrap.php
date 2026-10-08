<?php
declare(strict_types=1);

// Settings precedence: PHP constant (PHPUnit bootstrap) > environment variable
// (Playwright's throwaway server) > on-disk default (production).
$envDb  = getenv('STS_DB_PATH');
$envKey = getenv('STS_TEACHER_KEY');

$dbPath = defined('STS_DB_PATH')
    ? STS_DB_PATH
    : ($envDb ?: __DIR__ . '/../../data/spelltoslay.db');

// File defaults first, then each setting is overridden on its own by a PHP
// constant (PHPUnit) or environment variable (Playwright's throwaway server).
$config = ['teacher_key' => null, 'hub_secret' => null, 'hub_teacher_ids' => []];
$configFile = __DIR__ . '/../../config/config.php';
$useFile = !defined('STS_TEACHER_KEY') && !$envKey;   // tests never read the developer's file
if ($useFile && file_exists($configFile)) {
    $config = array_merge($config, require $configFile);
}
if (defined('STS_TEACHER_KEY')) {
    $config['teacher_key'] = STS_TEACHER_KEY;
} elseif ($envKey) {
    $config['teacher_key'] = $envKey;
}
// Shared secret with the lockersoft.games hub (its LSG_HUB_SECRET_SPELLTOSLAY),
// and the hub teacher accounts allowed to control this game. Either one unset
// means hub launches are refused; the teacher key keeps working.
if (defined('STS_HUB_SECRET')) {
    $config['hub_secret'] = STS_HUB_SECRET;
} elseif (getenv('STS_HUB_SECRET')) {
    $config['hub_secret'] = getenv('STS_HUB_SECRET');
}
if (defined('STS_HUB_TEACHER_IDS')) {
    $config['hub_teacher_ids'] = STS_HUB_TEACHER_IDS;
} elseif (getenv('STS_HUB_TEACHER_IDS')) {
    $config['hub_teacher_ids'] = array_map('intval', explode(',', getenv('STS_HUB_TEACHER_IDS')));
}

$GLOBALS['__STS_DB_PATH']   = $dbPath;
$GLOBALS['__STS_CONFIG']    = $config;

const STS_MAX_BODY_BYTES = 524288;

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
    // Bounded read: nothing this API accepts is anywhere near this size, and
    // the endpoints that take a body include unauthenticated ones.
    $raw = file_get_contents('php://input', false, null, 0, STS_MAX_BODY_BYTES + 1) ?: '';
    if (strlen($raw) > STS_MAX_BODY_BYTES) {
        sts_json(413, ['error' => 'request too large']);
    }
    return $raw;
}

function sts_input_json(): array {
    $raw = sts_input_raw();
    if ($raw === '') return [];
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) return [];
    // Clients send {"z": base64url(JSON object)} because DreamHost's
    // mod_security reads request bodies and rejects free text that resembles
    // SQL (a spelling list with "union" and "select" on adjacent lines is
    // enough). A plain JSON body is still accepted, for curl and for clients
    // loaded before this was deployed.
    if (count($decoded) === 1 && isset($decoded['z']) && is_string($decoded['z'])) {
        $json  = base64_decode(strtr($decoded['z'], '-_', '+/'), true);
        $inner = ($json !== false && str_starts_with(ltrim($json), '{')) ? json_decode($json, true) : null;
        return is_array($inner) ? $inner : [];
    }
    return $decoded;
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

function sts_b64url_encode(string $bytes): string {
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

function sts_b64url_decode(string $text): string|false {
    return base64_decode(strtr($text, '-_', '+/'), true);
}

/**
 * The hub secret, or null when hub launches are not configured. A short value
 * counts as not configured: an empty or guessable HMAC key would let anyone
 * mint a launch token.
 */
function sts_hub_secret(): ?string {
    $secret = sts_config()['hub_secret'] ?? null;
    return (is_string($secret) && strlen($secret) >= 16) ? $secret : null;
}

/**
 * Turn raw candidates (lines of a pasted list, entries of a hub word list)
 * into words the game can use: lower-case a-z, 1-32 letters, at most 500.
 * Returns [words, how many candidates were left out]. Blank strings do not
 * count as left out when $ignoreBlank is set (blank lines in a pasted list).
 */
function sts_clean_words(array $candidates, bool $ignoreBlank = false): array {
    $words = [];
    $skipped = 0;
    foreach ($candidates as $candidate) {
        $w = is_string($candidate) ? strtolower(trim($candidate)) : null;
        if ($w === '' && $ignoreBlank) continue;
        if ($w === null || !preg_match('/^[a-z]{1,32}$/', $w) || count($words) >= 500) {
            $skipped++;
            continue;
        }
        $words[] = $w;
    }
    return [$words, $skipped];
}

/**
 * Replace the teacher word list and make it the active source. $extraSet is
 * appended to the UPDATE of the state row (same transaction), for callers
 * that need to record something alongside. Caller guarantees $words is the
 * non-empty output of sts_clean_words().
 */
function sts_replace_teacher_word_list(array $words, string $extraSet = '', array $extraParams = []): void {
    $db = sts_db();
    $db->beginTransaction();
    try {
        $db->exec('DELETE FROM teacher_word_list');
        $ins = $db->prepare('INSERT INTO teacher_word_list (word, position, set_at) VALUES (:w, :p, :t)');
        $ts = sts_now();
        foreach ($words as $i => $w) {
            $ins->execute([':w' => $w, ':p' => $i, ':t' => $ts]);
        }
        $upd = $db->prepare(
            "UPDATE state SET word_source='teacher', word_list_version=word_list_version+1, version=version+1"
            . ($extraSet !== '' ? ', ' . $extraSet : '') . ' WHERE id=1'
        );
        $upd->execute($extraParams);
        $db->commit();
    } catch (\Throwable $e) {
        $db->rollBack();
        throw $e;
    }
}

/**
 * May this hub teacher control the game? The hub lets anyone register as a
 * teacher, and this game is one shared classroom, so a valid launch token is
 * not enough on its own: the teacher's hub account id must be listed in
 * `hub_teacher_ids`. An empty list allows nobody.
 */
function sts_hub_teacher_allowed(mixed $teacherId): bool {
    $allowed = sts_config()['hub_teacher_ids'] ?? [];
    return is_int($teacherId) && is_array($allowed) && in_array($teacherId, $allowed, true);
}

/**
 * Verify a launch token issued by the lockersoft.games hub (an HS256 JWT, see
 * LaunchTokenIssuer in that repo). Returns the payload, or null if the token
 * is not one we should trust. Only HS256 is accepted, whatever the token's
 * own header claims.
 */
function sts_verify_hub_launch_token(string $jwt): ?array {
    $secret = sts_hub_secret();
    if ($secret === null || strlen($jwt) > 262144) return null;
    $parts = explode('.', $jwt);
    if (count($parts) !== 3) return null;
    [$head64, $body64, $sig64] = $parts;

    $headJson = sts_b64url_decode($head64);
    $header   = $headJson === false ? null : json_decode($headJson, true);
    if (!is_array($header) || ($header['alg'] ?? null) !== 'HS256') return null;

    $sig = sts_b64url_decode($sig64);
    if ($sig === false) return null;
    $expected = hash_hmac('sha256', $head64 . '.' . $body64, $secret, true);
    if (!hash_equals($expected, $sig)) return null;

    $bodyJson = sts_b64url_decode($body64);
    $payload  = $bodyJson === false ? null : json_decode($bodyJson, true);
    if (!is_array($payload)) return null;
    if (($payload['iss'] ?? null) !== 'hub') return null;
    if (($payload['game'] ?? null) !== 'spelltoslay') return null;
    if (!is_int($payload['exp'] ?? null) || $payload['exp'] <= sts_now()) return null;
    if (!is_string($payload['jti'] ?? null) || !preg_match('/^[A-Za-z0-9\-]{1,64}$/', $payload['jti'])) return null;
    return $payload;
}

/**
 * A short signed ticket the teacher panel sends on every request after a hub
 * launch. The launch token itself can be many kilobytes (it carries the class
 * roster and word list), too big to repeat in a header every two seconds.
 * Format: v1.<expiry unix>.<launch jti>.<signature>. Nothing is stored
 * server-side; the signature and expiry are the whole check.
 */
function sts_teacher_ticket(int $exp, string $jti): string {
    $secret = sts_hub_secret();
    if ($secret === null) {
        throw new \LogicException('hub secret not configured');
    }
    $body = "v1.$exp.$jti";
    return $body . '.' . sts_b64url_encode(hash_hmac('sha256', 'sts-teacher-session.' . $body, $secret, true));
}

function sts_verify_teacher_ticket(string $ticket): bool {
    $secret = sts_hub_secret();
    if ($secret === null || strlen($ticket) > 512) return false;
    $parts = explode('.', $ticket);
    if (count($parts) !== 4) return false;
    [$version, $exp, $jti, $sig64] = $parts;
    if ($version !== 'v1' || !ctype_digit($exp) || !preg_match('/^[A-Za-z0-9\-]{1,64}$/', $jti)) return false;
    $sig = sts_b64url_decode($sig64);
    if ($sig === false) return false;
    $expected = hash_hmac('sha256', "sts-teacher-session.v1.$exp.$jti", $secret, true);
    return hash_equals($expected, $sig) && (int)$exp > sts_now();
}

/**
 * Gate for teacher-only endpoints. Emits the 403 itself; callers just return.
 *
 * Two ways in:
 *  - X-Teacher-Session: a ticket from /api/session-init.php (hub launch).
 *  - X-Teacher-Key: the static teacher key; ?key= is still honoured for curl
 *    and old bookmarks. Headers keep both out of URLs and access logs.
 * Whichever credential is presented first in that order is the only one
 * checked: a bad ticket is not rescued by a good key.
 */
function sts_require_teacher(): bool {
    $session = $_SERVER['HTTP_X_TEACHER_SESSION'] ?? null;
    if ($session !== null) {
        $ok = is_string($session) && sts_verify_teacher_ticket($session);
    } else {
        $expected = sts_config()['teacher_key'] ?? null;
        $provided = $_SERVER['HTTP_X_TEACHER_KEY'] ?? ($_GET['key'] ?? '');
        $ok = $expected && is_string($provided) && hash_equals((string)$expected, $provided);
    }
    if (!$ok) {
        sts_json(403, ['error' => 'forbidden']);
        return false;
    }
    return true;
}

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
