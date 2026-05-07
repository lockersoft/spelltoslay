<?php
declare(strict_types=1);

namespace Spelltoslay\Tests\Api;

use PHPUnit\Framework\TestCase;

class RenameTest extends TestCase
{
    protected function setUp(): void
    {
        sts_db()->exec('UPDATE state SET version=0 WHERE id=1');
        sts_db()->exec('DELETE FROM presence');
    }

    public function test_player_rename_updates_name_directly(): void
    {
        $now = time();
        sts_db()->exec("INSERT INTO presence (client_id, last_seen, name) VALUES ('uuid-pren', {$now}, 'OldName')");

        [$status, , $json] = sts_invoke('rename.php', 'POST', [], ['cid' => 'uuid-pren', 'name' => 'NewName']);
        $this->assertSame(200, $status);
        $this->assertTrue($json['ok']);
        $this->assertSame('NewName', $json['name']);

        $row = sts_db()->query("SELECT name FROM presence WHERE client_id='uuid-pren'")->fetch();
        $this->assertSame('NewName', $row['name']);
    }

    public function test_rename_rejects_invalid_name(): void
    {
        $now = time();
        sts_db()->exec("INSERT INTO presence (client_id, last_seen, name) VALUES ('uuid-prenbad', {$now}, 'SomeName')");

        [$status] = sts_invoke('rename.php', 'POST', [], ['cid' => 'uuid-prenbad', 'name' => '!@#$%']);
        $this->assertSame(400, $status);
    }

    public function test_rename_rejects_profanity(): void
    {
        $now = time();
        sts_db()->exec("INSERT INTO presence (client_id, last_seen, name) VALUES ('uuid-prenprof', {$now}, 'Clean')");

        [$status] = sts_invoke('rename.php', 'POST', [], ['cid' => 'uuid-prenprof', 'name' => 'shitname']);
        $this->assertSame(400, $status);
    }
}
