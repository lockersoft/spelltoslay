# Laser-kill effect — design

**Date:** 2026-05-13
**Status:** Approved (brainstorm), pending implementation plan
**Scope:** Visual-only feedback for the moment a typed word is correctly slain.
**File touched:** `public/game.js` (single-file game)

## Goal

When a player types an enemy's word correctly, a glowing projectile flies
from the hero to the enemy and detonates in a small ring shockwave. The
effect is purely visual — scoring, streak, and kill-counting still resolve
at type-commit time, exactly as today.

## User-visible behaviour

1. Player types the last letter of an enemy's word (or commits with
   space/enter).
2. **At t = 0** (commit): the enemy freezes in place, its word/HP bar
   disappears, and a bright orb spawns at the hero (`state.hero.x/y`).
3. **t = 0 → ~120 ms:** the orb travels in a straight line from the hero
   to the enemy's current position. Score and streak are already updated.
4. **t ≈ 120 ms:** the orb reaches the enemy. Enemy emoji disappears.
   A ring shockwave spawns at the enemy's last position.
5. **t ≈ 120 → 340 ms:** the ring expands and fades.
6. **t > 340 ms:** all visual artefacts are gone.

If the player commits another word during steps 3–5, a second orb fires
concurrently — effects are independent.

## Visual specification

All colours match the existing palette in `public/game.js` and
`public/style.css`. No new colour tokens.

### Orb

- Origin: `(state.hero.x, state.hero.y)`
- Target: `(e.x, e.y)` sampled at commit time (frozen, since the enemy is
  frozen during dying).
- Duration: **120 ms**.
- Path: straight line, linear interpolation.
- Body: radial gradient — white core (`#ffffff`) at 0%, locked-blue
  (`#5b8def`) at 40%, fully transparent at 100%.
- Radius: **8 px** at the core (so the visible glow is roughly 16 px).
- Trail: a thin line from origin to current position drawn _behind_ the
  orb at 25 % opacity, locked-blue, no glow. Trail vanishes when the orb
  arrives — it does not linger.

### Ring shockwave

- Centre: enemy's frozen position.
- Duration: **220 ms**.
- Two concentric strokes:
  - Outer: locked-blue (`#5b8def`), `lineWidth = 3`, easing from
    `r = 6 px → r = 36 px`, opacity `0.85 → 0`.
  - Inner: white (`#ffffff`), `lineWidth = 1.5`, easing from
    `r = 4 px → r = 22 px`, opacity `0.7 → 0`.
- Easing: ease-out (`1 − (1 − p)²`) for radius growth, linear for opacity.
- No fill — strokes only.

### Reduced motion

If `window.matchMedia('(prefers-reduced-motion: reduce)').matches` is
true at game start, the orb is skipped entirely — `onEnemySlain` pushes
the `ring` effect at the enemy's position immediately and splices the
enemy out of `state.enemies` right away, with no in-between flight
phase. The ring's duration also collapses from 220 ms to **80 ms** so
the visual is a brief flash rather than a slow expansion. This keeps the
feedback signal without animating motion across the screen, for
classroom users with accessibility settings.

## Data model

Two new pieces of state. One on `state`, one on each enemy.

```js
state.effects = [];   // array of effect objects, see below
```

Each effect is a plain object. Two kinds for now; the shape is open for
future kinds without changing the loop.

```js
// Orb: hero → enemy projectile
{
  kind: 'orb',
  x0, y0,            // hero position at commit
  x1, y1,            // enemy position at commit (frozen target)
  t0, t1,            // absolute state.time values (t1 - t0 === 0.12)
  enemyId,           // back-reference so we know which dying enemy to
                     // finalize when this orb expires
}

// Ring: shockwave at impact
{
  kind: 'ring',
  x, y,
  t0, t1,            // t1 - t0 === 0.22
}
```

Enemies gain one new flag:

```js
e.dying = true;   // set when onEnemySlain fires; never unset (enemy
                  // is removed when its orb expires)
```

No new top-level state is introduced beyond `state.effects`.

## Lifecycle (replaces current `onEnemySlain`)

Current `onEnemySlain(e)` immediately splices the enemy out of
`state.enemies` and resets the typing buffer. The new version:

1. **Score / streak / kill-counter** — unchanged. Commits at type-time.
2. **Remove `e` from `prefixIndex`** — unchanged (`removeEnemyFromIndex`).
3. **If reduced motion:** splice `e` out of `state.enemies` now, push a
   single `ring` effect at `(e.x, e.y)` with `t1 = state.time + 0.08`,
   then jump to step 5.
4. **Otherwise:** set `e.dying = true` and do **not** splice it out of
   `state.enemies`. Push an orb effect with `t0 = state.time`,
   `t1 = state.time + 0.12`, `enemyId = e.id`.
