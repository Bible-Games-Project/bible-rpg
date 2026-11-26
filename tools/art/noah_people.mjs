// Noah's chapter: the sheets its people are made from at runtime
// (src/game/noah/people.ts). The maintainer: Adam as the exact reference for
// look and movement, and every person different, matching their talk
// portrait (public/assets/noah/faces). So there are two kinds of sheet:
//   - three bodies, bald: Adam's tunic sheet with a robe to mid-shin
//     (man-robe) or as long as his tunic (man-tunic), and Eve's (woman),
//     with long sleeves to the wrist and the hair taken off, a skull drawn
//     where it was;
//   - one sheet per person (people/hair/<id>.png: the down, up and right
//     sheets one under the other) with what is drawn over the body: the hair
//     as in the portrait (long, tied back, curly, braided, a bun, bald...),
//     the beard, a head scarf, a band, gold, an apron.
// Their parts are marked by colour so each one is coloured at runtime:
// cloth in pure greys, hair and beard in blue greys, the scarves, bands,
// gold and aprons in green greys, skin left as it is.
// Only the standing and front/back walking frames are written: the side
// walk, the run, bending and blows are rebuilt at runtime from the standing
// frame (world/stride.ts), like every other sheet.
//
//   node tools/art/noah_people.mjs     (writes public/assets/noah/people/)
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'public/assets/noah/people');
const DIRS = ['down', 'up', 'right'];

/** Where things are on each source sheet's first frame (sheet pixels). */
const SOURCES = {
  adam: {
    file: (d) => `public/assets/sprites/char-adam-tunic-${d}.png`,
    fw: 58,
    cx: 29,
    shoulder: 41,
    // the fists, kept skin: from the front and back the outer columns from this row; from the side the near arm's band
    hands: { front: { y: 80, out: 14 }, side: { y: 79, x0: 23, x1: 33, gr: [0.645, 0.725] }, y1: 93 },
    face: {
      down: { mouth: [29.5, 31], nose: 29, chin: 34, half: 9 },
      right: { ear: [29, 26], chin: [36, 34], mouth: [39.5, 28.5], nose: [41, 28] },
    },
    // the skull (centre, radii), the hairline, the face's half width (front) or its back edge (side)
    head: {
      down: { x: 29.5, y: 21.5, rx: 10.5, ry: 11.5, fore: 17, half: 7.5 },
      up: { x: 29.5, y: 21.5, rx: 10.5, ry: 11.5, half: 7.5 },
      right: { x: 29.5, y: 20.5, rx: 11.5, ry: 11.5, fore: 16, face: 33, ear: [28.5, 23.5] },
    },
    // the apron: from the chest to above the knees, its half width (front) or the body's front (side)
    apron: { y0: 47, y1: 92, half: 8, front: 38 },
    legsShown: 19,
  },
  eve: {
    file: (d) => `public/assets/sprites/char-eve-tunic-${d}.png`,
    fw: 60,
    cx: 30,
    shoulder: 40,
    hands: { front: { y: 83, out: 13 }, side: { y: 82, x0: 25, x1: 34, gr: [0.6, 0.74] }, y1: 96 },
    face: {},
    head: {
      down: { x: 31.5, y: 21, rx: 10.5, ry: 12, fore: 16, half: 7.5 },
      up: { x: 31, y: 21, rx: 10.5, ry: 12, half: 7.5 },
      right: { x: 33, y: 20.5, rx: 11.5, ry: 12, fore: 12, face: 37, ear: [32.5, 22.5] },
    },
    legsShown: 17,
  },
};

const BODIES = {
  'man-robe': { src: 'adam', robe: true },
  'man-tunic': { src: 'adam', robe: false },
  woman: { src: 'eve', robe: true },
};

/**
 * Everyone as in their portrait. hair: the style (see hairAt); beard: its
 * kind; extra: what is drawn in the accent colour.
 *   vol: how far the hair stands off the skull (px); len: how far it falls
 *   below the skull's centre (px); fringe: how far over the forehead.
 */
