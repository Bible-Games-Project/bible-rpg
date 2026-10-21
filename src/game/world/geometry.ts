import type { Pt } from '../../data/eden/map';

export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const ll = dx * dx + dy * dy;
  let t = ll === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / ll;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.hypot(px - x, py - y);
}

export function distToPolyline(px: number, py: number, pts: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    best = Math.min(best, distToSegment(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  }
  return best;
}

/** Small deterministic PRNG (mulberry32) so decoration is the same every run. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(r: () => number, list: T[]): T {
  return list[Math.floor(r() * list.length) % list.length];
}

/** Wobble used to roughen region borders (same everywhere for a point). */
export function wobble(x: number, y: number, amp: number): number {
  return (Math.sin(x * 0.013 + y * 0.007) + Math.sin(x * 0.031 - y * 0.023) * 0.6 + Math.sin(y * 0.019 + 1.3) * 0.5) * amp * 0.45;
}
