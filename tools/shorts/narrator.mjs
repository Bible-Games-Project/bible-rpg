// The narrator's talking portrait for the shorts: from one PNG and its face
// notes (art/shorts/narrator/<name>.json: the mouth line, the eyes) it draws
// the open-mouth portraits (3 sizes, the jaw dropping) and the closed-eyes layer, pixel by pixel
// in the portrait's own blocky style, as transparent PNGs of the same size.
// The overlay stacks them over the portrait while the voice plays.
//
//   node tools/shorts/narrator.mjs <name> [outDir]   (default /tmp/shorts/narrator/<name>)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
/** The portrait cut to its figure, with a straight bottom edge (it stands on the frame's bottom). */
const [cx0, cy0, cx1, cy1] = face.crop;
function crop(png) {
  const out = new PNG({ width: cx1 - cx0, height: cy1 - cy0 });
  PNG.bitblt(png, out, cx0, cy0, cx1 - cx0, cy1 - cy0, 0, 0);
  return out;
}
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

// open mouths: the jaw drops. Under the lip line each column of the chin
// and beard moves down (most in the middle of the mouth, nothing at its
// corners), the opening shows dark with the upper teeth, and the neck under
// the beard takes up the drop, so the jacket and the Bible stay still.
const x0 = face.mouth[0][0], x1 = face.mouth.at(-1)[0];
const px = (png, x, y) => (y * W + x) * 4;
[1, 2, 3].forEach((size) => {
  const png = layer();
  src.data.copy(png.data);
  for (let x = Math.ceil(x0); x <= x1; x++) {
    const bx = Math.floor(x / B);
    const k = (bx * B + B / 2 - x0) / (x1 - x0);
    if (k <= 0 || k >= 1) continue;
    const h = Math.round(Math.round(size * face.open * Math.pow(Math.sin(Math.PI * k), 0.8)) * B);
    if (h <= 0) continue;
    const split = Math.round(lineY(x)) - face.lipUp;
    const chin = face.chin, end = face.neck;
    for (let y = split; y < end; y++) {
      const d = px(png, x, y);
      if (y < split + h) {
        // the opening: teeth along the top in the middle of wider mouths, dark below
        const teeth = h >= 3 * B && y < split + B * 0.8 && k > 0.22 && k < 0.78;
        const c = teeth ? face.teeth : face.inside;
        png.data[d] = c[0]; png.data[d + 1] = c[1]; png.data[d + 2] = c[2]; png.data[d + 3] = 255;
        continue;
      }
      const sy = y < chin + h ? y - h : Math.round(chin + ((y - chin - h) * (end - chin)) / (end - chin - h));
      src.data.copy(png.data, d, px(src, x, sy), px(src, x, sy) + 4);
    }
  }
  writeFileSync(`${dir}/mouth${size}.png`, PNG.sync.write(crop(png)));
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
writeFileSync(`${dir}/blink.png`, PNG.sync.write(crop(blink)));
writeFileSync(`${dir}/base.png`, PNG.sync.write(crop(src)));
console.log(`${dir}: base, mouth1-3, blink`);
