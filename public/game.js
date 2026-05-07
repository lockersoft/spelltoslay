'use strict';

// ─── Constants & tuning ──────────────────────────────
const ARENA = { w: 960, h: 600 };
const HERO  = { emoji: '🛡️', size: 36 };
const MAX_HP = 100;
const TYPO_HP_PENALTY = 1;
const WAVE_DURATION_S = 30;
const BOSS_WAVE_INTERVAL = 5;
const WPM_WINDOW_S = 30;
const POLL_DISMISS_AFTER_MS = 15000;

// ─── Registries (students extend these) ──────────────
const ENEMIES = [
  { id: 'ghost',  emoji: '👻',  difficultyClass: 'easy',   speed: 30, contactDamage: 10, pointMultiplier: 1, size: 28 },
  { id: 'dragon', emoji: '🐲',  difficultyClass: 'medium', speed: 22, contactDamage: 15, pointMultiplier: 2, size: 32 },
  { id: 'banana', emoji: '🍌',  difficultyClass: 'hard',   speed: 16, contactDamage: 25, pointMultiplier: 4, size: 38 },
];

// ─── State ───────────────────────────────────────────
const state = {
  running: false,
  paused: false,
  personalPaused: false,
  gameOver: false,
  time: 0,
  hero: { x: ARENA.w / 2, y: ARENA.h - 60, hp: MAX_HP },
  enemies: [],
  particles: [],
  spawn: { nextAt: 0, wave: 1, waveStartedAt: 0 },
  score: 0,
  kills: 0,
  streak: 0,
  bestStreak: 0,
  keystrokes: { correct: 0, total: 0 },
  wpmLog: [],            // [{ts, chars}], pruned to last WPM_WINDOW_S
  // Typing
  typedBuffer: '',
  lockedEnemyId: null,
  // Word pool
  wordPool: [],
  wordSource: '',
  wordListVersion: -1,
  pushWordPending: '',
  // Inherited polling
  serverVersion: -1,
  clientId: null,
  playerName: '',
  messageBar: '',
  personalMessage: '',
  tabVisible: true,
  pollState: null,
  pollAnsweredAt: 0,
  forceReloadHandled: false,
};

// ─── Boot ────────────────────────────────────────────
const canvas = document.getElementById('arena');
const ctx = canvas.getContext('2d');
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

state.clientId = (() => {
  const stored = localStorage.getItem('sts_cid');
  if (stored) return stored;
  const cid = crypto.randomUUID();
  localStorage.setItem('sts_cid', cid);
  return cid;
})();
state.playerName = localStorage.getItem('sts_player_name') || '';

// ─── Word pool ───────────────────────────────────────
let prefixIndex = new Map(); // prefix(string) → Set<enemyId>

function rebuildPrefixIndex() {
  prefixIndex = new Map();
  for (const e of state.enemies) {
    if (!e.word) continue;
    for (let len = 1; len <= e.word.length; len++) {
      const p = e.word.slice(0, len);
      if (!prefixIndex.has(p)) prefixIndex.set(p, new Set());
      prefixIndex.get(p).add(e.id);
    }
  }
}

function addEnemyToIndex(e) {
  for (let len = 1; len <= e.word.length; len++) {
    const p = e.word.slice(0, len);
    if (!prefixIndex.has(p)) prefixIndex.set(p, new Set());
    prefixIndex.get(p).add(e.id);
  }
}

