// Noah's people's talk portraits, from Adam's and Eve's (the maintainer: take
// Adam's as the reference, adapted to each): hair and clothes recoloured,
// skin toned, and beards drawn on the men. Writes public/assets/noah/portraits/.
// Run: node tools/art/noah_portraits.mjs
import fs from 'fs';
import { PNG } from 'pngjs';

const SRC = 'public/assets/portraits';
const OUT = 'public/assets/noah/portraits';
const read = (f) => PNG.sync.read(fs.readFileSync(f));
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

/** A colour ramp through dark → base → light, by luminance 0..1 */
function ramp(base, t, lift = 0.35) {
  const c = hex(base);
  if (t < 0.55) {
    const k = 0.3 + (t / 0.55) * 0.7;
    return c.map((v) => v * k);
  }
  const k = ((t - 0.55) / 0.45) * lift;
  return c.map((v) => v + (255 - v) * k);
}

/** where each source's parts are (portrait pixels) */
const SOURCES = {
  adam: { file: 'adam-tunic', face: [47, 40, 15.5, 19.5], hairline: 21, neckTop: 60, neck: [[33, 60], [61, 60], [48, 84]], chin: 58, mouth: [42, 52, 48, 51], brows: [28, 32], ears: [34, 46, 25, 69] },
  eve: { file: 'eve-tunic', face: [47, 34.5, 15, 19.5], hairline: 18, neckTop: 57, neck: [[33, 57], [63, 57], [48, 96]], chin: 53, mouth: [42, 52, 42, 45], brows: [23, 27], ears: [30, 40, 29, 65], sideHair: true, noFringe: true },
};

/** the cast: base portrait, hair, cloth, skin (multiply), beard (rows below the chin, 0 none; -1 stubble), mirror */
const CAST = {
  noah: { src: 'adam', hair: '#e9e6df', cloth: '#d9ceb0', skin: [0.98, 0.95, 0.93], beard: 26, age: 0.5 },
  'noah-wife': { src: 'eve', hair: '#b3aba3', cloth: '#3f6e8e', skin: [0.98, 0.95, 0.94], age: 0.35 },
  shem: { src: 'adam', hair: '#3a2416', cloth: '#b0352c', skin: [1, 0.98, 0.96], beard: 6 },
  ham: { src: 'adam', hair: '#17110e', cloth: '#c98a2a', skin: [0.74, 0.7, 0.68], beard: 4, mirror: true },
  japheth: { src: 'adam', hair: '#8a4a24', cloth: '#2e6a8e', skin: [1.06, 1.04, 1.03], beard: 3, mirror: true },
  'shem-wife': { src: 'eve', hair: '#2a1a12', cloth: '#8e3a5a', skin: [1, 0.97, 0.95] },
  'ham-wife': { src: 'eve', hair: '#140e0c', cloth: '#6a8a3a', skin: [0.78, 0.73, 0.7], mirror: true },
  'japheth-wife': { src: 'eve', hair: '#a0582a', cloth: '#c07a9a', skin: [1.05, 1.03, 1.02], mirror: true },
  wicked: { src: 'adam', hair: '#1c1512', cloth: '#40444c', skin: [0.9, 0.86, 0.84], beard: -1, scowl: true },
  giant: { src: 'adam', hair: '#120d0b', cloth: '#5a2a2a', skin: [0.82, 0.76, 0.72], beard: 10, scowl: true, mirror: true },
};

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** the face: an ellipse, its hairline fringe left to the hair; per row, how far it reaches (for the beard) */
function faceSpans(S) {
  const [cx, cy, rx, ry] = S.face;
  const spans = [];
  for (let y = 0; y < 100; y++) {
    const t = (y - cy) / ry;
    if (Math.abs(t) >= 1) { spans.push(null); continue; }
    const h = rx * Math.sqrt(1 - t * t);
    spans.push([Math.round(cx - h), Math.round(cx + h)]);
  }
  return spans;
}

