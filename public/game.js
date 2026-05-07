'use strict';

// ─── Constants ──────────────────────────────────
const ARENA = { w: 960, h: 600 };
const HERO = {
  emoji: '🛡️',
  speed: 220,             // px/sec
  size: 28,               // hit radius for collision
  maxHp: 100,
};

const WEAPONS = [
  {
    id: 'sword',
    name: 'Thrown Sword',
    emoji: '⚔️',
    cooldown: 0.7,        // seconds
    damage: 25,
    speed: 380,           // projectile px/sec
    range: 480,           // max travel
    behavior: 'thrown',
  },
  // students add new weapons here
];
const ENEMIES = [
  { id: 'ghost', emoji: '👻', hp: 30, speed: 90, damage: 10, size: 22, scoreValue: 5 },
  // students add new enemy types here
];
const POWERUPS = [
  // empty in v1; students add
];

const behaviors = {
  /** Fire one projectile at the nearest enemy — or a 2-projectile fan when
   *  spread shot is active (Jhett's milestone powerup, unlocked at 30 kills). */
  thrown(weapon, hero, target) {
    const dx = target.x - hero.x, dy = target.y - hero.y;
    const baseAngle = Math.atan2(dy, dx);
    const offsets = state.spread ? [-0.18, 0.18] : [0]; // ~10° fan when spread
    for (const off of offsets) {
      const a = baseAngle + off;
      state.projectiles.push({
        weapon, x: hero.x, y: hero.y,
        vx: Math.cos(a) * weapon.speed,
        vy: Math.sin(a) * weapon.speed,
        remaining: weapon.range,
        size: 14,
      });
    }
  },
  // students add new behaviors here (e.g. orbit, aura, beam)
};

// ─── State ──────────────────────────────────────
const SPREAD_KILL_THRESHOLD = 30;       // Jhett's spread-shot powerup unlocks here

const state = {
  running: false,
  paused: false,
  personalPaused: false,
  gameOver: false,
  time: 0,                // seconds since run start
  score: 0,
  kills: 0,               // count of enemies slain — drives milestone powerups
  spread: false,          // spread-shot powerup active (Jhett, idea by 30-kill milestone)
  spreadShownAt: 0,       // run-time (s) when spread unlock banner started
  hero: { x: ARENA.w / 2, y: ARENA.h / 2, hp: HERO.maxHp, vx: 0, vy: 0 },
  input: { up: false, down: false, left: false, right: false },
  enemies: [],
  projectiles: [],
  particles: [],
  weapons: [/* { def, cooldownLeft } pushed in Task 15 */],
  spawn: { nextAt: 0, wave: 1 },
  messageBar: '',
  serverVersion: -1,
  clientId: null,
  playerName: '',
  personalMessage: '',
  tabVisible: true,         // Feature 2: tracks document.visibilityState
  nameChangedBanner: null,  // Feature 8: { text, shownAt }
  pollState: null,          // Feature 12: { pollId, question, options, myAnswer }
  pollAnsweredAt: 0,        // ms timestamp; overlay auto-hides 15s after voting
  pointer: { active: false, x: 0, y: 0 },  // touch/mouse "hold to move" target
};
const POLL_DISMISS_AFTER_MS = 15000;

// ─── Boot ───────────────────────────────────────
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

// Feature 2: track tab visibility.
state.tabVisible = document.visibilityState !== 'hidden';
document.addEventListener('visibilitychange', () => {
  state.tabVisible = document.visibilityState !== 'hidden';
});

// ─── Build version display ──────────────────────
fetch('/api/health.php', { cache: 'no-store' })
  .then(r => r.json())
  .then(d => {
    const el = document.getElementById('build-version');
    if (el) el.textContent = `v${d.version || 'dev'}`;
  })
  .catch(() => {
    const el = document.getElementById('build-version');
    if (el) el.textContent = '';
  });

// ─── Name entry modal ───────────────────────────
(function bootWithNameCheck() {
  if (state.playerName) {
    startRun();
    requestAnimationFrame(tick);
  } else {
    document.getElementById('name-entry').classList.remove('hidden');
    requestAnimationFrame(tick); // start rendering loop (blank canvas is fine)
  }
})();

document.getElementById('start-playing').addEventListener('click', submitName);
document.getElementById('entry-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitName();
});

