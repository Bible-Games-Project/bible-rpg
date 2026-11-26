// Noah's chapter: the base sheets its people are coloured from at runtime
// (src/game/noah/people.ts). Each base is Adam's or Eve's tunic sheet
// (the maintainer: Adam as the exact reference for look and movement), with
//   - the clothes down to mid-shin and long sleeves to the wrist (a robe),
//   - a beard (Noah long, the other men short), and
//   - its parts marked by colour so each person can be coloured differently:
//     cloth in pure greys, hair and beard in blue greys, skin left as it is.
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

/** Where things are on each source sheet's first frame (sheet pixels). */
const SOURCES = {
  adam: {
    file: (d) => `public/assets/sprites/char-adam-tunic-${d}.png`,
    fw: 58,
    cx: 29,
    shoulder: 41,
    // the fists, kept skin: from the front and back the outer columns from this row; from the side the near arm's band
    hands: { front: { y: 80, out: 14 }, side: { y: 79, x0: 23, x1: 33, gr: [0.645, 0.725] }, y1: 93 },
    // the hair may reach below the shoulders only away from the body
    hairBelow: { front: 99, side: 99 },
    face: {
      down: { mouth: [29.5, 31], nose: 29, chin: 34, half: 9 },
      right: { ear: [29, 26], chin: [36, 34], mouth: [39.5, 28.5], nose: [41, 28] },
    },
    legsShown: 19,
  },
  eve: {
    file: (d) => `public/assets/sprites/char-eve-tunic-${d}.png`,
    fw: 60,
    cx: 30,
    shoulder: 40,
    hands: { front: { y: 83, out: 13 }, side: { y: 82, x0: 25, x1: 34, gr: [0.6, 0.74] }, y1: 96 },
    hairBelow: { front: 14, side: 0 },
    legsShown: 17,
  },
};

const BASES = {
  // Noah: a robe to mid-shin, a long beard
  'man-robe': { src: 'adam', beard: 13 },
  // his sons and the men of the land: the same robe, a short beard
  'man-beard': { src: 'adam', beard: 4 },
  // young men, no beard
  man: { src: 'adam', beard: 0 },
  // Noah's wife, his sons' wives and the women of the land
  woman: { src: 'eve', beard: 0 },
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
  a(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.d[this.i(x, y) + 3] > 0;
  }
  lum(x, y) {
    const i = this.i(x, y);
    return lumOf(this.d[i], this.d[i + 1], this.d[i + 2]);
  }
  set(x, y, c) {
    const i = this.i(x, y);
    this.d[i] = c[0];
    this.d[i + 1] = c[1];
    this.d[i + 2] = c[2];
    this.d[i + 3] = 255;
  }
}

