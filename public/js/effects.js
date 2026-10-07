import { state } from './state.js';
import { ctx } from './dom.js';

// ─── Effect drawing helpers ──────────────────────────
export function drawOrb(fx, p) {
  // p is normalized progress 0..1 over the orb's lifetime.
  const x = fx.x0 + (fx.x1 - fx.x0) * p;
  const y = fx.y0 + (fx.y1 - fx.y0) * p;

  // Trail: hero → current pos, locked-blue, 25% opacity, no glow.
  ctx.strokeStyle = 'rgba(91, 141, 239, 0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(fx.x0, fx.y0);
  ctx.lineTo(x, y);
  ctx.stroke();

  // Orb: radial gradient, white core → locked-blue → transparent.
  const r = 8;
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
  grad.addColorStop(0,   '#ffffff');
  grad.addColorStop(0.4, '#5b8def');
  grad.addColorStop(1,   'rgba(91, 141, 239, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r * 2, 0, Math.PI * 2);
  ctx.fill();
}

export function drawRing(fx, p) {
  // Ease-out for radius growth; linear fade for opacity.
  const ease = 1 - (1 - p) * (1 - p);
  const alpha = 1 - p;

  // Outer locked-blue ring.
  ctx.strokeStyle = `rgba(91, 141, 239, ${0.85 * alpha})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(fx.x, fx.y, 6 + (36 - 6) * ease, 0, Math.PI * 2);
  ctx.stroke();

  // Inner white ring.
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.7 * alpha})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(fx.x, fx.y, 4 + (22 - 4) * ease, 0, Math.PI * 2);
  ctx.stroke();
}

// ─── Effects ─────────────────────────────────────────
export function updateEffects(dt) {
  if (state.effects.length === 0) return;
  const survivors = [];
  for (const fx of state.effects) {
    if (state.time < fx.t1) {
      survivors.push(fx);
      continue;
    }
    // Expired.
    if (fx.kind === 'orb') {
      // Splice the dying enemy out of state.enemies, if still present
      // (play-again or game-over reset may have cleared the list).
      state.enemies = state.enemies.filter(en => en.id !== fx.enemyId);
      // Hand off to a ring at the impact point.
      survivors.push({
        kind: 'ring',
        x: fx.x1, y: fx.y1,
        t0: state.time,
        t1: state.time + 0.22,
      });
    }
    // Expired rings just drop.
  }
  state.effects = survivors;
}