function submitName() {
  const input = document.getElementById('entry-name');
  const errEl = document.getElementById('entry-error');
  const name = input.value.trim();
  if (!name || name.length > 16 || !/^[A-Za-z0-9 ]{1,16}$/.test(name)) {
    errEl.textContent = 'Name must be 1–16 characters, letters/numbers/spaces.';
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');
  state.playerName = name;
  localStorage.setItem('sts_player_name', name);
  document.getElementById('name-entry').classList.add('hidden');
  startRun();
}

// ─── Main loop with fixed-dt cap ────────────────
let lastTs = 0;
function tick(now) {
  const dt = Math.min(0.033, (now - lastTs) / 1000 || 0); // cap at 1/30s
  lastTs = now;

  if (state.running && !state.paused && !state.personalPaused && !state.gameOver) {
    state.time += dt;
    update(dt);
  }
  render();
  requestAnimationFrame(tick);
}

function update(dt) {
  // Hero velocity from keyboard input.
  let vx = (state.input.right ? 1 : 0) - (state.input.left ? 1 : 0);
  let vy = (state.input.down  ? 1 : 0) - (state.input.up   ? 1 : 0);

  // Pointer (touch/mouse) target overrides keyboard while active. Hero moves
  // toward the held-down position, stopping when within DEAD_ZONE px so the
  // hero doesn't jitter on top of the finger.
  if (state.pointer.active) {
    const POINTER_DEAD_ZONE = 18;
    const dx = state.pointer.x - state.hero.x;
    const dy = state.pointer.y - state.hero.y;
    const d = Math.hypot(dx, dy);
    if (d > POINTER_DEAD_ZONE) {
      vx = dx / d;
      vy = dy / d;
    } else {
      vx = 0; vy = 0;
    }
  }

  const mag = Math.hypot(vx, vy);
  if (mag > 1) { vx /= mag; vy /= mag; }
  state.hero.vx = vx * HERO.speed;
  state.hero.vy = vy * HERO.speed;

  state.hero.x = clamp(state.hero.x + state.hero.vx * dt, HERO.size, ARENA.w - HERO.size);
  state.hero.y = clamp(state.hero.y + state.hero.vy * dt, HERO.size, ARENA.h - HERO.size);

  // Spawn timer.
  state.spawn.nextAt -= dt;
  if (state.spawn.nextAt <= 0) {
    spawnEnemy();
    // Spawn rate accelerates with wave: 1.4s at wave 1, ~0.3s at wave 10+.
    state.spawn.nextAt = Math.max(0.3, 1.4 - (state.spawn.wave - 1) * 0.1);
  }
  // Wave bumps every 30 seconds.
  state.spawn.wave = 1 + Math.floor(state.time / 30);

  // Enemy chase + contact damage.
  for (const e of state.enemies) {
    const dx = state.hero.x - e.x, dy = state.hero.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.x += (dx / d) * e.def.speed * dt;
    e.y += (dy / d) * e.def.speed * dt;

    if (d < HERO.size + e.def.size && e.contactCooldown <= 0) {
      state.hero.hp -= e.def.damage;
      e.contactCooldown = 0.6;
    }
    e.contactCooldown = Math.max(0, e.contactCooldown - dt);
  }

  // Weapons: tick cooldowns, fire at nearest enemy.
  for (const w of state.weapons) {
    w.cooldownLeft -= dt;
    if (w.cooldownLeft > 0) continue;
    const target = nearestEnemy(state.hero.x, state.hero.y);
    if (!target) continue;
    const fn = behaviors[w.def.behavior];
    if (fn) fn(w.def, state.hero, target);
    w.cooldownLeft = w.def.cooldown;
  }

  // Move projectiles, check collisions.
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    const stepX = p.vx * dt, stepY = p.vy * dt;
    p.x += stepX; p.y += stepY;
    p.remaining -= Math.hypot(stepX, stepY);

    let hit = false;
    for (let j = state.enemies.length - 1; j >= 0; j--) {
      const e = state.enemies[j];
      if (Math.hypot(p.x - e.x, p.y - e.y) < p.size + e.def.size) {
        e.hp -= p.weapon.damage;
        hit = true;
        if (e.hp <= 0) {
          state.score += e.def.scoreValue;
          state.kills += 1;
          if (!state.spread && state.kills >= SPREAD_KILL_THRESHOLD) {
            state.spread = true;
            state.spreadShownAt = state.time;
          }
          state.enemies.splice(j, 1);
        }
        break;
      }
    }
    if (hit || p.remaining <= 0
        || p.x < -40 || p.x > ARENA.w + 40 || p.y < -40 || p.y > ARENA.h + 40) {
      state.projectiles.splice(i, 1);
    }
  }

  if (state.hero.hp <= 0 && !state.gameOver) {
    triggerGameOver();
  }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function spawnEnemy() {
  const def = ENEMIES[Math.floor(Math.random() * ENEMIES.length)];
  // Spawn just outside one of the four arena edges.
  const side = Math.floor(Math.random() * 4);
  const margin = 40;
  let x, y;
  if (side === 0)      { x = Math.random() * ARENA.w; y = -margin; }
  else if (side === 1) { x = ARENA.w + margin; y = Math.random() * ARENA.h; }
  else if (side === 2) { x = Math.random() * ARENA.w; y = ARENA.h + margin; }
  else                 { x = -margin; y = Math.random() * ARENA.h; }
  state.enemies.push({ def, x, y, hp: def.hp, contactCooldown: 0 });
}

function nearestEnemy(x, y) {
  let best = null, bestD = Infinity;
  for (const e of state.enemies) {
    const d = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function triggerGameOver() {
  state.gameOver = true;
  state.running = false;
  const summary =
    `Score ${state.score} · Wave ${state.spawn.wave} · ${state.time.toFixed(0)}s survived`;
  document.getElementById('game-over-summary').textContent = summary;
  document.getElementById('game-over-name').textContent = state.playerName;
  document.getElementById('submit-error').classList.add('hidden');
  document.getElementById('game-over').classList.remove('hidden');
}

document.getElementById('change-name').addEventListener('click', async e => {
  e.preventDefault();
  const newName = prompt('New name? (1–16 letters/numbers/spaces)', state.playerName);
  if (newName === null) return; // cancelled
  const trimmed = newName.trim();
  if (!trimmed || trimmed.length > 16 || !/^[A-Za-z0-9 ]{1,16}$/.test(trimmed)) {
    alert('Name must be 1–16 characters, letters/numbers/spaces.');
    return;
  }
  // Feature 8: player self-rename goes through rename.php to bypass the CASE logic.
  try {
    const r = await fetch('/api/rename.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cid: state.clientId, name: trimmed }),
    });
    const res = await r.json();
    if (!r.ok) { alert(res.error || 'Rename failed'); return; }
    state.playerName = res.name;
    localStorage.setItem('sts_player_name', res.name);
    document.getElementById('game-over-name').textContent = res.name;
  } catch (_) {
    // Fallback: update locally.
    state.playerName = trimmed;
    localStorage.setItem('sts_player_name', trimmed);
    document.getElementById('game-over-name').textContent = trimmed;
  }
});

function render() {
  ctx.clearRect(0, 0, ARENA.w, ARENA.h);

  // Hero
  drawEmoji(HERO.emoji, state.hero.x, state.hero.y, 36);

  for (const e of state.enemies) drawEmoji(e.def.emoji, e.x, e.y, 30);
  for (const p of state.projectiles) drawEmoji(p.weapon.emoji, p.x, p.y, 20);

  // Feature 8: name-changed banner (3 seconds, wall-clock so it dismisses
  // even when the game is paused or on the game-over screen).
  if (state.nameChangedBanner) {
    const elapsed = (Date.now() - state.nameChangedBanner.shownAtMs) / 1000;
    if (elapsed < 3) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, 3 - elapsed);
      ctx.font = 'bold 22px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = '#ffd76b';
      ctx.shadowColor = 'rgba(0,0,0,.85)';
      ctx.shadowBlur = 10;
      ctx.fillText(state.nameChangedBanner.text, ARENA.w / 2, ARENA.h / 2 - 110);
      ctx.restore();
    } else {
      state.nameChangedBanner = null;
    }
  }

  // Spread-shot unlock banner (3 seconds, fades in the last second).
  if (state.spread && state.time - state.spreadShownAt < 3) {
    const t = state.time - state.spreadShownAt;
    ctx.save();
    ctx.globalAlpha = Math.min(1, 3 - t);
    ctx.font = 'bold 36px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffd76b';
    ctx.shadowColor = 'rgba(0,0,0,.85)';
    ctx.shadowBlur = 10;
    ctx.fillText('⚡ SPREAD SHOT UNLOCKED ⚡', ARENA.w / 2, ARENA.h / 2 - 80);
    ctx.restore();
  }

  // Pointer target indicator (touch/mouse hold-to-move).
  if (state.pointer.active) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 215, 107, .7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(state.pointer.x, state.pointer.y, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(state.pointer.x, state.pointer.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 215, 107, .85)';
    ctx.fill();
    ctx.restore();
  }

  renderHUD();
}

