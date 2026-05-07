<?php
declare(strict_types=1);

namespace Spelltoslay\Tests\Api;

use PHPUnit\Framework\TestCase;

class TeacherTest extends TestCase
{
    private const KEY = 'test-teacher-key-xyz';

    protected function setUp(): void
    {
        sts_db()->exec('UPDATE state SET paused=0, message="", force_reload=0, force_reload_set_at=0, version=0, poll_id=0, poll_question="", poll_options="[]" WHERE id=1');
        sts_db()->exec('DELETE FROM scores');
        sts_db()->exec('DELETE FROM presence');
        sts_db()->exec('DELETE FROM poll_responses');
    }

    public function test_rejects_missing_key(): void
    {
        [$status] = sts_invoke('teacher.php', 'POST', [], ['action' => 'pause']);
        $this->assertSame(403, $status);
    }

    public function test_rejects_wrong_key(): void
    {
        [$status] = sts_invoke('teacher.php', 'POST', ['key' => 'bogus'], ['action' => 'pause']);
        $this->assertSame(403, $status);
    }

    public function test_pause_sets_state_and_bumps_version(): void
    {
        [$status, , $json] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY], ['action' => 'pause']);
        $this->assertSame(200, $status);
        $this->assertTrue($json['ok']);

        $row = sts_db()->query('SELECT paused, version FROM state WHERE id=1')->fetch();
        $this->assertSame(1, (int)$row['paused']);
        $this->assertSame(1, (int)$row['version']);
    }

    public function test_resume_clears_paused_and_bumps_version(): void
    {
        sts_db()->exec('UPDATE state SET paused=1, version=5 WHERE id=1');
        [$status] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY], ['action' => 'resume']);
        $this->assertSame(200, $status);

        $row = sts_db()->query('SELECT paused, version FROM state WHERE id=1')->fetch();
        $this->assertSame(0, (int)$row['paused']);
        $this->assertSame(6, (int)$row['version']);
    }

    public function test_unknown_action_400(): void
    {
        [$status] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY], ['action' => 'destroy_world']);
        $this->assertSame(400, $status);
    }

    public function test_message_sets_text_and_bumps_version(): void
    {
        [$status] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY], [
            'action' => 'message', 'text' => 'Eyes up front',
        ]);
        $this->assertSame(200, $status);
        $row = sts_db()->query('SELECT message, version FROM state WHERE id=1')->fetch();
        $this->assertSame('Eyes up front', $row['message']);
        $this->assertSame(1, (int)$row['version']);
    }

    public function test_message_truncates_at_200_chars(): void
    {
        $long = str_repeat('x', 250);
        sts_invoke('teacher.php', 'POST', ['key' => self::KEY], ['action' => 'message', 'text' => $long]);
        $row = sts_db()->query('SELECT message FROM state WHERE id=1')->fetch();
        $this->assertSame(200, mb_strlen($row['message']));
    }

    public function test_broadcast_reload_sets_flag_and_timestamp(): void
    {
        [$status] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY], ['action' => 'broadcastReload']);
        $this->assertSame(200, $status);
        $row = sts_db()->query('SELECT force_reload, force_reload_set_at FROM state WHERE id=1')->fetch();
        $this->assertSame(1, (int)$row['force_reload']);
        $this->assertGreaterThan(time() - 5, (int)$row['force_reload_set_at']);
    }

    public function test_clear_leaderboard_requires_confirm(): void
    {
        sts_db()->exec("INSERT INTO scores (name, score, wave, duration, ip, submitted_at) VALUES ('A', 1, 1, 1, '1.1.1.1', " . time() . ")");
        [$status] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY], ['action' => 'clearLeaderboard']);
        $this->assertSame(400, $status);
        $this->assertSame(1, (int)sts_db()->query('SELECT COUNT(*) AS c FROM scores')->fetch()['c']);
    }

    public function test_clear_leaderboard_with_confirm_wipes_scores(): void
    {
        sts_db()->exec("INSERT INTO scores (name, score, wave, duration, ip, submitted_at) VALUES ('A', 1, 1, 1, '1.1.1.1', " . time() . ")");
        [$status] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY], [
            'action' => 'clearLeaderboard', 'confirm' => true,
        ]);
        $this->assertSame(200, $status);
        $this->assertSame(0, (int)sts_db()->query('SELECT COUNT(*) AS c FROM scores')->fetch()['c']);
    }

    public function test_message_student_sets_personal_and_bumps_version(): void
    {
        sts_db()->exec("INSERT INTO presence (client_id, last_seen, name, personal_message) VALUES ('uuid-Y', " . time() . ", 'Charlie', '')");
        [$status, , $json] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY], [
            'action' => 'messageStudent', 'cid' => 'uuid-Y', 'text' => 'Stop talking',
        ]);
        $this->assertSame(200, $status);
        $this->assertTrue($json['ok']);

        $row = sts_db()->query("SELECT personal_message FROM presence WHERE client_id='uuid-Y'")->fetch();
        $this->assertSame('Stop talking', $row['personal_message']);

        $stateRow = sts_db()->query('SELECT version FROM state WHERE id=1')->fetch();
        $this->assertSame(1, (int)$stateRow['version']);
    }

    public function test_message_student_truncates_at_200(): void
    {
        sts_db()->exec("INSERT INTO presence (client_id, last_seen, personal_message) VALUES ('uuid-Z', " . time() . ", '')");
        $long = str_repeat('x', 250);
        sts_invoke('teacher.php', 'POST', ['key' => self::KEY], [
            'action' => 'messageStudent', 'cid' => 'uuid-Z', 'text' => $long,
        ]);
        $row = sts_db()->query("SELECT personal_message FROM presence WHERE client_id='uuid-Z'")->fetch();
        $this->assertSame(200, mb_strlen($row['personal_message']));
    }

    public function test_message_student_empty_text_clears(): void
    {
        sts_db()->exec("INSERT INTO presence (client_id, last_seen, personal_message) VALUES ('uuid-W', " . time() . ", 'some old message')");
        sts_invoke('teacher.php', 'POST', ['key' => self::KEY], [
            'action' => 'messageStudent', 'cid' => 'uuid-W', 'text' => '',
        ]);
        $row = sts_db()->query("SELECT personal_message FROM presence WHERE client_id='uuid-W'")->fetch();
        $this->assertSame('', $row['personal_message']);
    }

    public function test_message_student_rejects_missing_cid(): void
    {
        [$status] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY], [
            'action' => 'messageStudent', 'text' => 'hello',
        ]);
        $this->assertSame(400, $status);
    }

    public function test_pause_student_sets_flag_and_bumps_version(): void
    {
        sts_db()->exec("INSERT INTO presence (client_id, last_seen, name, personal_message, personal_paused) VALUES ('uuid-PS', " . time() . ", 'Dave', '', 0)");
        [$status, , $json] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY], [
            'action' => 'pauseStudent', 'cid' => 'uuid-PS',
        ]);
        $this->assertSame(200, $status);
        $this->assertTrue($json['ok']);

        $row = sts_db()->query("SELECT personal_paused FROM presence WHERE client_id='uuid-PS'")->fetch();
        $this->assertSame(1, (int)$row['personal_paused']);

        $stateRow = sts_db()->query('SELECT version FROM state WHERE id=1')->fetch();
        $this->assertSame(1, (int)$stateRow['version']);
    }

    public function test_resume_student_clears_flag_and_bumps_version(): void
    {
        sts_db()->exec("INSERT INTO presence (client_id, last_seen, name, personal_message, personal_paused) VALUES ('uuid-RS', " . time() . ", 'Eve', '', 1)");
        sts_db()->exec('UPDATE state SET version=3 WHERE id=1');
        [$status, , $json] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY], [
            'action' => 'resumeStudent', 'cid' => 'uuid-RS',
        ]);
        $this->assertSame(200, $status);
        $this->assertTrue($json['ok']);

        $row = sts_db()->query("SELECT personal_paused FROM presence WHERE client_id='uuid-RS'")->fetch();
        $this->assertSame(0, (int)$row['personal_paused']);

        $stateRow = sts_db()->query('SELECT version FROM state WHERE id=1')->fetch();
        $this->assertSame(4, (int)$stateRow['version']);
    }

    public function test_pause_student_rejects_missing_cid(): void
    {
        [$status] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY], [
            'action' => 'pauseStudent',
        ]);
        $this->assertSame(400, $status);
    }

    public function test_resume_student_rejects_missing_cid(): void
    {
        [$status] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY], [
            'action' => 'resumeStudent',
        ]);
        $this->assertSame(400, $status);
    }

    public function test_rename_student_updates_name(): void
    {
        sts_db()->exec("INSERT INTO presence (client_id, last_seen, name) VALUES ('uuid-rn', " . time() . ", 'OldName')");
        [$status, , $json] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY], [
            'action' => 'renameStudent', 'cid' => 'uuid-rn', 'name' => 'NewName',
        ]);
        $this->assertSame(200, $status);
        $this->assertTrue($json['ok']);
        $row = sts_db()->query("SELECT name FROM presence WHERE client_id='uuid-rn'")->fetch();
        $this->assertSame('NewName', $row['name']);
        $stateRow = sts_db()->query('SELECT version FROM state WHERE id=1')->fetch();
        $this->assertSame(1, (int)$stateRow['version']);
    }

    public function test_rename_student_validates_name(): void
    {
        sts_db()->exec("INSERT INTO presence (client_id, last_seen, name) VALUES ('uuid-rnv', " . time() . ", 'Someone')");
        [$status] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY], [
            'action' => 'renameStudent', 'cid' => 'uuid-rnv', 'name' => '!!!invalid!!!',
        ]);
        $this->assertSame(400, $status);
    }

    public function test_rename_student_rejects_profanity(): void
    {
        sts_db()->exec("INSERT INTO presence (client_id, last_seen, name) VALUES ('uuid-rnp', " . time() . ", 'Good')");
        [$status] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY], [
            'action' => 'renameStudent', 'cid' => 'uuid-rnp', 'name' => 'asshole',
        ]);
        $this->assertSame(400, $status);
    }

    public function test_start_poll_sets_state(): void
    {
        [$status, , $json] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY], [
            'action'   => 'startPoll',
            'question' => 'Best color?',
            'options'  => ['Red', 'Blue', 'Green'],
        ]);
        $this->assertSame(200, $status);
        $this->assertTrue($json['ok']);
        $row = sts_db()->query('SELECT poll_id, poll_question, poll_options FROM state WHERE id=1')->fetch();
        $this->assertSame(1, (int)$row['poll_id']);
        $this->assertSame('Best color?', $row['poll_question']);
        $this->assertSame(['Red', 'Blue', 'Green'], json_decode($row['poll_options'], true));
    }

    public function test_start_poll_validates(): void
    {
        // Fewer than 2 options.
        [$status] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY], [
            'action'   => 'startPoll',
            'question' => 'Q?',
            'options'  => ['OnlyOne'],
        ]);
        $this->assertSame(400, $status);

        // Empty question.
        [$status] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY], [
            'action'   => 'startPoll',
            'question' => '',
            'options'  => ['A', 'B'],
        ]);
        $this->assertSame(400, $status);
    }

    public function test_end_poll_clears_state(): void
    {
        sts_db()->exec("UPDATE state SET poll_id=1, poll_question='Running poll', poll_options='[\"A\",\"B\"]' WHERE id=1");
        [$status] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY], ['action' => 'endPoll']);
        $this->assertSame(200, $status);
        $row = sts_db()->query('SELECT poll_question FROM state WHERE id=1')->fetch();
        $this->assertSame('', $row['poll_question']);
    }
}
