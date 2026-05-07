<?php
declare(strict_types=1);

namespace Slay\Tests\Api;

use PHPUnit\Framework\TestCase;

class HealthTest extends TestCase
{
    public function test_returns_ok_with_db_status(): void
    {
        [$status, $headers, $json] = slay_invoke('health.php');

        $this->assertSame(200, $status);
        $this->assertTrue($json['ok']);
        $this->assertSame('ok', $json['db']);
        $this->assertArrayHasKey('version', $json);
        // Version is "<base>.<count>" — base from VERSION_BASE, count from VERSION (or "dev" locally).
        $this->assertMatchesRegularExpression('/^\d+\.\d+\.[\w]+$/', $json['version']);
    }
}
