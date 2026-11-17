// The narrator's talking portrait for the shorts: from one PNG and its face
// notes (art/shorts/narrator/<name>.json: the eyes, the crop) and its two
// open-mouth versions it makes the talking layers and draws the closed-eyes
// layer in the portrait's own blocky style, as PNGs of the same size.
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
// open mouths: the portrait with its mouth half open (<name>-mouth1.png) and
// open (<name>-mouth2.png), redrawn by the image AI on the mouth alone and
// pasted back with tools/shorts/mouth-paste.mjs; the widest size reuses the open one.
[1, 2, 3].forEach((size) => {
  const png = PNG.sync.read(readFileSync(`${root}art/shorts/narrator/${name}-mouth${Math.min(size, 2)}.png`));
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
