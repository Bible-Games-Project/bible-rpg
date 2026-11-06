#!/usr/bin/env node
// Cuts the Cain and Abel chapter's generated sheets (art/generated/cain-*)
// into sprites at the game's art resolution: the magenta background keyed
// out (with its pink fringe removed), each subject found as one connected
// shape, read in rows from left to right, trimmed and scaled to the size
// the game draws it at. Writes public/assets/cain/<name>.png and
// src/data/cain/generatedArt.json (size and base point of each sprite).
// The night colours are applied in the game (palette.ts), not here.
//
//   node tools/art/cain_ingest.mjs [--debug]
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'public/assets/cain');
const DATA = path.join(ROOT, 'src/data/cain/generatedArt.json');
const DEBUG = process.argv.includes('--debug');

/**
 * Each sheet's subjects in reading order: name and the height (or width,
 * `w`) in art pixels, i.e. the size of the drawing it replaces. `null`
 * skips a subject. `ay`: the base point's distance above the bottom.
 */
const SHEETS = {
  'cain-homestead': [
    { name: 'hut', h: 210 },
    { name: 'hearth', w: 64 },
    { name: 'torch', h: 72 },
    { name: 'altar', w: 100 },
    { name: 'altar-b', w: 86 },
    { name: 'wall-0', w: 50 },
    { name: 'wall-1', w: 52 },
    { name: 'wall-2', w: 50 },
    { name: 'log', w: 60 },
  ],
  'cain-trees': [
    { name: 'tree-oak-1', h: 250 },
    { name: 'tree-oak-2', h: 240, also: [{ name: 'tree-oak-small', h: 190 }] },
    { name: 'tree-olive', h: 220 },
    { name: 'tree-young', h: 190 },
    { name: 'tree-cypress', h: 240, also: [{ name: 'tree-cypress-small', h: 200 }] },
    { name: 'tree-umbrella', h: 230 },
    { name: 'tree-fruit', h: 180 },
    { name: 'bush-0', w: 96 },
    { name: 'bush-1', w: 110 },
    { name: 'bush-2', w: 80 },
  ],
  'cain-field': [
    { name: 'furrow', w: 128 },
    { name: 'wheat-0', h: 56 },
    { name: 'wheat-1', h: 52 },
    { name: 'stubble', h: 20 },
    { name: 'greens-0', h: 24 },
    { name: 'greens-1', h: 30 },
    { name: 'greens-2', h: 30 },
    { name: 'gourds', w: 64 },
    { name: 'gourds-picked', w: 64 },
    { name: 'jawbone', w: 38 },
    { name: 'staff', h: 128 },
    { name: 'dog-0', w: 70 },
    { name: 'dog-1', w: 70 },
  ],
  'cain-grave': [{ name: 'grave', w: 150 }],
};

function newest(job) {
  const dir = path.join(ROOT, 'art/generated', job);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
  // a medium (finished) version wins over the low drafts
  const medium = files.filter((f) => f.includes('-medium'));
  return path.join(dir, (medium.length ? medium : files).at(-1));
}

/** RGBA float image with the magenta keyed out. */
function keyed(png) {
  const { width: w, height: h, data } = png;
  // the background: the average of the corners
  let br = 0, bg = 0, bb = 0, n = 0;
  for (const [x0, y0] of [[0, 0], [w - 8, 0], [0, h - 8], [w - 8, h - 8]]) {
    for (let y = y0; y < y0 + 8; y++) for (let x = x0; x < x0 + 8; x++) {
      const i = (y * w + x) * 4;
      br += data[i]; bg += data[i + 1]; bb += data[i + 2]; n++;
    }
  }
  br /= n; bg /= n; bb /= n;
  const out = new Float32Array(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    let r = data[i], g = data[i + 1], b = data[i + 2];
    // how much of the pixel is magenta: magenta is (high R, low G, high B);
    // the subjects are never that (no purple in the sheets)
    const m = Math.min(r, b) - g;
    const mb = Math.min(br, bb) - bg;
    let a = 1 - Math.max(0, Math.min(1, (m - 40) / (mb - 110)));
    if (Math.hypot(r - br, g - bg, b - bb) < 60) a = 0;
    if (a > 0 && a < 1) {
      // take the background's share back out of the colour
      r = Math.max(0, Math.min(255, (r - br * (1 - a)) / a));
      g = Math.max(0, Math.min(255, (g - bg * (1 - a)) / a));
      b = Math.max(0, Math.min(255, (b - bb * (1 - a)) / a));
    }
    // any pink cast left on the edge
    if (a > 0) {
      const spill = Math.min(r, b) - g;
      if (spill > 0 && r > g && b > g + 20) { r -= spill * 0.5; b -= spill * 0.8; }
    }
    out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a;
  }
  return { w, h, data: out };
}

