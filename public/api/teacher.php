<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
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

$body   = sts_input_json();
$action = $body['action'] ?? '';

$db = sts_db();

switch ($action) {
    case 'pause':
        $db->exec('UPDATE state SET paused=1, version=version+1 WHERE id=1');
        break;

    case 'resume':
        $db->exec('UPDATE state SET paused=0, version=version+1 WHERE id=1');
        break;

    case 'message':
        $text = (string)($body['text'] ?? '');
        if (mb_strlen($text) > 200) $text = mb_substr($text, 0, 200);
        $stmt = $db->prepare('UPDATE state SET message=:m, version=version+1 WHERE id=1');
        $stmt->execute([':m' => $text]);
        break;

    case 'broadcastReload':
        $stmt = $db->prepare(
            'UPDATE state SET force_reload=1, force_reload_set_at=:t, version=version+1 WHERE id=1'
        );
        $stmt->execute([':t' => sts_now()]);
        break;

    case 'clearLeaderboard':
        if (empty($body['confirm'])) {
            sts_json(400, ['error' => 'confirm required']);
            return;
        }
        $db->exec('DELETE FROM scores');
        // Note: don't bump version — clients don't need to react.
        break;

    case 'messageStudent':
        $studentCid = (string)($body['cid'] ?? '');
        if ($studentCid === '' || !preg_match('/^[A-Za-z0-9\-]{1,64}$/', $studentCid)) {
            sts_json(400, ['error' => 'cid required']);
            return;
        }
        $text = (string)($body['text'] ?? '');
        if (mb_strlen($text) > 200) $text = mb_substr($text, 0, 200);
        $stmt = $db->prepare('UPDATE presence SET personal_message=:msg WHERE client_id=:cid');
        $stmt->execute([':msg' => $text, ':cid' => $studentCid]);
        $db->exec('UPDATE state SET version=version+1 WHERE id=1');
        break;

    case 'pauseStudent':
        $studentCid = (string)($body['cid'] ?? '');
        if ($studentCid === '' || !preg_match('/^[A-Za-z0-9\-]{1,64}$/', $studentCid)) {
            sts_json(400, ['error' => 'cid required']);
            return;
        }
        $stmt = $db->prepare('UPDATE presence SET personal_paused=1 WHERE client_id=:cid');
        $stmt->execute([':cid' => $studentCid]);
        $db->exec('UPDATE state SET version=version+1 WHERE id=1');
        break;

    case 'resumeStudent':
        $studentCid = (string)($body['cid'] ?? '');
        if ($studentCid === '' || !preg_match('/^[A-Za-z0-9\-]{1,64}$/', $studentCid)) {
            sts_json(400, ['error' => 'cid required']);
            return;
        }
        $stmt = $db->prepare('UPDATE presence SET personal_paused=0 WHERE client_id=:cid');
        $stmt->execute([':cid' => $studentCid]);
        $db->exec('UPDATE state SET version=version+1 WHERE id=1');
        break;

    case 'renameStudent':
        $studentCid = (string)($body['cid'] ?? '');
        if ($studentCid === '' || !preg_match('/^[A-Za-z0-9\-]{1,64}$/', $studentCid)) {
            sts_json(400, ['error' => 'cid required']);
            return;
        }
        $newName = trim((string)($body['name'] ?? ''));
        if ($newName === '' || mb_strlen($newName) > 16 || !preg_match('/^[A-Za-z0-9 ]{1,16}$/', $newName)) {
            sts_json(400, ['error' => 'name must be 1–16 alphanumeric characters (with spaces)']);
            return;
        }
        if (sts_is_profane($newName)) {
            sts_json(400, ['error' => 'name not allowed']);
            return;
        }
        $stmt = $db->prepare('UPDATE presence SET name = :name WHERE client_id = :cid');
        $stmt->execute([':name' => $newName, ':cid' => $studentCid]);
        $db->exec('UPDATE state SET version=version+1 WHERE id=1');
        break;

    case 'startPoll':
        $question = trim((string)($body['question'] ?? ''));
        if ($question === '' || mb_strlen($question) > 200) {
            sts_json(400, ['error' => 'question must be 1–200 characters']);
            return;
        }
        $options = $body['options'] ?? [];
        if (!is_array($options) || count($options) < 2 || count($options) > 6) {
            sts_json(400, ['error' => 'options must be an array of 2–6 items']);
            return;
        }
        $cleanOptions = [];
        foreach ($options as $opt) {
            $optStr = trim((string)$opt);
            if ($optStr === '' || mb_strlen($optStr) > 40) {
                sts_json(400, ['error' => 'each option must be 1–40 characters']);
                return;
            }
            $cleanOptions[] = $optStr;
        }
        $stmt = $db->prepare(
            'UPDATE state SET poll_id=poll_id+1, poll_question=:q, poll_options=:o, version=version+1 WHERE id=1'
        );
        $stmt->execute([':q' => $question, ':o' => json_encode($cleanOptions)]);
        break;

    case 'endPoll':
        $db->exec("UPDATE state SET poll_question='', poll_options='[]', version=version+1 WHERE id=1");
        break;

    default:
        sts_json(400, ['error' => 'unknown action']);
        return;
}

sts_json(200, ['ok' => true]);
