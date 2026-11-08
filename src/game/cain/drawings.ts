import { Pixels, clamp01, clump, ellipse, hash2, limb, mixRGB, ramp, seeded, tone, vnoise, type RGB } from './pixels';

/**
 * The Cain and Abel chapter's art, painted in code at the characters' art
 * resolution (one pixel here is one pixel of Adam's sprite). Colours are
 * natural (greens, browns, straw): the chapter's night palette
 * (palette.ts) recolours the world's textures when they are built.
 * The light comes from the upper left, like the rest of the game's art.
 */

export interface Drawing {
  frames: Pixels[];
  /** the base point (feet, trunk foot) in the frame */
  ax: number;
  ay: number;
}

const LEAVES = ramp('#0c2320', '#123528', '#1b4a31', '#29633b', '#3f7d44', '#62994c', '#93bb5e', '#c9dc7c');
const LEAVES_DARK = ramp('#0a1d1d', '#0f2c27', '#16402f', '#215538', '#316b40', '#4b8447', '#77a455');
const BARK = ramp('#2a1a12', '#4a2f1f', '#6b452c', '#8c5f3c', '#ad7c50', '#cc9d6a');
const STRAW = ramp('#2d2012', '#4a361c', '#6a4f28', '#8c6c36', '#ae8b48', '#ccaa62', '#e5c985');
const MUD = ramp('#2a1a12', '#46301f', '#62452c', '#7f5c3b', '#9c764d', '#b99163');
const STONE = ramp('#1b1d22', '#30333a', '#474b52', '#60656b', '#7c8186', '#9ca0a2', '#c0c2bf');
const SOIL = ramp('#24160f', '#3b2619', '#553823', '#6e4b2e', '#8a603b');
const WHEAT = ramp('#3a2a12', '#5f4720', '#86692e', '#ad8b3d', '#cfae55', '#ead27e');
const BONE = ramp('#4a4237', '#6e6555', '#958a74', '#bcb197', '#ded4bb', '#f4ecd6');
const FRUIT = ramp('#3a0f12', '#62181a', '#8e2a22', '#b8452c', '#dd7044');
const GOURD = ramp('#3c2a0e', '#6a4a14', '#9a6e1c', '#c79a2c', '#e8c35a');

const LIGHT = { x: -0.5, y: -0.62, z: 0.6 };

interface Blob {
  x: number;
  y: number;
  r: number;
  z: number;
}

/**
 * Leaves: overlapping round masses, each lit as a ball from the upper left,
 * broken into small scalloped clumps of leaves, darker underneath, with a
 * dark rim.
 */
function crown(p: Pixels, blobs: Blob[], leaves: RGB[], seed: number, opts: { clumpSize?: number; bottom?: number; top?: number } = {}): void {
  const size = opts.clumpSize ?? 10;
  const top = opts.top ?? Math.min(...blobs.map((b) => b.y - b.r));
  const bottom = opts.bottom ?? Math.max(...blobs.map((b) => b.y + b.r));
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const c = clump(x, y, size, seed);
      // the edge follows the leaf clumps: scalloped, not a smooth circle
      const edge = (0.5 - c.d) * size * 1.2 + (vnoise(x / 9, y / 9, seed + 3) - 0.5) * 8;
      let best = -Infinity;
      let nx = 0;
      let ny = 0;
      let nz = 1;
      for (const b of blobs) {
        const r = b.r + edge;
        const dx = x + 0.5 - b.x;
        const dy = y + 0.5 - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        const hgt = Math.sqrt(r * r - d2) + b.z;
        if (hgt > best) {
          best = hgt;
          nx = dx / r;
          ny = dy / r;
          nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        }
      }
      if (best === -Infinity) continue;
      const ball = nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z;
      // each clump of leaves is a little ball too, lit from the upper left
      const cl = -(c.dx * 0.8 + c.dy) * 1.25 - c.d * 0.35;
      const under = clamp01((y - top) / (bottom - top));
      let v = 0.48 + ball * 0.55 + cl * 0.12 - under * under * 0.3 + (hash2(x, y, seed) - 0.5) * 0.05;
      // the gaps between clumps
      if (c.d > 0.8) v -= 0.08;
      p.set(x, y, tone(leaves, v, x, y));
    }
  }
}

/** A trunk or branch: lit on its left side, with bark grain. */
function wood(p: Pixels, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, seed: number, bark: RGB[] = BARK): void {
  limb(p, x0, y0, x1, y1, w0, w1, (x, y, across, along) => {
    const grain = vnoise(x / 2.2, y / 9, seed) - 0.5;
    const v = 0.55 - across * 0.42 + grain * 0.35 - along * 0.05;
    return tone(bark, across > 0.82 ? 0.02 : v, x, y);
  });
}