const cloth = (l) => {
  const v = Math.max(0, Math.min(255, Math.round(l)));
  return [v, v, v];
};
/** hair and beard: blue greys (runtime: hue near 215) */
const hairC = (l) => {
  const v = Math.max(12, Math.min(200, l));
  return [Math.round(v * 0.72), Math.round(v * 0.82), Math.min(255, Math.round(v * 1.25))];
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

function writeFrames(frames, file) {
  const fw = frames[0].w;
  const png = new PNG({ width: fw * frames.length, height: frames[0].h });
  frames.forEach((f, k) => {
    for (let y = 0; y < f.h; y++) for (let x = 0; x < fw; x++) png.data.set(f.d.subarray(f.i(x, y), f.i(x, y) + 4), (y * png.width + k * fw + x) * 4);
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
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

function make(baseId, base, dir) {
  const S = SOURCES[base.src];
  const frames = readFrames(S.file(dir), S.fw);
  const side = dir === 'right';
  const first = rowsOf(frames[0]);
  return frames.map((src, k) => {
    const f = new Frame(src.w, src.h);
    f.d.set(src.d);
    const { top, bottom } = rowsOf(src);
    const bob = top - first.top;
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
    // --- hair: the dark mass from the top of the head
    const hair = new Uint8Array(f.w * f.h);
    const stack = [];
    for (let x = 0; x < f.w; x++) for (let y = top; y < top + 3; y++) if (f.a(x, y) && f.lum(x, y) < 110) stack.push([x, y]);
    const hairOk = (x, y) => {
      if (!f.a(x, y) || f.lum(x, y) >= 108) return false;
      if (y < shoulder) return true;
      if (base.src !== 'eve') return false;
      // Eve's long hair falls over her back and shoulders, away from the dress
      const lim = side ? S.cx - 6 : null;
      if (side) return x < lim && y < shoulder + 22;
      return Math.abs(x - S.cx) >= S.hairBelow.front && y < shoulder + 22;
    };
    while (stack.length) {
      const [x, y] = stack.pop();
      if (hair[y * f.w + x] || !hairOk(x, y)) continue;
      hair[y * f.w + x] = 1;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    // --- the robe: everything from the shoulders down to the hem, but the hands (long sleeves)
    for (let y = shoulder; y < Math.min(hem + 2, f.h); y++) {
      for (let x = 0; x < f.w; x++) {
        if (!f.a(x, y) || hair[y * f.w + x] || isHand(x, y)) continue;
        // the neck above the neckline stays skin (a round neckline under the chin)
        const l = f.lum(x, y);
        f.set(x, y, cloth(l * 0.92 + 8));
      }
    }
    // --- down to mid-shin: the tunic's width, flaring a little, over the legs;
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
    const from = hem - 8;
    for (let y = from; y <= robeEnd; y++) {
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
    // --- hair and beard in their marking colour
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (hair[y * f.w + x]) f.set(x, y, hairC(f.lum(x, y) * 1.15 + 10));
    if (base.beard) beard(f, S, dir, bob, base.beard, k);
    return f;
  });
}

/** A beard over the lower face, hanging `len` rows below the chin. */
function beard(f, S, dir, bob, len, seed) {
  if (dir === 'up') return;
  const strand = (x, y, base) => {
    const n = hash(x, y, seed % 2) - 0.5;
    return hairC(base + n * 26 + (x % 2 ? 6 : -6));
  };
  if (dir === 'down') {
    const F = S.face.down;
    const cx = F.mouth[0];
    const my = F.mouth[1] + bob;
    for (let y = F.nose + bob; y <= F.chin + bob; y++) {
      for (let x = Math.floor(cx - F.half); x <= Math.ceil(cx + F.half); x++) {
        if (!f.a(x, y)) continue;
        const dx = Math.abs(x - cx);
        // under the nose only the moustache's sides at first
        if (y < my - 1 && dx < 2.5) continue;
        if (y < my - 2 && dx < 5) continue;
        const mouth = (y === Math.round(my) || y === Math.round(my) + 1) && dx < 2;
        f.set(x, y, mouth ? hairC(38) : strand(x, y, 92 - (dx > F.half - 2 ? 22 : 0)));
      }
    }
    // hanging below the chin, narrowing to a point
    for (let j = 1; j <= len; j++) {
      const y = F.chin + bob + j;
      const half = Math.max(1, (F.half - 2) * (1 - (j / (len + 2)) ** 1.4));
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
        const edge = Math.abs(x - cx) > half - 1;
        f.set(x, y, strand(x, y, edge ? 62 : 90 - j * 1.5));
      }
    }
    return;
  }
  // from the side: the jaw from under the ear to the chin, and down in front
  const F = S.face.right;
  const [ex, ey] = F.ear;
  const [cxn, cyn] = F.chin;
  for (let y = ey + bob; y <= cyn + bob; y++) {
    for (let x = ex; x < f.w; x++) {
      if (!f.a(x, y)) continue;
      // below the line from the ear to the mouth
      const line = ey + bob + ((x - ex) / (F.mouth[0] - ex)) * (F.mouth[1] - ey);
      if (y < line) continue;
      if (x >= F.nose[0] && y <= F.nose[1] + bob) continue;
      f.set(x, y, strand(x, y, x >= F.mouth[0] - 1 && Math.abs(y - (F.mouth[1] + bob + 1)) < 0.6 ? 40 : 88));
    }
  }
  for (let j = 1; j <= len; j++) {
    const y = cyn + bob + j;
    const back = ex + 3 + j * 0.45;
    const front = cxn + 2 - j * 0.25;
    for (let x = Math.floor(back); x <= Math.ceil(front); x++) {
      const edge = x <= back + 0.5 || x >= front - 0.5;
      f.set(x, y, strand(x, y, edge ? 60 : 88 - j * 1.5));
    }
  }
}

for (const [id, base] of Object.entries(BASES)) {
  for (const dir of ['down', 'up', 'right']) {
    const frames = make(id, base, dir);
    writeFrames(frames, path.join(OUT, `${id}-${dir}.png`));
  }
  console.log('wrote', id);
}