/** Bounding boxes of the subjects (shapes closer than `gap` px are one). */
function subjects(img, gap = 10) {
  const { w, h, data } = img;
  const solid = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) solid[p] = data[p * 4 + 3] > 0.5 ? 1 : 0;
  // grow the shapes by `gap` (cheap box dilation, rows then columns)
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let run = -1e9;
    for (let x = 0; x < w; x++) { if (solid[y * w + x]) run = x; if (x - run <= gap) tmp[y * w + x] = 1; }
    run = 1e9;
    for (let x = w - 1; x >= 0; x--) { if (solid[y * w + x]) run = x; if (run - x <= gap) tmp[y * w + x] = 1; }
  }
  const grown = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let run = -1e9;
    for (let y = 0; y < h; y++) { if (tmp[y * w + x]) run = y; if (y - run <= gap) grown[y * w + x] = 1; }
    run = 1e9;
    for (let y = h - 1; y >= 0; y--) { if (tmp[y * w + x]) run = y; if (run - y <= gap) grown[y * w + x] = 1; }
  }
  const label = new Int32Array(w * h).fill(-1);
  const boxes = [];
  const stack = [];
  for (let p = 0; p < w * h; p++) {
    if (!grown[p] || label[p] >= 0) continue;
    const box = { x0: w, y0: h, x1: -1, y1: -1, n: 0 };
    label[p] = boxes.length;
    stack.push(p);
    while (stack.length) {
      const q = stack.pop();
      const x = q % w, y = (q / w) | 0;
      if (solid[q]) {
        box.n++;
        box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x);
        box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y);
      }
      for (const nq of [q - 1, q + 1, q - w, q + w]) {
        if (nq < 0 || nq >= w * h || !grown[nq] || label[nq] >= 0) continue;
        if ((nq === q - 1 && x === 0) || (nq === q + 1 && x === w - 1)) continue;
        label[nq] = boxes.length;
        stack.push(nq);
      }
    }
    boxes.push(box);
  }
  const big = boxes.filter((b) => b.n > 400);
  // rows: subjects whose vertical spans overlap the row's middle
  big.sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const rows = [];
  for (const b of big) {
    const mid = (b.y0 + b.y1) / 2;
    const row = rows.find((r) => mid > r.y0 && mid < r.y1);
    if (row) { row.items.push(b); row.y0 = Math.min(row.y0, b.y0); row.y1 = Math.max(row.y1, b.y1); }
    else rows.push({ y0: b.y0, y1: b.y1, items: [b] });
  }
  rows.sort((a, b) => a.y0 - b.y0);
  return rows.flatMap((r) => r.items.sort((a, b) => a.x0 - b.x0));
}

