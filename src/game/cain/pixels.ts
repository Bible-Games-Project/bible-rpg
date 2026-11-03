/**
 * A small pixel canvas and the noise used to paint the Cain and Abel
 * chapter's art in code (no image generation is reachable from the build
 * server). Pure functions with no Phaser or DOM, so the drawings can also
 * be rendered by a script outside the browser.
 */

export type RGB = [number, number, number];

export function hex(h: string): RGB {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

export function ramp(...colors: string[]): RGB[] {
  return colors.map(hex);
}

export function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export class Pixels {
  readonly data: Uint8ClampedArray;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  set(x: number, y: number, c: RGB, a = 255): void {
    x |= 0;
    y |= 0;
    if (!this.inside(x, y)) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = a;
  }

  /** Paint over what is there (a < 255 blends). */
  over(x: number, y: number, c: RGB, a = 255): void {
    x |= 0;
    y |= 0;
    if (!this.inside(x, y)) return;
    const i = (y * this.w + x) * 4;
    const k = a / 255;
    const old = this.data[i + 3] / 255;
    if (old === 0) {
      this.set(x, y, c, a);
      return;
    }
    for (let j = 0; j < 3; j++) this.data[i + j] = this.data[i + j] * (1 - k) + c[j] * k;
    this.data[i + 3] = Math.max(this.data[i + 3], a);
  }

  alpha(x: number, y: number): number {
    if (!this.inside(x, y)) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }

  get(x: number, y: number): RGB {
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }

  /** Copy another canvas in at (dx, dy), over what is there. */
  draw(src: Pixels, dx: number, dy: number): void {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const a = src.alpha(x, y);
        if (a) this.over(x + dx, y + dy, src.get(x, y), a);
      }
    }
  }

  /** A dark line along the shape's outer edge (opaque pixels next to empty ones). */
  outline(c: RGB, onlyBelow = false): void {
    const edge: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.alpha(x, y) < 128) continue;
        const open = onlyBelow
          ? this.alpha(x, y + 1) < 128 || this.alpha(x + 1, y) < 128
          : this.alpha(x - 1, y) < 128 || this.alpha(x + 1, y) < 128 || this.alpha(x, y - 1) < 128 || this.alpha(x, y + 1) < 128;
        if (open) edge.push(x, y);
      }
    }
    for (let i = 0; i < edge.length; i += 2) this.set(edge[i], edge[i + 1], c);
  }

  /** Each pixel either fully there or not (soft edges look blurred when scaled). */
  hardenAlpha(): void {
    for (let i = 3; i < this.data.length; i += 4) this.data[i] = this.data[i] >= 110 ? 255 : 0;
  }
}

/** Integer hash noise in [0, 1). */
export function hash2(x: number, y: number, s = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 1, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1). */
export function vnoise(x: number, y: number, s = 0): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, s);
  const b = hash2(x0 + 1, y0, s);
  const c = hash2(x0, y0 + 1, s);
  const d = hash2(x0 + 1, y0 + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Nearest of scattered points (cells of `size` px): distance and offset in cell units. */
export function clump(x: number, y: number, size: number, s = 0): { d: number; dx: number; dy: number } {
  const gx = Math.floor(x / size);
  const gy = Math.floor(y / size);
  let best = Infinity;
  let bx = 0;
  let by = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = (gx + i + 0.15 + hash2(gx + i, gy + j, s) * 0.7) * size;
      const cy = (gy + j + 0.15 + hash2(gx + i, gy + j, s + 7) * 0.7) * size;
      const dd = (x - cx) ** 2 + (y - cy) ** 2;
      if (dd < best) {
        best = dd;
        bx = x - cx;
        by = y - cy;
      }
    }
  }
  return { d: Math.sqrt(best) / size, dx: bx / size, dy: by / size };
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** A tone (0 dark – 1 light) as a colour of the ramp, dithered between steps. */
export function tone(r: RGB[], v: number, x: number, y: number, dither = 0.8): RGB {
  const n = r.length - 1;
  const t = Math.max(0, Math.min(1, v)) * n + (BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * dither;
  return r[Math.max(0, Math.min(n, Math.round(t)))];
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Seeded random numbers (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fill an ellipse, colouring each pixel with `paint(x, y, nx, ny)` (nx, ny: -1..1 inside). */
export function ellipse(p: Pixels, cx: number, cy: number, rx: number, ry: number, paint: (x: number, y: number, nx: number, ny: number) => RGB | null): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      const c = paint(x, y, nx, ny);
      if (c) p.set(x, y, c);
    }
  }
}

/** A thick line from (x0, y0) to (x1, y1), its width going from w0 to w1. */
export function limb(p: Pixels, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, paint: (x: number, y: number, across: number, along: number) => RGB): void {
  const minX = Math.floor(Math.min(x0, x1) - Math.max(w0, w1));
  const maxX = Math.ceil(Math.max(x0, x1) + Math.max(w0, w1));
  const minY = Math.floor(Math.min(y0, y1) - Math.max(w0, w1));
  const maxY = Math.ceil(Math.max(y0, y1) + Math.max(w0, w1));
  const dx = x1 - x0;
  const dy = y1 - y0;
  const ll = dx * dx + dy * dy || 1;
  const len = Math.sqrt(ll);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const t = Math.max(0, Math.min(1, ((x + 0.5 - x0) * dx + (y + 0.5 - y0) * dy) / ll));
      const px = x0 + dx * t;
      const py = y0 + dy * t;
      const half = (w0 + (w1 - w0) * t) / 2;
      // signed distance across the limb (-1 left edge, 1 right edge)
      const across = ((x + 0.5 - px) * -dy + (y + 0.5 - py) * dx) / len / Math.max(0.5, half);
      if (Math.hypot(x + 0.5 - px, y + 0.5 - py) > half) continue;
      p.set(x, y, paint(x, y, across, t));
    }
  }
}
