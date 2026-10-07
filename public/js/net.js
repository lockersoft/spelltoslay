import { state } from './state.js';
import { fetchWordPool } from './words.js';
import { updatePollOverlay } from './poll.js';
import { forgetRejectedName } from './ui.js';

// ─── Polling ─────────────────────────────────────────
// A reload broadcast stays visible in /api/state.php for 10 seconds, and the
// page we reload INTO polls inside that window. Remember which broadcast this
// tab already obeyed. sessionStorage survives the reload; where it is blocked,
// fall back to "only obey broadcasts issued after this page first heard from
// the server". (Two broadcasts in the same second count as one.)
const RELOAD_KEY = 'sts_reload_handled';
let bootServerTime = 0;
function shouldReload(s) {
  const at = s.forceReloadAt | 0;
  if (!bootServerTime) bootServerTime = s.serverTime | 0;
  if (!s.forceReload || !at) return false;
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === String(at)) return false;
    sessionStorage.setItem(RELOAD_KEY, String(at));
    return true;
  } catch (_) {
    return at > bootServerTime;
  }
}

const messageBarEl = document.getElementById('message-bar');
export function applyMessages(classMessage, personalMessage) {
  state.messageBar = [classMessage, personalMessage].filter(Boolean).join(' • ');
  messageBarEl.textContent = state.messageBar;
}

export async function pollServerState() {
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
  applyMessages(s.message || '', s.personalMessage || '');
  if (s.nameRejected && state.playerName) {
    forgetRejectedName();
  } else if (s.name && s.name !== state.playerName) {
    state.playerName = s.name;
    localStorage.setItem('sts_player_name', s.name);
  }

  if (shouldReload(s)) {
    location.reload();
    return;
  }

  // Word pool: refetch if version changed.
  if ((s.wordListVersion | 0) !== state.wordListVersion) {
    await fetchWordPool();
  }

  // Push word: queue exactly once. Server clears push_word after a 10s TTL,
  // but during that window we may receive the same word on multiple polls —
  // guard with state.lastPushWordConsumed so we only queue it the first time.
  if (s.pushWord && s.pushWord !== state.lastPushWordConsumed) {
    state.pushWordPending = s.pushWord;
    state.lastPushWordConsumed = s.pushWord;
  }
  if (!s.pushWord) {
    state.lastPushWordConsumed = '';
  }

  // Polls — capture state AND render the overlay (ported from SLAY).
  updatePollOverlay(s);
}
setInterval(pollServerState, 2000);
document.addEventListener('visibilitychange', () => { state.tabVisible = !document.hidden; });

// Wire the build-version display from /api/health.php
(async () => {
  try {
    const r = await fetch('/api/health.php', { cache: 'no-store' });
    const j = await r.json();
    const el = document.getElementById('build-version');
    if (el && j.version) el.textContent = 'v' + j.version;
  } catch (_) { /* ignore */ }
})();
