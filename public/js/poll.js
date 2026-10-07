import { POLL_DISMISS_AFTER_MS } from './constants.js';
import { state } from './state.js';

// ─── Poll overlay ────────────────────────────────────
// The overlay sits on top of the canvas, so we auto-dismiss it 15 seconds
// after the player has voted — long enough to confirm the choice, short
// enough not to obscure gameplay.
export function updatePollOverlay(s) {
  const pollEl = document.getElementById('poll-overlay');
  if (!pollEl) return;

  if (!s.pollQuestion) {
    pollEl.classList.add('hidden');
    document.getElementById('poll-options').dataset.renderKey = '';
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
  const answered = myAnswer !== null && myAnswer !== undefined;

  if (answered) {
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
    btnsEl.replaceChildren(thanks, fade);
    btnsEl.dataset.renderKey = '';
    return;
  }

  // Unanswered: rebuilding the buttons on every 2s poll can swallow a click
  // that lands mid-rebuild, so only rebuild when the poll itself changed.
  const renderKey = `${pollId}:${JSON.stringify(options)}`;
  if (btnsEl.dataset.renderKey === renderKey) return;
  btnsEl.dataset.renderKey = renderKey;
  btnsEl.replaceChildren(...options.map((opt, i) => {
    const btn = document.createElement('button');
    btn.textContent = opt;
    btn.addEventListener('click', async () => {
      try {
        const r = await fetch('/api/poll-vote.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cid: state.clientId, pollId, optionIndex: i }),
        });
        if (!r.ok) return;   // leave the buttons up so the student can retry
        state.pollAnsweredAt = Date.now();
        // Re-render in answered state immediately (don't wait for next poll).
        updatePollOverlay({ ...s, pollMyAnswer: i });
        // Schedule a hide so the user doesn't have to wait for a poll cycle.
        setTimeout(() => pollEl.classList.add('hidden'), POLL_DISMISS_AFTER_MS);
      } catch (_) { /* network error: buttons stay */ }
    });
    return btn;
  }));
}