const inTri = (x, y, [a, b, c]) => {
  const s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const pt = [x, y];
  const d1 = s(pt, a, b), d2 = s(pt, b, c), d3 = s(pt, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

/** what each pixel of the base is: 'hair' | 'skin' | 'cloth' */
function classify(p, S) {
  const spans = faceSpans(S);
  const W = p.width;
  const [cx, cy, rx, ry] = S.face;
  const kind = new Array(W * p.height).fill(null);
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!p.data[i * 4 + 3]) continue;
      const l = lum(p.data[i * 4], p.data[i * 4 + 1], p.data[i * 4 + 2]);
      const e = ((x - cx) / (rx * 1.06)) ** 2 + ((y - cy) / (ry * 1.04)) ** 2;
      let k;
      if (e < 1) k = !S.noFringe && y < S.hairline + 7 && l < 100 ? 'hair' : 'skin';
      else if (y <= cy && l >= 140 && e < 1.25) k = 'skin';
      // the jaw and the neck's shadows beside the face
      else if (y > cy && y < S.neckTop && l >= 100 && e < 1.5) k = 'skin';
      else if (y < S.neckTop) {
        const neck = y > cy && Math.abs(x - cx) < rx * 0.62;
        const ear = y >= S.ears[0] && y <= S.ears[1] && (x >= S.ears[2] && x <= S.ears[3]) && l >= 105;
        k = neck || ear ? 'skin' : 'hair';
      } else if (inTri(x, y, S.neck)) k = 'skin';
      else k = 'cloth';
      // long hair over the shoulders
      if (S.sideHair && k !== 'skin' && y >= S.neckTop - 4) {
        const bottom = x < 34 ? 59 + (34 - x) * 0.5 : x > 61 ? 59 + (x - 61) * 0.5 : 0;
        if (y < bottom) k = 'hair';
      }
      // the brows take the hair's colour
      if (k === 'skin' && y >= S.brows[0] && y <= S.brows[1] && l < 95) k = 'brow';
      kind[i] = k;
    }
  return { kind, spans };
}

function recolour(d, i, k, c, x, y) {
  const r = d[i], g = d[i + 1], b = d[i + 2];
  const l = lum(r, g, b) / 255;
  if (k === 'hair' || k === 'brow') {
    const o = ramp(c.hair, Math.min(1, l * 1.35 + 0.05), 0.4);
    d.set(o.map(clamp), i);
  } else if (k === 'cloth') {
    const o = ramp(c.cloth, Math.min(1, l * 0.95 + 0.05), 0.3);
    d.set(o.map(clamp), i);
  } else {
    let [mr, mg, mb] = c.skin;
    // older: a little paler and less ruddy
    if (c.age) { mr *= 1 - c.age * 0.06; mg *= 1 + c.age * 0.02; }
    d.set([clamp(r * mr), clamp(g * mg), clamp(b * mb)], i);
  }
}

/** a beard over the jaw (and down the chest for a long one), a moustache, leaving the lips */
function beard(p, S, spans, c, hair) {
  if (!c.beard) return;
  const W = p.width;
  const [mx0, mx1, my0, my1] = S.mouth;
  const top = my0 - 3;
  const chin = S.chin;
  const stubble = c.beard < 0;
  const bottom = chin + Math.max(0, c.beard);
  for (let y = top; y <= bottom; y++) {
    const sp = spans[Math.min(y, chin)] ?? spans[chin];
    if (!sp) continue;
    let x0 = sp[0], x1 = sp[1];
    if (y > chin) {
      // hanging below the chin, narrowing to a rounded point
      const t = (y - chin) / Math.max(1, bottom - chin);
      const half = ((x1 - x0) / 2) * (1 - 0.75 * t * t) + 1;
      const m = (x0 + x1) / 2;
      x0 = Math.round(m - half); x1 = Math.round(m + half);
    }
    for (let x = x0; x <= x1; x++) {
      const i = (y * W + x) * 4;
      // the lips stay, and the cheeks above the mouth line (only a moustache over it)
      if (y >= my0 - 1 && y <= my1 && x >= mx0 + 1 && x <= mx1 - 1) continue;
      if (y < my0 - 1 && (x < mx0 - 2 || x > mx1 + 2)) continue;
      if (y < my0 + 2 && (x < x0 + 2 || x > x1 - 2) && y <= chin - 6) continue;
      const edge = x === x0 || x === x1 || y === bottom;
      const n = hash(x, y);
      if (stubble) {
        if (n < 0.45 || y < my0 + 1) continue;
        const o = ramp(c.hair, 0.3).map((v, j) => v * 0.6 + p.data[i + j] * 0.4);
        p.data.set(o.map(clamp), i);
        p.data[i + 3] = 255;
        continue;
      }
      if (edge && n < 0.35) continue;
      // the curls of the hair on the head, repeated down the beard
      const hy = 3 + ((y - top) % 15);
      const hx = 34 + ((x - 34 + Math.floor((y - top) / 15) * 7) % 26 + 26) % 26;
      const hi = (hy * W + hx) * 4;
      const hl = hair.data[hi + 3] ? lum(hair.data[hi], hair.data[hi + 1], hair.data[hi + 2]) / 255 : 0.4;
      const t = edge ? 0.1 : Math.max(0.05, Math.min(1, hl * 1.35 + 0.05));
      p.data.set(ramp(c.hair, t, 0.4).map(clamp), i);
      p.data[i + 3] = 255;
    }
  }
}

