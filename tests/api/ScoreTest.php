<?php
declare(strict_types=1);

namespace Slay\Tests\Api;

use PHPUnit\Framework\TestCase;

class ScoreTest extends TestCase
{
    protected function setUp(): void
    {
        slay_db()->exec('DELETE FROM scores');
    }

    public function test_accepts_valid_submission(): void
    {
        [$status, , $json] = slay_invoke('score.php', 'POST', [], [
            'name' => 'Ava', 'score' => 423, 'wave' => 7, 'duration' => 184,
        ]);
        $this->assertSame(200, $status);
        $this->assertSame(1, $json['rank']);
        $this->assertSame(423, $json['topScore']);
    }

    public function test_rejects_long_name(): void
    {
        [$status, , $json] = slay_invoke('score.php', 'POST', [], [
            'name' => str_repeat('x', 17), 'score' => 1, 'wave' => 1, 'duration' => 1,
        ]);
        $this->assertSame(400, $status);
        $this->assertStringContainsString('name', $json['error']);
    }

    public function test_rejects_non_alnum_name(): void
    {
        [$status] = slay_invoke('score.php', 'POST', [], [
            'name' => 'A<script>v', 'score' => 1, 'wave' => 1, 'duration' => 1,
        ]);
        $this->assertSame(400, $status);
    }

    public function test_rejects_negative_score(): void
    {
        [$status] = slay_invoke('score.php', 'POST', [], [
            'name' => 'A', 'score' => -1, 'wave' => 1, 'duration' => 1,
        ]);
        $this->assertSame(400, $status);
    }

    public function test_rejects_implausible_score(): void
    {
        [$status] = slay_invoke('score.php', 'POST', [], [
            'name' => 'A', 'score' => 10_000_000, 'wave' => 1, 'duration' => 1,
        ]);
        $this->assertSame(400, $status);
    }

    public function test_returns_correct_rank(): void
    {
        slay_invoke('score.php', 'POST', [], ['name'=>'A','score'=>500,'wave'=>5,'duration'=>60]);
        slay_invoke('score.php', 'POST', [], ['name'=>'B','score'=>900,'wave'=>9,'duration'=>120]);
        sleep(11); // bypass rate limit
        [, , $json] = slay_invoke('score.php', 'POST', [], [
            'name'=>'C','score'=>700,'wave'=>7,'duration'=>90,
        ]);
        $this->assertSame(2, $json['rank']);     // 900, 700, 500
        $this->assertSame(900, $json['topScore']);
    }

    public function test_rate_limits_same_ip_and_name_within_10s(): void
    {
        slay_invoke('score.php', 'POST', [], ['name'=>'A','score'=>1,'wave'=>1,'duration'=>1]);
        [$status, , $json] = slay_invoke('score.php', 'POST', [], [
            'name'=>'A','score'=>2,'wave'=>1,'duration'=>1,
        ]);
        $this->assertSame(429, $status);
        $this->assertStringContainsString('rate', strtolower($json['error']));
    }
}
