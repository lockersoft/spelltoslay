// Shared helpers for e2e specs. The game exposes its internals on window
// only on localhost (see the test hooks in the game's entry script).
export async function boot(page, name = 'TST') {
  await page.addInitScript((n) => localStorage.setItem('sts_player_name', n), name);
  await page.goto('/');
  await page.waitForFunction(() => window.state && window.state.running);
}

// Freeze the spawner, clear the arena, inject deterministic stationary enemies.
export async function seedEnemies(page, seeds) {
  await page.evaluate((list) => {
    window.state.spawn.nextAt = 1e12;
    for (const e of [...window.state.enemies]) window.removeEnemyFromIndex(e);
    window.state.enemies.length = 0;
    window.state.typedBuffer = '';
    window.state.lockedEnemyId = null;
    document.getElementById('type-input').value = '';
    const def = { speed: 0, contactDamage: 1, size: 16, pointMultiplier: 1 };
    for (const s of list) {
      const e = { id: s.id, def, x: s.x, y: s.y, hp: s.word.length, word: s.word };
      window.state.enemies.push(e);
      window.addEnemyToIndex(e);
    }
  }, seeds);
}

export async function teacher(request, payload) {
  const r = await request.post('/api/teacher.php', {
    data: payload, headers: { 'X-Teacher-Key': 'e2e-key' },
  });
  if (!r.ok()) throw new Error(`teacher action failed: ${r.status()}`);
  return r.json();
}
