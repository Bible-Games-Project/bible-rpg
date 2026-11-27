// The line a sprite seen at a slant stands on (its shadow is cast from it).

/**
 * The row each column of a long thing seen at a slant stands on: the line
 * under its lowest points (the ark's blocks and ramp), bent no more than
 * they are. One anchor row for all of it cast the bow's shadow down at the
 * stern's level, a thin strip far from the hull ("the ark's shadow is awful").
 * A house stands on its two front walls' feet the same way: from one row,
 * its shadow fell below it, apart from it ("the shadows don't fit").
 * `ark`: its ends curve up off the ground (the line runs from its blocks).
 */
export function groundLine(p: { w: number; h: number; data: ArrayLike<number> }, ark = false): { ground: Float32Array; under: [number, number] } {
  const pts: [number, number][] = [];
  for (let x = 0; x < p.w; x++)
    for (let y = p.h - 1; y >= 0; y--)
      if (p.data[(y * p.w + x) * 4 + 3]) {
        pts.push([x, y]);
        break;
      }
  // the hull below the points (y grows downwards): monotone chain
  const hull: [number, number][] = [];
  for (const q of pts) {
    while (hull.length >= 2) {
      const [a, b] = [hull[hull.length - 2], hull[hull.length - 1]];
      if ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) >= 0) hull.pop();
      else break;
    }
    hull.push(q);
  }
  // the hull's ends curve up off the ground: the line runs from the outermost
  // blocks on, straight (it rose with the bow and the stern, casting their
  // shadows up in the air beside them)
  // a roof's eaves past the walls are no ground either
  while (hull.length > 2 && (hull[1][1] - hull[0][1]) / Math.max(1, hull[1][0] - hull[0][0]) > 0.6) hull.shift();
  while (hull.length > 2 && (hull[hull.length - 1][1] - hull[hull.length - 2][1]) / Math.max(1, hull[hull.length - 1][0] - hull[hull.length - 2][0]) < -0.6) hull.pop();
  if (ark) {
    while (hull.length > 2 && (hull[1][1] - hull[0][1]) / Math.max(1, hull[1][0] - hull[0][0]) > 0.6) hull.shift();
    while (hull.length > 2 && hull[hull.length - 1][1] < hull[hull.length - 2][1]) hull.pop();
  }
  const g = new Float32Array(p.w);
  // (the ark's first block, not the bow curving up just before it)
  const under: [number, number] = [hull[0][0] + (ark ? 16 : 0), hull[hull.length - 1][0]];
  let k = 0;
  for (let x = 0; x < p.w; x++) {
    while (k < hull.length - 2 && hull[k + 1][0] < x) k++;
    const [a, b] = [hull[k], hull[Math.min(k + 1, hull.length - 1)]];
    g[x] = b[0] === a[0] ? a[1] : a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  }
  return { ground: g, under };
}