function drawEmoji(emoji, x, y, size = 32) {
  ctx.font = `${size}px serif`;
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 6;
  ctx.fillText(emoji, x, y);
  ctx.shadowBlur = 0;
}

function renderHUD() {
  document.getElementById('hud-hp').textContent    = `❤️ ${Math.max(0, Math.round(state.hero.hp))}`;
  document.getElementById('hud-score').textContent = `⭐ ${state.score}`;
  const waveText = `🌊 wave ${state.spawn.wave}`;
  const progress = state.spread
    ? '⚡ spread!'
    : `🗡 ${state.kills}/${SPREAD_KILL_THRESHOLD}`;
  document.getElementById('hud-wave').textContent  = `${waveText} · ${progress}`;
  document.getElementById('hud-time').textContent  = `⏱ ${state.time.toFixed(1)}s`;
}

function startRun() {
  Object.assign(state, {
    running: true, paused: false, gameOver: false,
    time: 0, score: 0, kills: 0, spread: false, spreadShownAt: 0,
    hero: { x: ARENA.w / 2, y: ARENA.h / 2, hp: HERO.maxHp, vx: 0, vy: 0 },
    enemies: [], projectiles: [], particles: [],
    spawn: { nextAt: 0, wave: 1 },
  });
  state.weapons = WEAPONS.map(def => ({ def, cooldownLeft: def.cooldown }));
}

const KEYMAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
};
// Don't intercept WASD/arrows when the user is typing in an input — otherwise
// 'a','s','d','w' silently never reach the name-entry box (or any other input).
function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
window.addEventListener('keydown', e => {
  if (isTyping(e)) return;
  const k = KEYMAP[e.code]; if (k) { state.input[k] = true; e.preventDefault(); }
});
window.addEventListener('keyup', e => {
  if (isTyping(e)) return;
  const k = KEYMAP[e.code]; if (k) { state.input[k] = false; e.preventDefault(); }
});

// Pointer (touch / mouse) — hold-to-move toward pointer position. Works for
// trackpads, mice, and phone touchscreens via Pointer Events.
function pointerToCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width  / rect.width),
    y: (e.clientY - rect.top)  * (canvas.height / rect.height),
  };
}
canvas.addEventListener('pointerdown', e => {
  if (e.button !== undefined && e.button !== 0) return; // primary button only
  canvas.setPointerCapture(e.pointerId);
  const p = pointerToCanvas(e);
  state.pointer.active = true;
  state.pointer.x = p.x;
  state.pointer.y = p.y;
  e.preventDefault();
});
canvas.addEventListener('pointermove', e => {
  if (!state.pointer.active) return;
  const p = pointerToCanvas(e);
  state.pointer.x = p.x;
  state.pointer.y = p.y;
  e.preventDefault();
});
const releasePointer = e => {
  if (!state.pointer.active) return;
  state.pointer.active = false;
  if (e.pointerId !== undefined && canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) {
    canvas.releasePointerCapture(e.pointerId);
  }
};
canvas.addEventListener('pointerup',     releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('pointerleave',  releasePointer);
// Prevent the canvas from scrolling the page on touch — the player wants
// these gestures to control the hero, not pan the document.
canvas.style.touchAction = 'none';

document.getElementById('submit-score').addEventListener('click', async () => {
  const errEl = document.getElementById('submit-error');
  const name = state.playerName;

  if (!name || name.length > 16 || !/^[A-Za-z0-9 ]+$/.test(name)) {
    errEl.textContent = 'Name must be 1–16 characters, letters/numbers/spaces.';
    errEl.classList.remove('hidden');
    return;
  }

  let result;
  try {
    const r = await fetch('/api/score.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, score: state.score,
        wave: state.spawn.wave,
        duration: Math.round(state.time),
      }),
    });
    result = await r.json();
    if (!r.ok) throw new Error(result.error || `HTTP ${r.status}`);
  } catch (e) {
    errEl.textContent = `Couldn't submit: ${e.message}`;
    errEl.classList.remove('hidden');
    return;
  }

  document.getElementById('game-over').classList.add('hidden');
  await showLeaderboard(result.rank);
});

