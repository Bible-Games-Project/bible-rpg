import type { ShadowAsset } from '../manifest';
import type { Px } from './stride';

/**
 * The shadows of a rebuilt character sheet (strideSheets.ts), cast at boot
 * the way tools/art/from_generated.py's cast_shadow casts the drawn ones:
 * each pixel at height z above the feet lands z * SHADOW_X to the right and
 * z * SHADOW_Y down, then grown a pixel and blurred. One cell per frame,
 * then one per frame mirrored (a sprite facing left still has the sun at
 * the upper left), as fitShadow expects. The maintainer saw the run cast
 * the standing shadow: the frames made at boot had no shadow of their own.
 */
const SHADOW_X = 0.45;
const SHADOW_Y = 0.11;
const ALPHA = 0.34;
const RGB = [14, 30, 24];
/** the blur: two box passes of this radius (variance 4: the pipeline's gaussian of 2) */
const BLUR = 2;
const MARGIN = 8;

interface Shot {
  /** where each opaque pixel falls, relative to the feet */
  pts: Int16Array;
  n: number;
}

function cast(f: Px, ax: number, ay: number, mirror: boolean, ground?: ArrayLike<number>, under?: [number, number]): Shot {
  const pts = new Int16Array(f.w * f.h * 2 + (ground ? f.w * f.h * 2 : 0));
  let n = 0;
  // the ground under a long thing raised on blocks (the ark): between its
  // lowest pixel and the line it stands on, it is in its shade (the
  // maintainer: the ark's shadow was badly made, light under the hull)
  if (ground && under)
    for (let x = Math.max(0, under[0]); x <= Math.min(f.w - 1, under[1]); x++) {
      // every clear pixel below its top, not only those below its lowest
      // one: beside the ramp, under the hull, the ground stayed light
      let top = -1;
      for (let y = 0; y < f.h; y++)
        if (f.d[(y * f.w + x) * 4 + 3]) {
          top = y;
          break;
        }
      if (top < 0) continue;
      const sx = (mirror ? f.w - 1 - x : x) - (mirror ? f.w - ax : ax);
      for (let y = top + 1; y <= ground[x]; y++) {
        if (f.d[(y * f.w + x) * 4 + 3]) continue;
        pts[n++] = sx;
        pts[n++] = Math.round(y - ay);
      }
    }
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++) {
      if (!f.d[(y * f.w + x) * 4 + 3]) continue;
      // a long thing seen from above stands on a ground line, not a row: each column's height from its own
      const g = ground ? ground[x] : ay;
      const z = Math.max(0, g - y);
      const sx = (mirror ? f.w - 1 - x : x) - (mirror ? f.w - ax : ax);
      pts[n++] = Math.round(sx + SHADOW_X * z);
      pts[n++] = Math.round(SHADOW_Y * z + g - ay);
    }
  return { pts, n };
}

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) {
        const xx = x + i;
        if (xx >= 0 && xx < w) s += src[y * w + xx];
      }
      tmp[y * w + x] = s * k;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) {
        const yy = y + i;
        if (yy >= 0 && yy < h) s += tmp[yy * w + x];
      }
      out[y * w + x] = s * k;
    }
  return out;
}

/**
 * The shadow strip of `frames` (feet at ax, ay) and its entry; `file` is unused.
 * `ground`: the row each column stands on, for a long thing seen at a slant (the ark);
 * `under`: the columns (between its blocks) where the ground under it is shaded.
 */
export function castShadows(frames: Px[], ax: number, ay: number, ground?: ArrayLike<number>, under?: [number, number]): [HTMLCanvasElement, ShadowAsset] {
  const shots = [...frames.map((f) => cast(f, ax, ay, false, ground, under)), ...frames.map((f) => cast(f, ax, ay, true, ground, under))];
  let x0 = 0;
  let x1 = 0;
  let y0 = 0;
  let y1 = 0;
  for (const s of shots)
    for (let i = 0; i < s.n; i += 2) {
      x0 = Math.min(x0, s.pts[i]);
      x1 = Math.max(x1, s.pts[i]);
      y0 = Math.min(y0, s.pts[i + 1]);
      y1 = Math.max(y1, s.pts[i + 1]);
    }
  const left = MARGIN - x0;
  const up = MARGIN - y0;
  const cw = x1 - x0 + 2 * MARGIN + 1;
  const ch = y1 - y0 + 2 * MARGIN + 1;
  const c = document.createElement('canvas');
  c.width = cw * shots.length;
  c.height = ch;
  const ctx = c.getContext('2d')!;
  shots.forEach((s, k) => {
    const mask = new Float32Array(cw * ch);
    for (let i = 0; i < s.n; i += 2) {
      const px = s.pts[i] + left;
      const py = s.pts[i + 1] + up;
      // grown by a pixel all round
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mask[(py + dy) * cw + px + dx] = 1;
    }
    const soft = boxBlur(boxBlur(mask, cw, ch, BLUR), cw, ch, BLUR);
    const img = new ImageData(cw, ch);
    for (let i = 0; i < cw * ch; i++) {
      img.data[i * 4] = RGB[0];
      img.data[i * 4 + 1] = RGB[1];
      img.data[i * 4 + 2] = RGB[2];
      img.data[i * 4 + 3] = Math.round(Math.min(1, soft[i] * 1.3) * ALPHA * 255);
    }
    ctx.putImageData(img, k * cw, 0);
  });
  return [c, { file: '', anchorX: left, anchorY: up, frameWidth: cw, frameHeight: ch, frames: frames.length }];
}