/** Area-average resample of a box to `tw` × `th`, alpha cut hard. */
function resample(img, box, tw, th) {
  const { w, data } = img;
  const sw = box.x1 - box.x0 + 1;
  const sh = box.y1 - box.y0 + 1;
  const png = new PNG({ width: tw, height: th });
  for (let ty = 0; ty < th; ty++) {
    const sy0 = box.y0 + (ty * sh) / th, sy1 = box.y0 + ((ty + 1) * sh) / th;
    for (let tx = 0; tx < tw; tx++) {
      const sx0 = box.x0 + (tx * sw) / tw, sx1 = box.x0 + ((tx + 1) * sw) / tw;
      let r = 0, g = 0, b = 0, a = 0, area = 0;
      for (let y = Math.floor(sy0); y < Math.ceil(sy1); y++) {
        const wy = Math.min(y + 1, sy1) - Math.max(y, sy0);
        for (let x = Math.floor(sx0); x < Math.ceil(sx1); x++) {
          const wx = Math.min(x + 1, sx1) - Math.max(x, sx0);
          const k = wx * wy;
          const i = (y * w + x) * 4;
          const al = data[i + 3] * k;
          r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += al; area += k;
        }
      }
      const o = (ty * tw + tx) * 4;
      const cover = a / area;
      if (cover < 0.5 || a === 0) continue;
      png.data[o] = Math.round(r / a);
      png.data[o + 1] = Math.round(g / a);
      png.data[o + 2] = Math.round(b / a);
      png.data[o + 3] = 255;
    }
  }
  return png;
}

/** Drops the pink fringe left on the edges (no subject is purple). */
function defringe(png, leafy = false) {
  const { width: w, height: h, data } = png;
  for (let pass = 0; pass < 3; pass++) {
    const drop = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!data[i + 3]) continue;
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || !data[i - 1] || !data[i + 7] || !data[i - w * 4 + 3] || !data[i + w * 4 + 3];
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (!edge) continue;
      if (Math.min(r, b) - g > 8 || (r > g + 15 && b > g - 5)) drop.push(i);
      // on foliage the fringe comes out orange: an orange edge pixel next to leaves
      else if (leafy && r > g + 20 && [i - 4, i + 4, i - w * 4, i + w * 4].some((j) => j >= 0 && data[j + 3] && data[j + 1] > data[j])) drop.push(i);
    }
    for (const i of drop) data[i + 3] = 0;
  }
  return png;
}

/** The lowest row of the shape and where its middle is on that row. */
function base(png) {
  const { width: w, height: h, data } = png;
  for (let y = h - 1; y >= 0; y--) {
    let x0 = -1, x1 = -1;
    for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3]) { if (x0 < 0) x0 = x; x1 = x; }
    if (x0 >= 0) return { ax: Math.round((x0 + x1) / 2), ay: y };
  }
  return { ax: w / 2, ay: h - 1 };
}

fs.mkdirSync(OUT, { recursive: true });
const manifest = {};
for (const [job, items] of Object.entries(SHEETS)) {
  const file = newest(job);
  const img = keyed(PNG.sync.read(fs.readFileSync(file)));
  const found = subjects(img);
  if (found.length !== items.length) {
    console.error(`${job}: found ${found.length} subjects, expected ${items.length}`);
    for (const b of found) console.error(`  ${b.x0},${b.y0} ${b.x1 - b.x0 + 1}x${b.y1 - b.y0 + 1} (${b.n} px)`);
    process.exit(1);
  }
  const cut = (it, b) => {
    const sw = b.x1 - b.x0 + 1, sh = b.y1 - b.y0 + 1;
    const k = it.h ? it.h / sh : it.w / sw;
    const tw = Math.max(1, Math.round(sw * k)), th = Math.max(1, Math.round(sh * k));
    const png = defringe(resample(img, b, tw, th), job === 'cain-trees');
    const { ax, ay } = base(png);
    fs.writeFileSync(path.join(OUT, `${it.name}.png`), PNG.sync.write(png));
    manifest[it.name] = { w: tw, h: th, ax, ay };
    if (DEBUG) console.log(`${job} ${it.name}: ${sw}x${sh} -> ${tw}x${th}`);
  };
  items.forEach((it, i) => {
    if (!it.name) return;
    cut(it, found[i]);
    for (const v of it.also ?? []) cut(v, found[i]);
  });
}
fs.writeFileSync(DATA, JSON.stringify(manifest, null, 1) + '\n');
console.log(`${Object.keys(manifest).length} sprites -> public/assets/cain/`);
