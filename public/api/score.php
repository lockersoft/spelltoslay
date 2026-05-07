<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    sts_json(405, ['error' => 'method not allowed']);
    return;
}

$body = sts_input_json();
$name     = trim((string)($body['name']     ?? ''));
$score    = $body['score']    ?? null;
$wave     = $body['wave']     ?? null;
$duration = $body['duration'] ?? null;

// Validation.
if ($name === '' || mb_strlen($name) > 16) {
    sts_json(400, ['error' => 'name must be 1–16 characters']);
    return;
}
if (!preg_match('/^[A-Za-z0-9 ]+$/', $name)) {
    sts_json(400, ['error' => 'name must be alphanumeric (with spaces)']);
    return;
}
foreach (['score' => $score, 'wave' => $wave, 'duration' => $duration] as $f => $v) {
    if (!is_int($v) || $v < 0) {
        sts_json(400, ['error' => "$f must be a non-negative integer"]);
        return;
    }
}
// Plausibility ceilings (anti-spam, anti-cheat-lite).
if ($score > 1_000_000)   { sts_json(400, ['error' => 'score implausible']); return; }
if ($wave > 1000)         { sts_json(400, ['error' => 'wave implausible']); return; }
if ($duration > 7200)     { sts_json(400, ['error' => 'duration implausible']); return; }

// Profanity check (shared wordlist in _bootstrap.php).
if (sts_is_profane($name)) {
    sts_json(400, ['error' => 'name not allowed']); return;
}

$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

// Rate limit: 1 submission per (IP, name) per 10s.
// Keyed on (IP, name) rather than IP alone because in a classroom every
// student usually shares one outbound NAT IP — pure per-IP would block all
// other kids the moment one submits a score.
//
$db = sts_db();
$recent = $db->prepare(
    'SELECT COUNT(*) AS c FROM scores WHERE ip = :ip AND name = :name AND submitted_at > :since'
);
$recent->execute([':ip' => $ip, ':name' => $name, ':since' => sts_now() - 10]);
$count = (int)$recent->fetch()['c'];
if ($count > 0) {
    sts_json(429, ['error' => 'rate limit — wait a few seconds']);
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
    ':ts'       => sts_now(),
]);

$rank   = (int)$db->query("SELECT COUNT(*) AS c FROM scores WHERE score > $score")->fetch()['c'] + 1;
$topRow = $db->query('SELECT MAX(score) AS top FROM scores')->fetch();
$top    = (int)($topRow['top'] ?? 0);

sts_json(200, ['rank' => $rank, 'topScore' => $top]);
