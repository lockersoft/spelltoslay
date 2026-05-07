<?php
declare(strict_types=1);

namespace Spelltoslay\Tests\Api;

use PHPUnit\Framework\TestCase;

class ContributorsTest extends TestCase
{
    private const KEY = 'test-teacher-key-xyz';

    public function test_rejects_missing_key(): void
    {
        [$status] = sts_invoke('contributors.php', 'GET', []);
        $this->assertSame(403, $status);
    }

    public function test_rejects_wrong_key(): void
    {
        [$status] = sts_invoke('contributors.php', 'GET', ['key' => 'wrong']);
        $this->assertSame(403, $status);
    }

    public function test_endpoint_returns_contributors_array(): void
    {
        // Smoke test: endpoint authenticates and returns the expected shape.
        // CHANGELOG.md is currently scaffold-only ([Unreleased]) so the
        // contributors array may be empty — that's fine.
        [$status, , $json] = sts_invoke('contributors.php', 'GET', ['key' => self::KEY]);
        $this->assertSame(200, $status);
        $this->assertArrayHasKey('contributors', $json);
        $this->assertIsArray($json['contributors']);
    }
}
