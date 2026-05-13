# Laser-Kill Effect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the player types an enemy's word correctly, an orb projectile flies from the hero to the enemy and detonates as a ring shockwave at impact. Scoring still resolves at type-commit time; the effect is purely visual.

**Architecture:** Two new pieces of state — a per-`state` `effects` array (replacing the unused `particles` array) and a per-enemy `dying` flag. `onEnemySlain` no longer splices the enemy; it marks `e.dying = true` and pushes an orb effect. A new `updateEffects(dt)` step in the main loop expires orbs (→ pushes a ring + splices the dying enemy) and expires rings (→ drops them). A `prefers-reduced-motion` branch skips the orb entirely and fires a brief ring.

**Tech Stack:** Vanilla JS, Canvas 2D. Single file: `public/game.js`. No build step. Local dev server: `php -S localhost:8001 -t public` from repo root.

**Spec:** `docs/superpowers/specs/2026-05-13-laser-kill-effect-design.md`

---

## File Structure

Only one file is modified.

- `public/game.js` — single-file game. All changes land here. (823 lines today.)
- `CHANGELOG.md` — `[Unreleased] / Added` entry added in the final task.

No new files. No new modules. The game has no build step or test framework for client-side code; verification is manual in a browser plus the existing Playwright suite (which is unaffected).

---

## Task 1: State scaffolding + dying-guard in `updateEnemies`

**Files:**
- Modify: `public/game.js:29` (replace dead `particles:` field with `effects:`)
- Modify: `public/game.js:216-236` (add dying-skip in `updateEnemies`)
- Modify: `public/game.js:707-717` (call `updateEffects` from `tick`)
- Modify: `public/game.js:787-804` (clear effects in play-again reset)
- Add: `updateEffects(dt)` empty stub above `tick`

After this task there is **no visible change** in the game. Nothing ever sets `e.dying = true` yet, and `updateEffects` is a no-op. This is intentional — it lets us land scaffolding without behaviour changes.

- [ ] **Step 1: Start the local server**

```bash
php -S localhost:8001 -t public
```

Open `http://localhost:8001` in a browser. Enter a name, play one wave to confirm the baseline is healthy (enemies spawn, you can type and slay them, score increments). Leave the server running.

- [ ] **Step 2: Replace `state.particles` with `state.effects`**

Edit `public/game.js`. Find line 29:

```js
  particles: [],
```

Replace with:

```js
  effects: [],          // active visual effects: orb projectiles, ring shockwaves
```

`state.particles` was dead code from the SLAY parent project (`grep -n "particles" public/game.js` returns only the declaration).

- [ ] **Step 3: Add the dying-skip to `updateEnemies`**

Edit `public/game.js`. Find line 216 (function `updateEnemies`). Replace the loop body so the very first action inside the `for` is to skip dying enemies. The full function becomes:

```js
function updateEnemies(dt) {
  const survivors = [];
  for (const e of state.enemies) {
    if (e.dying) {
      // Frozen during the orb's flight. Still in state.enemies so the
      // dying emoji keeps rendering; removed by updateEffects when the
      // orb lands.
      survivors.push(e);
      continue;
    }
    // Walk straight toward hero
    const dx = state.hero.x - e.x, dy = state.hero.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    const sp = e.def.speed * dt;
    e.x += (dx / dist) * sp;
    e.y += (dy / dist) * sp;
    // Contact?
    if (dist < (e.def.size + HERO.size) * 0.4) {
      state.hero.hp = Math.max(0, state.hero.hp - e.def.contactDamage);
      removeEnemyFromIndex(e);
      // do not add to survivors
      if (state.hero.hp === 0) state.gameOver = true;
      continue;
    }
    survivors.push(e);
  }
  state.enemies = survivors;
}
```

The only addition is the four-line `if (e.dying)` block at the top of the loop. Everything else is unchanged.

- [ ] **Step 4: Add the `updateEffects` stub**

Edit `public/game.js`. Find the comment-banner around line 705 (`// ─── Main loop ───`). Immediately **above** that banner (i.e. between `updateEnemies` and the main-loop banner), add:

```js
// ─── Effects ─────────────────────────────────────────
function updateEffects(dt) {
  // Filled in by Task 3. Today this is a no-op: state.effects is always [].
}
```

- [ ] **Step 5: Call `updateEffects` from `tick`**

Edit `public/game.js`. Find `tick` around line 707. Update the running-block to include `updateEffects(dt)` after `updateEnemies(dt)`:

```js
function tick(now) {
  const dt = Math.min((now - lastTs) / 1000, 1 / 30);
  lastTs = now;
  if (state.running && !state.paused && !state.personalPaused && !state.gameOver) {
    state.time += dt;
    updateSpawner(dt);
    updateEnemies(dt);
    updateEffects(dt);
  }
  render();
  requestAnimationFrame(tick);
}
```

Only the new `updateEffects(dt)` line is added. The rest of `tick` is unchanged.

- [ ] **Step 6: Clear effects on play-again**

Edit `public/game.js`. Find the play-again click handler around line 787. Add a single line clearing the effects array. The handler becomes:

```js
playAgainBtn.addEventListener('click', () => {
  // Reset everything
  state.enemies.length = 0;
  state.effects.length = 0;
  prefixIndex.clear();
  state.score = 0; state.kills = 0; state.streak = 0; state.bestStreak = 0;
  state.keystrokes = { correct: 0, total: 0 };
  state.wpmLog.length = 0;
  state.hero.hp = MAX_HP;
  state.time = 0;
  state.spawn = { nextAt: 0, wave: 1, waveStartedAt: 0 };
  state.gameOver = false;
  gameOverShown = false;
  state.typedBuffer = '';
  typeInput.value = '';
  leaderboardEl.classList.add('hidden');
  state.running = true;
  typeInput.focus();
});
```

Only the `state.effects.length = 0;` line is new.

- [ ] **Step 7: Reload and verify nothing changed**

Hard-reload the browser (`Cmd-Shift-R`). Play one wave. Expected:
- Enemies still spawn, walk toward hero, deal contact damage as before.
- Typing still slays them.
- No console errors. Open DevTools → Console. Should be clean.

If `window.state.effects` is `[]` in the console, scaffolding is in place. There is intentionally no visible change.

- [ ] **Step 8: Commit**

```bash
git add public/game.js
git commit -m "feat(game): add state.effects scaffold and dying-enemy guard

No behaviour change yet. Lays the groundwork for Task 2 (render path)
and Task 3 (lifecycle wiring) of the laser-kill effect."
```

---

## Task 2: Render scaffolding (draws nothing yet)

**Files:**
- Modify: `public/game.js` — add `drawOrb`, `drawRing` helpers above `render()`
- Modify: `public/game.js:607-644` — suppress word/HP pill on dying enemies, add effects-render block

After this task there is still **no visible change** because nothing pushes effects yet. We land the rendering helpers now so Task 3 only has to flip the lifecycle on.

- [ ] **Step 1: Add `drawOrb` and `drawRing` helpers**

Edit `public/game.js`. Find the comment `// ─── Render ──` around line 594. Immediately **above** that banner, add:

```js
// ─── Effect drawing helpers ──────────────────────────
function drawOrb(fx, p) {
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

function drawRing(fx, p) {
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
```

- [ ] **Step 2: Suppress word pill on dying enemies and draw effects after enemies**

Edit `public/game.js`. Find the enemy render loop around line 607 (inside `render()`). The whole block (lines ~607-644) currently reads:

