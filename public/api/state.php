<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$db  = slay_db();
$now = slay_now();

$row = $db->query(
    'SELECT paused, message, force_reload, force_reload_set_at, version,
            poll_id, poll_question, poll_options FROM state WHERE id=1'
)->fetch();

$forceReload = ((int)$row['force_reload'] === 1)
    && ($now - (int)$row['force_reload_set_at'] <= 10);

// ── Input validation ────────────────────────────────────────────────────────
$cid       = (string)($_GET['cid'] ?? '');
$nameParam = (string)($_GET['name'] ?? '');
$validName = preg_match('/^[A-Za-z0-9 ]{1,16}$/', $nameParam) ? $nameParam : '';

// Optional live-stat params (Feature 1 & 2).
if (!function_exists('parse_nonneg_int')) {
    function parse_nonneg_int(mixed $raw, int $cap, int $default): int {
        if ($raw === null || $raw === '') return $default;
        if (!is_numeric($raw) || (int)$raw < 0) return $default;
        return min((int)$raw, $cap);
    }
}

$scoreParam   = parse_nonneg_int($_GET['score']   ?? null, 1_000_000, -1);
$waveParam    = parse_nonneg_int($_GET['wave']    ?? null, 1000,      -1);
$hpParam      = parse_nonneg_int($_GET['hp']      ?? null, 1000,      -1);
$playingParam = isset($_GET['playing']) ? (int)(((int)$_GET['playing']) !== 0) : -1;
$visibleParam = isset($_GET['visible']) ? (int)(((int)$_GET['visible']) !== 0) : -1;

// ── Presence upsert ─────────────────────────────────────────────────────────
if ($cid !== '' && preg_match('/^[A-Za-z0-9\-]{1,64}$/', $cid)) {
    // Read current row so we can fall back to existing values for absent params.
    $cur = $db->prepare('SELECT name, current_score, current_wave, current_hp, is_playing, is_visible FROM presence WHERE client_id = :cid');
    $cur->execute([':cid' => $cid]);
    $curRow = $cur->fetch();

    $upsertScore   = ($scoreParam   === -1) ? (int)($curRow['current_score'] ?? 0) : $scoreParam;
    $upsertWave    = ($waveParam    === -1) ? (int)($curRow['current_wave']  ?? 1) : $waveParam;
    $upsertHp      = ($hpParam      === -1) ? (int)($curRow['current_hp']    ?? 0) : $hpParam;
    $upsertPlaying = ($playingParam === -1) ? (int)($curRow['is_playing']    ?? 0) : $playingParam;
    $upsertVisible = ($visibleParam === -1) ? (int)($curRow['is_visible']    ?? 1) : $visibleParam;

    // Feature 8: name is only set on first insert or when row has no name yet.
    // On conflict, only update name if the stored value is NULL or ''.
    $up = $db->prepare(
        'INSERT INTO presence (client_id, last_seen, name, current_score, current_wave, current_hp, is_playing, is_visible)
         VALUES (:cid, :ts, NULLIF(:name, \'\'), :score, :wave, :hp, :playing, :visible)
         ON CONFLICT(client_id) DO UPDATE SET
           last_seen     = :ts,
           name          = CASE WHEN presence.name IS NULL OR presence.name = \'\' THEN NULLIF(:name, \'\') ELSE presence.name END,
           current_score = :score,
           current_wave  = :wave,
           current_hp    = :hp,
           is_playing    = :playing,
           is_visible    = :visible'
    );
    $up->execute([
        ':cid'     => $cid,
        ':ts'      => $now,
        ':name'    => $validName,
        ':score'   => $upsertScore,
        ':wave'    => $upsertWave,
        ':hp'      => $upsertHp,
        ':playing' => $upsertPlaying,
        ':visible' => $upsertVisible,
    ]);
}

// Opportunistic GC: prune presence rows older than 60s.
$db->exec('DELETE FROM presence WHERE last_seen < ' . ($now - 60));

$cntRow = $db->query(
    'SELECT COUNT(*) AS c FROM presence WHERE last_seen >= ' . ($now - 10)
)->fetch();
$playerCount = (int)$cntRow['c'];

// Personal message, personal_paused, and authoritative name for this client.
$personalMessage = '';
$personalPaused  = false;
$authName        = '';
if ($cid !== '' && preg_match('/^[A-Za-z0-9\-]{1,64}$/', $cid)) {
    $pmRow = $db->prepare('SELECT personal_message, personal_paused, name FROM presence WHERE client_id = :cid');
    $pmRow->execute([':cid' => $cid]);
    $pmFetched = $pmRow->fetch();
    if ($pmFetched !== false) {
        $personalMessage = (string)($pmFetched['personal_message'] ?? '');
        $personalPaused  = (int)($pmFetched['personal_paused'] ?? 0) === 1;
        $authName        = (string)($pmFetched['name'] ?? '');
    }
}

// ── Poll state ──────────────────────────────────────────────────────────────
$pollId       = (int)$row['poll_id'];
$pollQuestion = (string)$row['poll_question'];
$pollOptionsRaw = (string)$row['poll_options'];
$pollOptions  = json_decode($pollOptionsRaw, true);
if (!is_array($pollOptions)) $pollOptions = [];

$pollMyAnswer = null;
if ($pollQuestion !== '' && $cid !== '' && preg_match('/^[A-Za-z0-9\-]{1,64}$/', $cid)) {
    $voteRow = $db->prepare('SELECT option_index FROM poll_responses WHERE poll_id = :pid AND client_id = :cid');
    $voteRow->execute([':pid' => $pollId, ':cid' => $cid]);
    $voteFetched = $voteRow->fetch();
    if ($voteFetched !== false) {
        $pollMyAnswer = (int)$voteFetched['option_index'];
    }
}

// ── Build payload ───────────────────────────────────────────────────────────
$payload = [
    'paused'          => (int)$row['paused'] === 1,
    'message'         => (string)$row['message'],
    'version'         => (int)$row['version'],
    'forceReload'     => $forceReload,
    'playerCount'     => $playerCount,
    'personalMessage' => $personalMessage,
    'personalPaused'  => $personalPaused,
    'name'            => $authName,
    'pollId'          => $pollId,
    'pollQuestion'    => $pollQuestion !== '' ? $pollQuestion : null,
    'pollOptions'     => $pollQuestion !== '' ? $pollOptions : null,
    'pollMyAnswer'    => $pollMyAnswer,
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
