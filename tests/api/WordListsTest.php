<?php
declare(strict_types=1);

namespace Spelltoslay\Tests\Api;

use PHPUnit\Framework\TestCase;

final class WordListsTest extends TestCase
{
    private const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8'];

    public function testEveryGradeFileExists(): void
    {
        foreach (self::GRADES as $g) {
            $path = __DIR__ . "/../../public/words/grade-$g.json";
            $this->assertFileExists($path, "missing grade-$g.json");
        }
    }

    public function testEveryGradeFileHasRequiredShape(): void
    {
        foreach (self::GRADES as $g) {
            $path = __DIR__ . "/../../public/words/grade-$g.json";
            $data = json_decode((string)file_get_contents($path), true);
            $this->assertIsArray($data, "grade-$g.json is not valid JSON");
            $this->assertArrayHasKey('grade',   $data, "grade-$g missing 'grade'");
            $this->assertArrayHasKey('version', $data, "grade-$g missing 'version'");
            $this->assertArrayHasKey('easy',    $data, "grade-$g missing 'easy'");
            $this->assertArrayHasKey('medium',  $data, "grade-$g missing 'medium'");
            $this->assertArrayHasKey('hard',    $data, "grade-$g missing 'hard'");

            // Field-value sanity
            $this->assertSame((string)$g, (string)$data['grade'], "grade-$g.json has wrong 'grade' field");
            $this->assertIsInt($data['version'], "grade-$g.json 'version' must be int");
            $this->assertGreaterThanOrEqual(1, $data['version'], "grade-$g.json 'version' must be ≥1");

            foreach (['easy', 'medium', 'hard'] as $bucket) {
                $this->assertIsArray($data[$bucket], "grade-$g $bucket is not an array");
                $this->assertGreaterThanOrEqual(20, count($data[$bucket]),
                    "grade-$g $bucket needs at least 20 words");
                foreach ($data[$bucket] as $w) {
                    $this->assertIsString($w);
                    $this->assertMatchesRegularExpression('/^[a-z]+$/', $w,
                        "grade-$g $bucket contains non-lowercase-letter word: $w");
                }
                // Uniqueness — each word should appear at most once per bucket.
                $this->assertSame(
                    count($data[$bucket]),
                    count(array_unique($data[$bucket])),
                    "grade-$g $bucket contains duplicate words: " . implode(', ', array_keys(array_filter(array_count_values($data[$bucket]), fn($c) => $c > 1)))
                );
            }
        }
    }

    public function testBucketingRulesHold(): void
    {
        foreach (self::GRADES as $g) {
            $path = __DIR__ . "/../../public/words/grade-$g.json";
            $data = json_decode((string)file_get_contents($path), true);
            // Soft easy bound: easy words should be short (≤6 letters). Curated
            // lists may include 6-letter words like "banish" in the easy bucket.
            foreach ($data['easy'] as $w) {
                $this->assertLessThanOrEqual(6, strlen($w),
                    "easy bucket grade-$g: '$w' too long for the easy bucket");
            }
            // No length constraint on `hard` — the bucket is for hard-to-spell
            // words, not necessarily long ones (e.g., "rhythm", "weird", "seize").
            // The minimum-count check in testEveryGradeFileHasRequiredShape covers
            // that hard isn't empty.
        }
    }
}