```js
  // Enemies (Task 10 fills in real rendering)
  for (const e of state.enemies) {
    ctx.font = `${e.def.size}px serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText(e.def.emoji, e.x, e.y);

    // Locked ring
    if (e.id === state.lockedEnemyId) {
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

    // Word above the enemy
    ctx.font = '14px ui-monospace, monospace';
    const word = e.word;
    const typed = word.slice(0, e.typedLen);
    const rest  = word.slice(e.typedLen);
    const wY = e.y - e.def.size / 2 - 8;
    // Background pill
    const padding = 6, w = ctx.measureText(word).width;
    ctx.fillStyle = '#1a2238';
    ctx.fillRect(e.x - w/2 - padding, wY - 12, w + padding*2, 22);
    // Typed (green)
    ctx.fillStyle = '#06d6a0';
    ctx.fillText(typed, e.x - w/2 + ctx.measureText(typed).width/2, wY);
    // Untyped (white)
    ctx.fillStyle = '#cde';
    ctx.fillText(rest, e.x - w/2 + ctx.measureText(typed).width + ctx.measureText(rest).width/2, wY);
  }
```

Replace with:

```js
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

    // Word above the enemy — only for live enemies.
    if (!e.dying) {
      ctx.font = '14px ui-monospace, monospace';
      const word = e.word;
      const typed = word.slice(0, e.typedLen);
      const rest  = word.slice(e.typedLen);
      const wY = e.y - e.def.size / 2 - 8;
      // Background pill
      const padding = 6, w = ctx.measureText(word).width;
      ctx.fillStyle = '#1a2238';
      ctx.fillRect(e.x - w/2 - padding, wY - 12, w + padding*2, 22);
      // Typed (green)
      ctx.fillStyle = '#06d6a0';
      ctx.fillText(typed, e.x - w/2 + ctx.measureText(typed).width/2, wY);
      // Untyped (white)
      ctx.fillStyle = '#cde';
      ctx.fillText(rest, e.x - w/2 + ctx.measureText(typed).width + ctx.measureText(rest).width/2, wY);
    }
  }

  // Effects (orbs, rings). Drawn after enemies so they sit above the play
  // field, but before the HUD (HUD lives further down in render()).
  for (const fx of state.effects) {
    const p = (state.time - fx.t0) / (fx.t1 - fx.t0);
    if (p < 0 || p > 1) continue;
    if (fx.kind === 'orb')  drawOrb(fx, p);
    else if (fx.kind === 'ring') drawRing(fx, p);
  }
```

Changes: locked-ring guarded by `!e.dying`; word-pill block wrapped in `if (!e.dying) { ... }`; new `// Effects` loop appended.

- [ ] **Step 3: Reload and verify nothing renders, nothing breaks**

Hard-reload the browser. Play one wave. Expected:
- Game looks identical to Task 1.
- No console errors.
- No visible effects (because nothing pushes any yet).

- [ ] **Step 4: Commit**

```bash
git add public/game.js
git commit -m "feat(game): add orb/ring render helpers and dying-enemy guards

Draws nothing yet — state.effects is still empty. Adds drawOrb,
drawRing, the per-frame effects iteration in render(), and the
not-while-dying guards on the locked ring and word pill."
```

---

## Task 3: Lifecycle wiring — `onEnemySlain` + `updateEffects`

**Files:**
- Modify: `public/game.js:398-414` (rewrite `onEnemySlain`)
- Modify: `public/game.js` `updateEffects` stub from Task 1 (fill in the body)
- Add: `prefersReducedMotion` constant near the top of the file

This is the task that makes the feature visible. After this task, typing a word causes an orb to fly from the hero to the enemy, the orb detonates as a ring, and the enemy disappears at impact.

- [ ] **Step 1: Add `prefersReducedMotion` constant**

Edit `public/game.js`. Find the `// ─── Constants & tuning ───` block at line 3. Below the existing constants (after line 11, `const POLL_DISMISS_AFTER_MS = 15000;`), add:

