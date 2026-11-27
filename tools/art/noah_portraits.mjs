#!/usr/bin/env node
// Noah's people's talk portraits, cut from the two generated sheets
// (art/generated/noah-portraits-men, -women; the maintainer: "create them
// with OpenAI, taking Adam from story 1 as the reference"). Each bust is
// fitted to Adam's portrait (94 x 87, bottom-aligned, centred), and its blink
// (half shut, shut) and talk (half open, open) patches are made from the
// face itself: the eyes are found by their whites, the mouth by the darkest
// line under them. Writes public/assets/noah/faces/ and
// src/data/noah/portraits.json.
//
//   node tools/art/noah_portraits.mjs [--debug]
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { keyed, newest, resample, subjects } from './noah_ingest.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = 'assets/noah/faces';
const W = 94;
const H = 87;
/** how much taller than the frame the bust is drawn (its bottom cut off) */
const ZOOM = 1.12;
const DEBUG = process.argv.includes('--debug');

/** Each sheet's people in reading order (rows top to bottom, left to right). */
const SHEETS = {
  // (null: drawn again in a later sheet with the mouth closed, so it can open as they talk)
  'noah-portraits-men': ['noah', 'shem', null, 'japheth', 'wicked', null, 'wicked-c', 'giant'],
  'noah-portraits-women': ['noah-wife', 'shem-wife', null, 'japheth-wife', 'wicked-woman'],
  // the people of the city each their own face (the maintainer: faces were repeated)
  'noah-portraits-more': ['ham', 'wicked-b', 'thief', 'baker', 'debtor', 'farmer', 'mocker', 'ham-wife'],
};

/**
 * Where each face's eyes (centres) and mouth (the middle of its closing line,
 * and its width) are, measured on the cut portraits (a grid of 10 px over
 * them). An open smile's line is under the teeth: talking opens it further.
 * A fourth number: how far (rows) the seam may wander from the line (0 in a
 * beard: its dark hair pulled the seam apart).
 */
const FACES = {
  noah: { eyes: [[37.7, 34.9], [57, 34.9]], mouth: [47, 53, 12] },
  shem: { eyes: [[39.2, 34.2], [57.7, 34.2]], mouth: [47.5, 52, 12] },
  ham: { eyes: [[38.5, 33.5], [58.6, 33.5]], mouth: [47.5, 51, 12] },
  japheth: { eyes: [[36.3, 37.7], [56.3, 37.7]], mouth: [45.5, 54, 15] },
  wicked: { eyes: [[45.6, 34.2], [62.6, 34.2]], mouth: [54.5, 52, 13] },
  'wicked-b': { eyes: [[35.3, 30.1], [55.1, 30.1]], mouth: [44, 49, 14] },
  'wicked-c': { eyes: [[36.3, 37], [52.7, 37.3]], mouth: [44.5, 54, 15] },
  giant: { eyes: [[38.5, 28.5], [55.5, 28.5]], mouth: [46.5, 48, 12, 0] },
  thief: { eyes: [[37, 39.8], [56.4, 39.8]], mouth: [46, 58, 12] },
  baker: { eyes: [[37, 31], [57, 31]], mouth: [46.5, 50, 12, 0] },
  debtor: { eyes: [[38.5, 33.8], [56.4, 33.8]], mouth: [46.5, 53, 14] },
  farmer: { eyes: [[38.5, 32.9], [56.4, 32.9]], mouth: [47, 52, 14, 0] },
  mocker: { eyes: [[37.6, 35.3], [55.5, 35.3]], mouth: [45.5, 54, 12] },
  'noah-wife': { eyes: [[37.7, 36.3], [57.7, 36.3]], mouth: [46.5, 54, 16] },
  'shem-wife': { eyes: [[37.7, 43.4], [57, 43.4]], mouth: [46.5, 60, 15] },
  'ham-wife': { eyes: [[35.7, 38.5], [55.5, 38.5]], mouth: [45, 54, 15] },
  'japheth-wife': { eyes: [[37.7, 37], [58.4, 37]], mouth: [46.5, 54, 15] },
  'wicked-woman': { eyes: [[36.3, 41.9], [56.3, 41.9]], mouth: [46.5, 58, 12] },
};

