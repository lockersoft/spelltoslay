<?php
declare(strict_types=1);

namespace Spelltoslay\Tests\Api;

use PHPUnit\Framework\TestCase;

class TeacherAuthTest extends TestCase
{
    private const KEY = 'test-teacher-key-xyz';

    protected function tearDown(): void
    {
        // sts_invoke() merges request headers into $_SERVER and never removes them.
        unset($_SERVER['HTTP_X_TEACHER_KEY']);
    }

    public function test_header_key_is_accepted_on_every_teacher_endpoint(): void
    {
        $h = ['X-Teacher-Key' => self::KEY];
        [$a] = sts_invoke('teacher.php', 'POST', [], ['action' => 'resume'], $h);
        [$b] = sts_invoke('players.php', 'GET', [], null, $h);
        [$c] = sts_invoke('contributors.php', 'GET', [], null, $h);
        $this->assertSame([200, 200, 200], [$a, $b, $c]);
    }

    public function test_wrong_header_key_is_rejected_even_with_right_query_key(): void
    {
        [$status] = sts_invoke('players.php', 'GET', ['key' => self::KEY], null, ['X-Teacher-Key' => 'nope']);
        $this->assertSame(403, $status);
    }

    public function test_missing_key_is_rejected(): void
    {
        [$a] = sts_invoke('teacher.php', 'POST', [], ['action' => 'resume']);
        [$b] = sts_invoke('players.php', 'GET');
        [$c] = sts_invoke('contributors.php', 'GET');
        $this->assertSame([403, 403, 403], [$a, $b, $c]);
    }

    public function test_array_valued_key_is_rejected_not_fatal(): void
    {
        [$status] = sts_invoke('players.php', 'GET', ['key' => ['a', 'b']]);
        $this->assertSame(403, $status);
    }
}
