// ─── Label layout ────────────────────────────────────
// Place word labels so every pill is fully inside the arena and pills do not
// cover each other. Pure function: no canvas, no state. `items` are ordered
// most-important first; earlier items keep their wanted spot and later ones
// move (up first, then down) out of the way.
export function layoutLabels(items, arena) {
  const placed = [];
  const clampAxis = (c, size, max) =>
    size >= max ? max / 2 : Math.min(Math.max(c, size / 2), max - size / 2);
  const hits = (a, b) => Math.abs(a.cx - b.cx) < (a.w + b.w) / 2
                      && Math.abs(a.cy - b.cy) < (a.h + b.h) / 2;
  for (const it of items) {
    const r = { id: it.id, w: it.w, h: it.h,
                cx: clampAxis(it.x, it.w, arena.w),
                cy: clampAxis(it.y, it.h, arena.h) };
    const homeY = r.cy;
    for (let n = 1; n <= 8 && placed.some(p => hits(p, r)); n++) {
      // Alternate above/below the wanted row: -1, +1, -2, +2, ...
      const step = Math.ceil(n / 2) * (n % 2 === 1 ? -1 : 1);
      r.cy = clampAxis(homeY + step * (it.h + 2), it.h, arena.h);
    }
    placed.push(r);
  }
  return placed;
}