```js
// `true` if the OS reports prefers-reduced-motion. Sampled once at load,
// not reactive — a classroom user toggling the setting mid-run won't see
// the orb appear/disappear partway through.
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

- [ ] **Step 2: Rewrite `onEnemySlain`**

Edit `public/game.js`. Find `onEnemySlain` around line 398. Replace the whole function (lines 398-414) with:

```js
function onEnemySlain(e) {
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
```

- [ ] **Step 3: Fill in `updateEffects`**

Edit `public/game.js`. Find the `updateEffects` stub from Task 1 and replace its body. The function becomes:

```js
function updateEffects(dt) {
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
```

Note the `dt` parameter is unused (effects use absolute `state.time` not delta-time) but kept in the signature for symmetry with `updateEnemies(dt)` and `updateSpawner(dt)`.

- [ ] **Step 4: Reload and verify the full effect**

Hard-reload the browser. Play one wave. Expected sequence when typing a word:

1. Type all letters of an enemy's word (or press space on an ambiguous prefix).
2. The enemy stops moving and its word pill disappears.
3. A bright blue-white orb flies from the hero (🛡️) toward the enemy in about an eighth of a second.
4. When the orb arrives, the enemy emoji disappears and a blue-white ring expands and fades over ~0.22 s.
5. Score / kills / streak have already incremented (visible in the HUD pills before the orb lands).

Try the following extra checks:

- Type two short words in quick succession — both orbs should fly independently, neither aborting the other.
- Let an enemy get close before slaying — the orb is short but visible.
- Let an enemy reach the hero (don't type) — contact damage still works, no orb.
- After game over: the final kill's orb/ring should still complete before the modal locks the screen.

Open DevTools → Console. Should be clean.

- [ ] **Step 5: Commit**

```bash
git add public/game.js
git commit -m "feat(game): laser-kill effect — orb + ring shockwave on slay

onEnemySlain marks the enemy dying and spawns an orb projectile from
the hero. updateEffects expires the orb (splicing the dying enemy
out) and hands off to a ring shockwave at the impact point.
prefers-reduced-motion skips the orb entirely and plays a brief ring."
```

---

## Task 4: CHANGELOG + verification

**Files:**
- Modify: `CHANGELOG.md` (add `Added` bullet under `[Unreleased]`)
- Run: existing Playwright suite (should be unaffected)

- [ ] **Step 1: Update CHANGELOG**

Edit `CHANGELOG.md`. Find the `## [Unreleased]` block, specifically the `### Added` list (it already has favicon and Space/Enter commit entries). Append:

```markdown
- Laser-kill visual: an orb projectile flies from the hero to the enemy
  on word-slay, detonating as a ring shockwave at impact. The enemy
  freezes (`e.dying = true`) on commit and is removed when the orb
  lands. `prefers-reduced-motion` skips the orb and plays a brief ring.
```

- [ ] **Step 2: Run the Playwright suite**

```bash
npx playwright test
```

Expected: all tests pass. The suite asserts API/typing behaviour, not visual frames, so it should be unaffected. If a typing-flow test fails, suspect the dying-skip guard in `updateEnemies` — but no test in the current suite exercises a dying enemy because the kill is committed before any post-commit assertion.

- [ ] **Step 3: Manual reduced-motion sanity check**

In macOS: System Settings → Accessibility → Display → toggle "Reduce motion" on. Hard-reload the browser. Play one wave.

Expected: when you slay a word, the orb does **not** fly. Instead, the enemy disappears immediately and a brief (~80 ms) ring fires at its position. No console errors.

Toggle "Reduce motion" off again. Reload. Verify the orb returns.

- [ ] **Step 4: Commit and finish branch**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): laser-kill effect entry under [Unreleased]"
```

Per the user's workflow, **do not** open a pull request. The branch (`feature/laser-kill-effect`) is finished and ready to push when the user gives the word. Next steps after this plan:

1. Push the branch.
2. Deploy to staging (the production server is `lockersoft.com:~/spelltoslay-app/`; staging path / Deployer recipe matches SLAY's pattern).
3. Wait for user confirmation before promoting to production.

---

## Verification summary

| Task | Visible change | How to verify |
|------|----------------|---------------|
| 1    | None           | Game plays normally; `window.state.effects` is `[]` in console |
| 2    | None           | Game plays normally; no errors; no effects visible |
| 3    | **Full feature** | Orb flies on slay, ring fires at impact, enemy disappears at impact |
| 4    | None (docs)    | CHANGELOG entry; Playwright passes; reduced-motion path works |
