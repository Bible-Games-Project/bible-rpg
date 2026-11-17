// The narrator's talking portrait for the shorts: from one PNG and its face
// notes (art/shorts/narrator/<name>.json: the mouth line, the eyes) it draws
// the open-mouth layers (3 sizes) and the closed-eyes layer, pixel by pixel
// in the portrait's own blocky style, as transparent PNGs of the same size.
// The overlay stacks them over the portrait while the voice plays.
//
//   node tools/shorts/narrator.mjs <name> [outDir]   (default /tmp/shorts/narrator/<name>)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire((process.env.HEADLESS_TOOLS || '/tmp/tools') + '/package.json');
const { PNG } = require('pngjs');

const name = process.argv[2] ?? 'grandpa-bible';
const root = new URL('../../', import.meta.url).pathname;
const dir = process.argv[3] ?? `/tmp/shorts/narrator/${name}`;
const face = JSON.parse(readFileSync(`${root}art/shorts/narrator/${name}.json`, 'utf8'));
const src = PNG.sync.read(readFileSync(`${root}art/shorts/narrator/${name}.png`));
const W = src.width, H = src.height, B = face.block;
mkdirSync(dir, { recursive: true });

const layer = () => new PNG({ width: W, height: H });
/** Fills one art pixel (a B×B block on the portrait's grid). */
function block(png, bx, by, [r, g, b]) {
  for (let y = Math.round(by * B); y < Math.round((by + 1) * B) && y < H; y++)
    for (let x = Math.round(bx * B); x < Math.round((bx + 1) * B) && x < W; x++) {
      const i = (y * W + x) * 4;
      png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
    }
}
/** The mouth line's y at x, between its points. */
function lineY(x) {
  const m = face.mouth;
  for (let i = 1; i < m.length; i++) {
    if (x <= m[i][0]) {
      const k = (x - m[i - 1][0]) / (m[i][0] - m[i - 1][0]);
      return m[i - 1][1] + k * (m[i][1] - m[i - 1][1]);
    }
  }
  return m.at(-1)[1];
}

// open mouths: under the lip line, a dark opening deepest in the middle, the
// tongue at the bottom of the wider ones, the lower lip under it
const x0 = face.mouth[0][0], x1 = face.mouth.at(-1)[0];
[1, 2, 3].forEach((size) => {
  const png = layer();
  for (let bx = Math.floor(x0 / B); bx <= Math.floor(x1 / B); bx++) {
    const cx = bx * B + B / 2;
    const k = (cx - x0) / (x1 - x0);
    if (k < 0 || k > 1) continue;
    const depth = Math.round(size * Math.pow(Math.sin(Math.PI * k), 0.6) * face.open);
    const top = Math.floor(lineY(cx) / B);
    for (let j = 0; j <= depth; j++) {
      const c = j === 0 ? face.lip : j === depth && depth > 1 ? face.lowerLip : j === depth - 1 && depth > 2 ? face.tongue : face.inside;
      block(png, bx, top + j, c);
    }
  }
  writeFileSync(`${dir}/mouth${size}.png`, PNG.sync.write(png));
});

// closed eyes: the eye under the lid in skin colour, the lashes a soft curve
const blink = layer();
for (const e of face.eyes) {
  for (let by = Math.floor((e.y - e.ry) / B); by <= Math.floor((e.y + e.ry) / B); by++)
    for (let bx = Math.floor((e.x - e.rx) / B); bx <= Math.floor((e.x + e.rx) / B); bx++) {
      const dx = (bx * B + B / 2 - e.x) / e.rx, dy = (by * B + B / 2 - e.y) / e.ry;
      if (dx * dx + dy * dy <= 1) block(blink, bx, by, by * B + B / 2 < e.y ? face.lid : face.skin);
    }
  for (let bx = Math.floor((e.x - e.rx) / B); bx <= Math.floor((e.x + e.rx) / B); bx++) {
    const dx = (bx * B + B / 2 - e.x) / e.rx;
    if (Math.abs(dx) > 1) continue;
    block(blink, bx, Math.floor((e.y + e.ry * 0.25 + dx * dx * e.ry * 0.35) / B), face.lash);
  }
}
writeFileSync(`${dir}/blink.png`, PNG.sync.write(blink));
copyFileSync(`${root}art/shorts/narrator/${name}.png`, `${dir}/base.png`);
console.log(`${dir}: base, mouth1-3, blink`);
