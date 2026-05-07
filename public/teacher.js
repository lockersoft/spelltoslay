'use strict';

const url = new URL(location.href);
let key = url.searchParams.get('key') || sessionStorage.getItem('slay_teacher_key') || '';
if (key) sessionStorage.setItem('slay_teacher_key', key);

const gate = document.getElementById('auth-gate');
const panel = document.getElementById('control-panel');
const errEl = document.getElementById('teacher-error');

if (!key) {
  // Stay on the gate.
} else {
  gate.classList.add('hidden');
  panel.classList.remove('hidden');
  init();
}

function showError(msg) {
  errEl.textContent = msg;
  errEl.classList.remove('hidden');
  setTimeout(() => errEl.classList.add('hidden'), 4000);
}

async function action(payload) {
  const r = await fetch(`/api/teacher.php?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    showError(j.error || `HTTP ${r.status}`);
    throw new Error(j.error || r.status);
  }
  return r.json();
}

let lastPaused = false;
function setPauseButton(paused) {
  const btn = document.getElementById('pause-btn');
  btn.textContent = paused ? '▶ RESUME EVERYONE' : '⏸ PAUSE EVERYONE';
  btn.classList.toggle('resumed', paused);
  btn.dataset.paused = paused ? '1' : '0';
  lastPaused = paused;
}

let activePoll = null; // { pollId, question, options }
let lastPlayers = [];  // cached for poll tally

async function refreshState() {
  try {
    const r = await fetch('/api/state.php', { cache: 'no-store' });
    const s = await r.json();
    setPauseButton(!!s.paused);
    document.getElementById('player-count').textContent = `● ${s.playerCount} players`;
    if (document.getElementById('msg-input') !== document.activeElement) {
      document.getElementById('msg-input').value = s.message || '';
    }

    // Poll state mirroring (teacher view).
    const wasActive = !!activePoll;
    if (s.pollQuestion) {
      activePoll = { pollId: s.pollId, question: s.pollQuestion, options: s.pollOptions || [] };
      document.getElementById('poll-form').classList.add('hidden');
      document.getElementById('poll-active').classList.remove('hidden');
      document.getElementById('poll-active-question').textContent = s.pollQuestion;
      renderPollTally();
    } else {
      activePoll = null;
      document.getElementById('poll-form').classList.remove('hidden');
      document.getElementById('poll-active').classList.add('hidden');
      if (wasActive) {
        // Clear the form fields after a poll ends so the next start is fresh.
        document.getElementById('poll-question-input').value = '';
        document.querySelectorAll('.poll-opt').forEach(el => el.value = '');
      }
    }
  } catch (_) { /* ignore */ }
}

async function refreshLeaderboard() {
  try {
    const r = await fetch('/api/leaderboard.php', { cache: 'no-store' });
    const data = await r.json();
    const ol = document.getElementById('live-top');
    ol.innerHTML = '';
    for (const row of data.allTime.slice(0, 5)) {
      const li = document.createElement('li');
      li.textContent = `${row.name} — ${row.score} (wave ${row.wave})`;
      ol.appendChild(li);
    }
  } catch (_) {}
}

async function refreshRoster() {
  try {
    const r = await fetch(`/api/players.php?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
    if (!r.ok) return;
    const data = await r.json();
    lastPlayers = data.players;

    const roster = document.getElementById('roster');
    document.getElementById('roster-count').textContent = data.players.length;

    for (const player of data.players) {
      const cid = player.cid;
      let row = roster.querySelector(`[data-row-cid="${CSS.escape(cid)}"]`);
      if (!row) {
        row = createRosterRow(cid);
        roster.appendChild(row);
      }
      updateRosterRow(row, player);
    }

    // Remove rows for clients that are no longer fresh.
    const freshCids = new Set(data.players.map(p => p.cid));
    for (const r of Array.from(roster.querySelectorAll('[data-row-cid]'))) {
      if (!freshCids.has(r.dataset.rowCid)) r.remove();
    }

    if (activePoll) renderPollTally();
  } catch (_) {}
}

