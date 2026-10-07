<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    sts_json(405, ['error' => 'method not allowed']);
    return;
}

$body = sts_input_json();
$cid  = (string)($body['cid']  ?? '');
$name = trim((string)($body['name'] ?? ''));

// Validate cid.
if ($cid === '' || !preg_match('/^[A-Za-z0-9\-]{1,64}$/', $cid)) {
    sts_json(400, ['error' => 'invalid cid']);
    return;
}

// Validate name.
if (($nameError = sts_name_error($name)) !== null) {
    sts_json(400, ['error' => $nameError]);
    return;
}

$db = sts_db();
$stmt = $db->prepare('UPDATE presence SET name = :name WHERE client_id = :cid');
$stmt->execute([':name' => $name, ':cid' => $cid]);
$db->exec('UPDATE state SET version=version+1 WHERE id=1');

sts_json(200, ['ok' => true, 'name' => $name]);
