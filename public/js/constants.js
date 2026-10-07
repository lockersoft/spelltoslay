// ─── Constants & tuning ──────────────────────────────
export const ARENA = { w: 960, h: 600 };
export const HERO  = { emoji: '🛡️', size: 36 };
export const MAX_HP = 100;
export const TYPO_HP_PENALTY = 1;
// NOTE: public/api/score.php cross-checks submitted runs against
// WAVE_DURATION_S, the 32-letter word cap and the largest pointMultiplier
// below. Change them here and the server will start rejecting honest scores
// until its bounds are raised too.
export const WAVE_DURATION_S = 30;
export const BOSS_WAVE_INTERVAL = 5;
export const WPM_WINDOW_S = 30;
export const POLL_DISMISS_AFTER_MS = 15000;

// `true` if the OS reports prefers-reduced-motion. Sampled once at load,
// not reactive — a classroom user toggling the setting mid-run won't see
// the orb appear/disappear partway through.
export const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ─── Registries (students extend these) ──────────────
export const ENEMIES = [
  { id: 'ghost',  emoji: '👻',  difficultyClass: 'easy',   speed: 30, contactDamage: 10, pointMultiplier: 1, size: 28 },
  { id: 'dragon', emoji: '🐲',  difficultyClass: 'medium', speed: 22, contactDamage: 15, pointMultiplier: 2, size: 32 },
  { id: 'banana', emoji: '🍌',  difficultyClass: 'hard',   speed: 16, contactDamage: 25, pointMultiplier: 4, size: 38 },
];
