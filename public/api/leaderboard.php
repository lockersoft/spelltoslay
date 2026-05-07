<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    sts_json(405, ['error' => 'method not allowed']);
    return;
}

$db = sts_db();

$mapRow = function(array $r): array {
    return [
        'name'        => $r['name'],
        'score'       => (int)$r['score'],
        'wave'        => (int)$r['wave'],
        'submittedAt' => gmdate('Y-m-d\TH:i:s\Z', (int)$r['submitted_at']),
    ];
};

$allTime = $db->query(
    'SELECT name, score, wave, submitted_at
       FROM scores
   ORDER BY score DESC, submitted_at ASC
      LIMIT 20'
)->fetchAll();

$cutoff = sts_now() - 86400;
$today = $db->prepare(
    'SELECT name, score, wave, submitted_at
       FROM scores
      WHERE submitted_at >= :cutoff
   ORDER BY score DESC, submitted_at ASC
      LIMIT 10'
);
$today->execute([':cutoff' => $cutoff]);

sts_json(200, [
    'allTime' => array_map($mapRow, $allTime),
    'today'   => array_map($mapRow, $today->fetchAll()),
]);