const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
const sat = (d, i) => {
  const mx = Math.max(d[i], d[i + 1], d[i + 2]);
  return mx ? (mx - Math.min(d[i], d[i + 1], d[i + 2])) / mx : 0;
};

/** The bust in a 94 x 87 frame, centred: a little taller than the frame, cut at
 * the bottom, so the heads are Adam's size. */
function frame(img, box) {
  const sw = box.x1 - box.x0 + 1;
  const sh = box.y1 - box.y0 + 1;
  const th = Math.round(H * ZOOM);
  const tw = Math.round(sw * (th / sh));
  const fit = resample(img, box, tw, th);
  const out = new PNG({ width: W, height: H });
  const ox = Math.round((W - tw) / 2);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < tw; x++) {
      const tx = x + ox;
      if (tx < 0 || tx >= W) continue;
      fit.data.copy(out.data, (y * W + tx) * 4, (y * tw + x) * 4, (y * tw + x) * 4 + 4);
    }
  // the magenta's fringe on the edges (only near-magenta: the wicked woman's dress is purple)
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] > 150 && d[i + 2] > 140 && d[i + 1] < 110) d[i + 3] = 0;
  // and the pink left on light edges (white hair)
  for (let pass = 0; pass < 2; pass++) {
    const drop = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (!d[i + 3]) continue;
        const edge = x === 0 || x === W - 1 || y === 0 || !d[i - 1] || !d[i + 7] || !d[i - W * 4 + 3] || (y < H - 1 && !d[i + W * 4 + 3]);
        if (edge && Math.min(d[i], d[i + 2]) - d[i + 1] > 12 && lum(d, i) > 110) drop.push(i);
      }
    for (const i of drop) d[i + 3] = 0;
  }
  return out;
}

/** An eye's box: the iris, lashes and whites around the measured centre. */
function eyeBox(p, [cx, cy]) {
  const d = p.data;
  let x0 = 99, x1 = -1, y0 = 99, y1 = -1;
  for (let y = Math.round(cy) - 3; y <= Math.round(cy) + 2; y++)
    for (let x = Math.round(cx) - 5; x <= Math.round(cx) + 5; x++) {
      const i = (y * W + x) * 4;
      if (!d[i + 3] || !(lum(d, i) < 85 || (lum(d, i) > 165 && sat(d, i) < 0.3))) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  if (x1 < 0) throw new Error('no eye near ' + cx + ',' + cy);
  return { x0, x1, y0, y1 };
}

const px = (d, x, y) => [...d.slice((y * W + x) * 4, (y * W + x) * 4 + 4)];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k, 255].map((v) => Math.round(Math.max(0, Math.min(255, v))));

