<?php
declare(strict_types=1);

namespace Spelltoslay\Tests\Api;

use PHPUnit\Framework\TestCase;

class BootstrapSmokeTest extends TestCase
{
    public function test_bootstrap_opens_db_and_returns_pdo(): void
    {
        require_once __DIR__ . '/../../public/api/_bootstrap.php';

        $pdo = sts_db();
        $this->assertInstanceOf(\PDO::class, $pdo);

        // The state row from init_db must exist.
        $row = $pdo->query('SELECT * FROM state WHERE id = 1')->fetch(\PDO::FETCH_ASSOC);
        $this->assertNotFalse($row);
        $this->assertSame(0, (int)$row['paused']);
    }

    public function testScoresTableHasNewColumns(): void
    {
        $cols = array_column(
            sts_db()->query("PRAGMA table_info(scores)")->fetchAll(),
            'name'
        );
        $this->assertContains('wpm',         $cols);
        $this->assertContains('accuracy',    $cols);
        $this->assertContains('words_slain', $cols);
    }

    public function testStateTableHasNewColumns(): void
    {
        $cols = array_column(
            sts_db()->query("PRAGMA table_info(state)")->fetchAll(),
            'name'
        );
        $this->assertContains('word_source',        $cols);
        $this->assertContains('grade_level',        $cols);
        $this->assertContains('word_list_version',  $cols);
        $this->assertContains('push_word',          $cols);
        $this->assertContains('push_word_set_at',   $cols);
    }

    public function testTeacherWordListTableExists(): void
    {
        $row = sts_db()->query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='teacher_word_list'"
        )->fetch();
        $this->assertNotFalse($row);
        $cols = array_column(
            sts_db()->query("PRAGMA table_info(teacher_word_list)")->fetchAll(),
            'name'
        );
        $this->assertContains('word',     $cols);
        $this->assertContains('position', $cols);
        $this->assertContains('set_at',   $cols);
    }
}
