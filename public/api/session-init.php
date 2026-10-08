<?php
declare(strict_types=1);

// Hub launch: the teacher panel posts the launch token it was opened with
// (teacher.html#session=<JWT> from lockersoft.games) and gets back a short
// session ticket to use in place of the teacher key.

require_once __DIR__ . '/_bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    sts_json(405, ['error' => 'method not allowed']);
    return;
}

$token   = sts_input_json()['token'] ?? null;
$payload = is_string($token) ? sts_verify_hub_launch_token($token) : null;
if ($payload === null) {
    sts_json(403, ['error' => 'launch link not accepted']);
    return;
}

// A genuine token is not enough: the hub account behind it has to be one this
// game has been told to trust. The id is echoed back so the teacher can ask
// for it to be added; the token's holder already knows it.
$teacherId = $payload['teacher']['id'] ?? null;
if (!sts_hub_teacher_allowed($teacherId)) {
    sts_json(403, [
        'error'     => 'hub account not allowed',
        'teacherId' => is_int($teacherId) ? $teacherId : null,
    ]);
    return;
}

// The ticket ends when the launch token does, and never runs longer than 12h.
$exp = min((int)$payload['exp'], sts_now() + 12 * 3600);

// A launch can carry the class's active word list from the hub. Apply it
// once per launch: reopening the same link later (closed tab, second device)
// must not undo a list the teacher has chosen in the panel since.
// Login never depends on this step.
$wordlist = ['status' => 'none'];
$hubList  = $payload['wordlist'] ?? null;
if (is_array($hubList) && is_array($hubList['words'] ?? null)) {
    $listName = is_string($hubList['name'] ?? null) ? mb_substr($hubList['name'], 0, 80) : '';
    [$words, $skipped] = sts_clean_words($hubList['words']);
    try {
        $seen = sts_db()->query('SELECT hub_launch_jti FROM state WHERE id=1')->fetch()['hub_launch_jti'] ?? '';
        if ($seen === $payload['jti']) {
            $wordlist = ['status' => 'already', 'name' => $listName];
        } elseif (count($words) === 0) {
            $wordlist = ['status' => 'empty', 'name' => $listName, 'skipped' => $skipped];
        } else {
            sts_replace_teacher_word_list($words, 'hub_launch_jti = :jti', [':jti' => $payload['jti']]);
            $wordlist = ['status' => 'applied', 'name' => $listName, 'applied' => count($words), 'skipped' => $skipped];
        }
    } catch (\Throwable $e) {
        // e.g. the hub_launch_jti column is missing because init_db.php has not
        // run since this was deployed. The teacher still gets in.
        error_log('session-init: word list not applied: ' . $e->getMessage());
        $wordlist = ['status' => 'error', 'name' => $listName];
    }
}

$teacher = $payload['teacher']['name'] ?? '';
$class   = $payload['class']['name'] ?? '';

sts_json(200, [
    'ok'        => true,
    'session'   => sts_teacher_ticket($exp, $payload['jti']),
    'expiresAt' => $exp,
    'teacher'   => is_string($teacher) ? mb_substr($teacher, 0, 80) : '',
    'class'     => is_string($class) ? mb_substr($class, 0, 80) : '',
    'wordlist'  => $wordlist,
]);
