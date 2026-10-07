<?php
declare(strict_types=1);

namespace Spelltoslay\Tests\Api;

use PHPUnit\Framework\TestCase;

class ScoreTest extends TestCase
{
    protected function setUp(): void
    {
        sts_db()->exec('DELETE FROM scores');
    }

    public function test_accepts_valid_submission(): void
    {
        [$status, , $json] = sts_invoke('score.php', 'POST', [], [
            'name' => 'Ava', 'score' => 423, 'wave' => 7, 'duration' => 184, 'wordsSlain' => 40,
        ]);
        $this->assertSame(200, $status);
        $this->assertSame(1, $json['rank']);
        $this->assertSame(423, $json['topScore']);
    }

    public function test_rejects_long_name(): void
    {
        [$status, , $json] = sts_invoke('score.php', 'POST', [], [
            'name' => str_repeat('x', 17), 'score' => 1, 'wave' => 1, 'duration' => 1,
        ]);
        $this->assertSame(400, $status);
        $this->assertStringContainsString('name', $json['error']);
    }

    public function test_rejects_non_alnum_name(): void
    {
        [$status] = sts_invoke('score.php', 'POST', [], [
            'name' => 'A<script>v', 'score' => 1, 'wave' => 1, 'duration' => 1,
        ]);
        $this->assertSame(400, $status);
    }

    public function test_rejects_negative_score(): void
    {
        [$status] = sts_invoke('score.php', 'POST', [], [
            'name' => 'A', 'score' => -1, 'wave' => 1, 'duration' => 1,
        ]);
        $this->assertSame(400, $status);
    }

    public function test_rejects_implausible_score(): void
    {
        [$status] = sts_invoke('score.php', 'POST', [], [
            'name' => 'A', 'score' => 10_000_000, 'wave' => 1, 'duration' => 1,
        ]);
        $this->assertSame(400, $status);
    }

    public function test_returns_correct_rank(): void
    {
        sts_invoke('score.php', 'POST', [], ['name'=>'A','score'=>500,'wave'=>3,'duration'=>60,'wordsSlain'=>20]);
        sts_invoke('score.php', 'POST', [], ['name'=>'B','score'=>900,'wave'=>5,'duration'=>120,'wordsSlain'=>30]);
        sleep(11); // bypass rate limit
        [, , $json] = sts_invoke('score.php', 'POST', [], [
            'name'=>'C','score'=>700,'wave'=>4,'duration'=>90,'wordsSlain'=>25,
        ]);
        $this->assertSame(2, $json['rank']);     // 900, 700, 500
        $this->assertSame(900, $json['topScore']);
    }

    public function test_rate_limits_same_ip_and_name_within_10s(): void
    {
        sts_invoke('score.php', 'POST', [], ['name'=>'A','score'=>1,'wave'=>1,'duration'=>1,'wordsSlain'=>1]);
        [$status, , $json] = sts_invoke('score.php', 'POST', [], [
            'name'=>'A','score'=>2,'wave'=>1,'duration'=>1,'wordsSlain'=>1,
        ]);
        $this->assertSame(429, $status);
        $this->assertStringContainsString('rate', strtolower($json['error']));
    }

    public function testAcceptsNewTypingFields(): void
    {
        [$status, , $json] = sts_invoke(
            'score.php', 'POST', [],
            ['name' => 'Pat', 'score' => 1240, 'wave' => 3, 'duration' => 184,
             'wpm' => 42, 'accuracy' => 94, 'wordsSlain' => 38]
        );
        $this->assertSame(200, $status);
        $this->assertArrayHasKey('rank', $json);

        $row = sts_db()->query("SELECT wpm, accuracy, words_slain FROM scores WHERE name='Pat'")->fetch();
        $this->assertSame(42, (int)$row['wpm']);
        $this->assertSame(94, (int)$row['accuracy']);
        $this->assertSame(38, (int)$row['words_slain']);
    }

    public function testRejectsImplausibleWpm(): void
    {
        [$status] = sts_invoke(
            'score.php', 'POST', [],
            ['name' => 'Q', 'score' => 1, 'wave' => 1, 'duration' => 1, 'wpm' => 9999]
        );
        $this->assertSame(400, $status);
    }

    public function testRejectsImplausibleAccuracy(): void
    {
        [$status] = sts_invoke(
            'score.php', 'POST', [],
            ['name' => 'Q', 'score' => 1, 'wave' => 1, 'duration' => 1, 'accuracy' => 200]
        );
        $this->assertSame(400, $status);
    }

    public function testLegacyPayloadWithoutTypingFieldsIsRejectedWhenItClaimsPoints(): void
    {
        // A payload with no wordsSlain claims zero kills, so it cannot carry points.
        [$status] = sts_invoke(
            'score.php', 'POST', [],
            ['name' => 'Legacy', 'score' => 100, 'wave' => 2, 'duration' => 30]
        );
        $this->assertSame(400, $status);
    }

    public function test_rejects_score_higher_than_kills_allow(): void
    {
        [$status, , $json] = sts_invoke('score.php', 'POST', [], [
            'name' => 'Hax', 'score' => 999999, 'wave' => 1, 'duration' => 20,
            'wpm' => 40, 'accuracy' => 90, 'wordsSlain' => 3,
        ]);
        $this->assertSame(400, $status);
        $this->assertSame('score does not match the run', $json['error']);
    }

    public function test_rejects_wave_beyond_elapsed_time(): void
    {
        [$status, , $json] = sts_invoke('score.php', 'POST', [], [
            'name' => 'Hax', 'score' => 10, 'wave' => 50, 'duration' => 60,
            'wpm' => 40, 'accuracy' => 90, 'wordsSlain' => 5,
        ]);
        $this->assertSame(400, $status);
        $this->assertSame('score does not match the run', $json['error']);
    }

    public function test_rejects_more_kills_than_time_allows(): void
    {
        [$status, , $json] = sts_invoke('score.php', 'POST', [], [
            'name' => 'Hax', 'score' => 10, 'wave' => 1, 'duration' => 10,
            'wpm' => 40, 'accuracy' => 90, 'wordsSlain' => 500,
        ]);
        $this->assertSame(400, $status);
        $this->assertSame('score does not match the run', $json['error']);
    }

    public function test_accepts_the_best_legitimate_run_shape(): void
    {
        // 10 minutes, wave 21, 300 words at the per-word ceiling.
        [$status] = sts_invoke('score.php', 'POST', [], [
            'name' => 'Legit', 'score' => 300 * 256, 'wave' => 21, 'duration' => 600,
            'wpm' => 120, 'accuracy' => 99, 'wordsSlain' => 300,
        ]);
        $this->assertSame(200, $status);
    }

    public function test_accepts_zero_score_run_with_no_kills(): void
    {
        [$status] = sts_invoke('score.php', 'POST', [], [
            'name' => 'Zero', 'score' => 0, 'wave' => 1, 'duration' => 12,
        ]);
        $this->assertSame(200, $status);
    }
}
