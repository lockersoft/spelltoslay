<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    sts_json(405, ['error' => 'method not allowed']);
    return;
}

$body        = sts_input_json();
$cid         = (string)($body['cid']         ?? '');
$pollId      = $body['pollId']      ?? null;
$optionIndex = $body['optionIndex'] ?? null;

// Validate cid.
if ($cid === '' || !preg_match('/^[A-Za-z0-9\-]{1,64}$/', $cid)) {
    sts_json(400, ['error' => 'invalid cid']);
    return;
}

// Validate pollId is an integer.
if (!is_int($pollId)) {
    sts_json(400, ['error' => 'pollId must be an integer']);
    return;
}

// Validate optionIndex is an integer.
if (!is_int($optionIndex) || $optionIndex < 0) {
    sts_json(400, ['error' => 'optionIndex must be a non-negative integer']);
    return;
}

$db = sts_db();
$stateRow = $db->query('SELECT poll_id, poll_options, poll_question FROM state WHERE id=1')->fetch();
$currentPollId = (int)$stateRow['poll_id'];
$pollQuestion  = (string)$stateRow['poll_question'];

// Must match current active poll.
if ($pollId !== $currentPollId || $pollQuestion === '') {
    sts_json(400, ['error' => 'poll not active or wrong poll id']);
    return;
}

$options = json_decode((string)$stateRow['poll_options'], true);
if (!is_array($options) || $optionIndex >= count($options)) {
    sts_json(400, ['error' => 'invalid option index']);
    return;
}

$stmt = $db->prepare(
    'INSERT OR REPLACE INTO poll_responses (poll_id, client_id, option_index, answered_at)
     VALUES (:pid, :cid, :opt, :ts)'
);
$stmt->execute([
    ':pid' => $currentPollId,
    ':cid' => $cid,
    ':opt' => $optionIndex,
    ':ts'  => sts_now(),
]);

sts_json(200, ['ok' => true]);
