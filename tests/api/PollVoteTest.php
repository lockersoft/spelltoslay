<?php
declare(strict_types=1);

namespace Spelltoslay\Tests\Api;

use PHPUnit\Framework\TestCase;

class PollVoteTest extends TestCase
{
    protected function setUp(): void
    {
        sts_db()->exec('UPDATE state SET poll_id=0, poll_question="", poll_options="[]", version=0 WHERE id=1');
        sts_db()->exec('DELETE FROM poll_responses');
        sts_db()->exec('DELETE FROM presence');
    }

    private function seedPoll(): void
    {
        sts_db()->exec("UPDATE state SET poll_id=1, poll_question='Pick one:', poll_options='[\"Option A\",\"Option B\",\"Option C\"]' WHERE id=1");
    }

    public function test_vote_inserts_response(): void
    {
        $this->seedPoll();
        [$status, , $json] = sts_invoke('poll-vote.php', 'POST', [], [
            'cid' => 'uuid-voter3', 'pollId' => 1, 'optionIndex' => 0,
        ]);
        $this->assertSame(200, $status);
        $this->assertTrue($json['ok']);
        $row = sts_db()->query("SELECT option_index FROM poll_responses WHERE poll_id=1 AND client_id='uuid-voter3'")->fetch();
        $this->assertNotFalse($row);
        $this->assertSame(0, (int)$row['option_index']);
    }

    public function test_vote_replaces_existing(): void
    {
        $this->seedPoll();
        sts_invoke('poll-vote.php', 'POST', [], ['cid' => 'uuid-voter4', 'pollId' => 1, 'optionIndex' => 0]);
        sts_invoke('poll-vote.php', 'POST', [], ['cid' => 'uuid-voter4', 'pollId' => 1, 'optionIndex' => 2]);

        $rows = sts_db()->query("SELECT * FROM poll_responses WHERE poll_id=1 AND client_id='uuid-voter4'")->fetchAll();
        $this->assertCount(1, $rows);
        $this->assertSame(2, (int)$rows[0]['option_index']);
    }

    public function test_vote_rejects_wrong_poll_id(): void
    {
        $this->seedPoll();
        [$status] = sts_invoke('poll-vote.php', 'POST', [], [
            'cid' => 'uuid-voter5', 'pollId' => 999, 'optionIndex' => 0,
        ]);
        $this->assertSame(400, $status);
    }

    public function test_vote_rejects_invalid_option_index(): void
    {
        $this->seedPoll();
        // Out-of-range index (only 3 options: 0, 1, 2).
        [$status] = sts_invoke('poll-vote.php', 'POST', [], [
            'cid' => 'uuid-voter6', 'pollId' => 1, 'optionIndex' => 5,
        ]);
        $this->assertSame(400, $status);
    }
}
