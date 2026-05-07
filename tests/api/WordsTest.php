<?php
declare(strict_types=1);

namespace Spelltoslay\Tests\Api;

use PHPUnit\Framework\TestCase;

final class WordsTest extends TestCase
{
    protected function setUp(): void
    {
        sts_db()->exec('DELETE FROM teacher_word_list');
        sts_db()->exec("UPDATE state SET word_source='builtin:6', grade_level=6, word_list_version=0, push_word=''");
    }

    public function testBuiltinSourceReturnsGradeJson(): void
    {
        [$status, , $json] = sts_invoke('words.php', 'GET', ['source' => 'builtin:3']);
        $this->assertSame(200, $status);
        $this->assertSame('builtin:3', $json['source']);
        $this->assertIsArray($json['words']);
        $this->assertNotEmpty($json['words']);
        // The shape is a flat array of words — easy/medium/hard merged.
        foreach ($json['words'] as $w) {
            $this->assertIsString($w);
        }
    }

    public function testInvalidGradeReturns400(): void
    {
        [$status, , $json] = sts_invoke('words.php', 'GET', ['source' => 'builtin:99']);
        $this->assertSame(400, $status);
        $this->assertArrayHasKey('error', $json);
    }

    public function testMalformedSourceReturns400(): void
    {
        [$status] = sts_invoke('words.php', 'GET', ['source' => 'banana']);
        $this->assertSame(400, $status);
    }

    public function testTeacherSourceReturnsTeacherWords(): void
    {
        sts_db()->exec("INSERT INTO teacher_word_list (word, position, set_at) VALUES ('foo',0,1),('bar',1,1),('baz',2,1)");
        [$status, , $json] = sts_invoke('words.php', 'GET', ['source' => 'teacher']);
        $this->assertSame(200, $status);
        $this->assertSame('teacher', $json['source']);
        $this->assertSame(['foo','bar','baz'], $json['words']);
    }

    public function testNoParamFallsBackToActiveSource(): void
    {
        sts_db()->exec("UPDATE state SET word_source='builtin:1', word_list_version=5");
        [$status, , $json] = sts_invoke('words.php', 'GET');
        $this->assertSame(200, $status);
        $this->assertSame('builtin:1', $json['source']);
        $this->assertSame(5, $json['version']);
        $this->assertNotEmpty($json['words']);
    }
}
