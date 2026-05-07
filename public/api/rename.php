<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    slay_json(405, ['error' => 'method not allowed']);
    return;
}

$body = slay_input_json();
$cid  = (string)($body['cid']  ?? '');
$name = trim((string)($body['name'] ?? ''));

// Validate cid.
if ($cid === '' || !preg_match('/^[A-Za-z0-9\-]{1,64}$/', $cid)) {
    slay_json(400, ['error' => 'invalid cid']);
    return;
}

// Validate name.
if ($name === '' || mb_strlen($name) > 16 || !preg_match('/^[A-Za-z0-9 ]{1,16}$/', $name)) {
    slay_json(400, ['error' => 'name must be 1–16 alphanumeric characters (with spaces)']);
    return;
}

if (slay_is_profane($name)) {
    slay_json(400, ['error' => 'name not allowed']);
    return;
}

$db = slay_db();
$stmt = $db->prepare('UPDATE presence SET name = :name WHERE client_id = :cid');
$stmt->execute([':name' => $name, ':cid' => $cid]);
$db->exec('UPDATE state SET version=version+1 WHERE id=1');

slay_json(200, ['ok' => true, 'name' => $name]);