function createRosterRow(cid) {
  const div = document.createElement('div');
  div.className = 'roster-row';
  div.dataset.rowCid = cid;
  div.innerHTML = `
    <span class="activity-dot yellow" title="status"></span>
    <span class="roster-name editable" title="Click to rename"></span>
    <button class="rename-btn" title="Rename this student">✏️</button>
    <span class="roster-stat" data-stat="score">⭐ 0</span>
    <span class="roster-stat" data-stat="wave">🌊 1</span>
    <span class="roster-stat" data-stat="hp">❤️ 0</span>
    <input class="roster-msg" placeholder="Send a personal message…">
    <button class="send-personal">Send</button>
    <button class="clear-personal secondary">Clear</button>
    <button class="pause-personal">⏸ Pause</button>
  `;

  div.querySelector('.send-personal').addEventListener('click', async () => {
    const text = div.querySelector('.roster-msg').value;
    await action({ action: 'messageStudent', cid, text });
  });
  div.querySelector('.clear-personal').addEventListener('click', async () => {
    div.querySelector('.roster-msg').value = '';
    await action({ action: 'messageStudent', cid, text: '' });
  });
  div.querySelector('.pause-personal').addEventListener('click', async () => {
    const btn = div.querySelector('.pause-personal');
    const isPaused = btn.dataset.paused === '1';
    await action({ action: isPaused ? 'resumeStudent' : 'pauseStudent', cid });
    refreshRoster();
  });
  div.querySelector('.roster-name').addEventListener('click', () => {
    beginRename(div, cid);
  });
  div.querySelector('.rename-btn').addEventListener('click', () => {
    beginRename(div, cid);
  });
  return div;
}

function updateRosterRow(row, player) {
  // Skip name update while a rename is in progress.
  if (!row.dataset.renaming) {
    row.querySelector('.roster-name').textContent = player.name || '(no name)';
  }

  // Activity dot.
  const dot = row.querySelector('.activity-dot');
  let cls = 'yellow';
  if (!player.isVisible) cls = 'red';
  else if (player.isPlaying) cls = 'green';
  dot.classList.remove('green', 'yellow', 'red');
  dot.classList.add(cls);
  dot.title = !player.isVisible ? 'Tab inactive'
    : player.isPlaying ? 'Playing'
    : 'Idle';

  // Live stats.
  row.querySelector('[data-stat="score"]').textContent = `⭐ ${player.score}`;
  row.querySelector('[data-stat="wave"]').textContent  = `🌊 ${player.wave}`;
  row.querySelector('[data-stat="hp"]').textContent    = `❤️ ${player.hp}`;

  // Personal message: only update if not focused.
  const input = row.querySelector('.roster-msg');
  if (document.activeElement !== input) {
    input.value = player.personalMessage || '';
  }

  // Pause button.
  const btn = row.querySelector('.pause-personal');
  btn.dataset.paused = player.personalPaused ? '1' : '0';
  btn.textContent = player.personalPaused ? '▶ Resume' : '⏸ Pause';
  btn.classList.toggle('paused', player.personalPaused);
}

