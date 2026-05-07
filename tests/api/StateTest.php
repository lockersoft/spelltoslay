<?php
declare(strict_types=1);

namespace Slay\Tests\Api;

use PHPUnit\Framework\TestCase;

class StateTest extends TestCase
{
    protected function setUp(): void
    {
        slay_db()->exec('UPDATE state SET paused=0, message="", force_reload=0, force_reload_set_at=0, version=0, poll_id=0, poll_question="", poll_options="[]" WHERE id=1');
        slay_db()->exec('DELETE FROM presence');
        slay_db()->exec('DELETE FROM poll_responses');
    }

    public function test_returns_default_state(): void
    {
        [$status, , $json] = slay_invoke('state.php');
        $this->assertSame(200, $status);
        $this->assertFalse($json['paused']);
        $this->assertSame('',  $json['message']);
        $this->assertSame(0,   $json['version']);
        $this->assertFalse($json['forceReload']);
        $this->assertSame(0,   $json['playerCount']);
    }

    public function test_etag_returns_304_when_version_matches(): void
    {
        // Bump version so the ETag is non-trivial.
        slay_db()->exec('UPDATE state SET version=5 WHERE id=1');

        [$status, $headers] = slay_invoke('state.php');
        $this->assertSame(200, $status);
        $etag = null;
        foreach ($headers as $h) if (stripos($h, 'ETag:') === 0) $etag = trim(substr($h, 5));
        $this->assertNotNull($etag);

        [$status2] = slay_invoke('state.php', 'GET', [], null, ['If-None-Match' => $etag]);
        $this->assertSame(304, $status2);
    }

    public function test_force_reload_auto_clears_after_10s(): void
    {
        slay_db()->exec(
            'UPDATE state SET force_reload=1, force_reload_set_at='
            . (time() - 11) . ' WHERE id=1'
        );
        [, , $json] = slay_invoke('state.php');
        $this->assertFalse($json['forceReload']);
    }

    public function test_force_reload_active_within_10s(): void
    {
        slay_db()->exec(
            'UPDATE state SET force_reload=1, force_reload_set_at='
            . (time() - 3) . ' WHERE id=1'
        );
        [, , $json] = slay_invoke('state.php');
        $this->assertTrue($json['forceReload']);
    }

    public function test_presence_increments_player_count(): void
    {
        slay_invoke('state.php', 'GET', ['cid' => 'uuid-A']);
        slay_invoke('state.php', 'GET', ['cid' => 'uuid-B']);
        [, , $json] = slay_invoke('state.php', 'GET', ['cid' => 'uuid-A']); // re-poll same client
        $this->assertSame(2, $json['playerCount']);
    }

    public function test_presence_drops_stale_clients(): void
    {
        // Insert a stale presence directly.
        slay_db()->exec(
            "INSERT INTO presence (client_id, last_seen) VALUES ('uuid-stale', "
            . (time() - 30) . ")"
        );
        [, , $json] = slay_invoke('state.php', 'GET', ['cid' => 'uuid-A']);
        $this->assertSame(1, $json['playerCount']); // only uuid-A counted
    }

    public function test_no_cid_query_does_not_create_presence_row(): void
    {
        [, , $json] = slay_invoke('state.php');
        $this->assertSame(0, $json['playerCount']);
    }

    public function test_state_stores_name_with_cid(): void
    {
        slay_invoke('state.php', 'GET', ['cid' => 'uuid-1', 'name' => 'Alice']);
        $row = slay_db()->query("SELECT name FROM presence WHERE client_id='uuid-1'")->fetch();
        $this->assertSame('Alice', $row['name']);
    }

    public function test_state_returns_personal_message_for_this_cid(): void
    {
        slay_db()->exec(
            "INSERT INTO presence (client_id, last_seen, name, personal_message) VALUES ('uuid-X', " . time() . ", 'Bob', 'Pay attention')"
        );
        [, , $json] = slay_invoke('state.php', 'GET', ['cid' => 'uuid-X']);
        $this->assertSame('Pay attention', $json['personalMessage']);
    }

