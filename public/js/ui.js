import { MAX_HP } from './constants.js';
import { state } from './state.js';
import { postJson } from './api.js';
import { typeInput, wordSizeSlider } from './dom.js';
import { clearPrefixIndex } from './words.js';
import { currentWpm, currentAccuracy, elapsedMMSS } from './typing.js';

// ─── Word-size slider ────────────────────────────────
const wordSizeValue  = document.getElementById('word-size-value');
wordSizeSlider.value = String(state.wordFontSize);
wordSizeValue.textContent = String(state.wordFontSize);
wordSizeSlider.addEventListener('input', () => {
  const v = Math.max(12, Math.min(40, parseInt(wordSizeSlider.value, 10) || 22));
  state.wordFontSize = v;
  wordSizeValue.textContent = String(v);
  localStorage.setItem('sts_word_font_size', String(v));
});

// ─── Name entry / change ─────────────────────────────
const nameEntryEl   = document.getElementById('name-entry');
const entryNameInput = document.getElementById('entry-name');
const startPlayingBtn = document.getElementById('start-playing');
const entryErrorEl  = document.getElementById('entry-error');

const nameTitleEl   = document.getElementById('name-entry-title');
const cancelNameBtn = document.getElementById('cancel-name');
let nameModalMode = 'first';   // 'first' = welcome screen, 'change' = from game over

export function openNameModal(mode) {
  nameModalMode = mode;
  nameTitleEl.textContent = mode === 'first' ? 'Welcome to SpellToSlay' : 'Change your name';
  startPlayingBtn.textContent = mode === 'first' ? 'Start playing' : 'Save name';
  cancelNameBtn.classList.toggle('hidden', mode === 'first');
  entryNameInput.value = mode === 'first' ? '' : state.playerName;
  entryErrorEl.classList.add('hidden');
  nameEntryEl.classList.remove('hidden');
  entryNameInput.focus();
}

function showNameError(msg) {
  entryErrorEl.textContent = msg;
  entryErrorEl.classList.remove('hidden');
}

let nameSavePending = false;
async function submitName() {
  if (nameSavePending) return;
  const v = entryNameInput.value.trim();
  if (!/^[A-Za-z0-9 ]{1,16}$/.test(v)) {
    showNameError('Name must be 1–16 letters, numbers, or spaces.');
    return;
  }
  // The server owns the "is this name allowed" rule.
  nameSavePending = true;
  startPlayingBtn.disabled = true;
  cancelNameBtn.disabled = true;
  let status = 0;   // 0 = server not reached
  let error = '';
  try {
    const r = await postJson('/api/rename.php', { cid: state.clientId, name: v });
    status = r.status;
    if (!r.ok) error = (await r.json().catch(() => ({}))).error || '';
  } catch (_) {
    /* offline */
  } finally {
    nameSavePending = false;
    startPlayingBtn.disabled = false;
    cancelNameBtn.disabled = false;
  }

  if (status === 400) {
    showNameError(error === 'name not allowed'
      ? 'That name is not allowed. Please pick another.'
      : 'Name must be 1–16 letters, numbers, or spaces.');
    return;
  }
  // A first-time player may start even if the server could not be reached
  // (score submission re-checks the name). An existing player's rename must
  // really have been saved, or the next poll would silently undo it.
  if (nameModalMode === 'change' && status !== 200) {
    showNameError('Could not save the name. Try again.');
    return;
  }

  state.playerName = v;
  localStorage.setItem('sts_player_name', v);
  nameEntryEl.classList.add('hidden');
  entryErrorEl.classList.add('hidden');
  if (nameModalMode === 'first') {
    state.running = true;
    typeInput.focus();
  } else {
    goNameEl.textContent = v;
  }
}

// The server refused the name this browser has saved (it predates the current
// rules, or was typed while offline): forget it and ask again.
export function forgetRejectedName() {
  state.playerName = '';
  localStorage.removeItem('sts_player_name');
  state.running = false;
  if (nameEntryEl.classList.contains('hidden') || nameModalMode !== 'first') {
    openNameModal('first');
    showNameError('That name is not allowed. Please pick another.');
  }
}