function beginRename(row, cid) {
  if (row.dataset.renaming) return;
  row.dataset.renaming = '1';

  const nameSpan = row.querySelector('.roster-name');
  const original = nameSpan.textContent.replace('(no name)', '');
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 16;
  input.className = 'roster-name-input';
  input.value = original;
  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  let finished = false;
  const finish = async (commit) => {
    if (finished) return;
    finished = true;
    const newSpan = document.createElement('span');
    newSpan.className = 'roster-name editable';
    newSpan.title = 'Click to rename';
    newSpan.addEventListener('click', () => beginRename(row, cid));

    if (commit) {
      const newName = input.value.trim();
      if (newName && /^[A-Za-z0-9 ]{1,16}$/.test(newName) && newName !== original) {
        try {
          await action({ action: 'renameStudent', cid, name: newName });
          newSpan.textContent = newName;
        } catch (e) {
          newSpan.textContent = original || '(no name)';
        }
      } else {
        newSpan.textContent = original || '(no name)';
      }
    } else {
      newSpan.textContent = original || '(no name)';
    }

    input.replaceWith(newSpan);
    delete row.dataset.renaming;
    refreshRoster();
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

function renderPollTally() {
  if (!activePoll) return;
  const tally = activePoll.options.map(() => 0);
  let total = 0;
  for (const p of lastPlayers) {
    if (p.pollAnswer != null && p.pollAnswer >= 0 && p.pollAnswer < tally.length) {
      tally[p.pollAnswer]++;
      total++;
    }
  }
  const container = document.getElementById('poll-tally');
  container.innerHTML = '';
  const max = Math.max(1, ...tally);
  for (let i = 0; i < activePoll.options.length; i++) {
    const row = document.createElement('div');
    row.className = 'poll-tally-bar';
    const label = document.createElement('span');
    label.className = 'poll-tally-label';
    label.textContent = activePoll.options[i];
    const fill = document.createElement('span');
    fill.className = 'poll-tally-fill';
    fill.style.width = `${(tally[i] / max) * 200}px`;
    const count = document.createElement('span');
    count.className = 'poll-tally-count';
    count.textContent = tally[i];
    row.append(label, fill, count);
    container.appendChild(row);
  }
  const totalLine = document.createElement('p');
  totalLine.style.cssText = 'margin:8px 0 0;font-size:12px;color:#6e7681';
  totalLine.textContent = `${total} of ${lastPlayers.length} responded`;
  container.appendChild(totalLine);
}

async function refreshContributors() {
  try {
    const r = await fetch(`/api/contributors.php?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
    if (!r.ok) return;
    const data = await r.json();
    const ul = document.getElementById('contributors-list');
    ul.innerHTML = '';
    if (!data.contributors || data.contributors.length === 0) {
      const li = document.createElement('li');
      li.style.color = '#6e7681';
      li.textContent = 'No student contributions shipped yet.';
      ul.appendChild(li);
      return;
    }
    for (const c of data.contributors) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="contrib-name">${escapeHtml(c.name)}</span> — ${escapeHtml(c.feature)} <span class="contrib-version">v${escapeHtml(c.version)}</span>`;
      ul.appendChild(li);
    }
  } catch (_) {}
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function init() {
  document.getElementById('pause-btn').addEventListener('click', async () => {
    await action({ action: lastPaused ? 'resume' : 'pause' });
    refreshState();
  });

  const sendMsg = async () => {
    const v = document.getElementById('msg-input').value;
    await action({ action: 'message', text: v });
    refreshState();
  };
  document.getElementById('send-msg').addEventListener('click', sendMsg);
  document.getElementById('msg-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendMsg();
  });
  document.getElementById('clear-msg').addEventListener('click', async () => {
    document.getElementById('msg-input').value = '';
    await action({ action: 'message', text: '' });
    refreshState();
  });

  document.getElementById('reload-all').addEventListener('click', async () => {
    await action({ action: 'broadcastReload' });
  });

  document.getElementById('clear-board').addEventListener('click', async () => {
    if (!confirm('Wipe ALL leaderboard scores? This cannot be undone.')) return;
    await action({ action: 'clearLeaderboard', confirm: true });
    refreshLeaderboard();
  });

  document.getElementById('start-poll-btn').addEventListener('click', async () => {
    const question = document.getElementById('poll-question-input').value.trim();
    const options = Array.from(document.querySelectorAll('.poll-opt'))
      .map(el => el.value.trim()).filter(v => v !== '');
    if (!question || options.length < 2) {
      showError('Need a question and at least 2 non-empty options.');
      return;
    }
    await action({ action: 'startPoll', question, options });
    refreshState();
  });

  document.getElementById('end-poll-btn').addEventListener('click', async () => {
    await action({ action: 'endPoll' });
    refreshState();
  });

  setInterval(refreshState, 2000);
  setInterval(refreshLeaderboard, 5000);
  setInterval(refreshRoster, 2000);
  setInterval(refreshContributors, 30000);
  refreshState();
  refreshLeaderboard();
  refreshRoster();
  refreshContributors();
}
