import { ARENA, HERO } from './constants.js';
import { state } from './state.js';
import { ctx } from './dom.js';
import { refreshLock, typedLenFor, currentWpm, currentAccuracy, elapsedMMSS } from './typing.js';
import { drawOrb, drawRing } from './effects.js';
import { layoutLabels } from './labels.js';

// ─── Render ──────────────────────────────────────────
export function render() {
  if (state.typedBuffer !== '') refreshLock();
  ctx.clearRect(0, 0, ARENA.w, ARENA.h);
  // Background
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, ARENA.w, ARENA.h);

  // Hero
  ctx.fillStyle = '#fff';
  ctx.font = `${HERO.size}px serif`;
  ctx.fillText(HERO.emoji, state.hero.x, state.hero.y);

  // Enemies
  for (const e of state.enemies) {
    ctx.font = `${e.def.size}px serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText(e.def.emoji, e.x, e.y);

    // Locked ring (skipped for dying — the lock indicator on a corpse is noise).
    if (!e.dying && e.id === state.lockedEnemyId) {
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
  }

  // Word labels. Laid out together so they stay inside the arena and do not
  // cover one another; the enemy nearest the hero gets first pick of position.
  // Font + pill scale uniformly from state.wordFontSize (user-adjustable).
  // The 14/22 base values come from the original v1 design at 14 px font.
  {
    const fs = state.wordFontSize;
    const sc = fs / 14;
    const padding = 6;
    ctx.font = `${fs}px ui-monospace, monospace`;
    const live = state.enemies.filter(e => !e.dying)
      .map(e => ({ e, d: Math.hypot(e.x - state.hero.x, e.y - state.hero.y) }))
      .sort((a, b) => a.d - b.d)
      .map(o => o.e);
    const items = live.map(e => ({
      id: e.id,
      x: e.x,
      y: e.y - e.def.size / 2 - 8 - sc,     // pill centre; the text row sits 1*sc below it
      w: ctx.measureText(e.word).width + padding * 2,
      h: 22 * sc,
    }));
    const rects = layoutLabels(items, ARENA);
    state.labelRects = rects;               // read by tests; nothing else uses it
    live.forEach((e, i) => {
      const r = rects[i];
      const n = typedLenFor(e);
      const typed = e.word.slice(0, n);
      const rest  = e.word.slice(n);
      const left  = r.cx - (r.w - padding * 2) / 2;
      const textY = r.cy + sc;
      ctx.fillStyle = '#1a2238';
      ctx.fillRect(r.cx - r.w / 2, r.cy - r.h / 2, r.w, r.h);
      const typedW = ctx.measureText(typed).width;
      ctx.fillStyle = '#06d6a0';
      ctx.fillText(typed, left + typedW / 2, textY);
      ctx.fillStyle = '#cde';
      ctx.fillText(rest, left + typedW + ctx.measureText(rest).width / 2, textY);
    });
  }

  // Effects (orbs, rings). Drawn after enemies so they sit above the play
  // field, but before the HUD (HUD lives further down in render()).
  for (const fx of state.effects) {
    const p = (state.time - fx.t0) / (fx.t1 - fx.t0);
    if (p < 0 || p > 1) continue;
    if (fx.kind === 'orb')  drawOrb(fx, p);
    else if (fx.kind === 'ring') drawRing(fx, p);
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
  const pTm   = pill(`TIME ${elapsedMMSS()}`, '#fff');
  pSc.draw(ARENA.w - pSc.w - 8, 8);
  pTm.draw(ARENA.w - pTm.w - 8, 30);

  // Bottom-right: WPM, accuracy, streak
  const pWp   = pill(`WPM ${currentWpm()}`, '#06d6a0');
  const pAc   = pill(`ACC ${currentAccuracy()}%`, '#5b8def');
  const pSt   = pill(`STREAK ${state.streak}`, '#ffd166');
  pWp.draw(ARENA.w - pWp.w - 8, ARENA.h - 70);
  pAc.draw(ARENA.w - pAc.w - 8, ARENA.h - 48);
  pSt.draw(ARENA.w - pSt.w - 8, ARENA.h - 26);

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
