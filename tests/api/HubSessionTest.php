<?php
declare(strict_types=1);

namespace Spelltoslay\Tests\Api;

use PHPUnit\Framework\TestCase;

class HubSessionTest extends TestCase
{
    private const SECRET = 'test-hub-secret-0123456789abcdef';

    private static function b64(string $s): string
    {
        return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    }

    /** Mint a token the way the hub's LaunchTokenIssuer does (HS256 JWT). */
    private static function jwt(array $overrides = [], string $secret = self::SECRET, array $header = ['typ' => 'JWT', 'alg' => 'HS256']): string
    {
        $payload = array_merge([
            'iss' => 'hub', 'sub' => 'class:42', 'iat' => time(), 'exp' => time() + 3600,
            'jti' => '3f0c2c1e-9a53-4c0e-8a0b-6a1f0d2b7e11', 'game' => 'spelltoslay',
            'teacher' => ['id' => 7, 'name' => 'Mrs Smith'],
            'class' => ['id' => 42, 'name' => 'Period 3', 'grade_level' => 4, 'join_code' => 'ABC4'],
            'students' => [['id' => 101, 'name' => 'Maya C']],
            'hub_callback' => 'https://lockersoft.games/api/v1',
        ], $overrides);
        $payload = array_filter($payload, fn ($v) => $v !== null);
        $head = self::b64(json_encode($header)) . '.' . self::b64(json_encode($payload));
        return $head . '.' . self::b64(hash_hmac('sha256', $head, $secret, true));
    }

    private function init(string $token): array
    {
        return sts_invoke('session-init.php', 'POST', [], ['token' => $token]);
    }

    protected function tearDown(): void
    {
        unset($_SERVER['HTTP_X_TEACHER_SESSION'], $_SERVER['HTTP_X_TEACHER_KEY']);
        $GLOBALS['__STS_CONFIG']['hub_secret'] = self::SECRET;
    }

    public function test_valid_launch_token_returns_a_session_ticket(): void
    {
        [$status, , $json] = $this->init(self::jwt());
        $this->assertSame(200, $status);
        $this->assertIsString($json['session']);
        $this->assertLessThan(200, strlen($json['session']));   // small enough for a header
        $this->assertSame('Mrs Smith', $json['teacher']);
        $this->assertSame('Period 3', $json['class']);
        $this->assertStringNotContainsString(self::SECRET, json_encode($json));
    }

    public function test_ticket_opens_every_teacher_endpoint(): void
    {
        [, , $json] = $this->init(self::jwt());
        $h = ['X-Teacher-Session' => $json['session']];
        [$a] = sts_invoke('teacher.php', 'POST', [], ['action' => 'resume'], $h);
        [$b] = sts_invoke('players.php', 'GET', [], null, $h);
        [$c] = sts_invoke('contributors.php', 'GET', [], null, $h);
        $this->assertSame([200, 200, 200], [$a, $b, $c]);
    }

    public function test_a_launch_token_with_a_long_word_list_still_yields_a_short_ticket(): void
    {
        $words = array_map(fn ($i) => 'word' . str_repeat('x', $i % 20), range(1, 500));
        [$status, , $json] = $this->init(self::jwt(['wordlist' => ['id' => 1, 'name' => 'Big', 'words' => $words]]));
        $this->assertSame(200, $status);
        $this->assertLessThan(200, strlen($json['session']));
    }