/** The roots spreading at the foot of a trunk. */
function roots(p: Pixels, x: number, y: number, w: number, seed: number): void {
  const r = seeded(seed);
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1;
    const len = w * (0.55 + r() * 0.35);
    wood(p, x + side * w * 0.15, y - 8 - r() * 4, x + side * len, y + r() * 1.5, w * 0.55, 3, seed + i);
  }
}

/** A crown: one big mass with rounded lobes around it, the upper ones standing out. */
function blobsIn(r: () => number, cx: number, cy: number, rx: number, ry: number, n: number, rmin: number, rmax: number): Blob[] {
  const out: Blob[] = [{ x: cx, y: cy, r: Math.min(rx, ry) * 0.8, z: 10 }];
  const start = r() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = start + (i / n) * Math.PI * 2 + (r() - 0.5) * 0.5;
    const d = 0.5 + r() * 0.2;
    const x = cx + Math.cos(a) * rx * d;
    const y = cy + Math.sin(a) * ry * d;
    const rad = rmin + r() * (rmax - rmin);
    out.push({ x, y, r: rad, z: -Math.sin(a) * 8 + r() * 4 });
  }
  // smaller masses over the top half, catching the light
  for (let i = 0; i < n; i++) {
    const a = Math.PI + r() * Math.PI;
    const d = r() * 0.75;
    out.push({ x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d, r: rmin * 0.55 + r() * rmin * 0.3, z: 16 + r() * 10 });
  }
  return out;
}

export type TreeKind = 'oak' | 'oakSmall' | 'umbrella' | 'cypress' | 'bush' | 'fruit';

export interface TreeDrawing {
  trunk: Pixels;
  crown: Pixels;
  /** the crown with its fruit picked (fruit trees) */
  bare?: Pixels;
  ax: number;
  ay: number;
  /** where the crown is, for its shadow and for seeing behind it */
  crownBox: { x: number; y: number; w: number; h: number };
  /** collider at the foot, in art pixels: half width and height */
  foot: { w: number; h: number };
}

