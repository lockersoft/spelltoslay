import { state } from './state.js';

// ─── Prefix index ────────────────────────────────────
const prefixIndex = new Map(); // prefix(string) → Set<enemyId>

export function hasPrefix(prefix) {
  return prefixIndex.has(prefix);
}

export function clearPrefixIndex() {
  prefixIndex.clear();
}

export function addEnemyToIndex(e) {
  for (let len = 1; len <= e.word.length; len++) {
    const p = e.word.slice(0, len);
    if (!prefixIndex.has(p)) prefixIndex.set(p, new Set());
    prefixIndex.get(p).add(e.id);
  }
}

export function removeEnemyFromIndex(e) {
  if (!e.word) return;
  for (let len = 1; len <= e.word.length; len++) {
    const p = e.word.slice(0, len);
    const set = prefixIndex.get(p);
    if (set) {
      set.delete(e.id);
      if (set.size === 0) prefixIndex.delete(p);
    }
  }
}

// Closest enemy to the hero from a list (Euclidean). null for an empty list.
export function closestToHero(list) {
  let best = null, bestDist = Infinity;
  for (const e of list) {
    const d = Math.hypot(e.x - state.hero.x, e.y - state.hero.y);
    if (d < bestDist) { bestDist = d; best = e; }
  }
  return best;
}

// Live enemies whose word starts with the given prefix.
export function enemiesForPrefix(prefix) {
  const ids = prefixIndex.get(prefix);
  if (!ids) return [];
  return state.enemies.filter(e => ids.has(e.id));
}

// ─── Word pool ───────────────────────────────────────
export async function fetchWordPool() {
  try {
    const r = await fetch('/api/words.php', { cache: 'no-store' });
    const j = await r.json();
    state.wordPool = (j.words || []).filter(w => /^[a-z]{1,32}$/.test(w));
    state.wordSource = j.source || '';
    state.wordListVersion = j.version | 0;
  } catch (e) {
    console.warn('failed to fetch word pool', e);
  }
}

export function pickWordFor(enemyDef) {
  if (state.pushWordPending) {
    const w = state.pushWordPending;
    state.pushWordPending = '';
    return w;
  }
  const pool = state.wordPool;
  if (pool.length === 0) return 'cat';

  // Length-based heuristic: easy ≤5, hard ≥8, medium = the rest. Mirrors the
  // bucketing rule used in public/words/grade-*.json. When the teacher pastes
  // a flat list, all enemies fall back to a uniform draw.
  const matches = pool.filter(w => {
    if (enemyDef.difficultyClass === 'easy')   return w.length <= 5;
    if (enemyDef.difficultyClass === 'hard')   return w.length >= 8;
    return w.length >= 6 && w.length <= 7;
  });
  const source = matches.length >= 3 ? matches : pool;
  // Prefer a word no live enemy is already carrying: first within this
  // difficulty bucket, then anywhere in the pool. Only when every pool word
  // is on screen does a repeat spawn. (A teacher-pushed word, above, is
  // spawned regardless.)
  const live = new Set(state.enemies.filter(e => !e.dying).map(e => e.word));
  const fresh = source.filter(w => !live.has(w));
  const freshAnywhere = fresh.length > 0 ? fresh : pool.filter(w => !live.has(w));
  const from = freshAnywhere.length > 0 ? freshAnywhere : source;
  return from[(Math.random() * from.length) | 0];
}