    public static function badTokens(): array
    {
        return [
            'wrong secret'      => [self::jwt([], 'another-secret-0123456789abcdef')],
            'alg none'          => [self::b64('{"typ":"JWT","alg":"none"}') . '.' . self::b64(json_encode(['iss' => 'hub', 'game' => 'spelltoslay', 'exp' => time() + 99, 'jti' => 'a'])) . '.'],
            'alg HS512 header'  => [self::jwt([], self::SECRET, ['typ' => 'JWT', 'alg' => 'HS512'])],
            'expired'           => [self::jwt(['exp' => time() - 1])],
            'no exp'            => [self::jwt(['exp' => null])],
            'string exp'        => [self::jwt(['exp' => (string)(time() + 3600)])],
            'other game'        => [self::jwt(['game' => 'slay'])],
            'wrong issuer'      => [self::jwt(['iss' => 'someone'])],
            'no jti'            => [self::jwt(['jti' => null])],
            'odd jti'           => [self::jwt(['jti' => "a.b\nc"])],
            'two parts'         => ['abc.def'],
            'empty'             => [''],
            'garbage'           => ['not a token at all'],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('badTokens')]
    public function test_bad_launch_tokens_are_refused(string $token): void
    {
        [$status, , $json] = $this->init($token);
        $this->assertSame(403, $status);
        $this->assertArrayNotHasKey('session', $json);
    }

    public function test_tampered_payload_is_refused(): void
    {
        [$h, $p, $s] = explode('.', self::jwt(['exp' => time() + 60]));
        $forged = json_decode(base64_decode(strtr($p, '-_', '+/')), true);
        $forged['exp'] = time() + 999999;
        [$status] = $this->init($h . '.' . self::b64(json_encode($forged)) . '.' . $s);
        $this->assertSame(403, $status);
    }

    public function test_non_string_token_and_wrong_method_are_refused(): void
    {
        [$a] = sts_invoke('session-init.php', 'POST', [], ['token' => ['x']]);
        [$b] = sts_invoke('session-init.php', 'POST', [], []);
        [$c] = sts_invoke('session-init.php', 'GET');
        $this->assertSame([403, 403, 405], [$a, $b, $c]);
    }

    public function test_hub_launch_is_off_when_no_secret_is_configured(): void
    {
        foreach ([null, '', 'short'] as $secret) {
            $GLOBALS['__STS_CONFIG']['hub_secret'] = $secret;
            // A token signed with that same (missing/weak) secret must not work.
            [$status] = $this->init(self::jwt([], (string)$secret));
            $this->assertSame(403, $status, var_export($secret, true));
        }
    }

    public function test_ticket_is_refused_when_altered_expired_or_secret_removed(): void
    {
        [, , $json] = $this->init(self::jwt());
        $ticket = $json['session'];
        $parts = explode('.', $ticket);

        // Extend the expiry without re-signing.
        $longer = $parts; $longer[1] = (string)((int)$parts[1] + 86400);
        [$a] = sts_invoke('players.php', 'GET', [], null, ['X-Teacher-Session' => implode('.', $longer)]);
        // A ticket that was honestly issued but has run out.
        $expired = sts_teacher_ticket(time() - 5, 'abc');
        [$b] = sts_invoke('players.php', 'GET', [], null, ['X-Teacher-Session' => $expired]);
        // Garbage, and empty.
        [$c] = sts_invoke('players.php', 'GET', [], null, ['X-Teacher-Session' => 'v1.x.y.z']);
        [$d] = sts_invoke('players.php', 'GET', [], null, ['X-Teacher-Session' => '']);
        // Secret removed from config after issue.
        $GLOBALS['__STS_CONFIG']['hub_secret'] = null;
        [$e] = sts_invoke('players.php', 'GET', [], null, ['X-Teacher-Session' => $ticket]);
        $this->assertSame([403, 403, 403, 403, 403], [$a, $b, $c, $d, $e]);
    }

    public function test_a_bad_ticket_is_not_rescued_by_a_good_key(): void
    {
        [$status] = sts_invoke('players.php', 'GET', ['key' => 'test-teacher-key-xyz'], null,
            ['X-Teacher-Session' => 'v1.1.a.b', 'X-Teacher-Key' => 'test-teacher-key-xyz']);
        $this->assertSame(403, $status);
    }

    public function test_ticket_never_outlives_the_launch_token_or_twelve_hours(): void
    {
        [, , $short] = $this->init(self::jwt(['exp' => time() + 120]));
        $this->assertLessThanOrEqual(time() + 120, (int)explode('.', $short['session'])[1]);
        [, , $long] = $this->init(self::jwt(['exp' => time() + 30 * 86400, 'jti' => 'long-one']));
        $this->assertLessThanOrEqual(time() + 12 * 3600, (int)explode('.', $long['session'])[1]);
    }

    public function test_key_login_still_works(): void
    {
        [$status] = sts_invoke('players.php', 'GET', [], null, ['X-Teacher-Key' => 'test-teacher-key-xyz']);
        $this->assertSame(200, $status);
    }
}