/** The new trees of the chapter (the maintainer: "new trees, prettier"). */
export function drawTree(kind: TreeKind, seed: number): TreeDrawing {
  const r = seeded(seed * 9973 + 17);
  if (kind === 'cypress') {
    const w = 84;
    const h = 236;
    const trunk = new Pixels(w, h);
    const top = new Pixels(w, h);
    const ax = 42;
    const ay = 230;
    wood(trunk, ax, ay, ax, ay - 40, 10, 7, seed);
    const blobs: Blob[] = [];
    for (let i = 0; i < 11; i++) {
      const t = i / 10;
      const y = 26 + t * 168;
      // a flame: thin at the top, fullest low down
      const rad = 8 + Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.62) * 26;
      blobs.push({ x: ax + (r() - 0.5) * 8, y, r: rad, z: (1 - t) * 6 + r() * 4 });
    }
    crown(top, blobs, LEAVES_DARK, seed, { clumpSize: 5 });
    top.outline(LEAVES_DARK[0]);
    return { trunk, crown: top, ax, ay, crownBox: { x: 8, y: 6, w: 68, h: 200 }, foot: { w: 14, h: 8 } };
  }
  if (kind === 'bush') {
    const w = 96;
    const h = 74;
    const trunk = new Pixels(w, h);
    const top = new Pixels(w, h);
    const ax = 48;
    const ay = 70;
    const blobs = blobsIn(r, ax, 42, 30, 18, 6, 13, 18);
    crown(top, blobs, LEAVES, seed, { clumpSize: 5 });
    top.outline(LEAVES[0]);
    return { trunk, crown: top, ax, ay, crownBox: { x: 8, y: 8, w: 80, h: 62 }, foot: { w: 40, h: 10 } };
  }
  if (kind === 'umbrella') {
    // a wide flat crown on a slender, forking trunk
    const w = 260;
    const h = 210;
    const trunk = new Pixels(w, h);
    const top = new Pixels(w, h);
    const ax = 130;
    const ay = 204;
    const lean = (r() - 0.5) * 30;
    const fork: [number, number] = [ax + lean * 0.5, 126];
    wood(trunk, ax, ay, fork[0], fork[1], 20, 13, seed);
    roots(trunk, ax, ay, 18, seed);
    const tips: [number, number][] = [
      [ax - 70 + r() * 16, 68],
      [ax - 18 + r() * 10, 60],
      [ax + 30 + r() * 10, 62],
      [ax + 74 - r() * 14, 72],
    ];
    for (const [i, t] of tips.entries()) wood(trunk, fork[0], fork[1], t[0], t[1], 11, 5, seed + i + 1);
    const blobs: Blob[] = [];
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      const x = 30 + t * 200 + (r() - 0.5) * 14;
      const y = 58 + Math.sin(t * Math.PI) * -20 + (r() - 0.5) * 12;
      blobs.push({ x, y, r: 20 + Math.sin(t * Math.PI) * 14 + r() * 6, z: r() * 6 });
    }
    for (let i = 0; i < 6; i++) blobs.push({ x: 70 + r() * 120, y: 30 + r() * 20, r: 16 + r() * 8, z: 14 });
    crown(top, blobs, LEAVES, seed, { clumpSize: 6, top: 10, bottom: 98 });
    top.outline(LEAVES[0]);
    return { trunk, crown: top, ax, ay, crownBox: { x: 6, y: 4, w: 248, h: 100 }, foot: { w: 18, h: 9 } };
  }
  if (kind === 'fruit') {
    const w = 150;
    const h = 170;
    const trunk = new Pixels(w, h);
    const top = new Pixels(w, h);
    const ax = 75;
    const ay = 165;
    wood(trunk, ax, ay, ax - 2, ay - 58, 13, 9, seed);
    wood(trunk, ax - 2, ay - 52, ax - 30, ay - 84, 7, 4, seed + 1);
    wood(trunk, ax - 2, ay - 56, ax + 28, ay - 88, 7, 4, seed + 2);
    roots(trunk, ax, ay, 12, seed);
    const blobs = blobsIn(r, ax, 66, 46, 36, 7, 20, 27);
    crown(top, blobs, LEAVES, seed, { clumpSize: 6 });
    top.outline(LEAVES[0]);
    const bare = new Pixels(w, h);
    bare.draw(top, 0, 0);
    // the fruit (pomegranates), hanging among the leaves
    for (let i = 0; i < 9; i++) {
      const fx = ax - 42 + r() * 84;
      const fy = 40 + r() * 62;
      if (top.alpha(fx | 0, fy | 0) < 128) continue;
      fruitBall(top, fx, fy, 4.2);
    }
    return { trunk, crown: top, bare, ax, ay, crownBox: { x: 14, y: 14, w: 122, h: 100 }, foot: { w: 14, h: 8 } };
  }
  // oaks: a round, full crown on a strong trunk
  const small = kind === 'oakSmall';
  const w = small ? 180 : 230;
  const h = small ? 210 : 260;
  const trunk = new Pixels(w, h);
  const top = new Pixels(w, h);
  const ax = w / 2;
  const ay = h - 6;
  const tw = small ? 20 : 26;
  const ty = ay - (small ? 70 : 88);
  wood(trunk, ax, ay, ax + (r() - 0.5) * 6, ty, tw, tw * 0.62, seed);
  roots(trunk, ax, ay, tw, seed);
  for (let i = 0; i < 3; i++) {
    const side = i - 1;
    wood(trunk, ax, ty + 10, ax + side * (small ? 34 : 46) + (r() - 0.5) * 10, ty - (small ? 34 : 46), tw * 0.42, 3, seed + 5 + i);
  }
  const cx = ax;
  const cy = small ? 82 : 100;
  const rx = small ? 62 : 82;
  const ry = small ? 52 : 68;
  const blobs = blobsIn(r, cx, cy, rx, ry, small ? 7 : 8, small ? 26 : 34, small ? 34 : 44);
  crown(top, blobs, LEAVES, seed, { clumpSize: 6 });
  top.outline(LEAVES[0]);
  return { trunk, crown: top, ax, ay, crownBox: { x: cx - rx - 20, y: cy - ry - 24, w: (rx + 20) * 2, h: (ry + 24) * 2 }, foot: { w: tw, h: 9 } };
}

function fruitBall(p: Pixels, x: number, y: number, rad: number): void {
  ellipse(p, x, y, rad, rad, (px, py, nx, ny) => tone(FRUIT, 0.65 - nx * 0.35 - ny * 0.45, px, py, 0.4));
  p.set(x - 1, y - 2, FRUIT[4]);
  p.set(x, y - rad - 0.5, FRUIT[0]);
}

/** A soft round shadow on the ground (darker in the middle), lying to the lower right. */
export function drawShadow(w: number, h: number): Pixels {
  const p = new Pixels(w, h);
  ellipse(p, w / 2, h / 2, w / 2, h / 2, (x, y, nx, ny) => {
    const d = Math.sqrt(nx * nx + ny * ny);
    const a = (1 - d * d) * 0.9 + 0.1;
    // dithered density, so it stays pixel art
    return hash2(x, y, 99) < a ? [0, 0, 0] : null;
  });
  return p;
}