export const PEOPLE = {
  noah: { body: 'man-robe', hair: { tex: 'straight', vol: 1.5, len: 17, fringe: -1, part: true }, beard: 'long' },
  shem: { body: 'man-robe', hair: { tex: 'straight', vol: 0.5, len: 2, fringe: -1, tail: 16, part: true }, beard: 'short' },
  ham: { body: 'man-robe', hair: { tex: 'curly', vol: 1.5, len: 1, fringe: 0 }, beard: 'short' },
  japheth: { body: 'man-robe', hair: { tex: 'wavy', vol: 2, len: 13, fringe: 2 }, beard: 'stubble' },
  'noah-wife': { body: 'woman', hair: { tex: 'straight', vol: 1, len: 6, fringe: 1, part: true, braid: 'side' } },
  'shem-wife': { body: 'woman', hair: { tex: 'straight', vol: 0.5, len: 2, fringe: 1, part: true, bun: 'top' } },
  'ham-wife': { body: 'woman', hair: { tex: 'wavy', vol: 1, len: 12, fringe: 0 }, extra: 'scarf' },
  'japheth-wife': { body: 'woman', hair: { tex: 'straight', vol: 1, len: 4, fringe: 1, part: true, braid: 'two' } },
  wicked: { body: 'man-tunic', hair: { tex: 'straight', vol: 0.5, len: 1, fringe: -2, slick: true }, beard: 'moustache' },
  'wicked-b': { body: 'man-tunic', hair: { tex: 'curly', vol: 0, len: 0, fringe: -1 } },
  'wicked-c': { body: 'man-tunic', hair: { tex: 'wavy', vol: 2, len: 6, fringe: 3 }, beard: 'pointed' },
  'wicked-woman': { body: 'woman', hair: { tex: 'wavy', vol: 1, len: 2, fringe: 1, bun: 'crown' }, extra: 'gold' },
  giant: { body: 'man-tunic', hair: { tex: 'wavy', vol: 3, len: 17, fringe: 1 }, beard: 'thick' },
  thief: { body: 'man-tunic', hair: { tex: 'wavy', vol: 2, len: 4, fringe: 4 }, beard: 'stubble' },
  baker: { body: 'man-robe', hair: { tex: 'curly', vol: 1, len: 1, fringe: 0, bald: true }, beard: 'full', extra: 'apron' },
  debtor: { body: 'man-tunic', hair: { tex: 'wavy', vol: 1, len: 2, fringe: 0, thin: true } },
  farmer: { body: 'man-tunic', hair: { tex: 'wavy', vol: 1.5, len: 3, fringe: 0 }, beard: 'full', extra: 'band' },
  mocker: { body: 'man-tunic', hair: { tex: 'wavy', vol: 1.5, len: 2, fringe: 3 } },
};

const lumOf = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

function hash(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** One frame: its pixels and helpers. */
class Frame {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint8Array(w * h * 4);
  }
  i(x, y) {
    return (y * this.w + x) * 4;
  }
  in(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  a(x, y) {
    return this.in(x, y) && this.d[this.i(x, y) + 3] > 0;
  }
  lum(x, y) {
    const i = this.i(x, y);
    return lumOf(this.d[i], this.d[i + 1], this.d[i + 2]);
  }
  rgb(x, y) {
    const i = this.i(x, y);
    return [this.d[i], this.d[i + 1], this.d[i + 2]];
  }
  set(x, y, c) {
    if (!this.in(x, y)) return;
    const i = this.i(x, y);
    this.d[i] = c[0];
    this.d[i + 1] = c[1];
    this.d[i + 2] = c[2];
    this.d[i + 3] = 255;
  }
  clear(x, y) {
    this.d.fill(0, this.i(x, y), this.i(x, y) + 4);
  }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cloth = (l) => {
  const v = clamp(Math.round(l), 0, 255);
  return [v, v, v];
};
/** hair and beard: blue greys (runtime: hue near 215) */
const hairC = (l) => {
  const v = clamp(l, 12, 200);
  return [Math.round(v * 0.72), Math.round(v * 0.82), Math.min(255, Math.round(v * 1.25))];
};
/** scarves, bands, gold, aprons: green greys */
const accentC = (l) => {
  const v = clamp(l, 14, 205);
  return [Math.round(v * 0.7), Math.min(255, Math.round(v * 1.22)), Math.round(v * 0.7)];
};

function readFrames(file, fw) {
  const png = PNG.sync.read(fs.readFileSync(path.join(ROOT, file)));
  const n = Math.round(png.width / fw);
  const frames = [];
  for (let k = 0; k < n; k++) {
    const f = new Frame(fw, png.height);
    for (let y = 0; y < png.height; y++) for (let x = 0; x < fw; x++) f.d.set(png.data.subarray((y * png.width + k * fw + x) * 4, (y * png.width + k * fw + x) * 4 + 4), f.i(x, y));
    frames.push(f);
  }
  return frames;
}

function writeSheets(rows, file) {
  const fw = rows[0][0].w;
  const fh = rows[0][0].h;
  const n = rows[0].length;
  const png = new PNG({ width: fw * n, height: fh * rows.length });
  rows.forEach((frames, r) => frames.forEach((f, k) => {
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) png.data.set(f.d.subarray(f.i(x, y), f.i(x, y) + 4), ((r * fh + y) * png.width + k * fw + x) * 4);
  }));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png, { colorType: 6 }));
}

function rowsOf(f) {
  let top = f.h;
  let bottom = 0;
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.a(x, y)) {
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  return { top, bottom };
}

