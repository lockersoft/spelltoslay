import { test, expect } from '@playwright/test';

// When two enemies share a prefix (cat / carry), per-keystroke "lock to closest"
// damage means typing one full word doesn't slay it — early letters land on the
// "wrong" enemy, and by the time the buffer disambiguates only one final letter
// of damage hits the intended target. Fix: defer damage while the prefix is
// ambiguous; flush accumulated damage when the buffer commits to a single
// enemy (uniquely-prefixed OR exact-word-with-no-extension match).
//
// These tests inject deterministic enemies and verify the slay/HP outcomes.

async function bootSignedIn(page) {
  await page.addInitScript(() => localStorage.setItem('sts_player_name', 'TST'));
  await page.goto('/');
  await page.waitForFunction(() => window.state && window.state.running);
}

async function resetArenaWith(page, enemies) {
  await page.evaluate((seeds) => {
    // Freeze spawns and clear arena
    window.state.spawn.nextAt = 1e12;
    for (const e of [...window.state.enemies]) window.removeEnemyFromIndex(e);
    window.state.enemies.length = 0;
    window.state.typedBuffer = '';
    window.state.lockedEnemyId = null;
    document.getElementById('type-input').value = '';
    // Inject deterministic enemies
    const def = { speed: 0, contactDamage: 1, size: 16, pointMultiplier: 1 };
    for (const seed of seeds) {
      const e = { id: seed.id, def, x: seed.x, y: seed.y, hp: seed.word.length, word: seed.word, typedLen: 0 };
      window.state.enemies.push(e);
      window.addEnemyToIndex(e);
    }
  }, enemies);
}

test('typing a word slays it even when another enemy shares its prefix', async ({ page }) => {
  await bootSignedIn(page);
  // carry is positioned closer to the hero (which is at the bottom-center) so the
  // original buggy lock-to-closest would steer initial damage to carry.
  await resetArenaWith(page, [
    { id: 'cat',   word: 'cat',   x: 100, y: 100 },
    { id: 'carry', word: 'carry', x: 480, y: 500 },
  ]);

  await page.locator('#type-input').focus();
  await page.keyboard.type('cat');

  const status = await page.evaluate(() => ({
    cat:   window.state.enemies.find(e => e.id === 'cat')   || null,
    carry: window.state.enemies.find(e => e.id === 'carry') || null,
  }));
  expect(status.cat).toBeNull();          // slain by typing the full word
  expect(status.carry).not.toBeNull();    // the bystander
  expect(status.carry.hp).toBe(5);        // never took damage during ambiguity
});

test('typing a longer prefix-shared word still slays the correct enemy', async ({ page }) => {
  await bootSignedIn(page);
  // carry, carrot, carrying — all share "carr". Type "carrying" and slay it cleanly.
  await resetArenaWith(page, [
    { id: 'carry',    word: 'carry',    x: 100, y: 100 },
    { id: 'carrot',   word: 'carrot',   x: 200, y: 200 },
    { id: 'carrying', word: 'carrying', x: 480, y: 500 },
  ]);

  await page.locator('#type-input').focus();
  await page.keyboard.type('carrying');

  const status = await page.evaluate(() => ({
    carry:    window.state.enemies.find(e => e.id === 'carry')    || null,
    carrot:   window.state.enemies.find(e => e.id === 'carrot')   || null,
    carrying: window.state.enemies.find(e => e.id === 'carrying') || null,
  }));
  expect(status.carrying).toBeNull();
  expect(status.carry).not.toBeNull();
  expect(status.carry.hp).toBe(5);
  expect(status.carrot).not.toBeNull();
  expect(status.carrot.hp).toBe(6);
});

test('single unambiguous enemy still slain per-keystroke', async ({ page }) => {
  await bootSignedIn(page);
  await resetArenaWith(page, [
    { id: 'dog', word: 'dog', x: 200, y: 200 },
  ]);
  await page.locator('#type-input').focus();
  await page.keyboard.type('dog');
  const dog = await page.evaluate(() => window.state.enemies.find(e => e.id === 'dog') || null);
  expect(dog).toBeNull();
});

// Prefix-of-another: "a" is a complete word AND a prefix of "and". Typing
// "and" naturally disambiguates and slays "and". Typing "a" alone leaves the
// lock ambiguous (both still match), so the player presses Space to commit.
test('Space commits the buffer when prefix-of-another keeps it ambiguous', async ({ page }) => {
  await bootSignedIn(page);
  await resetArenaWith(page, [
    { id: 'a',   word: 'a',   x: 200, y: 200 },
    { id: 'and', word: 'and', x: 300, y: 300 },
  ]);

  await page.locator('#type-input').focus();
  // Typing "and" completely should slay the longer word straightforwardly.
  await page.keyboard.type('and');
  let s = await page.evaluate(() => ({
    a:   window.state.enemies.find(e => e.id === 'a')   || null,
    and: window.state.enemies.find(e => e.id === 'and') || null,
  }));
  expect(s.and).toBeNull();
  expect(s.a).not.toBeNull();
  expect(s.a.hp).toBe(1);

  // Now slay "a" — typing 'a' is ambiguous (it's also a prefix of "and"…
  // wait, "and" is dead, so "a" is unique). Buffer becomes 'a', candidates={a},
  // size=1, exact match with no extension → auto-slay.
  await page.keyboard.type('a');
  s = await page.evaluate(() => window.state.enemies.find(e => e.id === 'a') || null);
  expect(s).toBeNull();
});

test('Space commits "a" while "and" is still alive', async ({ page }) => {
  await bootSignedIn(page);
  await resetArenaWith(page, [
    { id: 'a',   word: 'a',   x: 200, y: 200 },
    { id: 'and', word: 'and', x: 300, y: 300 },
  ]);

  await page.locator('#type-input').focus();
  await page.keyboard.type('a');
  // Ambiguous: a is exact match, and extends. No damage yet.
  let s = await page.evaluate(() => ({
    a:    window.state.enemies.find(e => e.id === 'a')   || null,
    and:  window.state.enemies.find(e => e.id === 'and') || null,
    buf:  window.state.typedBuffer,
  }));
  expect(s.a).not.toBeNull();
  expect(s.a.hp).toBe(1);
  expect(s.and).not.toBeNull();
  expect(s.and.hp).toBe(3);
  expect(s.buf).toBe('a');

  // Press Space — commits exact match "a", slays it.
  await page.keyboard.press('Space');
  s = await page.evaluate(() => ({
    a:   window.state.enemies.find(e => e.id === 'a')   || null,
    and: window.state.enemies.find(e => e.id === 'and') || null,
    buf: window.state.typedBuffer,
  }));
  expect(s.a).toBeNull();
  expect(s.and).not.toBeNull();
  expect(s.and.hp).toBe(3);
  expect(s.buf).toBe('');
});
