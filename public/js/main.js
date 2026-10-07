import { state } from './state.js';
import { fetchWordPool, pickWordFor, addEnemyToIndex, removeEnemyFromIndex } from './words.js';
import { updateSpawner, updateEnemies } from './spawner.js';
import { typedLenFor } from './typing.js';
import { updateEffects } from './effects.js';
import { layoutLabels } from './labels.js';
import { render } from './render.js';
import { pollServerState, applyMessages } from './net.js';
import { showGameOver, isGameOverShown, renderLeaderboard } from './ui.js';

// ─── Test hooks ──────────────────────────────────────
// Playwright drives the game through these. Any other hostname — production
// included — never gets them, so the console has nothing obvious to poke at.
if (location.hostname === 'localhost') {
  Object.assign(window, {
    state, pickWordFor, addEnemyToIndex, removeEnemyFromIndex,
    typedLenFor, layoutLabels, applyMessages, renderLeaderboard,
  });
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
    updateEffects(dt);
  }
  // Surface the game-over modal the frame the run ends.
  if (state.gameOver && !isGameOverShown()) {
    state.running = false;
    showGameOver();
  }
  render();
  requestAnimationFrame(tick);
}

// ─── Init & start ────────────────────────────────────
(async function init() {
  await fetchWordPool();
  await pollServerState();
  // Boot main loop right away — game stays in title state until name entry submitted (Task 13)
  state.running = !!state.playerName;
  state.spawn.waveStartedAt = state.time;
  requestAnimationFrame(tick);
})();
