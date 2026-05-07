<?php
declare(strict_types=1);

namespace Slay\Tests\Api;

use PHPUnit\Framework\TestCase;

class ContributorsTest extends TestCase
{
    private const KEY = 'test-teacher-key-xyz';

    public function test_rejects_missing_key(): void
    {
        [$status] = slay_invoke('contributors.php', 'GET', []);
        $this->assertSame(403, $status);
    }

    public function test_rejects_wrong_key(): void
    {
        [$status] = slay_invoke('contributors.php', 'GET', ['key' => 'wrong']);
        $this->assertSame(403, $status);
    }

    public function test_parses_changelog_entries(): void
    {
        // The production CHANGELOG.md has Jhett's spread shot entry.
        [$status, , $json] = slay_invoke('contributors.php', 'GET', ['key' => self::KEY]);
        $this->assertSame(200, $status);
        $this->assertArrayHasKey('contributors', $json);
        $this->assertNotEmpty($json['contributors']);

        // Find Jhett's entry.
        $jhett = null;
        foreach ($json['contributors'] as $entry) {
            if ($entry['name'] === 'Jhett') {
                $jhett = $entry;
                break;
            }
        }
        $this->assertNotNull($jhett, 'Expected to find Jhett in contributors');
        $this->assertSame('0.2.0', $jhett['version']);
        $this->assertNotEmpty($jhett['feature']);
    }
}
