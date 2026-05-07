<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

// Force test mode: temp SQLite DB, predictable teacher key.
$tmpDb = tempnam(sys_get_temp_dir(), 'slay_test_') . '.sqlite';
register_shutdown_function(fn() => @unlink($tmpDb));

define('SLAY_DB_PATH', $tmpDb);
define('SLAY_TEACHER_KEY', 'test-teacher-key-xyz');

// Initialize schema by including the init script.
require __DIR__ . '/../scripts/init_db.php';

// Make API helpers (slay_db, slay_json, etc.) available globally for test setUp/tearDown.
require_once __DIR__ . '/../public/api/_bootstrap.php';

/**
 * Invoke a PHP endpoint in-process, returning [status, headers, decoded JSON].
 *
 * Sets $_SERVER, $_GET, $_POST, php://input as the endpoint expects, then
 * captures output. PHPUnit running this is single-threaded so globals are safe.
 */
function slay_invoke(string $relPath, string $method = 'GET', array $query = [], $body = null, array $headers = []): array {
    $_SERVER = array_merge($_SERVER, [
        'REQUEST_METHOD' => $method,
        'REMOTE_ADDR'    => '127.0.0.1',
        'HTTP_HOST'      => 'localhost',
    ]);
    foreach ($headers as $k => $v) {
        $_SERVER['HTTP_' . strtoupper(str_replace('-', '_', $k))] = $v;
    }
    $_GET  = $query;
    $_POST = is_array($body) ? $body : [];

    // Stub php://input for JSON-body endpoints.
    if (is_string($body)) {
        $GLOBALS['__SLAY_TEST_INPUT'] = $body;
    } elseif (is_array($body) && $method !== 'GET') {
        $GLOBALS['__SLAY_TEST_INPUT'] = json_encode($body);
    } else {
        $GLOBALS['__SLAY_TEST_INPUT'] = '';
    }

    http_response_code(200);
    ob_start();
    // header() can't be intercepted cleanly under PHPUnit/CLI without runkit,
    // so endpoints in test mode also append headers to a $GLOBALS['__SLAY_HEADERS'] array.
    $GLOBALS['__SLAY_HEADERS'] = [];
    try {
        require __DIR__ . '/../public/api/' . $relPath;
    } catch (\Throwable $e) {
        ob_end_clean();
        throw $e;
    }
    $out = ob_get_clean();
    $status = http_response_code() ?: 200;

    $json = json_decode($out, true);
    return [$status, $GLOBALS['__SLAY_HEADERS'], $json, $out];
}