/** Adam and Eve's house: a round hut of mud brick under a thatched roof. */
export function drawHut(): Drawing {
  const w = 220;
  const h = 196;
  const p = new Pixels(w, h);
  const cx = 110;
  const base = 186;
  const wallTop = 118;
  const rx = 78;
  // the wall: a cylinder of mud bricks, lit from the left
  for (let y = wallTop - 8; y <= base + 6; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      const nx = (x + 0.5 - cx) / rx;
      if (Math.abs(nx) > 1) continue;
      const curve = Math.sqrt(1 - nx * nx) * 10;
      if (y > base - 10 + curve) continue;
      const row = Math.floor((y - wallTop) / 8);
      const brick = (Math.floor((x + (row % 2) * 7) / 14) + row * 3) % 5;
      const seam = (y - wallTop) % 8 === 0 || (x + (row % 2) * 7) % 14 === 0;
      let v = 0.62 - nx * 0.4 + (vnoise(x / 5, y / 4, 4) - 0.5) * 0.2 + (brick - 2) * 0.03;
      if (seam) v -= 0.22;
      p.set(x, y, tone(MUD, v, x, y));
    }
  }
  // the doorway, a dark arch with a hide hung across half of it
  const dx = cx + 6;
  for (let y = 136; y <= base + 2; y++) {
    for (let x = dx - 15; x <= dx + 15; x++) {
      const nx = (x + 0.5 - dx) / 15;
      const archTop = 136 + (1 - Math.sqrt(Math.max(0, 1 - nx * nx))) * 12;
      if (Math.abs(nx) > 1 || y < archTop) continue;
      const hide = x < dx - 2 && y < base - 6 - (x - (dx - 15)) * 0.4;
      if (hide) p.set(x, y, tone(MUD, 0.85 - (vnoise(x / 3, y / 6, 8) - 0.5) * 0.5 - (x - dx + 15) * 0.02, x, y));
      else p.set(x, y, tone(MUD, 0.02 + (y - archTop) * 0.004, x, y, 0.3));
    }
  }
  // the roof: a cone of thatch in tiers, overhanging the wall
  const apex = { x: cx - 2, y: 12 };
  const eave = 124;
  const erx = 100;
  const ery = 18;
  for (let y = apex.y; y <= eave + ery; y++) {
    for (let x = cx - erx; x <= cx + erx; x++) {
      const t = (y - apex.y) / (eave - apex.y);
      const half = erx * Math.min(1, t);
      const below = y > eave ? Math.sqrt(Math.max(0, 1 - ((x + 0.5 - cx) / erx) ** 2)) * ery : 0;
      if (Math.abs(x + 0.5 - cx) > half && y <= eave) continue;
      if (y > eave && y - eave > below) continue;
      const nx = (x + 0.5 - cx) / Math.max(1, erx * Math.min(1, t));
      const ang = Math.atan2(y - apex.y, x - apex.x);
      // straws run down from the apex; tiers every 18 px
      const straw = vnoise(ang * 60, y / 14, 11) - 0.5;
      const tier = ((y - apex.y) % 18) / 18;
      let v = 0.6 - nx * 0.38 + straw * 0.35 - tier * 0.18;
      if (tier > 0.86) v -= 0.25;
      // the eave's fringe, ragged
      if (y > eave + below - 4 - hash2(x, 3, 5) * 4) v -= 0.18;
      p.set(x, y, tone(STRAW, v, x, y));
    }
  }
  // the smoke hole at the top, with the ends of the poles
  for (const [ox, oy] of [[-6, -10], [3, -12], [8, -8]]) limb(p, apex.x, apex.y + 8, apex.x + ox, apex.y + oy, 3, 2, (x, y, a) => tone(BARK, 0.5 - a * 0.4, x, y));
  ellipse(p, apex.x, apex.y + 8, 7, 3, () => STRAW[0]);
  p.outline(MUD[0]);
  return { frames: [p], ax: cx, ay: base };
}

/** A pile of rough stones: an altar (Genesis 4:3–4) or a piece of wall. */
export function drawStones(w: number, h: number, rows: number, seed: number, flatTop = false): Drawing {
  const p = new Pixels(w, h);
  const r = seeded(seed);
  const rowH = (h - 8) / rows;
  for (let row = 0; row < rows; row++) {
    // lower rows are wider; an altar narrows a little to a flat top
    const k = flatTop ? 1 - row * 0.08 : 1 - row * 0.18;
    const span = (w - 6) * k;
    const y = h - 4 - rowH * (row + 0.5);
    let x = (w - span) / 2;
    while (x < (w + span) / 2 - 4) {
      const sw = Math.min((w + span) / 2 - x, 10 + r() * 12);
      const rx = sw / 2 + 0.8;
      const ry = rowH / 2 + 0.8 + r() * 1.2;
      const sx = x + sw / 2;
      const shade = r() * 0.12;
      ellipse(p, sx, y, rx, ry, (px, py, nx, ny) => tone(STONE, 0.6 - nx * 0.25 - ny * 0.35 + shade + (vnoise(px / 3, py / 3, seed) - 0.5) * 0.25, px, py));
      x += sw - 0.5;
    }
  }
  if (flatTop) {
    // the top slab
    const ty = h - 4 - rowH * rows;
    ellipse(p, w / 2, ty + 2, w * 0.4, 5, (px, py, nx, ny) => tone(STONE, 0.78 - nx * 0.2 - ny * 0.2, px, py));
  }
  p.outline(STONE[0]);
  return { frames: [p], ax: w / 2, ay: h - 2 };
}