/** The blink patches over both eyes: half shut (the lid down to the middle) and shut (skin with the lash line). */
function blink(p, boxes) {
  const x0 = Math.min(...boxes.map((b) => b.x0)) - 1;
  const x1 = Math.max(...boxes.map((b) => b.x1)) + 1;
  const y0 = Math.min(...boxes.map((b) => b.y0)) - 1;
  const y1 = Math.max(...boxes.map((b) => b.y1)) + 1;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const frames = [0, 1].map(() => {
    const o = new PNG({ width: w, height: h });
    for (let y = 0; y < h; y++) p.data.copy(o.data, y * w * 4, ((y + y0) * W + x0) * 4, ((y + y0) * W + x1 + 1) * 4);
    return o;
  });
  for (const b of boxes) {
    // the lash colour: the darkest pixel of the eye; the skin: the row under it (lid a shade darker)
    let lash = [40, 25, 20, 255], dl = 999;
    for (let y = b.y0; y <= b.y1; y++)
      for (let x = b.x0; x <= b.x1; x++) {
        const i = (y * W + x) * 4;
        if (lum(p.data, i) < dl) { dl = lum(p.data, i); lash = px(p.data, x, y); }
      }
    const mid = Math.round((b.y0 + b.y1) / 2);
    for (let x = b.x0; x <= b.x1; x++) {
      const skin = px(p.data, x, Math.min(H - 1, b.y1 + 2));
      const lid = shade(skin, 0.9);
      const set = (f, y, c) => f.data.set(c, ((y - y0) * w + x - x0) * 4);
      const edge = x === b.x0 || x === b.x1;
      // half shut: the lid over the top half, the lashes on its edge
      for (let y = b.y0; y < mid; y++) set(frames[0], y, lid);
      if (!edge) set(frames[0], mid, lash);
      // shut: skin, and the lashes as a line a little low, curving down at the ends
      for (let y = b.y0; y <= b.y1; y++) set(frames[1], y, lid);
      set(frames[1], edge ? mid : mid + 1, lash);
    }
  }
  return [frames, x0, y0];
}

/**
 * Talk patches. The mouth's seam is found column by column (the darkest
 * pixel near the measured line, so a smirk opens along its own curve), and it
 * opens like lips: a lens, tall in the middle and shut at the corners, the
 * upper lip lifted a pixel when wide open, the lower lip and the chin drawn
 * down and easing back to the face below (no seam where the patch ends). The
 * inside takes the lips' own colour, darkened.
 * The maintainer: "the talking mouths are badly made, make them fit".
 */
function talk(p, m) {
  const d = p.data;
  const w = m.x1 - m.x0 + 1;
  const c = (m.x0 + m.x1) / 2;
  const half = w / 2 + 0.5;
  // the seam: the darkest pixel within a row (or `reach`) of the measured line
  const seam = [];
  for (let x = m.x0; x <= m.x1; x++) {
    let best = m.y, bl = 999;
    for (let y = m.y - m.reach; y <= m.y + m.reach; y++) {
      const l = lum(d, (y * W + x) * 4) + Math.abs(y - m.y) * 10;
      if (l < bl) { bl = l; best = y; }
    }
    seam.push(best);
  }
  // smoothed: the parabola nearest to it (a smile curves; pixel steps made it jagged)
  const n = seam.length;
  const xs = seam.map((_, i) => (i - (n - 1) / 2) / Math.max(1, (n - 1) / 2));
  const S = [0, 0, 0, 0, 0], T = [0, 0, 0];
  xs.forEach((x, i) => {
    for (let k = 0; k < 5; k++) S[k] += x ** k;
    for (let k = 0; k < 3; k++) T[k] += seam[i] * x ** k;
  });
  // the normal equations for y = c0 + c1 x + c2 x² (3 × 3, by Cramer)
  const M = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]];
  const det = (A) => A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
  const D = det(M);
  const coef = [0, 1, 2].map((k) => det(M.map((row, r) => row.map((v, j) => (j === k ? T[r] : v)))) / D);
  const sm = xs.map((x) => Math.round(coef[0] + coef[1] * x + coef[2] * x * x));
  // the lips' colour, from the seam's middle
  const mid = Math.round(c);
  const lip = px(d, mid, sm[mid - m.x0] + 2);
  // (half a mouth's own dark red: in a beard the "lips" sampled are hair)
  const mix = (a, b) => [0, 1, 2].map((k) => Math.round((a[k] + b[k]) / 2)).concat(255);
  const inside = mix(shade([lip[0] * 0.75 + 30, lip[1] * 0.45, lip[2] * 0.45], 0.42), [64, 22, 22]);
  const deep = shade(inside, 0.75);
  const pad = 2, below = 9;
  const px0 = m.x0 - pad, px1 = m.x1 + pad;
  const top = Math.min(...sm) - 3, bottom = Math.max(...sm) + below;
  const pw = px1 - px0 + 1, ph = bottom - top + 1;
  return [[2, 0], [3, 0]].map(([g, u]) => {
    const o = new PNG({ width: pw, height: ph });
    for (let x = px0; x <= px1; x++) {
      const i = x - m.x0;
      const sy = sm[Math.max(0, Math.min(w - 1, i))];
      const t = (x - c) / half;
      // the gap's height here: a lens, thin at the corners (0 past them)
      const gc = Math.abs(t) >= 1 ? 0 : Math.max(1, Math.round(g * (1 - t * t) + 0.3));
      const uc = gc >= g ? u : 0;
      const g0 = sy - uc; // the gap's first row
      const drop = Math.max(0, gc - uc - 1); // how far the lower lip comes down
      for (let r = top; r <= bottom; r++) {
        let col;
        if (gc === 0 || r < g0) col = px(d, x, Math.min(H - 1, r + (r < g0 ? uc : 0)));
        else if (r < g0 + gc) {
          const k = r - g0;
          col = k === 0 ? deep : inside;
          if (gc === 1) col = shade(px(d, x, sy), 0.7);
        } else {
          // below the gap: drawn down by `drop`, easing to nothing by the patch's end
          const from = g0 + gc, span = bottom - from + 1;
          const f = (r - from) / Math.max(1, span);
          const src = Math.round(r - drop * (1 - f));
          col = px(d, x, Math.min(H - 1, Math.max(sy + 1, src)));
        }
        o.data.set(col, ((r - top) * pw + x - px0) * 4);
      }
      // the upper lip's shadow on the open mouth's edge
      if (gc > 0 && g0 - 1 >= top) {
        const j = ((g0 - 1 - top) * pw + x - px0) * 4;
        o.data.set(shade([...o.data.slice(j, j + 4)], 0.88), j);
      }
    }
    return { png: o, x: px0, y: top, w: pw, h: ph };
  });
}