function removeEnemyFromIndex(e) {
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

async function fetchWordPool() {
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

function pickWordFor(enemyDef) {
  // For builtin sources we'd want bucket-aware selection, but words.php
  // currently returns a flat merged array. Random pick from the full pool
  // is acceptable for v1 — bucket bias can be added once words.php returns
  // structured buckets in a follow-up.
  if (state.wordPool.length === 0) return 'cat';
  return state.wordPool[(Math.random() * state.wordPool.length) | 0];
}

// ─── Polling ─────────────────────────────────────────
async function pollServerState() {
  const params = new URLSearchParams({ cid: state.clientId });
  if (state.playerName) params.set('name', state.playerName);
  if (state.running) {
    params.set('score', String(state.score));
    params.set('wave',  String(state.spawn.wave));
    params.set('hp',    String(state.hero.hp));
    params.set('playing', '1');
  }
  params.set('visible', state.tabVisible ? '1' : '0');

  let r;
  try { r = await fetch('/api/state.php?' + params.toString(), { cache: 'no-store' }); }
  catch (_) { return; }
  if (!r.ok) return;
  const s = await r.json();

  state.paused          = !!s.paused;
  state.personalPaused  = !!s.personalPaused;
  state.messageBar      = (s.message || '') + (s.personalMessage ? '  •  ' + s.personalMessage : '');
  if (s.name && s.name !== state.playerName) {
    state.playerName = s.name;
    localStorage.setItem('sts_player_name', s.name);
  }

  if (s.forceReload && !state.forceReloadHandled) {
    state.forceReloadHandled = true;
    location.reload();
    return;
  }

  // Word pool: refetch if version changed.
  if ((s.wordListVersion | 0) !== state.wordListVersion) {
    await fetchWordPool();
  }

  // Push word: queue exactly once.
  if (s.pushWord && s.pushWord !== state.pushWordPending) {
    state.pushWordPending = s.pushWord;
  }

  // Polls — same shape as SLAY; just store and let the overlay render.
  if (s.pollQuestion) {
    state.pollState = { pollId: s.pollId, question: s.pollQuestion, options: s.pollOptions || [], myAnswer: s.pollMyAnswer ?? null };
  } else {
    state.pollState = null;
  }
}
setInterval(pollServerState, 2000);
document.addEventListener('visibilitychange', () => { state.tabVisible = !document.hidden; });

// ─── Render ──────────────────────────────────────────
function render() {
  ctx.clearRect(0, 0, ARENA.w, ARENA.h);
  // Background
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, ARENA.w, ARENA.h);

  // Hero
  ctx.font = `${HERO.size}px serif`;
  ctx.fillText(HERO.emoji, state.hero.x, state.hero.y);

  // Enemies (Task 10 fills in real rendering)
  for (const e of state.enemies) {
    ctx.font = `${e.def.size || 32}px serif`;
    ctx.fillText(e.def.emoji, e.x, e.y);
  }

  // HUD placeholder text — replaced in Task 12
  ctx.fillStyle = '#9fb0d8';
  ctx.font = '11px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`HP ${state.hero.hp}  W${state.spawn.wave}  Score ${state.score}`, 8, 18);
  ctx.textAlign = 'center';

  // Pause overlay
  if (state.paused || state.personalPaused) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, ARENA.w, ARENA.h);
    ctx.fillStyle = '#fff';
    ctx.font = '32px ui-sans-serif, system-ui';
    ctx.fillText('⏸ PAUSED BY TEACHER', ARENA.w / 2, ARENA.h / 2);
    if (state.messageBar) {
      ctx.font = '18px ui-sans-serif, system-ui';
      ctx.fillText(state.messageBar, ARENA.w / 2, ARENA.h / 2 + 40);
    }
  }
}

// ─── Main loop ───────────────────────────────────────
let lastTs = performance.now();
function tick(now) {
  const dt = Math.min((now - lastTs) / 1000, 1 / 30);
  lastTs = now;
  if (state.running && !state.paused && !state.personalPaused && !state.gameOver) {
    state.time += dt;
    // updateEnemies / updateSpawner / updateParticles land in Task 10
  }
  render();
  requestAnimationFrame(tick);
}

// ─── Init & start ────────────────────────────────────
(async function init() {
  await fetchWordPool();
  await pollServerState();
  // Boot main loop right away — game stays in title state until name entry submitted (Task 13)
  state.running = true;
  state.spawn.waveStartedAt = state.time;
  requestAnimationFrame(tick);
})();
