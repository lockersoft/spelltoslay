<?php
declare(strict_types=1);

namespace Spelltoslay\Tests\Api;

use PHPUnit\Framework\TestCase;

class EnvOverrideTest extends TestCase
{
    public function test_init_db_honours_env_db_path(): void
    {
        // Run a COPY of the initializer from a temp tree, so that even a
        // version that ignores the env var can only write under the temp dir
        // (its default is <script dir>/../data/), never the developer's DB.
        $tree = sys_get_temp_dir() . '/sts_env_' . bin2hex(random_bytes(4));
        mkdir($tree . '/scripts', 0775, true);
        copy(dirname(__DIR__, 2) . '/scripts/init_db.php', $tree . '/scripts/init_db.php');
        $path = $tree . '/custom.sqlite';
        $cmd  = 'env STS_DB_PATH=' . escapeshellarg($path) . ' ' . escapeshellarg(PHP_BINARY)
              . ' ' . escapeshellarg($tree . '/scripts/init_db.php') . ' 2>&1';
        exec($cmd, $out, $code);
        try {
            $this->assertSame(0, $code, implode("\n", $out));
            $this->assertFileExists($path);
            $this->assertDirectoryDoesNotExist($tree . '/data');
        } finally {
            exec('rm -rf ' . escapeshellarg($tree));
        }
    }

    public function test_bootstrap_honours_env_db_path_and_key(): void
    {
        $path = sys_get_temp_dir() . '/sts_env_' . bin2hex(random_bytes(4)) . '.sqlite';
        $root = dirname(__DIR__, 2);
        $code = 'require ' . var_export($root . '/public/api/_bootstrap.php', true) . ';'
              . 'echo $GLOBALS["__STS_DB_PATH"], "|", sts_config()["teacher_key"];';
        $cmd  = 'env STS_DB_PATH=' . escapeshellarg($path) . ' STS_TEACHER_KEY=envkey '
              . escapeshellarg(PHP_BINARY) . ' -r ' . escapeshellarg($code) . ' 2>&1';
        $this->assertSame($path . '|envkey', trim((string)shell_exec($cmd)));
    }
}