const out = {};
const dir = path.join(ROOT, 'public', OUT);
fs.mkdirSync(dir, { recursive: true });
for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
for (const [job, names] of Object.entries(SHEETS)) {
  const img = keyed(PNG.sync.read(fs.readFileSync(newest(job))));
  const found = subjects(img, 6).filter((b) => b.n > 20000);
  if (found.length !== names.length) {
    console.error(`${job}: found ${found.length} portraits, expected ${names.length}`);
    for (const b of found) console.error(`  ${b.x0},${b.y0} ${b.x1 - b.x0 + 1}x${b.y1 - b.y0 + 1} (${b.n} px)`);
    process.exit(1);
  }
  names.forEach((id, n) => {
    if (!id) return;
    const p = frame(img, found[n]);
    const save = (png, name) => {
      const file = `${OUT}/${name}.png`;
      fs.writeFileSync(path.join(ROOT, 'public', file), PNG.sync.write(png));
      return file;
    };
    const entry = { file: save(p, id), width: W, height: H, mouth: [], eyes: [] };
    const face = FACES[id];
    const boxes = face.eyes.map((e) => eyeBox(p, e));
    const [frames, x, y] = blink(p, boxes);
    entry.eyes = frames.map((f, i) => ({ file: save(f, `${id}-eyes-${i}`), x, y, w: f.width, h: f.height }));
    const [mx, my, mw, reach = 1] = face.mouth;
    const m = { x0: Math.round(mx - mw / 2), x1: Math.round(mx - mw / 2) + mw - 1, y: Math.round(my), reach };
    entry.mouth = talk(p, m).map((t, i) => ({ file: save(t.png, `${id}-mouth-${i}`), x: t.x, y: t.y, w: t.w, h: t.h }));
    if (DEBUG) console.log(id, 'eyes', boxes, 'mouth', m);
    out[id] = entry;
  });
}
fs.writeFileSync(path.join(ROOT, 'src/data/noah/portraits.json'), JSON.stringify(out, null, 1) + '\n');
console.log('portraits:', Object.keys(out).join(' '));
