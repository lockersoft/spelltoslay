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

$teacher = $payload['teacher']['name'] ?? '';
$class   = $payload['class']['name'] ?? '';

sts_json(200, [
    'ok'        => true,
    'session'   => sts_teacher_ticket($exp, $payload['jti']),
    'expiresAt' => $exp,
    'teacher'   => is_string($teacher) ? mb_substr($teacher, 0, 80) : '',
    'class'     => is_string($class) ? mb_substr($class, 0, 80) : '',
]);
