<?php
declare(strict_types=1);

namespace Spelltoslay\Tests\Api;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class ProfanityTest extends TestCase
{
    public static function blocked(): array
    {
        return [['shit'], ['Shithead'], ['xfuckx'], ['sh1t'], ['f u c k'], ['FUCK'],
                ['ass'], ['big ass'], ['dick'], ['Damn'], ['a55'], ['bitch1'], ['asshole']];
    }

    public static function allowed(): array
    {
        return [['Dickens'], ['Cassie'], ['Hancock'], ['Amsterdam'], ['Ava'], ['Player 1'],
                ['Bass'], ['Dickson'], ['Class 5'], ['Matthew'], ['Grass Hopper']];
    }

    #[DataProvider('blocked')]
    public function test_blocks(string $name): void
    {
        $this->assertTrue(sts_is_profane($name), $name);
        $this->assertSame('name not allowed', sts_name_error($name));
    }

    #[DataProvider('allowed')]
    public function test_allows(string $name): void
    {
        $this->assertFalse(sts_is_profane($name), $name);
        $this->assertNull(sts_name_error($name));
    }

    public function test_name_error_shape_rules(): void
    {
        $shape = 'name must be 1–16 letters, numbers, or spaces';
        $this->assertSame($shape, sts_name_error(''));
        $this->assertSame($shape, sts_name_error(str_repeat('x', 17)));
        $this->assertSame($shape, sts_name_error('A<b>'));
    }
}