/** A ring of stones with a small fire; `frames` flames, flickering. */
export function drawFire(frames: number, big = false, hearth = !big): Drawing {
  const w = big ? 44 : 34;
  const h = big ? 64 : 44;
  const out: Pixels[] = [];
  const ax = w / 2;
  const ay = h - 4;
  for (let f = 0; f < frames; f++) {
    const p = new Pixels(w, h);
    if (hearth) {
      // the stones of the hearth
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const sx = ax + Math.cos(a) * 12;
        const sy = ay - 3 + Math.sin(a) * 4;
        if (Math.sin(a) < -0.2) continue;
        ellipse(p, sx, sy, 4, 3, (px, py, nx, ny) => tone(STONE, 0.55 - nx * 0.3 - ny * 0.3, px, py));
      }
      limb(p, ax - 10, ay - 2, ax + 9, ay - 5, 4, 3, (x, y, a) => tone(BARK, 0.4 - a * 0.3, x, y));
      limb(p, ax - 8, ay - 6, ax + 10, ay - 1, 4, 3, (x, y, a) => tone(BARK, 0.5 - a * 0.3, x, y));
    }
    const fh = big ? 50 : 28;
    const fw = big ? 15 : 9;
    const base = ay - (big ? 6 : 5);
    for (let y = base - fh; y <= base; y++) {
      for (let x = 0; x < w; x++) {
        const t = (base - y) / fh; // 0 bottom, 1 top
        const sway = Math.sin(t * 5 + f * 1.7) * t * 3;
        const half = fw * (1 - t) ** 0.8 * (0.75 + vnoise(x / 3, (y + f * 9) / 3, 21) * 0.5);
        const dx = Math.abs(x + 0.5 - ax - sway);
        if (dx > half) continue;
        const heat = (1 - dx / Math.max(1, half)) * (1 - t * 0.8);
        const c: RGB = heat > 0.7 ? [255, 244, 190] : heat > 0.45 ? [255, 196, 84] : heat > 0.22 ? [240, 120, 40] : [190, 60, 26];
        p.set(x, y, c);
      }
    }
    out.push(p);
  }
  return { frames: out, ax, ay };
}

/** A torch: a pole with a bundle of reeds bound at the top (its flame is
 * a separate sprite, cain-flame). */
export function drawTorch(): Drawing {
  const w = 14;
  const h = 70;
  const p = new Pixels(w, h);
  limb(p, 7, h - 2, 7, 16, 3, 2.5, (x, y, a) => tone(BARK, 0.62 - a * 0.4 + (vnoise(x, y / 5, 4) - 0.5) * 0.2, x, y));
  ellipse(p, 7, 11, 4.5, 8, (x, y, nx, ny) => tone(STRAW, 0.5 - nx * 0.35 - ny * 0.2 + (vnoise(x * 2, y, 6) - 0.5) * 0.25, x, y));
  for (const cy of [6, 15]) for (let x = 3; x <= 11; x++) if (p.alpha(x, cy)) p.set(x, cy, BARK[1]);
  return { frames: [p], ax: 7, ay: h - 2 };
}

/** A clay pot on its three stones, over Eve's fire. */
export function drawPot(): Drawing {
  const w = 30;
  const h = 30;
  const p = new Pixels(w, h);
  ellipse(p, 15, 15, 11, 10, (x, y, nx, ny) => tone(MUD, 0.6 - nx * 0.4 - ny * 0.3 + (y > 18 ? -0.15 : 0), x, y));
  ellipse(p, 15, 6, 8, 2.5, (x, y, nx) => tone(MUD, 0.15 - nx * 0.1, x, y));
  for (let x = 7; x <= 23; x++) p.set(x, 5, MUD[4]);
  p.outline(MUD[0]);
  return { frames: [p], ax: 15, ay: 24 };
}

/** One ridge of tilled earth (Cain "a tiller of the ground", Genesis 4:2). */
export function drawFurrow(seed: number): Pixels {
  const w = 128;
  const h = 14;
  const p = new Pixels(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const end = Math.min(x, w - 1 - x);
      if (end < 3 && hash2(x, y, seed) > end / 3) continue;
      const t = y / (h - 1); // 0 top of the ridge, 1 the groove
      const v = 0.75 - t * 0.7 + (vnoise(x / 3, y / 2, seed) - 0.5) * 0.35;
      p.set(x, y, tone(SOIL, v, x, y));
    }
  }
  return p;
}

