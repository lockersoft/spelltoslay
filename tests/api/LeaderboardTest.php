<?php
declare(strict_types=1);

namespace Slay\Tests\Api;

use PHPUnit\Framework\TestCase;

class LeaderboardTest extends TestCase
{
    protected function setUp(): void
    {
        slay_db()->exec('DELETE FROM scores');
    }

    private function insert(string $name, int $score, int $secondsAgo): void
    {
        $stmt = slay_db()->prepare(
            'INSERT INTO scores (name, score, wave, duration, ip, submitted_at)
             VALUES (:n, :s, 1, 60, "127.0.0.1", :t)'
        );
        $stmt->execute([':n' => $name, ':s' => $score, ':t' => time() - $secondsAgo]);
    }

    public function test_returns_alltime_top_20_and_today_top_10(): void
    {
        // 25 historic scores, 5 from today.
        for ($i = 0; $i < 25; $i++) {
            $this->insert("Old$i", 100 + $i, 86400 * 2); // 2 days ago
        }
        for ($i = 0; $i < 5; $i++) {
            $this->insert("New$i", 500 + $i, 60); // 1 minute ago
        }

        [$status, , $json] = slay_invoke('leaderboard.php');
        $this->assertSame(200, $status);
        $this->assertCount(20, $json['allTime']);
        $this->assertCount(5,  $json['today']);

        // allTime is sorted desc; top entry is highest "New" score.
        $this->assertSame('New4', $json['allTime'][0]['name']);
        $this->assertSame(504,    $json['allTime'][0]['score']);

        // Each entry has expected shape.
        $first = $json['allTime'][0];
        foreach (['name','score','wave','submittedAt'] as $k) {
            $this->assertArrayHasKey($k, $first);
        }
        // submittedAt is ISO8601.
        $this->assertNotFalse(strtotime($first['submittedAt']));
    }

    public function test_empty_leaderboard(): void
    {
        [$status, , $json] = slay_invoke('leaderboard.php');
        $this->assertSame(200, $status);
        $this->assertSame([], $json['allTime']);
        $this->assertSame([], $json['today']);
    }
}
