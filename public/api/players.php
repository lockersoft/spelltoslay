<?php
declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    sts_json(405, ['error' => 'method not allowed']);
    return;
}

$config = sts_config();
$expected = $config['teacher_key'] ?? null;
$provided = $_GET['key'] ?? '';
if (!$expected || !is_string($provided) || !hash_equals($expected, $provided)) {
    sts_json(403, ['error' => 'forbidden']);
    return;
}

$db  = sts_db();
$now = sts_now();

// Get current poll_id so we can look up each player's vote.
$stateRow = $db->query('SELECT poll_id FROM state WHERE id=1')->fetch();
$currentPollId = (int)($stateRow['poll_id'] ?? 0);

$rows = $db->query(
    'SELECT client_id, name, personal_message, personal_paused, last_seen,
            current_score, current_wave, current_hp, is_playing, is_visible
       FROM presence
      WHERE last_seen >= ' . ($now - 10) . '
   ORDER BY (name IS NULL) ASC, name ASC, client_id ASC'
)->fetchAll();

// Fetch all votes for the current poll in one query.
$voteMap = [];
if ($currentPollId > 0) {
    $votes = $db->prepare('SELECT client_id, option_index FROM poll_responses WHERE poll_id = :pid');
    $votes->execute([':pid' => $currentPollId]);
    foreach ($votes->fetchAll() as $v) {
        $voteMap[$v['client_id']] = (int)$v['option_index'];
    }
}

sts_json(200, ['players' => array_map(fn($r) => [
    'cid'             => $r['client_id'],
    'name'            => (string)($r['name'] ?? ''),
    'personalMessage' => (string)($r['personal_message'] ?? ''),
    'personalPaused'  => (int)($r['personal_paused'] ?? 0) === 1,
    'lastSeen'        => (int)$r['last_seen'],
    'score'           => (int)($r['current_score'] ?? 0),
    'wave'            => (int)($r['current_wave']  ?? 1),
    'hp'              => (int)($r['current_hp']    ?? 0),
    'isPlaying'       => (int)($r['is_playing']    ?? 0) === 1,
    'isVisible'       => (int)($r['is_visible']    ?? 1) === 1,
    'pollAnswer'      => isset($voteMap[$r['client_id']]) ? $voteMap[$r['client_id']] : null,
], $rows)]);
