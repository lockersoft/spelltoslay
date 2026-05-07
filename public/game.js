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

if (typeof window !== 'undefined') window.state = state;

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

const nameEntryEl   = document.getElementById('name-entry');
const entryNameInput = document.getElementById('entry-name');
const startPlayingBtn = document.getElementById('start-playing');
const entryErrorEl  = document.getElementById('entry-error');

if (!state.playerName) {
  nameEntryEl.classList.remove('hidden');
  entryNameInput.value = '';
  state.running = false; // pause the engine until they submit
} else {
  // Already named on a prior visit; just go.
  nameEntryEl.classList.add('hidden');
}

startPlayingBtn.addEventListener('click', () => {
  const v = entryNameInput.value.trim();
  if (!/^[A-Za-z0-9 ]{1,16}$/.test(v)) {
    entryErrorEl.textContent = 'Name must be 1–16 letters, numbers, or spaces.';
    entryErrorEl.classList.remove('hidden');
    return;
  }
  state.playerName = v;
  localStorage.setItem('sts_player_name', v);
  nameEntryEl.classList.add('hidden');
  entryErrorEl.classList.add('hidden');
  state.running = true;
  typeInput.focus();
});

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
  return source[(Math.random() * source.length) | 0];
}

function updateSpawner(dt) {
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
function spawnOne(def) {
  const word = pickWordFor(def);
  const e = {
    id:       'e' + (nextEnemyId++),
    def,
    x:        20 + Math.random() * (ARENA.w - 40),
    y:        -20,
    hp:       word.length,        // letter-by-letter damage
    word,
    typedLen: 0,
  };
  state.enemies.push(e);
  addEnemyToIndex(e);
}

function updateEnemies(dt) {
  const survivors = [];
  for (const e of state.enemies) {
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
}

// ─── Typing input ────────────────────────────────────
const typeInput = document.getElementById('type-input');

function onType() {
  if (!state.running || state.gameOver || state.paused || state.personalPaused) {
    typeInput.value = '';
    return;
  }
  const raw = typeInput.value.toLowerCase().replace(/[^a-z]/g, '');
  const prev = state.typedBuffer;

  // Pure backspace? Just shrink the buffer.
  if (raw.length < prev.length) {
    state.typedBuffer = raw;
    refreshLock();
    return;
  }

  // Process new keystrokes one at a time.
  for (let i = prev.length; i < raw.length; i++) {
    const ch = raw[i];
    state.keystrokes.total += 1;
    const candidatePrefix = state.typedBuffer + ch;
    if (prefixIndex.has(candidatePrefix)) {
      // Correct letter (the buffer extends a real prefix of at least one live enemy).
      state.typedBuffer = candidatePrefix;
      state.keystrokes.correct += 1;
      state.wpmLog.push({ ts: state.time, chars: 1 });
      damageLockedByOne();
    } else {
      // Wrong letter — typo penalty, undo the buffer growth, and refuse to advance.
      state.hero.hp = Math.max(0, state.hero.hp - TYPO_HP_PENALTY);
      if (state.hero.hp === 0) state.gameOver = true;
      state.streak = 0;
      // Mark the input as "stalled" — keep the wrong letter in the input box (red flash via CSS),
      // require Backspace to recover.
      typeInput.classList.add('stalled');
      typeInput.value = state.typedBuffer + ch;
      flashLockedRed();
      return;
    }
  }
  typeInput.classList.remove('stalled');
  typeInput.value = state.typedBuffer;
  refreshLock();
}

function refreshLock() {
  if (state.typedBuffer === '') {
    state.lockedEnemyId = null;
    return;
  }
  const candidates = prefixIndex.get(state.typedBuffer);
  if (!candidates || candidates.size === 0) {
    state.lockedEnemyId = null;
    return;
  }
  // Among matches, pick the one closest to the hero (Euclidean).
  let bestId = null, bestDist = Infinity;
  for (const id of candidates) {
    const e = state.enemies.find(en => en.id === id);
    if (!e) continue;
    const d = Math.hypot(e.x - state.hero.x, e.y - state.hero.y);
    if (d < bestDist) { bestDist = d; bestId = id; }
  }
  state.lockedEnemyId = bestId;
  const locked = state.enemies.find(e => e.id === bestId);
  if (locked) locked.typedLen = state.typedBuffer.length;
}

function damageLockedByOne() {
  refreshLock();
  const e = state.enemies.find(en => en.id === state.lockedEnemyId);
  if (!e) return;
  e.typedLen = state.typedBuffer.length;
  e.hp -= 1;
  if (e.hp <= 0) {
    onEnemySlain(e);
  }
}

function onEnemySlain(e) {
  const word = e.word;
  // Score: floor(wordLength × pointMultiplier × streakBonus)
  const streakBonus = Math.min(1 + 0.05 * state.streak, 2.0);
  const points = Math.floor(word.length * e.def.pointMultiplier * streakBonus);
  state.score += points;
  state.kills += 1;
  state.streak += 1;
  if (state.streak > state.bestStreak) state.bestStreak = state.streak;
  // Remove
  removeEnemyFromIndex(e);
  state.enemies = state.enemies.filter(en => en.id !== e.id);
  // Reset buffer; lock will refresh on next keystroke
  state.typedBuffer = '';
  state.lockedEnemyId = null;
  typeInput.value = '';
}

function flashLockedRed() {
  const e = state.enemies.find(en => en.id === state.lockedEnemyId);
  if (!e) return;
  e.flashUntil = state.time + 0.4;
}

function currentWpm() {
  // Trim WPM log to last WPM_WINDOW_S seconds.
  const cutoff = state.time - WPM_WINDOW_S;
  while (state.wpmLog.length > 0 && state.wpmLog[0].ts < cutoff) state.wpmLog.shift();
  if (state.wpmLog.length === 0) return 0;
  const chars = state.wpmLog.reduce((s, e) => s + e.chars, 0);
  const span  = Math.max(1, state.time - state.wpmLog[0].ts);
  return Math.round((chars / 5) * (60 / span));
}

function currentAccuracy() {
  if (state.keystrokes.total === 0) return 100;
  return Math.round(100 * state.keystrokes.correct / state.keystrokes.total);
}

function elapsedHHMMSS() {
  const t = Math.floor(state.time);
  const m = String(Math.floor(t / 60)).padStart(1, '0');
  const s = String(t % 60).padStart(2, '0');
  return `${m}:${s}`;
}

typeInput.addEventListener('input', onType);
typeInput.addEventListener('blur',  () => setTimeout(() => typeInput.focus(), 50));
window.addEventListener('load',     () => typeInput.focus());

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

  // Polls — capture state AND render the overlay (ported from SLAY).
  updatePollOverlay(s);
}
setInterval(pollServerState, 2000);
document.addEventListener('visibilitychange', () => { state.tabVisible = !document.hidden; });

// ─── Poll overlay ────────────────────────────────────
// The overlay sits on top of the canvas, so we auto-dismiss it 15 seconds
// after the player has voted — long enough to confirm the choice, short
// enough not to obscure gameplay.
function updatePollOverlay(s) {
  const pollEl = document.getElementById('poll-overlay');
  if (!pollEl) return;

  if (!s.pollQuestion) {
    pollEl.classList.add('hidden');
    state.pollState = null;
    state.pollAnsweredAt = 0;
    return;
  }

  const options = s.pollOptions || [];
  const myAnswer = s.pollMyAnswer;
  const pollId   = s.pollId;

  // Reset the dismissal timer if this is a new poll.
  if (!state.pollState || state.pollState.pollId !== pollId) {
    state.pollAnsweredAt = 0;
  }

  state.pollState = { pollId, question: s.pollQuestion, options, myAnswer: myAnswer ?? null };

  // If we've answered (this session OR a previous session for the same poll),
  // start the dismissal clock if it's not already running.
  if (myAnswer !== null && myAnswer !== undefined && !state.pollAnsweredAt) {
    state.pollAnsweredAt = Date.now();
  }
  if (state.pollAnsweredAt && Date.now() - state.pollAnsweredAt > POLL_DISMISS_AFTER_MS) {
    pollEl.classList.add('hidden');
    return;
  }

  pollEl.classList.remove('hidden');
  document.getElementById('poll-question').textContent = s.pollQuestion;
  const btnsEl = document.getElementById('poll-options');
  btnsEl.innerHTML = '';

  if (myAnswer !== null && myAnswer !== undefined) {
    // Already answered — show confirmed state with countdown to dismiss.
    const remaining = Math.max(0, Math.ceil(
      (POLL_DISMISS_AFTER_MS - (Date.now() - state.pollAnsweredAt)) / 1000
    ));
    const thanks = document.createElement('p');
    thanks.textContent = `✓ You picked: ${options[myAnswer] || myAnswer}`;
    thanks.style.fontWeight = '700';
    thanks.style.margin = '0';
    const fade = document.createElement('p');
    fade.textContent = remaining > 0 ? `(closing in ${remaining}s)` : '';
    fade.style.cssText = 'margin: 4px 0 0; font-size: 12px; color: #6e7681;';
    btnsEl.appendChild(thanks);
    btnsEl.appendChild(fade);
  } else {
    // Not yet answered — show option buttons.
    options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.textContent = opt;
      btn.addEventListener('click', async () => {
        try {
          await fetch('/api/poll-vote.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cid: state.clientId, pollId, optionIndex: i }),
          });
          if (state.pollState) state.pollState.myAnswer = i;
          state.pollAnsweredAt = Date.now();
          // Re-render in answered state immediately (don't wait for next poll).
          updatePollOverlay({ ...s, pollMyAnswer: i });
          // Schedule a hide so the user doesn't have to wait for a poll cycle.
          setTimeout(() => pollEl.classList.add('hidden'), POLL_DISMISS_AFTER_MS);
        } catch (_) {}
      });
      btnsEl.appendChild(btn);
    });
  }
}

