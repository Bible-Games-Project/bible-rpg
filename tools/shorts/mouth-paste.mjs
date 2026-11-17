// Pastes an AI-edited mouth back into the narrator's portrait: the edit was
// made on a 2× crop of the face (x, y = the crop's top-left on the portrait,
// 512 px wide) and only an ellipse round the mouth is taken from it, its edge
// blended, so the rest of the portrait stays pixel for pixel the same.
//
//   node tools/shorts/mouth-paste.mjs <name> <edit.png> <out.png> [x y cx cy rx ry]
// (defaults: grandpa-bible's crop 356 260 and mouth ellipse 614 532 115 58)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { PNG } = createRequire((process.env.HEADLESS_TOOLS || '/tmp/tools') + '/package.json')('pngjs');
const [name, editFile, outFile, ...n] = process.argv.slice(2);
const [X, Y, cx, cy, rx, ry] = n.length ? n.map(Number) : [356, 260, 614, 532, 115, 58];
const root = new URL('../../', import.meta.url).pathname;
const src = PNG.sync.read(readFileSync(`${root}art/shorts/narrator/${name}.png`));
const ed = PNG.sync.read(readFileSync(editFile));
const K = ed.width / 512;
for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
  for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const r = Math.hypot((x - cx) / rx, (y - cy) / ry);
    if (r >= 1) continue;
    const w = r < 0.8 ? 1 : (1 - r) / 0.2;
    const d = (y * src.width + x) * 4;
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) s += ed.data[(((y - Y) * K + j) * ed.width + (x - X) * K + i) * 4 + c];
      src.data[d + c] = Math.round(src.data[d + c] * (1 - w) + (s / (K * K)) * w);
    }
  }
writeFileSync(outFile, PNG.sync.write(src));
console.log(outFile);
