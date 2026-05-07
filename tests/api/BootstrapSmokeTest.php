<?php
declare(strict_types=1);

namespace Slay\Tests\Api;

use PHPUnit\Framework\TestCase;

class BootstrapSmokeTest extends TestCase
{
    public function test_bootstrap_opens_db_and_returns_pdo(): void
    {
        require_once __DIR__ . '/../../public/api/_bootstrap.php';

        $pdo = slay_db();
        $this->assertInstanceOf(\PDO::class, $pdo);

        // The state row from init_db must exist.
        $row = $pdo->query('SELECT * FROM state WHERE id = 1')->fetch(\PDO::FETCH_ASSOC);
        $this->assertNotFalse($row);
        $this->assertSame(0, (int)$row['paused']);
    }
}
