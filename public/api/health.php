<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

try {
    $row = sts_db()->query('SELECT 1 AS ok')->fetch();
    $dbOk = ($row['ok'] ?? null) == 1;
} catch (\Throwable $e) {
    $dbOk = false;
}

// Version display: "<semver-base>.<commit-count>" — e.g. "0.3.52".
//
// VERSION_BASE is committed to the repo and bumped on each minor release.
// VERSION is written by the deploy task with the current commit count
// (git rev-list --count HEAD), so it auto-bumps on every deploy.
$baseFile = __DIR__ . '/../../VERSION_BASE';
$base     = file_exists($baseFile) ? trim(file_get_contents($baseFile)) : '0.0';

$verFile  = __DIR__ . '/../../VERSION';
$count    = file_exists($verFile) ? trim(file_get_contents($verFile)) : 'dev';

$version  = "$base.$count";

sts_json(200, [
    'ok'      => $dbOk,
    'db'      => $dbOk ? 'ok' : 'error',
    'version' => $version,
]);