/** a frown: the inner ends of the brows lowered a pixel */
function scowl(p, S) {
  const W = p.width;
  const mid = 47;
  for (let y = S.brows[1] + 1; y >= S.brows[0]; y--)
    for (let x = mid - 8; x <= mid + 8; x++) {
      if (Math.abs(x - mid) < 2) continue;
      const i = (y * W + x) * 4;
      const l = lum(p.data[i], p.data[i + 1], p.data[i + 2]);
      if (l < 95 && Math.abs(x - mid) < 7) {
        const j = ((y + 1) * W + x) * 4;
        p.data.copyWithin(j, i, i + 4);
      }
    }
}

const mirror = (p) => {
  const o = new PNG({ width: p.width, height: p.height });
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) p.data.copy(o.data, (y * p.width + p.width - 1 - x) * 4, (y * p.width + x) * 4, (y * p.width + x) * 4 + 4);
  return o;
};

const manifest = JSON.parse(fs.readFileSync('src/data/generated/assets.json', 'utf8')).portraits;
const out = {};
for (const [id, c] of Object.entries(CAST)) {
  const S = SOURCES[c.src];
  const entry = manifest[S.file];
  const base = read(`${SRC}/${S.file}.png`);
  const { kind, spans } = classify(base, S);
  const W = base.width;
  const paint = (p, ox, oy) => {
    for (let y = 0; y < p.height; y++)
      for (let x = 0; x < p.width; x++) {
        const i = (y * p.width + x) * 4;
        if (!p.data[i + 3]) continue;
        const k = kind[(y + oy) * W + x + ox] ?? 'skin';
        recolour(p.data, i, k, c, x + ox, y + oy);
      }
  };
  paint(base, 0, 0);
  if (c.scowl) scowl(base, S);
  beard(base, S, spans, c, read(`${SRC}/${S.file}.png`));
  const final = c.mirror ? mirror(base) : base;
  fs.writeFileSync(`${OUT}/${id}.png`, PNG.sync.write(final));
  const patches = (list, name) =>
    list.map((q, n) => {
      const pp = read(`public/${q.file}`);
      paint(pp, q.x, q.y);
      const f = c.mirror ? mirror(pp) : pp;
      const file = `assets/noah/portraits/${id}-${name}-${n}.png`;
      fs.writeFileSync(`public/${file}`, PNG.sync.write(f));
      return { file, x: c.mirror ? W - q.x - q.w : q.x, y: q.y, w: q.w, h: q.h };
    });
  out[id] = { file: `assets/noah/portraits/${id}.png`, width: entry.width, height: entry.height, mouth: patches(entry.mouth, 'mouth'), eyes: patches(entry.eyes, 'eyes') };
}
fs.writeFileSync('src/data/noah/portraits.json', JSON.stringify(out, null, 1) + '\n');
console.log('portraits:', Object.keys(out).join(' '));
