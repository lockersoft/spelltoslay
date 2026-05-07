<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    slay_json(405, ['error' => 'method not allowed']);
    return;
}

$config   = slay_config();
$expected = $config['teacher_key'] ?? null;
$provided = $_GET['key'] ?? '';
if (!$expected || !is_string($provided) || !hash_equals($expected, $provided)) {
    slay_json(403, ['error' => 'forbidden']);
    return;
}

// Allow test to override the changelog path via a constant.
$changelogPath = defined('SLAY_CHANGELOG_PATH')
    ? SLAY_CHANGELOG_PATH
    : __DIR__ . '/../../CHANGELOG.md';

$contributors = [];

if (file_exists($changelogPath)) {
    $lines   = file($changelogPath, FILE_IGNORE_NEW_LINES);
    $version = 'Unreleased';

    foreach ($lines as $line) {
        // Track current version from headings like "## [0.2.0]" or "## [Unreleased]"
        if (preg_match('/^##\s+\[([^\]]+)\]/', $line, $m)) {
            $version = $m[1];
            continue;
        }

        // Look for bullet lines containing "(idea by **NAME**)"
        if (!preg_match('/^\s*[-*+]\s+(.+)$/', $line, $bulletMatch)) {
            continue;
        }
        $bulletText = trim($bulletMatch[1]);

        if (!preg_match('/\(idea by \*\*([^*]+)\*\*\)/', $bulletText, $ideaMatch)) {
            continue;
        }
        $name = trim($ideaMatch[1]);

        // Extract feature: first bolded text like "**Spread shot powerup**"
        if (preg_match('/\*\*([^*]+)\*\*/', $bulletText, $boldMatch)) {
            $feature = trim($boldMatch[1]);
        } else {
            $feature = mb_substr($bulletText, 0, 60);
        }

        $versionStr = ($version === 'Unreleased') ? 'Unreleased' : $version;

        $contributors[] = [
            'name'    => $name,
            'version' => $versionStr,
            'feature' => $feature,
        ];
    }
}

slay_json(200, ['contributors' => $contributors]);
