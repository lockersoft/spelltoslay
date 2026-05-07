<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    sts_json(405, ['error' => 'method not allowed']);
    return;
}

$db = sts_db();

// Resolve the source — explicit param wins; otherwise read from state.
$source = (string)($_GET['source'] ?? '');
if ($source === '') {
    $row = $db->query('SELECT word_source FROM state WHERE id=1')->fetch();
    $source = (string)($row['word_source'] ?? 'builtin:6');
}

// Always read the version so clients can cache-bust correctly.
$verRow = $db->query('SELECT word_list_version FROM state WHERE id=1')->fetch();
$version = (int)($verRow['word_list_version'] ?? 0);

if ($source === 'teacher') {
    $stmt = $db->query('SELECT word FROM teacher_word_list ORDER BY position ASC');
    $words = array_map(fn($r) => (string)$r['word'], $stmt->fetchAll());
    sts_json(200, ['source' => 'teacher', 'version' => $version, 'words' => $words]);
    return;
}

if (preg_match('/^builtin:([K0-8]|[1-8])$/', $source, $m)) {
    $grade = $m[1];
    $path = __DIR__ . "/../words/grade-$grade.json";
    if (!is_file($path)) {
        sts_json(400, ['error' => 'unknown grade']);
        return;
    }
    $data = json_decode((string)file_get_contents($path), true);
    if (!is_array($data) || !isset($data['easy'], $data['medium'], $data['hard'])) {
        sts_json(500, ['error' => 'word list malformed']);
        return;
    }
    $merged = array_values(array_merge($data['easy'], $data['medium'], $data['hard']));
    sts_json(200, ['source' => "builtin:$grade", 'version' => $version, 'words' => $merged]);
    return;
}

sts_json(400, ['error' => 'invalid source']);
