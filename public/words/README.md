# SpellToSlay built-in word lists

Lightweight, hand-curated grade-level word pools, one JSON file per grade
(K through 8). Each file has three difficulty buckets:

- `easy`   — short common words (≤ 6 letters).
- `medium` — moderately common words, typically 6–10 letters.
- `hard`   — tricky-to-spell words; length is not bounded (e.g. "rhythm", "seize").

The day-one lists were compiled from a mix of public-domain sources
(Dolch sight-word list for K–3, frequency-banded common-English vocabulary
for 4–8). They are starting points, not a curriculum — teachers paste
their weekly lists in the teacher panel to override at runtime.

To add a word, edit the JSON file and bump the `version` field. The
`tests/api/WordListsTest.php` suite enforces the bucketing rules and a
minimum 20-word floor per bucket.

## Bucketing rule

If you're adding words by hand and unsure where they go:

- **easy:** short, common words. Length ≤ 6 letters (rule of thumb).
- **medium:** moderately common words, typically 6–10 letters.
- **hard:** tricky-to-spell words. Length is not bounded — short tricky
  words like "rhythm", "weird", or "seize" belong here.

The test (`tests/api/WordListsTest.php`) enforces only the easy ≤6 bound
and a minimum 20 words per bucket. The medium/hard split is judgment-
based; pick what feels right for the grade level.