/** Ripe wheat, or its stubble once reaped. */
export function drawWheat(seed: number, reaped = false): Drawing {
  const w = 40;
  const h = 52;
  const p = new Pixels(w, h);
  const r = seeded(seed);
  for (let i = 0; i < 11; i++) {
    const bx = 6 + r() * 28;
    const lean = (r() - 0.5) * 10;
    const top = reaped ? h - 8 - r() * 4 : 6 + r() * 12;
    limb(p, bx, h - 3, bx + (reaped ? 0 : lean), top, 2, 1.5, (x, y, a) => tone(WHEAT, 0.55 - a * 0.3, x, y));
    if (!reaped) {
      // the ear of grain
      limb(p, bx + lean, top + 9, bx + lean * 1.05, top - 2, 4, 2, (x, y, a) => tone(WHEAT, 0.8 - a * 0.25 + (hash2(x, y, 3) - 0.5) * 0.3, x, y));
    }
  }
  p.outline(WHEAT[0], true);
  return { frames: [p], ax: w / 2, ay: h - 3 };
}

/** A gourd vine on the ground, with its gourds or picked. */
export function drawGourds(seed: number, picked = false): Drawing {
  const w = 64;
  const h = 40;
  const p = new Pixels(w, h);
  const r = seeded(seed);
  for (let i = 0; i < 9; i++) {
    const lx = 8 + r() * 48;
    const ly = 14 + r() * 20;
    ellipse(p, lx, ly, 7 + r() * 3, 5 + r() * 2, (x, y, nx, ny) => tone(LEAVES, 0.62 - nx * 0.3 - ny * 0.4 + (vnoise(x / 2, y / 2, i) - 0.5) * 0.3, x, y));
  }
  p.outline(LEAVES[0]);
  if (!picked) {
    for (const [gx, gy, gr] of [[22, 28, 7], [42, 24, 6]] as const) {
      ellipse(p, gx, gy, gr * 1.25, gr, (x, y, nx, ny) => tone(GOURD, 0.7 - nx * 0.35 - ny * 0.45, x, y, 0.5));
      for (let x = gx - gr; x <= gx + gr; x++) p.set(x, gy + gr, GOURD[0]);
    }
  }
  return { frames: [p], ax: w / 2, ay: h - 4 };
}

/** Young green crops in the rows (decoration). */
export function drawGreens(seed: number): Drawing {
  const w = 30;
  const h = 22;
  const p = new Pixels(w, h);
  const r = seeded(seed);
  for (let i = 0; i < 5; i++) {
    const bx = 5 + r() * 20;
    for (let j = 0; j < 3; j++) {
      const a = -Math.PI / 2 + (j - 1) * 0.7 + (r() - 0.5) * 0.3;
      limb(p, bx, h - 3, bx + Math.cos(a) * 9, h - 3 + Math.sin(a) * 12, 3.5, 1.5, (x, y, ac) => tone(LEAVES, 0.62 - ac * 0.3, x, y));
    }
  }
  p.outline(LEAVES[0], true);
  return { frames: [p], ax: w / 2, ay: h - 3 };
}

/** A donkey's jawbone lying in the field (the maintainer's choice). */
export function drawJawbone(): Drawing {
  const w = 36;
  const h = 18;
  const p = new Pixels(w, h);
  // the long bone, curving up at the back
  limb(p, 4, 9, 26, 11, 6, 5, (x, y, a) => tone(BONE, 0.7 - a * 0.35 + (hash2(x, y, 2) - 0.5) * 0.15, x, y));
  limb(p, 26, 11, 32, 3, 5, 4, (x, y, a) => tone(BONE, 0.65 - a * 0.35, x, y));
  // the teeth along the top
  for (let x = 6; x <= 22; x += 3) {
    p.set(x, 5, BONE[5]);
    p.set(x + 1, 5, BONE[4]);
    p.set(x, 4, BONE[4]);
  }
  p.outline(BONE[0]);
  return { frames: [p], ax: w / 2, ay: h - 4 };
}

/** The fat portions of the firstlings (Genesis 4:4), on a leaf. */
export function drawFat(): Drawing {
  const w = 22;
  const h = 16;
  const p = new Pixels(w, h);
  ellipse(p, 11, 10, 10, 4.5, (x, y, nx) => tone(LEAVES, 0.5 - nx * 0.3, x, y));
  for (const [fx, fy, fr] of [[8, 7, 4], [14, 8, 3.6], [11, 5, 3]] as const) {
    ellipse(p, fx, fy, fr, fr * 0.8, (x, y, nx, ny) => tone(BONE, 0.8 - nx * 0.3 - ny * 0.4, x, y, 0.5));
  }
  p.outline(BONE[0]);
  return { frames: [p], ax: 11, ay: 13 };
}

/** Abel's shepherd's staff, with a crook at the top. */
export function drawStaff(): Drawing {
  const w = 16;
  const h = 128;
  const p = new Pixels(w, h);
  limb(p, 6, h - 2, 6, 14, 3, 3, (x, y, a) => tone(BARK, 0.7 - a * 0.4 + (vnoise(x, y / 6, 2) - 0.5) * 0.2, x, y));
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI + (i / 12) * Math.PI * 1.1;
    const x = 10 + Math.cos(a) * 4.5;
    const y = 12 + Math.sin(a) * 6;
    limb(p, x, y, x + 0.5, y + 0.5, 3, 3, (px, py) => tone(BARK, 0.6, px, py));
  }
  p.outline(BARK[0]);
  return { frames: [p], ax: 6, ay: h - 2 };
}