// ─── Render ──────────────────────────────────────────
function render() {
  if (state.typedBuffer !== '') refreshLock();
  ctx.clearRect(0, 0, ARENA.w, ARENA.h);
  // Background
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, ARENA.w, ARENA.h);

  // Hero
  ctx.font = `${HERO.size}px serif`;
  ctx.fillText(HERO.emoji, state.hero.x, state.hero.y);

  // Enemies (Task 10 fills in real rendering)
  for (const e of state.enemies) {
    ctx.font = `${e.def.size}px serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText(e.def.emoji, e.x, e.y);

    // Locked ring
    if (e.id === state.lockedEnemyId) {
      ctx.strokeStyle = '#5b8def';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.def.size * 0.7, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Red flash on typo
    if (e.flashUntil && state.time < e.flashUntil) {
      ctx.fillStyle = 'rgba(239, 71, 111, 0.4)';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.def.size * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Word above the enemy
    ctx.font = '14px ui-monospace, monospace';
    const word = e.word;
    const typed = word.slice(0, e.typedLen);
    const rest  = word.slice(e.typedLen);
    const wY = e.y - e.def.size / 2 - 8;
    // Background pill
    const padding = 6, w = ctx.measureText(word).width;
    ctx.fillStyle = '#1a2238';
    ctx.fillRect(e.x - w/2 - padding, wY - 12, w + padding*2, 22);
    // Typed (green)
    ctx.fillStyle = '#06d6a0';
    ctx.fillText(typed, e.x - w/2 + ctx.measureText(typed).width/2, wY);
    // Untyped (white)
    ctx.fillStyle = '#cde';
    ctx.fillText(rest, e.x - w/2 + ctx.measureText(typed).width + ctx.measureText(rest).width/2, wY);
  }

  // ── HUD ──
  function pill(text, color) {
    ctx.font = '11px ui-monospace, monospace';
    const padX = 6, padY = 4;
    const w = ctx.measureText(text).width + padX * 2;
    return { w, h: 18, draw(x, y) {
      ctx.fillStyle = '#1a2238';
      ctx.fillRect(x, y, w, 18);
      ctx.strokeStyle = '#2a3858';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 17);
      ctx.fillStyle = color || '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(text, x + padX, y + 9 + 4);
      ctx.textAlign = 'center';
    }};
  }

  // Top-left: HP, wave
  let yL = 8;
  const pHp   = pill(`HP ${state.hero.hp}`, '#ef476f');           pHp.draw(8, yL);   yL += 22;
  const pWv   = pill(`W ${state.spawn.wave}`, '#fff');            pWv.draw(8, yL);

  // Top-right: score, time
  const pSc   = pill(`SCORE ${state.score}`, '#fff');
  const pTm   = pill(`TIME ${elapsedHHMMSS()}`, '#fff');
  pSc.draw(ARENA.w - pSc.w - 8, 8);
  pTm.draw(ARENA.w - pTm.w - 8, 30);

  // Bottom-right: WPM, accuracy, streak
  const pWp   = pill(`WPM ${currentWpm()}`, '#06d6a0');
  const pAc   = pill(`ACC ${currentAccuracy()}%`, '#5b8def');
  const pSt   = pill(`STREAK ${state.streak}`, '#ffd166');
  pWp.draw(ARENA.w - pWp.w - 8, ARENA.h - 70);
  pAc.draw(ARENA.w - pAc.w - 8, ARENA.h - 48);
  pSt.draw(ARENA.w - pSt.w - 8, ARENA.h - 26);

  // Top-center: teacher message strip (only when message set)
  if (state.messageBar) {
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = '#ffd166';
    ctx.textAlign = 'center';
    ctx.fillText(`📣 ${state.messageBar}`, ARENA.w / 2, 14);
  }

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
    updateSpawner(dt);
    updateEnemies(dt);
  }
  render();
  requestAnimationFrame(tick);
}

// ─── Game-over flow, score submission, leaderboard ──
const gameOverEl     = document.getElementById('game-over');
const goSummaryEl    = document.getElementById('game-over-summary');
const goNameEl       = document.getElementById('game-over-name');
const submitScoreBtn = document.getElementById('submit-score');
const submitErrorEl  = document.getElementById('submit-error');
const leaderboardEl  = document.getElementById('leaderboard');
const playAgainBtn   = document.getElementById('play-again');
const rankSummaryEl  = document.getElementById('rank-summary');
const lbTodayEl      = document.getElementById('lb-today');
const lbAlltimeEl    = document.getElementById('lb-alltime');

let gameOverShown = false;
function showGameOver() {
  if (gameOverShown) return;
  gameOverShown = true;
  goSummaryEl.textContent =
    `Score ${state.score} · ${state.kills} words · WPM ${currentWpm()} · ACC ${currentAccuracy()}% · time ${elapsedHHMMSS()}`;
  goNameEl.textContent = state.playerName;
  submitErrorEl.classList.add('hidden');
  gameOverEl.classList.remove('hidden');
}

submitScoreBtn.addEventListener('click', async () => {
  submitScoreBtn.disabled = true;
  submitErrorEl.classList.add('hidden');
  try {
    const r = await fetch('/api/score.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: state.playerName,
        score: state.score,
        wave: state.spawn.wave,
        duration: Math.floor(state.time),
        wpm: currentWpm(),
        accuracy: currentAccuracy(),
        wordsSlain: state.kills,
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      submitErrorEl.textContent = j.error || `HTTP ${r.status}`;
      submitErrorEl.classList.remove('hidden');
      submitScoreBtn.disabled = false;
      return;
    }
    rankSummaryEl.textContent = `You ranked #${j.rank}.`;
    await renderLeaderboard();
    gameOverEl.classList.add('hidden');
    leaderboardEl.classList.remove('hidden');
  } catch (e) {
    submitErrorEl.textContent = 'Could not reach server.';
    submitErrorEl.classList.remove('hidden');
    submitScoreBtn.disabled = false;
  }
});