5. **Reset buffer / lock** — unchanged (`state.typedBuffer = ''`,
   `state.lockedEnemyId = null`, `typeInput.value = ''`).

A new `updateEffects(dt)` is called from `tick()` between
`updateEnemies(dt)` and `render()`. Each frame it:

- Walks `state.effects` and partitions into alive (`state.time < t1`) and
  expired.
- For each **expired orb**:
  - Find the enemy by `enemyId` and splice it out of `state.enemies`
    (only if still present — defensive against run-reset clearing the
    list mid-flight).
  - Push a `ring` effect at the same `(x1, y1)`, with
    `t0 = state.time`, `t1 = state.time + 0.22` (or `+0.08` if reduced
    motion).
- **Expired rings** are simply dropped.
- Survivors stay in `state.effects`.

## Guarded code paths

Adding `e.dying` means several existing loops must skip dying enemies.
This list is exhaustive — anything not on it is unaffected:

- `updateEnemies(dt)` — skip dying enemies entirely (no movement, no
  contact-damage check, no removal-on-arrival).
- `commitTypedBuffer()` / `refreshLock()` / `attemptLock()` — dying
  enemies must not appear in any lock, prefix match, or commit
  search. Easiest path: filter `state.enemies` once at the top with
  `const live = state.enemies.filter(e => !e.dying)` and use `live` for
  matching. This is the only change to the typing path.
- `rebuildPrefixIndex()` — already runs on word-pool changes; if it
  fires while an enemy is dying, the dying enemy must be excluded.
- `flashLockedRed()` — already harmless (looks up by `lockedEnemyId`
  which is cleared at commit), but we must not flash a dying enemy as a
  typo target.

## Render layer

`render()` gets one new block, drawn **after** enemies and **before** the
HUD, so effects sit above the play field but below the score pills:

```js
for (const fx of state.effects) {
  const p = (state.time - fx.t0) / (fx.t1 - fx.t0);
  if (fx.kind === 'orb')  drawOrb(fx, p);
  else if (fx.kind === 'ring') drawRing(fx, p);
}
```

`drawOrb` uses `ctx.createRadialGradient` for the orb body and a single
`ctx.beginPath/moveTo/lineTo/stroke` for the trail.

`drawRing` uses two `ctx.beginPath/arc/stroke` calls. No fills.

Dying enemies render exactly like live ones today, **except** their
word/HP pill is suppressed (the word is already typed; showing it on a
"dead" enemy is noise). That's a one-line guard in the existing enemy
render block.

## Run reset / game over

`resetRun()` already clears `state.enemies`. It must also clear
`state.effects = []`. Any in-flight orbs/rings vanish on reset, which is
the correct behaviour (the run is over).

Game-over does **not** clear `state.effects`. Once `state.gameOver`
flips, the `tick()` guard stops running `updateEffects` (it gates on
`!state.gameOver`), so any in-flight orb visually **freezes** at its
current interpolated position. The game-over modal is surfaced ~50 ms
later by the polling `setInterval` and occludes the frozen artefact —
so the user never sees a stuck orb in practice. If a future iteration
wants the orb to genuinely play out across the game-over transition,
move the `updateEffects(dt)` call outside the `gameOver` clause in
`tick()`. v1 accepts the cheaper "modal covers it" behaviour.

## Performance

Worst-case observed in classroom play: ~5 concurrent effects (a
fast-typing student burning through a wave). Each orb is one gradient
fill plus one line; each ring is two strokes. At 60 fps this is well
under 1 ms per frame on the cheapest target hardware (Chromebook
classroom carts). No `requestAnimationFrame` budget concern.

## Testing

Manual smoke test against `php -S localhost:8001 -t public`:

1. Start a run, type one full word — see orb fly to enemy, ring fire.
2. Type a second word before the first orb lands — both orbs animate
   independently.
3. Kill an enemy at point-blank range (one to the hero's left, type fast)
   — orb is short and barely visible; no crash.
4. Get to game over — final kill's effect plays out, then the modal
   appears.
5. Toggle OS reduced-motion, reload, kill an enemy — orb is instant, ring
   is short. No errors.

The existing Playwright suite (`tests/`) does not assert visual frames;
it asserts API responses. No new E2E tests are required for this purely
visual change. If a regression is found later, screenshot-diff would be
the right tool — out of scope here.

## Out of scope

- Sound effects.
- Per-keystroke visual feedback (sparks while typing partial word).
- Enemy-class-themed colours (one palette covers all enemies for now).
- Screen-shake on big kills.
- Particle explosions (rejected in brainstorm in favour of ring).

These are recorded so a future "make kills feel punchier" pass has a
clear starting set.