/** The first row below the waist where only the legs are left (as stride.ts splitSide). */
function hemOf(f, top, bottom) {
  const widths = [];
  for (let y = 0; y < f.h; y++) {
    let n = 0;
    for (let x = 0; x < f.w; x++) if (f.a(x, y)) n++;
    widths.push(n);
  }
  const maxW = Math.max(...widths);
  for (let y = top + Math.floor(0.6 * (bottom - top + 1)); y <= bottom; y++) if (widths[y] <= 0.45 * maxW) return y;
  return bottom;
}

/** Each source frame's vertical bob against the first (by the top of the head). */
const sources = {};
function source(src, dir) {
  const key = `${src}-${dir}`;
  if (!sources[key]) {
    const S = SOURCES[src];
    const frames = readFrames(S.file(dir), S.fw);
    const first = rowsOf(frames[0]).top;
    sources[key] = frames.map((f) => ({ f, bob: rowsOf(f).top - first }));
  }
  return sources[key];
}

/** The dark hair mass from the top of the head (Eve's falls over her back and shoulders). */
function hairMask(f, S, src, side, shoulder) {
  const hair = new Uint8Array(f.w * f.h);
  const { top } = rowsOf(f);
  const stack = [];
  for (let x = 0; x < f.w; x++) for (let y = top; y < top + 3; y++) if (f.a(x, y) && f.lum(x, y) < 110) stack.push([x, y]);
  const ok = (x, y) => {
    if (!f.a(x, y) || f.lum(x, y) >= 108) return false;
    if (y < shoulder) return true;
    if (src !== 'eve') return false;
    if (side) return x < S.cx - 6 && y < shoulder + 22;
    return Math.abs(x - S.cx) >= 14 && y < shoulder + 22;
  };
  while (stack.length) {
    const [x, y] = stack.pop();
    if (hair[y * f.w + x] || !ok(x, y)) continue;
    hair[y * f.w + x] = 1;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return hair;
}

/** The face's skin, lit (light from the upper left), to draw a bald skull with. */
function skinOf(f, H, bob) {
  const list = [];
  for (let y = Math.round(H.y + bob); y < H.y + bob + 4; y++) for (let x = Math.round(H.x - 4); x <= H.x + 4; x++) if (f.a(x, y)) {
    const c = f.rgb(x, y);
    if (c[0] > c[2] + 25 && lumOf(...c) > 110) list.push(c);
  }
  list.sort((a, b) => lumOf(...a) - lumOf(...b));
  return list[Math.floor(list.length * 0.55)] ?? [222, 170, 130];
}

/** A body sheet: the clothes as a robe (or the tunic's length), the hair off, a skull where it was. */
function body(id, B, dir) {
  const S = SOURCES[B.src];
  const side = dir === 'right';
  const H = S.head[dir];
  const list = source(B.src, dir);
  return list.map(({ f: src, bob }, k) => {
    const f = new Frame(src.w, src.h);
    f.d.set(src.d);
    const { top, bottom } = rowsOf(src);
    const shoulder = S.shoulder + bob;
    const hem = hemOf(src, top, bottom);
    const robeEnd = bottom - S.legsShown;
    const isHand = (x, y) => {
      if (y > S.hands.y1 + bob) return false;
      if (side) {
        if (y < S.hands.side.y + bob || x < S.hands.side.x0 || x >= S.hands.side.x1 || !src.a(x, y)) return false;
        // the fist against the tunic: skin is between the sash (redder) and the light cloth (yellower)
        const i = src.i(x, y);
        const gr = src.d[i + 1] / Math.max(1, src.d[i]);
        return gr >= S.hands.side.gr[0] && gr <= S.hands.side.gr[1];
      }
      return y >= S.hands.front.y + bob && Math.abs(x + 0.5 - S.cx - 0.5) >= S.hands.front.out;
    };
    const hair = hairMask(src, S, B.src, side, shoulder);
    // --- the robe: everything from the shoulders down to the hem, but the hands (long sleeves)
    for (let y = shoulder; y < Math.min(hem + 2, f.h); y++) {
      for (let x = 0; x < f.w; x++) {
        if (!f.a(x, y) || hair[y * f.w + x] || isHand(x, y)) continue;
        f.set(x, y, cloth(f.lum(x, y) * 0.92 + 8));
      }
    }
    if (B.robe) {
      // down to mid-shin: the tunic's width, flaring a little, over the legs;
      // the tunic's ragged hem is drawn again as part of the robe
      const ref = hem - 9;
      let hl = f.w;
      let hr = -1;
      for (let x = 0; x < f.w; x++) if (src.a(x, ref) && !isHand(x, ref)) {
        hl = Math.min(hl, x);
        hr = Math.max(hr, x);
      }
      const raw = [];
      for (let x = 0; x < f.w; x++) raw.push(f.a(x, ref) && !isHand(x, ref) ? f.lum(x, ref) : null);
      const shade = raw.map((_, x) => {
        let s = 0;
        let n = 0;
        for (let j = -1; j <= 1; j++) if (raw[x + j] != null) {
          s += raw[x + j];
          n++;
        }
        return n ? s / n : 140;
      });
      for (let y = hem - 8; y <= robeEnd; y++) {
        const t = Math.max(0, (y - hem) / Math.max(1, robeEnd - hem));
        let l0 = hl - Math.floor(t * 3);
        let r0 = hr + Math.floor(t * 3);
        for (let x = 0; x < f.w; x++) if (src.a(x, y) && !isHand(x, y) && (y > hem || x >= hl - 2 && x <= hr + 2)) {
          l0 = Math.min(l0, x);
          r0 = Math.max(r0, x);
        }
        const end = robeEnd - (hash(0, y, 3) < 0.5 ? 0 : 1);
        for (let x = l0; x <= r0; x++) {
          if (x < 0 || x >= f.w || isHand(x, y)) continue;
          if (y > end && hash(x, y, k) < 0.6) continue;
          const edge = x === l0 || x === r0;
          const fold = Math.sin((x - S.cx) * 1.1 + 0.6) * 4 + (hash(x, Math.floor(y / 5), 9) - 0.5) * 5;
          let l = shade[Math.max(hl, Math.min(hr, x))] + fold - t * 12;
          if (edge) l *= 0.72;
          if (y >= end) l *= 0.78;
          f.set(x, y, cloth(l));
        }
      }
    }
    // --- the hair off; under it a skull, and from behind Eve's neck and shoulders
    const back = [];
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (hair[y * f.w + x]) {
      f.clear(x, y);
      // from behind and from the side, what the long hair covered on the back is the dress
      if (y >= shoulder + 1 && (dir === 'up' || side)) back.push([x, y]);
    }
    if (dir === 'up') {
      // the neck and shoulders as from the front (Eve's hair hid them)
      const front = source(B.src, 'down')[k]?.f;
      const fh = front && hairMask(front, S, B.src, false, shoulder);
      if (front) for (let y = Math.round(H.y + bob + 4); y < shoulder + 2; y++) for (let x = 0; x < f.w; x++) {
        if (f.a(x, y) || !front.a(x, y) || fh[y * f.w + x]) continue;
        const c = front.rgb(x, y);
        if (c[0] > c[2] + 20) f.set(x, y, c.map((v) => v * 0.9));
      }
    }
    // the dress where the hair covered it from behind: between its edges on each row
    for (const [x, y] of back) {
      let l = -1;
      let r = -1;
      for (let j = x - 1; j >= 0; j--) if (f.a(j, y)) {
        l = j;
        break;
      }
      for (let j = x + 1; j < f.w; j++) if (f.a(j, y)) {
        r = j;
        break;
      }
      if (l >= 0 && r >= 0 && dir === 'up') f.set(x, y, cloth(130 + (hash(x, y >> 2, 4) - 0.5) * 10));
    }
    const skin = skinOf(f, H, bob);
    const cy = H.y + bob;
    for (let y = Math.floor(cy - H.ry - 1); y <= cy + H.ry; y++) for (let x = Math.floor(H.x - H.rx - 1); x <= H.x + H.rx + 1; x++) {
      const u = (x + 0.5 - H.x - 0.5) / H.rx;
      const v = (y + 0.5 - cy - 0.5) / H.ry;
      const d = Math.hypot(u, v);
      if (d > 1 || f.a(x, y)) continue;
      // the skull: lit from the upper left, darker to its edge
      const lit = 1.06 - 0.16 * (u + 0.2) - 0.12 * v - (d > 0.82 ? 0.16 : 0);
      f.set(x, y, skin.map((c) => clamp(Math.round(c * lit), 0, 255)));
    }
    return f;
  });
}

/** How far the hair stands off the skull at a point (front, back or side). */
function hairAt(P, H, view, x, y, cy) {
  const h = P.hair;
  const u = (x - H.x) / H.rx;
  const v = (y - cy) / H.ry;
  const d = Math.hypot(u, v);
  // the outer edge: the skull and the hair's volume (more at the top and sides)
  const vol = h.vol + (h.tex === 'curly' ? 0.6 : 0);
  const R = 1 + vol / H.rx;
  const below = y - cy;
  let inCap = d <= R;
  let fall = false;
  if (h.len > 0 && below > 0) {
    // falling to `len` below the centre, as wide as the head and a little more
    const w = H.rx + vol - Math.max(0, below - h.len + 3) * 1.2;
    if (view === 'up') fall = Math.abs(x - H.x) <= w && below <= h.len + H.ry * 0.3;
    else if (view === 'down') fall = Math.abs(x - H.x) <= w && Math.abs(x - H.x) >= H.half - 0.5 && below <= h.len + 0.5;
    else fall = x <= H.x + 1.5 - below * 0.15 && x >= H.x - H.rx - vol && below <= h.len + 0.5;
  }
  if (!inCap && !fall) return null;
  // what the hair leaves bare: the face, and the ears of short hair
  if (view === 'down') {
    const line = H.fore + (cy - H.y) + (h.fringe ?? 0) - (h.part ? 0.6 * Math.max(0, 1 - Math.abs(x - H.x) / 3) : 0);
    if (y >= line && Math.abs(x - H.x) < H.half + 0.5) return null;
    if (h.len < 4 && below >= 1.5 && Math.abs(x - H.x) > H.rx - 2.5) return null;
  } else if (view === 'right') {
    const line = H.fore + (cy - H.y) + (h.fringe ?? 0);
    if (y >= line && x >= H.face - (y > line + 6 ? 1 : 0)) return null;
    // the ear: bare when the hair is short
    if (h.len < 4 && Math.hypot(x - H.ear[0], y - (H.ear[1] + cy - H.y)) < 2.6) return null;
    if (h.len < 4 && below > 2 && x > H.ear[0] - 1) return null;
  }
  if (h.bald) {
    // only round the sides and the back, below the crown
    if (view === 'down' && (v < -0.15 || Math.abs(u) < 0.72)) return null;
    if (view === 'right' && (v < -0.1 || x > H.x + 1)) return null;
    if (view === 'up' && v < 0) return null;
  }
  if (h.thin && v < -0.35 && hash(x, y, 7) < 0.55 && view !== 'up') return null;
  return { u, v, d, R, fall: !inCap };
}

/** The shade of a hair pixel (blue grey marking, light from the upper left). */
function hairShade(P, info, x, y, edge) {
  const h = P.hair;
  const { u, v } = info;
  let l = 112 + 30 * Math.max(0, 1 - ((u + 0.35) ** 2 + (v + 0.6) ** 2) * 2.2);
  if (h.tex === 'straight') l += (hash(x, Math.floor(y / 5), 1) - 0.5) * 26 + (x % 2 ? 4 : -4);
  else if (h.tex === 'wavy') l += Math.sin(x * 1.1 + Math.sin(y * 0.45 + x * 0.2) * 1.6 + hash(x >> 2, y >> 3, 2) * 3) * 9 + (hash(x, Math.floor(y / 3), 2) - 0.5) * 18;
  else {
    const cx = Math.floor(x / 2);
    const cy = Math.floor((y + (cx % 2)) / 2);
    l += (hash(cx, cy, 3) < 0.5 ? 14 : -12) + ((x % 2 === 0 && (y + cx) % 2 === 0) ? 8 : -2);
  }
  if (h.slick) l += v < 0 ? 14 * Math.max(0, 1 - Math.abs(u + 0.25) * 3) : 0;
  if (edge) l *= 0.62;
  return hairC(l);
}

/** The overlay of one person in one direction: hair, beard, extras. */
function overlay(P, dir) {
  const B = BODIES[P.body];
  const S = SOURCES[B.src];
  const H = S.head[dir];
  const side = dir === 'right';
  return source(B.src, dir).map(({ f: src, bob }, k) => {
    const f = new Frame(src.w, src.h);
    const cy = H.y + bob;
    // --- the hair
    const cells = new Map();
    for (let y = 0; y < f.h * 0.6; y++) for (let x = 0; x < f.w; x++) {
      const info = hairAt(P, H, dir, x, y, cy);
      if (info) cells.set(y * f.w + x, info);
    }
    for (const [i, info] of cells) {
      const x = i % f.w;
      const y = Math.floor(i / f.w);
      const edge = !cells.has(i - 1) || !cells.has(i + 1) || !cells.has(i - f.w) || !cells.has(i + f.w);
      // ragged ends for loose hair
      if (edge && P.hair.tex !== 'straight' && hash(x, y, 5) < 0.3 && !P.hair.slick) continue;
      f.set(x, y, hairShade(P, info, x, y, edge));
    }
    extras(f, P, S, H, dir, cy, bob, k);
    if (P.beard) beard(f, S, dir, bob, P.beard, k);
    if (P.extra === 'apron') apron(f, S, src, dir, bob);
    return f;
  });
}

/** Tails, buns, braids, scarves, bands and gold. */
function extras(f, P, S, H, dir, cy, bob, k) {
  const h = P.hair;
  const side = dir === 'right';
  const strand = (x, y, base, s = 0) => hairC(base + (hash(x, y, s) - 0.5) * 22);
  const ball = (bx, by, r, base, s) => {
    for (let y = Math.floor(by - r - 1); y <= by + r + 1; y++) for (let x = Math.floor(bx - r - 1); x <= bx + r + 1; x++) {
      const d = Math.hypot(x - bx, y - by);
      if (d > r) continue;
      const lit = -(x - bx) * 3 - (y - by) * 4;
      f.set(x, y, strand(x, y, (d > r - 1 ? 70 : 118) + lit, s));
    }
  };
  const braid = (x0, y0, y1, half, drift = 0) => {
    for (let y = y0; y <= y1; y++) {
      const t = (y - y0) / Math.max(1, y1 - y0);
      const cx = x0 + drift * t;
      const w = half * (1 - t * 0.35);
      const twist = ((y - y0) % 4) / 4;
      for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w); x++) {
        const s = (x - cx) / Math.max(1, w);
        const lobe = Math.abs(s - (twist * 2 - 1));
        f.set(x, y, hairC((Math.abs(s) > 0.8 ? 72 : 120) - lobe * 22));
      }
      if (y === y1) for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w); x++) f.set(x, y + 1, accentC(120));
    }
  };
  if (h.tail) {
    // tied at the nape, falling down the back
    if (dir === 'up') braid(Math.round(H.x), Math.round(cy + 6), Math.round(cy + h.tail), 1.6);
    if (side) {
      for (let y = Math.round(cy + 3); y <= cy + h.tail; y++) {
        const x0 = Math.round(H.x - H.rx + 1 + (y - cy) * 0.12);
        for (let x = x0; x <= x0 + 2; x++) f.set(x, y, strand(x, y, x === x0 ? 70 : 104, 1));
      }
    }
  }
  if (h.bun === 'top') {
    if (dir === 'down') ball(H.x, cy - H.ry - 2, 4.2, 0, 2);
    if (dir === 'up') ball(H.x, cy - H.ry + 1, 4.6, 0, 2);
    if (side) ball(H.x - 2, cy - H.ry - 1, 4.4, 0, 2);
  }
  if (h.bun === 'crown') {
    // piled up high
    if (dir === 'down') ball(H.x, cy - H.ry - 1, 6.5, 0, 3);
    if (dir === 'up') ball(H.x, cy - H.ry + 1, 7, 0, 3);
    if (side) ball(H.x - 1.5, cy - H.ry - 0.5, 6.5, 0, 3);
  }
  if (h.braid === 'side') {
    // one braid over the near shoulder
    if (dir === 'down') braid(Math.round(H.x + H.half + 2), Math.round(cy + 4), Math.round(cy + 30), 2.4, -1.5);
    if (dir === 'up') braid(Math.round(H.x - H.half - 2), Math.round(cy + 4), Math.round(cy + 26), 2.4, 1);
    if (side) braid(Math.round(H.x - 1), Math.round(cy + 6), Math.round(cy + 28), 2.2, 2);
  }
  if (h.braid === 'two') {
    for (const s of [-1, 1]) {
      if (dir === 'down') braid(Math.round(H.x + s * (H.half + 2.5)), Math.round(cy + 3), Math.round(cy + 26), 2, s * 0.5);
      if (dir === 'up') braid(Math.round(H.x + s * (H.half + 1.5)), Math.round(cy + 3), Math.round(cy + 24), 2, s * 0.5);
    }
    if (side) braid(Math.round(H.x - 1), Math.round(cy + 5), Math.round(cy + 27), 2, 2);
  }
  if (P.extra === 'scarf') {
    // a head scarf over the hair, falling to the shoulders
    const line = (dir === 'up' ? -99 : H.fore - H.y - 1) + cy;
    for (let y = Math.floor(cy - H.ry - 2.5); y <= cy + 17; y++) for (let x = Math.floor(H.x - H.rx - 4); x <= H.x + H.rx + 4; x++) {
      const u = (x - H.x) / (H.rx + 1.8);
      const v = (y - cy) / (H.ry + 1.8);
      const below = y - cy;
      const w = H.rx + 1.8 + Math.max(0, below - 4) * 0.35;
      let on = Math.hypot(u, v) <= 1 && y < cy + 2;
      if (below >= 0) on = on || Math.abs(x - H.x) <= w;
      if (side && below >= 0) on = x <= H.face - 2 - below * 0.2 && x >= H.x - w;
      if (!on) continue;
      if (dir === 'down' && y >= line && Math.abs(x - H.x) < H.half + 1) continue;
      if (side && y >= line && x >= H.face - 2) continue;
      const edge = Math.hypot(u, v) > 0.9 && y < cy;
      const fold = Math.sin(x * 0.8 + y * 0.35) * 8 + (hash(x, y >> 1, 6) - 0.5) * 8;
      f.set(x, y, accentC((edge ? 84 : 120) + fold - (y - cy) * 0.6 - (x - H.x) * 1.2));
    }
  }
  if (P.extra === 'band') {
    // a cloth band round the head over the brow, its knot behind
    const y0 = (dir === 'up' ? H.y - 6 : (dir === 'right' ? H.fore : H.fore) - 4) + bob;
    for (let y = Math.round(y0); y <= y0 + 3; y++) for (let x = 0; x < f.w; x++) {
      const u = (x - H.x) / (H.rx + 1.5);
      const v = (y - cy) / (H.ry + 1.5);
      if (Math.hypot(u, v) > 1) continue;
      f.set(x, y, accentC(118 + (y === Math.round(y0) ? 18 : 0) - (y === Math.round(y0 + 3) ? 26 : 0) + (hash(x, y, 8) - 0.5) * 12));
    }
    if (dir !== 'down') {
      const kx = dir === 'up' ? H.x : H.x - H.rx - 1;
      for (let j = 0; j < 6; j++) for (let x = Math.round(kx - 1); x <= kx + 1; x++) f.set(x + (dir === 'up' ? (j > 2 ? 1 : 0) : -1), Math.round(y0 + 2 + j), accentC(100 - j * 6));
    }
  }
  if (P.extra === 'gold') {
    // a band of gold at the foot of the piled hair, and earrings
    const y0 = cy - H.ry + 2;
    for (let x = Math.round(H.x - 7); x <= H.x + 7; x++) {
      const y = Math.round(y0 + Math.abs(x - H.x) * 0.25);
      if (dir === 'down' || dir === 'up') f.set(x, y, accentC(150 + (x % 2 ? 30 : 0)));
    }
    if (dir === 'down') f.set(Math.round(H.x), Math.round(y0 - 1), accentC(190));
    if (side) for (let x = Math.round(H.x - 6); x <= H.x + 5; x++) f.set(x, Math.round(y0 + 1 + (x - H.x) * 0.15), accentC(150 + (x % 2 ? 30 : 0)));
    if (dir === 'down') for (const s of [-1, 1]) {
      const ex = Math.round(H.x + s * (H.rx - 0.5));
      f.set(ex, Math.round(cy + 6), accentC(180));
      f.set(ex, Math.round(cy + 7), accentC(150));
    }
    if (side) {
      f.set(Math.round(H.ear[0]), Math.round(H.ear[1] + bob + 4), accentC(180));
      f.set(Math.round(H.ear[0]), Math.round(H.ear[1] + bob + 5), accentC(150));
    }
  }
}

