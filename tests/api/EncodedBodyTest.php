<?php
declare(strict_types=1);

namespace Spelltoslay\Tests\Api;

use PHPUnit\Framework\TestCase;

class EncodedBodyTest extends TestCase
{
    private const KEY = 'test-teacher-key-xyz';

    private static function wrap(mixed $payload): string
    {
        $b64 = rtrim(strtr(base64_encode(json_encode($payload)), '+/', '-_'), '=');
        return json_encode(['z' => $b64]);
    }

    protected function setUp(): void
    {
        sts_db()->exec('DELETE FROM teacher_word_list');
        sts_db()->exec("UPDATE state SET message='' WHERE id=1");
    }

    public function test_encoded_word_list_arrives_intact(): void
    {
        // Pasted from a word processor: CRLF endings, trailing blank line,
        // and adjacent words that read as SQL to a WAF.
        $text = "union\r\nselect\r\ndrop\r\ntable\r\n\r\n";
        [$status] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY],
            self::wrap(['action' => 'setWordList', 'text' => $text]));
        $this->assertSame(200, $status);
        $words = array_column(
            sts_db()->query('SELECT word FROM teacher_word_list ORDER BY position')->fetchAll(), 'word');
        $this->assertSame(['union', 'select', 'drop', 'table'], $words);
    }

    public function test_encoded_message_keeps_unicode(): void
    {
        $msg = "Eyes up — ¡vamos! 🙂 'quotes' \"too\"";
        sts_invoke('teacher.php', 'POST', ['key' => self::KEY],
            self::wrap(['action' => 'message', 'text' => $msg]));
        $this->assertSame($msg, sts_db()->query('SELECT message FROM state WHERE id=1')->fetch()['message']);
    }

    public function test_plain_json_body_still_works(): void
    {
        [$status] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY],
            ['action' => 'message', 'text' => 'plain']);
        $this->assertSame(200, $status);
    }

    public function test_garbage_z_is_an_empty_payload(): void
    {
        [$status, , $json] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY],
            json_encode(['z' => '!!!not base64!!!']));
        $this->assertSame(400, $status);
        $this->assertSame('unknown action', $json['error']);
    }

    public function test_wrapped_json_array_is_an_empty_payload(): void
    {
        [$status, , $json] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY], self::wrap(['x']));
        $this->assertSame(400, $status);
        $this->assertSame('unknown action', $json['error']);
    }

    public function test_z_alongside_other_keys_is_not_unwrapped(): void
    {
        [$status] = sts_invoke('teacher.php', 'POST', ['key' => self::KEY],
            json_encode(['action' => 'message', 'text' => 'kept', 'z' => 'x']));
        $this->assertSame(200, $status);
        $this->assertSame('kept', sts_db()->query('SELECT message FROM state WHERE id=1')->fetch()['message']);
    }
}
