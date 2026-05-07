<?php
declare(strict_types=1);

namespace Spelltoslay\Tests\Api;

use PHPUnit\Framework\TestCase;

class PlayersTest extends TestCase
{
    private const KEY = 'test-teacher-key-xyz';

    protected function setUp(): void
    {
        sts_db()->exec('UPDATE state SET paused=0, message="", force_reload=0, force_reload_set_at=0, version=0, poll_id=0, poll_question="", poll_options="[]" WHERE id=1');
        sts_db()->exec('DELETE FROM presence');
        sts_db()->exec('DELETE FROM poll_responses');
    }

    public function test_rejects_missing_key(): void
    {
        [$status] = sts_invoke('players.php', 'GET', []);
        $this->assertSame(403, $status);
    }

    public function test_returns_only_fresh_clients_with_names(): void
    {
        $now = time();
        // Fresh client with a name.
        sts_db()->exec("INSERT INTO presence (client_id, last_seen, name, personal_message) VALUES ('uuid-fresh', {$now}, 'Dave', '')");
        // Stale client.
        sts_db()->exec("INSERT INTO presence (client_id, last_seen, name, personal_message) VALUES ('uuid-stale', " . ($now - 30) . ", 'Stale', '')");

        [$status, , $json] = sts_invoke('players.php', 'GET', ['key' => self::KEY]);
        $this->assertSame(200, $status);
        $this->assertCount(1, $json['players']);
        $this->assertSame('uuid-fresh', $json['players'][0]['cid']);
        $this->assertSame('Dave', $json['players'][0]['name']);
    }

    public function test_returns_personal_message_field(): void
    {
        $now = time();
        sts_db()->exec("INSERT INTO presence (client_id, last_seen, name, personal_message) VALUES ('uuid-pm', {$now}, 'Eve', 'Focus please')");

        [$status, , $json] = sts_invoke('players.php', 'GET', ['key' => self::KEY]);
        $this->assertSame(200, $status);
        $this->assertCount(1, $json['players']);
        $this->assertSame('Focus please', $json['players'][0]['personalMessage']);
    }

    public function test_players_returns_personal_paused_field(): void
    {
        $now = time();
        sts_db()->exec("INSERT INTO presence (client_id, last_seen, name, personal_message, personal_paused) VALUES ('uuid-paused', {$now}, 'Frank', '', 1)");
        sts_db()->exec("INSERT INTO presence (client_id, last_seen, name, personal_message, personal_paused) VALUES ('uuid-active', {$now}, 'Grace', '', 0)");

        [$status, , $json] = sts_invoke('players.php', 'GET', ['key' => self::KEY]);
        $this->assertSame(200, $status);
        $this->assertCount(2, $json['players']);

        $byName = [];
        foreach ($json['players'] as $p) $byName[$p['name']] = $p;
        $this->assertTrue($byName['Frank']['personalPaused']);
        $this->assertFalse($byName['Grace']['personalPaused']);
    }

    public function test_players_includes_live_stats(): void
    {
        $now = time();
        sts_db()->exec("INSERT INTO presence (client_id, last_seen, name, personal_message, current_score, current_wave, current_hp, is_playing, is_visible)
            VALUES ('uuid-stats2', {$now}, 'Harry', '', 500, 3, 75, 1, 1)");

        [$status, , $json] = sts_invoke('players.php', 'GET', ['key' => self::KEY]);
        $this->assertSame(200, $status);
        $this->assertCount(1, $json['players']);
        $p = $json['players'][0];
        $this->assertSame(500, $p['score']);
        $this->assertSame(3,   $p['wave']);
        $this->assertSame(75,  $p['hp']);
        $this->assertTrue($p['isPlaying']);
        $this->assertTrue($p['isVisible']);
    }

    public function test_players_includes_poll_answer(): void
    {
        $now = time();
        sts_db()->exec("UPDATE state SET poll_id=5, poll_question='Q?', poll_options='[\"A\",\"B\"]' WHERE id=1");
        sts_db()->exec("INSERT INTO presence (client_id, last_seen, name, personal_message) VALUES ('uuid-voter2', {$now}, 'Ivy', '')");
        sts_db()->exec("INSERT INTO poll_responses (poll_id, client_id, option_index, answered_at) VALUES (5, 'uuid-voter2', 0, {$now})");

        [$status, , $json] = sts_invoke('players.php', 'GET', ['key' => self::KEY]);
        $this->assertSame(200, $status);
        $this->assertSame(0, $json['players'][0]['pollAnswer']);
    }
}