async function renderLeaderboard() {
  try {
    const r = await fetch('/api/leaderboard.php', { cache: 'no-store' });
    const j = await r.json();
    const fmt = e => `<li><b>${e.name}</b> — ${e.score} (W${e.wave}, WPM ${e.wpm}, ${e.accuracy}%)</li>`;
    lbTodayEl.innerHTML   = (j.today   || []).map(fmt).join('');
    lbAlltimeEl.innerHTML = (j.allTime || []).map(fmt).join('');
  } catch (_) { /* ignore */ }
}

playAgainBtn.addEventListener('click', () => {
  // Reset everything
  state.enemies.length = 0;
  prefixIndex.clear();
  state.score = 0; state.kills = 0; state.streak = 0; state.bestStreak = 0;
  state.keystrokes = { correct: 0, total: 0 };
  state.wpmLog.length = 0;
  state.hero.hp = MAX_HP;
  state.time = 0;
  state.spawn = { nextAt: 0, wave: 1, waveStartedAt: 0 };
  state.gameOver = false;
  gameOverShown = false;
  state.typedBuffer = '';
  typeInput.value = '';
  leaderboardEl.classList.add('hidden');
  state.running = true;
  typeInput.focus();
});

// Hook game-over into the main loop: when state.gameOver flips, surface the modal.
const _origTick = tick;
window._gameOverHook = setInterval(() => {
  if (state.gameOver && !gameOverShown) {
    state.running = false;
    showGameOver();
  }
}, 50);

// ─── Init & start ────────────────────────────────────
(async function init() {
  await fetchWordPool();
  await pollServerState();
  // Boot main loop right away — game stays in title state until name entry submitted (Task 13)
  state.running = !!state.playerName;
  state.spawn.waveStartedAt = state.time;
  requestAnimationFrame(tick);
})();