/** Anger over someone's head: a little dark scribble (Genesis 4:5). World-sized. */
export function drawAnger(): Pixels {
  // the "cross vein" sign of anger: four bent strokes round a centre, bright
  // red edged in pale peach so it shows against hair and stone at night
  // (the maintainer lost the old dark scribble against the altar)
  const rows = [
    '   RR    RR   ',
    '   RR    RR   ',
    'RRRRR    RRRRR',
    ' RRR      RRR ',
    '              ',
    '              ',
    ' RRR      RRR ',
    'RRRRR    RRRRR',
    '   RR    RR   ',
    '   RR    RR   ',
  ];
  // each mark two pixels square: thick strokes, mostly red
  const p = new Pixels(30, 22);
  const red: RGB = [236, 58, 48];
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch === 'R' && [0, 1].forEach((i) => [0, 1].forEach((j) => p.set(x * 2 + 1 + i, y * 2 + 1 + j, red)))));
  p.outline([248, 177, 149]);
  return p;
}

/** A tinted copy (the produce basket of Cain's offering, smoke). */
export function tinted(src: Pixels, by: RGB, k: number): Pixels {
  const p = new Pixels(src.w, src.h);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const a = src.alpha(x, y);
      if (a) p.set(x, y, mixRGB(src.get(x, y), by, k), a);
    }
  }
  return p;
}

const FUR = ramp('#140e0b', '#22170f', '#352416', '#4b331f', '#634429', '#7d5835', '#986d44');
const CREAM = ramp('#5e4c3a', '#8a7358', '#b39c7c', '#d6c19e', '#eee0c0', '#faf1dc');

/**
 * Abel's sheepdog (placeholder until the generated art): a lean dark dog
 * with a cream chest, muzzle and tail tip, seen from the side facing right.
 * Frames: 0–1 idle (breathing, the tail wagging), 2–5 trotting.
 */
export function drawDog(): Drawing {
  const W = 72;
  const H = 52;
  const AY = 49;
  const frames: Pixels[] = [];
  const lit = (r: RGB[], base: number) => (x: number, y: number, nx: number, ny: number) => tone(r, base + (-nx * 0.5 - ny * 0.62) * 0.35 + (vnoise(x / 3, y / 3, 7) - 0.5) * 0.1, x, y);
  for (let f = 0; f < 6; f++) {
    const p = new Pixels(W, H);
    const walking = f >= 2;
    const ph = walking ? ((f - 2) / 4) * Math.PI * 2 : 0;
    const bob = walking ? -Math.abs(Math.sin(ph)) * 1.2 : f === 1 ? 0.6 : 0;
    const wag = walking ? Math.sin(ph * 2) * 2 : f === 1 ? 3 : -2;
    const by = 31 + bob;
    const leg = (x: number, swing: number, far: boolean) => {
      const knee = by + 7;
      const fx = x + swing;
      limb(p, x, by + 2, x + swing * 0.5, knee, 3.4, 2.6, (px, py) => tone(FUR, far ? 0.18 : 0.38, px, py));
      limb(p, x + swing * 0.5, knee, fx, AY - 1, 2.4, 2, (px, py) => tone(FUR, far ? 0.16 : 0.34, px, py));
      limb(p, fx, AY - 1, fx + 1.6, AY - 1, 1.6, 1.5, (px, py) => tone(CREAM, far ? 0.35 : 0.6, px, py));
    };
    const s = walking ? Math.sin(ph) * 4 : 0;
    // far legs first, darker
    leg(25, -s, true);
    leg(47, s, true);
    // tail, behind the body
    limb(p, 21, by - 4, 13, by - 7 + wag, 3.6, 3, (px, py) => tone(FUR, 0.4, px, py));
    limb(p, 13, by - 7 + wag, 8, by - 11 + wag * 1.3, 3, 1.8, (px, py) => tone(CREAM, 0.7, px, py));
    // body and chest
    ellipse(p, 34, by - 1, 16, 9, lit(FUR, 0.42));
    ellipse(p, 46, by + 1, 7, 8, lit(CREAM, 0.6));
    // near legs
    leg(28, s, false);
    leg(44, -s, false);
    // neck and head
    limb(p, 44, by - 3, 50, by - 10, 6.5, 5.5, (px, py) => tone(FUR, 0.45, px, py));
    ellipse(p, 53, by - 13, 7.5, 6.5, lit(FUR, 0.48));
    limb(p, 57, by - 12, 62.5, by - 10.5, 3.4, 2.6, (px, py, across) => tone(across > 0.3 ? CREAM : FUR, across > 0.3 ? 0.55 : 0.5, px, py));
    p.set(63, by - 11, FUR[0]);
    p.set(64, by - 11, FUR[0]);
    p.set(63, by - 12, FUR[0]);
    // the ears, folded at the tips
    limb(p, 50, by - 18, 48, by - 23, 3, 1.4, (px, py) => tone(FUR, 0.3, px, py));
    limb(p, 48, by - 23, 46.5, by - 21.5, 1.4, 1, (px, py) => tone(FUR, 0.22, px, py));
    // the eye
    p.set(56, by - 14, [24, 16, 10]);
    p.set(56, by - 15, [24, 16, 10]);
    p.outline(FUR[0]);
    frames.push(p);
  }
  return { frames, ax: 36, ay: AY };
}

