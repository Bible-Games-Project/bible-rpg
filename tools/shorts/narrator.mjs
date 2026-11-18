// The narrator's talking portrait for the shorts, from one of the
// maintainer's poses (art/shorts/narrator/poses/<pose>-closed.png and
// -open.png, the same drawing with the mouth shut and open) and its notes
// (<pose>.json: the mouth and eyes, the crop): the portrait with the mouth
// shut, the open mouth (taken from the open drawing round the mouth only, so
// the rest never flickers), a half-open one made from it and the closed-eyes layer, drawn in the portrait's
// blocky style. All cut to the figure with a straight bottom edge (it stands
// on the frame's bottom). The overlay stacks them while the voice plays.
//
//   node tools/shorts/narrator.mjs <pose> [outDir]   (default /tmp/shorts/narrator/<pose>)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire((process.env.HEADLESS_TOOLS || '/tmp/tools') + '/package.json');
const { PNG } = require('pngjs');

const pose = process.argv[2] ?? 'quiet';
const root = new URL('../../', import.meta.url).pathname;
const dir = process.argv[3] ?? `/tmp/shorts/narrator/${pose}`;
const at = `${root}art/shorts/narrator/poses/${pose}`;
const face = JSON.parse(readFileSync(`${at}.json`, 'utf8'));
const src = PNG.sync.read(readFileSync(`${at}-closed.png`));
const open = PNG.sync.read(readFileSync(`${at}-open.png`));
const W = src.width, H = src.height, B = face.block;
mkdirSync(dir, { recursive: true });

const [cx0, cy0, cx1, cy1] = face.crop;
function crop(png) {
  const out = new PNG({ width: cx1 - cx0, height: cy1 - cy0 });
  PNG.bitblt(png, out, cx0, cy0, cx1 - cx0, cy1 - cy0, 0, 0);
  return out;
}

// the open mouth: the open drawing inside an ellipse round the mouth, its edge blended
const talk = new PNG({ width: W, height: H });
src.data.copy(talk.data);
const m = face.mouth;
for (let y = Math.floor(m.y - m.ry); y <= m.y + m.ry; y++)
  for (let x = Math.floor(m.x - m.rx); x <= m.x + m.rx; x++) {
    const r = Math.hypot((x - m.x) / m.rx, (y - m.y) / m.ry);
    if (r >= 1) continue;
    const k = r < 0.75 ? 1 : (1 - r) / 0.25;
    const i = (y * W + x) * 4;
    for (let c = 0; c < 4; c++) talk.data[i + c] = Math.round(src.data[i + c] * (1 - k) + open.data[i + c] * k);
  }
writeFileSync(`${dir}/mouth2.png`, PNG.sync.write(crop(talk)));

// the half-open mouth, from the open one: in each column of the mouth
// (face.jaw: x0..x1) the rows below `y` move up by d (most in the middle,
// none at the corners) and the rows down to `end` stretch to fill, so the
// jaw comes halfway up
const { x0: jx0, x1: jx1, y: jy, end: jend, d: jd } = face.jaw;
const half = new PNG({ width: W, height: H });
talk.data.copy(half.data);
for (let x = jx0; x <= jx1; x++) {
  const d = Math.round(jd * Math.sqrt(Math.sin((Math.PI * (x - jx0)) / (jx1 - jx0))));
  for (let y = jy; y < jend && d > 0; y++) {
    const sy = Math.min(jend - 1, Math.round(jy + d + ((y - jy) * (jend - jy - d)) / (jend - jy)));
    talk.data.copy(half.data, (y * W + x) * 4, (sy * W + x) * 4, (sy * W + x) * 4 + 4);
  }
}
writeFileSync(`${dir}/mouth1.png`, PNG.sync.write(crop(half)));

// closed eyes: the eye (a rounded box, so its corners are covered too) in
// skin colour, the shut lid a soft curve across it in art pixels of half size
const blink = new PNG({ width: W, height: H });
const h = B / 2;
for (const e of face.eyes) {
  // the skin colour right round this eye (the median of the skin-like pixels on a ring)
  const ring = [];
  for (let a = 0; a < 360; a += 3) {
    const x = Math.round(e.x + Math.cos((a * Math.PI) / 180) * (e.rx + 6)), y = Math.round(e.y + Math.sin((a * Math.PI) / 180) * (e.ry + 6));
    const p = [...src.data.subarray((y * W + x) * 4, (y * W + x) * 4 + 3)];
    if (Math.abs(p[0] - face.skin[0]) + Math.abs(p[1] - face.skin[1]) + Math.abs(p[2] - face.skin[2]) < 70) ring.push(p);
  }
  const skin = ring.length ? [0, 1, 2].map((c) => ring.map((p) => p[c]).sort((a, b) => a - b)[ring.length >> 1]) : face.skin;
  for (let y = Math.floor(e.y - e.ry); y <= e.y + e.ry; y++)
    for (let x = Math.floor(e.x - e.rx); x <= e.x + e.rx; x++) {
      const dx = (x - e.x) / e.rx, dy = (y - e.y) / e.ry;
      if (Math.abs(dx) ** 3 + Math.abs(dy) ** 3 > 1) continue;
      const cx = (Math.floor(x / h) + 0.5) * h, ex = (cx - e.x) / e.rx;
      const ly = Math.floor((e.y + e.ry * 0.15 + ex * ex * e.ry * 0.55) / h) * h;
      const c = Math.abs(ex) < 0.8 && y >= ly && y < ly + 1.5 * h ? face.lash : skin;
      const i = (y * W + x) * 4;
      blink.data[i] = c[0]; blink.data[i + 1] = c[1]; blink.data[i + 2] = c[2]; blink.data[i + 3] = 255;
    }
}
writeFileSync(`${dir}/blink.png`, PNG.sync.write(crop(blink)));
writeFileSync(`${dir}/base.png`, PNG.sync.write(crop(src)));
console.log(`${dir}: base, mouth1-2, blink`);
