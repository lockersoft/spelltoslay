import { TYPO_HP_PENALTY, WPM_WINDOW_S, PREFERS_REDUCED_MOTION } from './constants.js';
import { state } from './state.js';
import { typeInput, wordSizeSlider } from './dom.js';
import { hasPrefix, enemiesForPrefix, closestToHero, removeEnemyFromIndex } from './words.js';

// The buffer can stop matching anything without the player touching a key:
// the enemy they were typing walked into the hero. Left alone, every later
// keystroke would be scored as a typo, so drop it.
export function dropOrphanedBuffer() {
  if (state.typedBuffer === '' || hasPrefix(state.typedBuffer)) return;
  state.typedBuffer = '';
  state.lockedEnemyId = null;
  typeInput.value = '';
  typeInput.classList.remove('stalled');
}

// How many leading letters of this enemy's word to draw as "typed".
export function typedLenFor(e) {
  const buf = state.typedBuffer;
  return (!e.dying && buf !== '' && e.word.startsWith(buf)) ? buf.length : 0;
}

// ─── Typing input ────────────────────────────────────
function onType() {
  if (!state.running || state.gameOver || state.paused || state.personalPaused) {
    typeInput.value = '';
    return;
  }
  const raw = typeInput.value.toLowerCase().replace(/[^a-z]/g, '');
  const prev = state.typedBuffer;

  // Buffer shrank (backspace, or the whole field cleared at once).
  if (raw.length < prev.length) {
    // Only keep what is still a real prefix; a paste-over could be anything.
    state.typedBuffer = (raw === '' || hasPrefix(raw)) ? raw : '';
    typeInput.value = state.typedBuffer;
    typeInput.classList.remove('stalled');
    refreshLock();
    return;
  }

  // Process new keystrokes one at a time.
  for (let i = prev.length; i < raw.length; i++) {
    const ch = raw[i];
    state.keystrokes.total += 1;
    const candidatePrefix = state.typedBuffer + ch;
    if (hasPrefix(candidatePrefix)) {
      // Correct letter (the buffer extends a real prefix of at least one live enemy).
      state.typedBuffer = candidatePrefix;
      state.keystrokes.correct += 1;
      state.wpmLog.push({ ts: state.time, chars: 1 });
      commitOrLock();
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
}

// Space/Enter: explicit commit when the buffer matches a live enemy's full word.
// Needed for prefix-of-another cases (e.g. "a" vs "and"): typing 'a' alone leaves
// the lock ambiguous, so without an explicit commit the player can't slay the
// shorter word while the longer one is alive.
typeInput.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  if (!state.running || state.gameOver || state.paused || state.personalPaused) return;
  if (state.typedBuffer === '') return;
  ev.preventDefault();
  const exact = enemiesForPrefix(state.typedBuffer).filter(e => e.word === state.typedBuffer);
  if (exact.length === 0) {
    // Buffer isn't a complete word of any live enemy — premature commit = typo.
    state.hero.hp = Math.max(0, state.hero.hp - TYPO_HP_PENALTY);
    if (state.hero.hp === 0) state.gameOver = true;
    state.streak = 0;
    typeInput.classList.add('stalled');
    flashLockedRed();
    return;
  }
  onEnemySlain(closestToHero(exact));
});

export function refreshLock() {
  const best = closestToHero(enemiesForPrefix(state.typedBuffer));
  state.lockedEnemyId = (state.typedBuffer !== '' && best) ? best.id : null;
}

// Decide what (if anything) to do after the buffer has been extended by one
// valid keystroke. Damage is deferred while the prefix matches multiple live
// enemies. When the buffer exactly matches at least one live enemy's word and
// no live enemy could extend the buffer further, the closest exact match is
// slain immediately (two enemies may carry the same word).
function commitOrLock() {
  const buf = state.typedBuffer;
  const candidates = enemiesForPrefix(buf);
  if (candidates.length === 0) return;

  const exact = candidates.filter(e => e.word === buf);
  const extending = candidates.length - exact.length;

  if (exact.length >= 1 && extending === 0) {
    onEnemySlain(closestToHero(exact));
    return;
  }

  if (candidates.length === 1) {
    const e = candidates[0];
    const remaining = e.word.length - buf.length;
    if (remaining < e.hp) e.hp = remaining;   // monotone: backspace doesn't heal
    state.lockedEnemyId = e.id;
    return;
  }

  // Ambiguous — no damage. Visual lock on the closest prefix-matcher.
  state.lockedEnemyId = closestToHero(candidates).id;
}

function onEnemySlain(e) {
  e.hp = 0;
  const word = e.word;
  // Score: floor(wordLength × pointMultiplier × streakBonus)
  const streakBonus = Math.min(1 + 0.05 * state.streak, 2.0);
  const points = Math.floor(word.length * e.def.pointMultiplier * streakBonus);
  state.score += points;
  state.kills += 1;
  state.streak += 1;
  if (state.streak > state.bestStreak) state.bestStreak = state.streak;

  // The enemy is dead-on-paper now. Pull it from the prefix index immediately
  // so further typing can't match it. Reset the player's typing state.
  removeEnemyFromIndex(e);
  state.typedBuffer = '';
  state.lockedEnemyId = null;
  typeInput.value = '';

  if (PREFERS_REDUCED_MOTION) {
    // Skip the orb. Splice the enemy out now and play a brief ring at
    // its last position.
    state.enemies = state.enemies.filter(en => en.id !== e.id);
    state.effects.push({
      kind: 'ring',
      x: e.x, y: e.y,
      t0: state.time,
      t1: state.time + 0.08,
    });
    return;
  }

  // Standard path: enemy enters dying state, orb flies from hero. The
  // enemy is spliced from state.enemies by updateEffects when the orb
  // lands.
  e.dying = true;
  state.effects.push({
    kind: 'orb',
    x0: state.hero.x, y0: state.hero.y,
    x1: e.x,          y1: e.y,
    t0: state.time,
    t1: state.time + 0.12,
    enemyId: e.id,
  });
}

function flashLockedRed() {
  const e = state.enemies.find(en => en.id === state.lockedEnemyId);
  if (!e) return;
  e.flashUntil = state.time + 0.4;
}

export function currentWpm() {
  // Trim WPM log to last WPM_WINDOW_S seconds.
  const cutoff = state.time - WPM_WINDOW_S;
  while (state.wpmLog.length > 0 && state.wpmLog[0].ts < cutoff) state.wpmLog.shift();
  if (state.wpmLog.length === 0) return 0;
  const chars = state.wpmLog.reduce((s, e) => s + e.chars, 0);
  const span  = Math.max(1, state.time - state.wpmLog[0].ts);
  return Math.round((chars / 5) * (60 / span));
}

export function currentAccuracy() {
  if (state.keystrokes.total === 0) return 100;
  return Math.round(100 * state.keystrokes.correct / state.keystrokes.total);
}

export function elapsedMMSS() {
  const t = Math.floor(state.time);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

typeInput.addEventListener('input', onType);
// Recapture focus only during gameplay. While a modal is up (name entry, game over),
// state.running is false and the user is typing into a different input — don't steal.
typeInput.addEventListener('blur',  () => setTimeout(() => {
  // Don't steal focus back from the word-size slider — the user is adjusting it.
  if (state.running && document.activeElement !== wordSizeSlider) typeInput.focus();
}, 50));
window.addEventListener('load',     () => { if (state.running) typeInput.focus(); });