async function showLeaderboard(myRank) {
  const r = await fetch('/api/leaderboard.php', { cache: 'no-store' });
  const data = await r.json();

  document.getElementById('rank-summary').textContent =
    `You ranked #${myRank}.`;

  const renderList = (id, rows) => {
    const el = document.getElementById(id);
    el.innerHTML = '';
    for (const row of rows) {
      const li = document.createElement('li');
      li.textContent = `${row.name} — ${row.score} (wave ${row.wave})`;
      el.appendChild(li);
    }
  };
  renderList('lb-today',   data.today);
  renderList('lb-alltime', data.allTime);

  document.getElementById('leaderboard').classList.remove('hidden');
}

document.getElementById('play-again').addEventListener('click', () => {
  document.getElementById('leaderboard').classList.add('hidden');
  startRun();
});

async function pollServerState() {
  try {
    // Feature 1 & 2: send live stats and activity flags.
    const playing = (state.running && !state.gameOver) ? 1 : 0;
    const visible = state.tabVisible ? 1 : 0;
    const qs = [
      `cid=${encodeURIComponent(state.clientId)}`,
      `name=${encodeURIComponent(state.playerName)}`,
      `score=${state.score}`,
      `wave=${state.spawn.wave}`,
      `hp=${Math.max(0, Math.round(state.hero.hp))}`,
      `playing=${playing}`,
      `visible=${visible}`,
    ].join('&');
    const r = await fetch(`/api/state.php?${qs}`, { cache: 'no-store' });
    if (!r.ok) return;
    const s = await r.json();

    // Feature 8: if server has an authoritative name that differs, update locally.
    if (s.name && s.name !== '' && s.name !== state.playerName) {
      const oldName = state.playerName;
      state.playerName = s.name;
      localStorage.setItem('sts_player_name', s.name);
      // Show transient banner.
      state.nameChangedBanner = { text: `Name changed by teacher → ${s.name}`, shownAtMs: Date.now() };
    }

    // Stash personal message and personal paused flag.
    state.personalMessage = s.personalMessage || '';
    state.personalPaused  = !!s.personalPaused;

    // Pause / resume.
    state.paused = !!s.paused;
    const overlay = document.getElementById('overlay');
    const isAnyPaused = state.paused || state.personalPaused;
    if (isAnyPaused) {
      let overlayHtml;
      if (state.paused) {
        overlayHtml = `<div>⏸ PAUSED BY TEACHER</div>`;
        if (s.message) overlayHtml += `<div class="sub">🔔 ${escapeHtml(s.message)}</div>`;
      } else {
        overlayHtml = `<div>⏸ PAUSED — your teacher wants your attention</div>`;
      }
      if (state.personalMessage) overlayHtml += `<div class="sub">👤 ${escapeHtml(state.personalMessage)}</div>`;
      overlay.innerHTML = overlayHtml;
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
    }

    // Message bar (shown when not paused — stacks broadcast + personal).
    const bar = document.getElementById('message-bar');
    if (!isAnyPaused) {
      const lines = [];
      if (s.message) lines.push(`🔔 ${escapeHtml(s.message)}`);
      if (state.personalMessage) lines.push(`👤 ${escapeHtml(state.personalMessage)}`);
      bar.innerHTML = lines.join('<br>');
    } else {
      bar.innerHTML = '';
    }

    // Force reload. The server keeps emitting the flag for ~10s so latecomers
    // catch it, but a client that just reloaded would otherwise loop until the
    // window expires. Skip the reload if we reloaded ourselves within ~12s.
    if (s.forceReload && s.version > state.serverVersion) {
      const last = parseInt(localStorage.getItem('sts_last_reload_at') || '0', 10);
      if (Date.now() - last >= 12000) {
        localStorage.setItem('sts_last_reload_at', String(Date.now()));
        state.serverVersion = s.version;
        setTimeout(() => location.reload(), 600);
        return;
      }
    }
    state.serverVersion = s.version;

    // Feature 12: poll overlay.
    updatePollOverlay(s);
  } catch (_) {
    // Network blip — try again on next tick.
  }
}

// Feature 12: poll overlay management.
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

  state.pollState = { pollId, question: s.pollQuestion, options, myAnswer };

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

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

setInterval(pollServerState, 2000);
pollServerState();
