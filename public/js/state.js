import { ARENA, MAX_HP } from './constants.js';

// ─── State ───────────────────────────────────────────
export const state = {
  running: false,
  paused: false,
  personalPaused: false,
  gameOver: false,
  time: 0,
  hero: { x: ARENA.w / 2, y: ARENA.h - 60, hp: MAX_HP },
  enemies: [],
  effects: [],          // active visual effects: orb projectiles, ring shockwaves
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
  // Per-browser visual preferences
  wordFontSize: 22,    // px; user-adjustable via the footer slider, persisted in localStorage
  // Word pool
  wordPool: [],
  wordSource: '',
  wordListVersion: -1,
  pushWordPending: '',
  lastPushWordConsumed: '',
  // Inherited polling
  serverVersion: -1,
  clientId: null,
  playerName: '',
  messageBar: '',
  labelRects: [],        // last frame's word-label rectangles (for tests)
  tabVisible: true,
  pollState: null,
  pollAnsweredAt: 0,
};

// ─── Per-browser identity and preferences ────────────
state.clientId = (() => {
  const stored = localStorage.getItem('sts_cid');
  if (stored) return stored;
  const cid = crypto.randomUUID();
  localStorage.setItem('sts_cid', cid);
  return cid;
})();
state.playerName = localStorage.getItem('sts_player_name') || '';
{
  const stored = parseInt(localStorage.getItem('sts_word_font_size'), 10);
  if (Number.isFinite(stored) && stored >= 12 && stored <= 40) state.wordFontSize = stored;
}