/** Abel's flint knife (for the firstlings, Genesis 4:4), pointing right: a wooden haft and a knapped blade. */
export function drawKnife(): Drawing {
  const w = 32;
  const h = 12;
  const p = new Pixels(w, h);
  limb(p, 3, 6, 11, 6, 2.4, 2.4, (x, y, a) => tone(BARK, 0.65 - a * 0.3, x, y));
  // a pale flint blade, its edge catching the light
  limb(p, 11, 6, 29, 5, 3.4, 0.9, (x, y, a) => tone(STONE, 1 - a * 0.3, x, y));
  for (let x = 12; x <= 27; x++) p.set(x, 4, STONE[6]);
  p.outline(STONE[1]);
  return { frames: [p], ax: 7, ay: 6 };
}

/**
 * Cain's basket of the fruit of the ground (Genesis 4:3), in the chapter's
 * own style (the maintainer: the apples and grapes of the Eden basket did
 * not belong): a woven straw basket with a gourd, ears of wheat and greens
 * from his field.
 */
export function drawCainBasket(): Drawing {
  const w = 38;
  const h = 36;
  const p = new Pixels(w, h);
  // ears of wheat standing up at the back
  for (const [x0, x1, top] of [[13, 10, 3], [17, 17, 1], [21, 24, 3], [25, 29, 7]] as const) {
    limb(p, x0, 20, x1, top + 7, 0.8, 0.6, (x, y) => tone(WHEAT, 0.45, x, y));
    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      const ex = x1 + (x0 - x1) * t * 0.35;
      const ey = top + 1 + i * 2;
      ellipse(p, ex - 0.8, ey, 1.3, 1.5, (x, y, nx) => tone(WHEAT, 0.75 - nx * 0.25, x, y, 0.4));
      ellipse(p, ex + 0.8, ey + 0.6, 1.3, 1.5, (x, y, nx) => tone(WHEAT, 0.6 - nx * 0.25, x, y, 0.4));
    }
  }
  // greens spilling over the left of the rim
  for (const [x, y, a] of [[7, 17, -2.4], [10, 15, -1.9], [13, 16, -1.2]] as const) {
    limb(p, x + 3, y + 4, x + Math.cos(a) * 7, y + Math.sin(a) * 5, 2.6, 0.8, (px, py, ac) => tone(LEAVES, 0.62 - ac * 0.3, px, py));
  }
  // a ripe gourd on the right, ribbed
  ellipse(p, 25, 17.5, 7, 5.5, (x, y, nx, ny) => {
    const rib = Math.abs(Math.sin((nx + 1) * 2.4 * Math.PI)) < 0.25 ? -0.18 : 0;
    return tone(GOURD, 0.72 - nx * 0.25 - ny * 0.3 + rib, x, y, 0.5);
  });
  limb(p, 25, 12.5, 26.5, 10, 1.1, 0.8, (x, y) => tone(LEAVES, 0.35, x, y));
  // a smaller one at the front left
  ellipse(p, 14, 19.5, 4.5, 3.6, (x, y, nx, ny) => tone(GOURD, 0.6 - nx * 0.25 - ny * 0.3, x, y, 0.5));
  // the basket: woven straw, wider at the rim, in light from the upper left
  const top = 20;
  const bottom = h - 2;
  for (let y = top; y <= bottom; y++) {
    const t = (y - top) / (bottom - top);
    const half = 16 - t * t * 5;
    for (let x = Math.ceil(19 - half); x <= Math.floor(19 + half); x++) {
      const nx = (x + 0.5 - 19) / half;
      const weave = ((Math.floor(x / 3) + Math.floor((y - top) / 2)) & 1) ? 0.1 : -0.06;
      const row = (y - top) % 2 === 1 ? -0.08 : 0;
      p.set(x, y, tone(STRAW, 0.62 - nx * 0.28 - t * 0.25 + weave + row, x, y, 0.3));
    }
  }
  // the rim, a twisted band
  limb(p, 3.5, top, 34.5, top, 1.8, 1.8, (x, y, ac) => tone(STRAW, 0.82 - ac * 0.3 + ((x & 2) ? 0.08 : -0.08), x, y, 0.3));
  p.outline(STRAW[0]);
  return { frames: [p], ax: 19, ay: h - 2 };
}
