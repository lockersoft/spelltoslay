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
        $GLOBALS['__STS_CONFIG']['hub_teacher_ids'] = [7];
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
        $t0 = time();
        [$s1, , $short] = $this->init(self::jwt(['exp' => $t0 + 120]));
        [$s2, , $long]  = $this->init(self::jwt(['exp' => $t0 + 30 * 86400, 'jti' => 'long-one']));
        $this->assertSame([200, 200], [$s1, $s2]);

        $shortExp = (int)explode('.', $short['session'])[1];
        $this->assertSame($t0 + 120, $shortExp);
        $this->assertSame($shortExp, $short['expiresAt']);

        $longExp = (int)explode('.', $long['session'])[1];
        $this->assertGreaterThanOrEqual($t0 + 12 * 3600, $longExp);
        $this->assertLessThanOrEqual(time() + 12 * 3600, $longExp);
        $this->assertSame($longExp, $long['expiresAt']);

        // Both are real, working tickets.
        foreach ([$short, $long] as $j) {
            [$status] = sts_invoke('players.php', 'GET', [], null, ['X-Teacher-Session' => $j['session']]);
            $this->assertSame(200, $status);
        }
    }

    public function test_a_genuine_token_from_an_unlisted_hub_teacher_is_refused(): void
    {
        [$status, , $json] = $this->init(self::jwt(['teacher' => ['id' => 8, 'name' => 'Someone Else']]));
        $this->assertSame(403, $status);
        $this->assertSame('hub account not allowed', $json['error']);
        $this->assertSame(8, $json['teacherId']);
        $this->assertArrayNotHasKey('session', $json);
    }

    public static function unlistedTeacherShapes(): array
    {
        return [
            'string id that looks listed' => [['id' => '7', 'name' => 'x']],
            'fractional id'               => [['id' => 7.5, 'name' => 'x']],
            'boolean id'                  => [['id' => true, 'name' => 'x']],
            'no id'                       => [['name' => 'x']],
            'teacher not an object'       => ['7'],
            'no teacher'                  => [null],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('unlistedTeacherShapes')]
    public function test_teacher_id_must_be_a_listed_integer(mixed $teacher): void
    {
        [$status, , $json] = $this->init(self::jwt(['teacher' => $teacher]));
        $this->assertSame(403, $status);
        $this->assertArrayNotHasKey('session', $json);
    }

    public function test_an_empty_or_malformed_allow_list_allows_nobody(): void
    {
        foreach ([[], null, 'all', [true], ['7']] as $list) {
            $GLOBALS['__STS_CONFIG']['hub_teacher_ids'] = $list;
            [$status] = $this->init(self::jwt());
            $this->assertSame(403, $status, var_export($list, true));
        }
    }

    public function test_key_login_still_works(): void
    {
        [$status] = sts_invoke('players.php', 'GET', [], null, ['X-Teacher-Key' => 'test-teacher-key-xyz']);
        $this->assertSame(200, $status);
    }

    // ── Word list carried by the launch ────────────────────────────────────

    private function resetWordState(): void
    {
        sts_db()->exec('DELETE FROM teacher_word_list');
        sts_db()->exec("UPDATE state SET word_source='builtin:6', grade_level=6, hub_launch_jti='' WHERE id=1");
    }

    private function wordState(): array
    {
        $row = sts_db()->query('SELECT word_source, word_list_version FROM state WHERE id=1')->fetch();
        $words = array_column(sts_db()->query('SELECT word FROM teacher_word_list ORDER BY position')->fetchAll(), 'word');
        return [$row['word_source'], (int)$row['word_list_version'], $words];
    }

    public function test_launch_applies_the_class_word_list(): void
    {
        $this->resetWordState();
        [, $v0] = $this->wordState();
        [$status, , $json] = $this->init(self::jwt([
            'jti' => 'wl-1', 'wordlist' => ['id' => 88, 'name' => 'Grade 4 Unit 2', 'words' => ['because', 'Friend', ' thought ']],
        ]));
        $this->assertSame(200, $status);
        $this->assertSame(['status' => 'applied', 'name' => 'Grade 4 Unit 2', 'applied' => 3, 'skipped' => 0], $json['wordlist']);
        [$source, $v1, $words] = $this->wordState();
        $this->assertSame('teacher', $source);
        $this->assertSame(['because', 'friend', 'thought'], $words);   // lower-cased, trimmed, in order
        $this->assertGreaterThan($v0, $v1);                             // clients refetch

        // The game serves it to players.
        [, , $served] = sts_invoke('words.php', 'GET');
        $this->assertSame(['because', 'friend', 'thought'], $served['words']);
    }

    public function test_unusable_words_are_skipped_and_counted(): void
    {
        $this->resetWordState();
        [, , $json] = $this->init(self::jwt([
            'jti' => 'wl-2',
            'wordlist' => ['id' => 1, 'name' => 'Mixed', 'words' => ['cat', "don't", 'ice-cream', 'two words', '', 42, null, ['x'], str_repeat('a', 33), 'dog']],
        ]));
        $this->assertSame('applied', $json['wordlist']['status']);
        $this->assertSame(2, $json['wordlist']['applied']);
        $this->assertSame(8, $json['wordlist']['skipped']);
        $this->assertSame(['cat', 'dog'], $this->wordState()[2]);
    }

    public function test_reopening_the_same_launch_link_does_not_reapply_the_list(): void
    {
        $this->resetWordState();
        $token = self::jwt(['jti' => 'wl-3', 'wordlist' => ['id' => 1, 'name' => 'L', 'words' => ['cat', 'dog']]]);
        $this->init($token);
        // The teacher then switches back to the built-in list in the panel...
        sts_invoke('teacher.php', 'POST', ['key' => 'test-teacher-key-xyz'], ['action' => 'clearWordList']);
        [, $vBefore] = $this->wordState();
        // ...and reopens the same link (closed tab, second device).
        [$status, , $json] = $this->init($token);
        $this->assertSame(200, $status);
        $this->assertIsString($json['session']);
        $this->assertSame('already', $json['wordlist']['status']);
        [$source, $vAfter, $words] = $this->wordState();
        $this->assertSame('builtin:6', $source);
        $this->assertSame([], $words);
        $this->assertSame($vBefore, $vAfter);

        // A fresh launch from the hub does apply again.
        [, , $again] = $this->init(self::jwt(['jti' => 'wl-4', 'wordlist' => ['id' => 1, 'name' => 'L', 'words' => ['sun']]]));
        $this->assertSame('applied', $again['wordlist']['status']);
        $this->assertSame(['sun'], $this->wordState()[2]);
    }

    public function test_launch_without_a_word_list_leaves_the_game_alone(): void
    {
        $this->resetWordState();
        sts_invoke('teacher.php', 'POST', ['key' => 'test-teacher-key-xyz'], ['action' => 'setWordList', 'text' => "mine\nown"]);
        $before = $this->wordState();
        [$status, , $json] = $this->init(self::jwt(['jti' => 'wl-5']));
        $this->assertSame(200, $status);
        $this->assertSame('none', $json['wordlist']['status']);
        $this->assertSame($before, $this->wordState());
    }

    public static function emptyWordLists(): array
    {
        return [
            'no usable words' => [['id' => 1, 'name' => 'Bad', 'words' => ["it's", '123', '']]],
            'empty array'     => [['id' => 1, 'name' => 'Empty', 'words' => []]],
            'words not array' => [['id' => 1, 'name' => 'Odd', 'words' => 'cat,dog']],
            'wordlist string' => ['cat'],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('emptyWordLists')]
    public function test_a_list_with_nothing_usable_changes_nothing_but_still_logs_in(mixed $wordlist): void
    {
        $this->resetWordState();
        $before = $this->wordState();
        [$status, , $json] = $this->init(self::jwt(['jti' => 'wl-' . md5(json_encode($wordlist)), 'wordlist' => $wordlist]));
        $this->assertSame(200, $status);
        $this->assertIsString($json['session']);
        $this->assertContains($json['wordlist']['status'], ['empty', 'none']);
        $this->assertSame($before, $this->wordState());
    }

    public function test_list_is_capped_at_500_words(): void
    {
        $this->resetWordState();
        $alpha = fn (int $i) => 'w' . strtr(str_pad(base_convert((string)$i, 10, 26), 3, '0', STR_PAD_LEFT), '0123456789', 'qrstuvwxyz');
        $words = array_map($alpha, range(0, 599));
        [, , $json] = $this->init(self::jwt(['jti' => 'wl-cap', 'wordlist' => ['id' => 1, 'name' => 'Big', 'words' => $words]]));
        $this->assertSame(500, $json['wordlist']['applied']);
        $this->assertSame(100, $json['wordlist']['skipped']);
        $this->assertCount(500, $this->wordState()[2]);
    }

    public function test_a_refused_launch_never_touches_the_word_list(): void
    {
        $this->resetWordState();
        $before = $this->wordState();
        $wl = ['id' => 1, 'name' => 'L', 'words' => ['cat', 'dog']];
        $this->init(self::jwt(['jti' => 'wl-x1', 'wordlist' => $wl, 'teacher' => ['id' => 8, 'name' => 'Other']]));
        $this->init(self::jwt(['jti' => 'wl-x2', 'wordlist' => $wl], 'another-secret-0123456789abcdef'));
        $this->init(self::jwt(['jti' => 'wl-x3', 'wordlist' => $wl, 'exp' => time() - 1]));
        $this->assertSame($before, $this->wordState());
    }

    public function test_pasted_list_in_the_panel_still_works_after_the_refactor(): void
    {
        $this->resetWordState();
        [$status] = sts_invoke('teacher.php', 'POST', ['key' => 'test-teacher-key-xyz'],
            ['action' => 'setWordList', 'text' => "Alpha\r\nbeta\n\nnot ok\ngamma"]);
        $this->assertSame(200, $status);
        $this->assertSame(['alpha', 'beta', 'gamma'], $this->wordState()[2]);
        [$empty, , $json] = sts_invoke('teacher.php', 'POST', ['key' => 'test-teacher-key-xyz'],
            ['action' => 'setWordList', 'text' => "123\n!!"]);
        $this->assertSame(400, $empty);
        $this->assertStringContainsString('no usable words', $json['error']);
    }
}