/** A beard over the lower face. */
function beard(f, S, dir, bob, kind, seed) {
  if (dir === 'up' || !S.face.down) return;
  const len = { long: 13, full: 3, short: 2, pointed: 6, thick: 6, stubble: 0, moustache: 0 }[kind];
  const sparse = kind === 'stubble';
  const strand = (x, y, base) => {
    const n = hash(x, y, seed % 2) - 0.5;
    return hairC(base + n * 26 + (x % 2 ? 6 : -6));
  };
  if (dir === 'down') {
    const F = S.face.down;
    const cx = F.mouth[0];
    const my = F.mouth[1] + bob;
    const half = F.half + (kind === 'thick' ? 1 : 0) - (kind === 'pointed' ? 3 : 0);
    if (kind === 'moustache') {
      // a thin moustache curling down at its ends
      for (let x = Math.floor(cx - 5); x <= Math.ceil(cx + 5); x++) {
        const dx = Math.abs(x - cx);
        const y = Math.round(my - 1.6 + (dx > 3.5 ? 1 : 0));
        f.set(x, y, hairC(dx < 1 ? 70 : 58));
      }
      return;
    }
    for (let y = F.nose + bob; y <= F.chin + bob; y++) {
      for (let x = Math.floor(cx - F.half); x <= Math.ceil(cx + F.half); x++) {
        if (!f.in(x, y)) continue;
        const dx = Math.abs(x - cx);
        // under the nose only the moustache's sides at first
        if (y < my - 1 && dx < 2.5) continue;
        if (y < my - 2 && dx < 5) continue;
        if (kind === 'pointed' && dx > 3.5 - (y > my ? 0 : 1) && !(y <= my && y >= my - 1 && dx < 5)) continue;
        if (sparse && (hash(x, y, 11) < 0.45 || y < my - 1)) continue;
        const mouth = (y === Math.round(my) || y === Math.round(my) + 1) && dx < 2;
        if (mouth && sparse) continue;
        f.set(x, y, mouth ? hairC(38) : strand(x, y, (sparse ? 78 : 92) - (dx > F.half - 2 ? 22 : 0)));
      }
    }
    // hanging below the chin, narrowing to a point
    for (let j = 1; j <= len; j++) {
      const y = F.chin + bob + j;
      const w = Math.max(1, (half - 2) * (1 - (j / (len + 2)) ** (kind === 'pointed' ? 0.8 : 1.4)));
      for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w); x++) {
        const edge = Math.abs(x - cx) > w - 1;
        f.set(x, y, strand(x, y, edge ? 62 : 90 - j * 1.5));
      }
    }
    return;
  }
  // from the side: the jaw from under the ear to the chin, and down in front
  const F = S.face.right;
  const [ex, ey] = F.ear;
  const [cxn, cyn] = F.chin;
  if (kind === 'moustache') {
    for (let x = F.mouth[0] - 1; x <= F.nose[0]; x++) f.set(x, Math.round(F.mouth[1] + bob - 1 + (x < F.mouth[0] ? 1 : 0)), hairC(60));
    return;
  }
  for (let y = ey + bob; y <= cyn + bob; y++) {
    for (let x = ex; x < f.w; x++) {
      if (!SOURCES.adam || !f.in(x, y)) continue;
      // below the line from the ear to the mouth
      const line = ey + bob + ((x - ex) / (F.mouth[0] - ex)) * (F.mouth[1] - ey);
      if (y < line) continue;
      if (x >= F.nose[0] && y <= F.nose[1] + bob) continue;
      if (x > F.nose[0] + 1) continue;
      if (kind === 'pointed' && x < F.mouth[0] - 3) continue;
      if (sparse && hash(x, y, 11) < 0.45) continue;
      f.set(x, y, strand(x, y, x >= F.mouth[0] - 1 && Math.abs(y - (F.mouth[1] + bob + 1)) < 0.6 ? 40 : sparse ? 78 : 88));
    }
  }
  for (let j = 1; j <= len; j++) {
    const y = cyn + bob + j;
    const back = (kind === 'pointed' ? cxn - 3 + j * 0.3 : ex + 3 + j * 0.45) - (kind === 'thick' ? 1 : 0);
    const front = cxn + 2 - j * 0.25;
    for (let x = Math.floor(back); x <= Math.ceil(front); x++) {
      const edge = x <= back + 0.5 || x >= front - 0.5;
      f.set(x, y, strand(x, y, edge ? 60 : 88 - j * 1.5));
    }
  }
}

