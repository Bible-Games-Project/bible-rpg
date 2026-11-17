// Pastes an AI-edited mouth back into the narrator's portrait. The edit was
// made on a 2× crop of the face (x, y = the crop's top-left on the portrait,
// 512 px wide). Inside an ellipse round the mouth only the mouth and
// skin (not the grey beard, in either image) are taken from it: the beard stays
// the portrait's own pixels, so it shows no patch.
//
//   node tools/shorts/mouth-paste.mjs <name> <edit.png> <out.png> [x y cx cy rx ry]
// (defaults: grandpa-bible's crop 356 260 and mouth ellipse 614 532 115 58)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { PNG } = createRequire((process.env.HEADLESS_TOOLS || '/tmp/tools') + '/package.json')('pngjs');
const [name, editFile, outFile, ...n] = process.argv.slice(2);
const [X, Y, cx, cy, rx, ry] = n.length ? n.map(Number) : [356, 260, 614, 532, 115, 58];
const root = new URL('../../', import.meta.url).pathname;
const B = JSON.parse(readFileSync(`${root}art/shorts/narrator/${name}.json`, 'utf8')).block;
const src = PNG.sync.read(readFileSync(`${root}art/shorts/narrator/${name}.png`));
const ed = PNG.sync.read(readFileSync(editFile));
const K = ed.width / 512;
const W = src.width;
const srcAt = (x, y) => [0, 1, 2].map((c) => src.data[(y * W + x) * 4 + c]);
// the mouth and the skin round it, in the edit or in the portrait (anything
// but the grey beard), grown a little so it comes with its outline and a soft edge
const notBeard = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) > 50 || r + g + b < 210;
const avg = (x, y) => [0, 1, 2].map((c) => {
  let t = 0;
  for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) t += ed.data[(((y - Y) * K + j) * ed.width + (x - X) * K + i) * 4 + c];
  return t / (K * K);
});
const x0 = Math.floor(cx - rx), y0 = Math.floor(cy - ry), w = Math.ceil(2 * rx) + 1, h = Math.ceil(2 * ry) + 1;
const diff = new Float32Array(w * h), edit = [];
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const e = avg(x0 + x, y0 + y), o = srcAt(x0 + x, y0 + y);
  edit[y * w + x] = e;
  const inside = Math.hypot((x0 + x - cx) / rx, (y0 + y - cy) / ry) < 1;
  diff[y * w + x] = inside && (notBeard(e) || notBeard(o)) ? 1 : 0;
}
const R = Math.round(B * 0.4);
let changed = 0;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  let m = 0;
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
    const xx = x + i, yy = y + j, r = Math.hypot(i, j);
    if (xx >= 0 && yy >= 0 && xx < w && yy < h && r <= R && diff[yy * w + xx]) m = Math.max(m, Math.min(1, (R + 1 - r) / (R * 0.6)));
  }
  const k = m;
  if (!k) continue;
  changed++;
  const d = ((y0 + y) * W + x0 + x) * 4;
  for (let c = 0; c < 3; c++) src.data[d + c] = Math.round(src.data[d + c] * (1 - k) + edit[y * w + x][c] * k);
}
writeFileSync(outFile, PNG.sync.write(src));
console.log(outFile, changed, 'pixels');