    public function test_state_empty_personal_message_when_none(): void
    {
        [, , $json] = slay_invoke('state.php', 'GET', ['cid' => 'uuid-new']);
        $this->assertSame('', $json['personalMessage']);
    }

    public function test_state_returns_personal_paused_for_this_cid(): void
    {
        slay_db()->exec(
            "INSERT INTO presence (client_id, last_seen, name, personal_message, personal_paused) VALUES ('uuid-X', " . time() . ", 'Bob', '', 1)"
        );
        [, , $json] = slay_invoke('state.php', 'GET', ['cid' => 'uuid-X']);
        $this->assertTrue($json['personalPaused']);
    }

    public function test_state_personal_paused_false_when_none(): void
    {
        [, , $json] = slay_invoke('state.php', 'GET', ['cid' => 'uuid-none']);
        $this->assertFalse($json['personalPaused']);
    }

    public function test_state_accepts_live_stats(): void
    {
        [$status] = slay_invoke('state.php', 'GET', [
            'cid'     => 'uuid-stats',
            'name'    => 'Tester',
            'score'   => '423',
            'wave'    => '5',
            'hp'      => '80',
            'playing' => '1',
            'visible' => '1',
        ]);
        $this->assertSame(200, $status);
        $row = slay_db()->query("SELECT current_score, current_wave, current_hp, is_playing, is_visible FROM presence WHERE client_id='uuid-stats'")->fetch();
        $this->assertSame(423, (int)$row['current_score']);
        $this->assertSame(5,   (int)$row['current_wave']);
        $this->assertSame(80,  (int)$row['current_hp']);
        $this->assertSame(1,   (int)$row['is_playing']);
        $this->assertSame(1,   (int)$row['is_visible']);
    }

    public function test_state_returns_authoritative_name(): void
    {
        // Pre-seed presence with a name.
        slay_db()->exec("INSERT INTO presence (client_id, last_seen, name) VALUES ('uuid-auth', " . time() . ", 'ServerName')");
        // Poll with a different name.
        [, , $json] = slay_invoke('state.php', 'GET', ['cid' => 'uuid-auth', 'name' => 'ClientName']);
        $this->assertSame('ServerName', $json['name']);
        // DB should still have ServerName.
        $row = slay_db()->query("SELECT name FROM presence WHERE client_id='uuid-auth'")->fetch();
        $this->assertSame('ServerName', $row['name']);
    }

    public function test_state_first_name_set_when_empty(): void
    {
        // Fresh cid, no prior presence.
        slay_invoke('state.php', 'GET', ['cid' => 'uuid-fresh2', 'name' => 'NewPlayer']);
        $row = slay_db()->query("SELECT name FROM presence WHERE client_id='uuid-fresh2'")->fetch();
        $this->assertSame('NewPlayer', $row['name']);
    }

    public function test_state_includes_poll_when_active(): void
    {
        slay_db()->exec("UPDATE state SET poll_id=1, poll_question='Who is the best?', poll_options='[\"Alice\",\"Bob\"]' WHERE id=1");
        [, , $json] = slay_invoke('state.php', 'GET', ['cid' => 'uuid-poll1']);
        $this->assertSame('Who is the best?', $json['pollQuestion']);
        $this->assertSame(['Alice', 'Bob'], $json['pollOptions']);
        $this->assertSame(1, $json['pollId']);
    }

    public function test_state_my_answer_when_voted(): void
    {
        slay_db()->exec("UPDATE state SET poll_id=2, poll_question='Favourite?', poll_options='[\"Cat\",\"Dog\"]' WHERE id=1");
        slay_db()->exec("INSERT INTO poll_responses (poll_id, client_id, option_index, answered_at) VALUES (2, 'uuid-voter', 1, " . time() . ")");
        [, , $json] = slay_invoke('state.php', 'GET', ['cid' => 'uuid-voter']);
        $this->assertSame(1, $json['pollMyAnswer']);
    }
}
