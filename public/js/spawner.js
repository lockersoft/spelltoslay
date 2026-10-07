import { ARENA, HERO, ENEMIES, WAVE_DURATION_S, BOSS_WAVE_INTERVAL } from './constants.js';
import { state } from './state.js';
import { pickWordFor, addEnemyToIndex, removeEnemyFromIndex } from './words.js';
import { dropOrphanedBuffer } from './typing.js';

export function updateSpawner(dt) {
  const sp = state.spawn;
  // Time-since-last-wave-start drives wave advancement.
  if (state.time - sp.waveStartedAt >= WAVE_DURATION_S) {
    sp.wave += 1;
    sp.waveStartedAt = state.time;
    // On boss-wave starts, drop a single hard-pool enemy as the wave's herald.
    if (sp.wave % BOSS_WAVE_INTERVAL === 0) {
      const bossDef = ENEMIES.find(e => e.difficultyClass === 'hard');
      if (bossDef) spawnOne(bossDef);
    }
  }

  // Spawn cadence ramps with wave: every (max(1.5, 4 - wave*0.2)) seconds.
  const interval = Math.max(1.5, 4 - sp.wave * 0.2);
  if (state.time >= sp.nextAt) {
    sp.nextAt = state.time + interval;
    // Pick an enemy: early waves favor easy, later mix in medium then hard.
    const candidates = ENEMIES.filter(e => {
      if (sp.wave < 2) return e.difficultyClass === 'easy';
      if (sp.wave < 4) return e.difficultyClass !== 'hard';
      return true;
    });
    const def = candidates[(Math.random() * candidates.length) | 0];
    spawnOne(def);
  }
}

let nextEnemyId = 1;
export function spawnOne(def) {
  const word = pickWordFor(def);
  const e = {
    id:       'e' + (nextEnemyId++),
    def,
    x:        20 + Math.random() * (ARENA.w - 40),
    y:        -20,
    hp:       word.length,        // letter-by-letter damage
    word,
  };
  state.enemies.push(e);
  addEnemyToIndex(e);
}

export function updateEnemies(dt) {
  const survivors = [];
  for (const e of state.enemies) {
    if (e.dying) {
      // Frozen during the orb's flight. Still in state.enemies so the
      // dying emoji keeps rendering; removed by updateEffects when the
      // orb lands.
      survivors.push(e);
      continue;
    }
    // Walk straight toward hero
    const dx = state.hero.x - e.x, dy = state.hero.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    const sp = e.def.speed * dt;
    e.x += (dx / dist) * sp;
    e.y += (dy / dist) * sp;
    // Contact?
    if (dist < (e.def.size + HERO.size) * 0.4) {
      state.hero.hp = Math.max(0, state.hero.hp - e.def.contactDamage);
      removeEnemyFromIndex(e);
      // do not add to survivors
      if (state.hero.hp === 0) state.gameOver = true;
      continue;
    }
    survivors.push(e);
  }
  state.enemies = survivors;
  dropOrphanedBuffer();
}