/** A work apron over the front of the robe (the baker). */
function apron(f, S, src, dir, bob) {
  const A = S.apron;
  if (!A) return;
  if (dir === 'up') {
    // only its strings, tied at the back of the waist
    for (let x = Math.round(S.cx - 9); x <= S.cx + 9; x++) f.set(x, 69 + bob, accentC(110));
    for (let j = 1; j < 6; j++) f.set(Math.round(S.cx + (j % 2)), 69 + bob + j, accentC(100));
    return;
  }
  for (let y = A.y0 + bob; y <= A.y1 + bob; y++) {
    if (dir === 'down') {
      const half = y < 60 + bob ? A.half - 2 : A.half;
      for (let x = Math.round(S.cx + 0.5 - half); x <= S.cx + 0.5 + half; x++) {
        if (!src.a(x, y)) continue;
        const edge = Math.abs(x - S.cx - 0.5) > half - 1 || y === A.y1 + bob;
        f.set(x, y, accentC((edge ? 96 : 122) + Math.sin(x * 1.4) * 5 + (hash(x, y >> 2, 12) - 0.5) * 8 - (y - A.y0) * 0.25));
      }
      if (y === 68 + bob) for (let x = Math.round(S.cx - 11); x <= S.cx + 12; x++) if (src.a(x, y)) f.set(x, y, accentC(104));
    } else {
      // from the side: its edge down the body's front
      let front = -1;
      for (let x = f.w - 1; x >= 0; x--) if (src.a(x, y)) {
        front = x;
        break;
      }
      if (front < 0 || front < A.front - 6) continue;
      for (let x = front - 3; x <= front; x++) f.set(x, y, accentC((x === front - 3 ? 96 : 120) - (y - A.y0) * 0.25));
    }
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  for (const file of fs.readdirSync(OUT)) if (file.endsWith('.png')) fs.rmSync(path.join(OUT, file));
  for (const [id, B] of Object.entries(BODIES)) {
    for (const dir of DIRS) writeSheets([body(id, B, dir)], path.join(OUT, `${id}-${dir}.png`));
    console.log('wrote', id);
  }
  for (const [id, P] of Object.entries(PEOPLE)) {
    writeSheets(DIRS.map((dir) => overlay(P, dir)), path.join(OUT, 'hair', `${id}.png`));
  }
  console.log('wrote', Object.keys(PEOPLE).length, 'people');
}