startPlayingBtn.addEventListener('click', submitName);
entryNameInput.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') { ev.preventDefault(); submitName(); }
});
cancelNameBtn.addEventListener('click', () => nameEntryEl.classList.add('hidden'));
document.getElementById('change-name').addEventListener('click', (ev) => {
  ev.preventDefault();
  openNameModal('change');
});

if (!state.playerName) {
  openNameModal('first');
  state.running = false; // engine stays idle until they submit
} else {
  // Already named on a prior visit; just go.
  nameEntryEl.classList.add('hidden');
}

// ─── Game-over flow, score submission, leaderboard ──
const gameOverEl     = document.getElementById('game-over');
const goSummaryEl    = document.getElementById('game-over-summary');
const goNameEl       = document.getElementById('game-over-name');
const submitScoreBtn = document.getElementById('submit-score');
const submitErrorEl  = document.getElementById('submit-error');
const leaderboardEl  = document.getElementById('leaderboard');
const playAgainBtn   = document.getElementById('play-again');
const skipSubmitBtn  = document.getElementById('skip-submit');
const rankSummaryEl  = document.getElementById('rank-summary');
const lbTodayEl      = document.getElementById('lb-today');
const lbAlltimeEl    = document.getElementById('lb-alltime');

let gameOverShown = false;
export function isGameOverShown() {
  return gameOverShown;
}

export function showGameOver() {
  if (gameOverShown) return;
  gameOverShown = true;
  goSummaryEl.textContent =
    `Score ${state.score} · ${state.kills} words · WPM ${currentWpm()} · ACC ${currentAccuracy()}% · time ${elapsedMMSS()}`;
  goNameEl.textContent = state.playerName;
  submitErrorEl.classList.add('hidden');
  submitScoreBtn.disabled = false;
  skipSubmitBtn.disabled = false;
  gameOverEl.classList.remove('hidden');
}

submitScoreBtn.addEventListener('click', async () => {
  // Both buttons are off while the request is in flight: a restart now would
  // let this callback put the leaderboard on top of the new game.
  submitScoreBtn.disabled = true;
  skipSubmitBtn.disabled = true;
  submitErrorEl.classList.add('hidden');
  try {
    const r = await postJson('/api/score.php', {
        name: state.playerName,
        score: state.score,
        wave: state.spawn.wave,
        duration: Math.floor(state.time),
        wpm: currentWpm(),
        accuracy: currentAccuracy(),
        wordsSlain: state.kills,
      });
    const j = await r.json();
    if (!r.ok) {
      submitErrorEl.textContent = j.error || `HTTP ${r.status}`;
      submitErrorEl.classList.remove('hidden');
      submitScoreBtn.disabled = false;
      skipSubmitBtn.disabled = false;
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
    skipSubmitBtn.disabled = false;
  }
});

export async function renderLeaderboard() {
  try {
    const r = await fetch('/api/leaderboard.php', { cache: 'no-store' });
    const j = await r.json();
    const fill = (ol, rows) => {
      ol.replaceChildren(...(rows || []).map((e) => {
        const li = document.createElement('li');
        const b = document.createElement('b');
        b.textContent = e.name;
        li.append(b, ` — ${e.score} (W${e.wave}, WPM ${e.wpm}, ${e.accuracy}%)`);
        return li;
      }));
    };
    fill(lbTodayEl, j.today);
    fill(lbAlltimeEl, j.allTime);
  } catch (_) { /* ignore */ }
}

export function resetRun() {
  state.enemies.length = 0;
  state.effects.length = 0;
  clearPrefixIndex();
  state.score = 0; state.kills = 0; state.streak = 0; state.bestStreak = 0;
  state.keystrokes = { correct: 0, total: 0 };
  state.wpmLog.length = 0;
  state.hero.hp = MAX_HP;
  state.time = 0;
  state.spawn = { nextAt: 0, wave: 1, waveStartedAt: 0 };
  state.gameOver = false;
  gameOverShown = false;
  state.typedBuffer = '';
  state.lockedEnemyId = null;
  typeInput.value = '';
  typeInput.classList.remove('stalled');
  gameOverEl.classList.add('hidden');
  leaderboardEl.classList.add('hidden');
  state.running = true;
  typeInput.focus();
}
playAgainBtn.addEventListener('click', resetRun);
skipSubmitBtn.addEventListener('click', resetRun);
