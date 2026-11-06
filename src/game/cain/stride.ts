/**
 * Cain's own walk and run seen from the side (the maintainer, as a test on
 * Cain only): his arms swing further than Adam's, and running is a trot,
 * with longer strides, a lean, more arm swing and the body off the ground
 * between steps. Made at runtime from the standing frame of Adam's side
 * sheet, the way tools/art/from_generated.py (side_frames) made the walk:
 * the legs turn at the hip and the near arm at the shoulder, the far limbs
 * a little darker behind the body, the lowest foot on the ground.
 */

export interface Px {
  w: number;
  h: number;
  d: Uint8ClampedArray;
}

export type XY = [number, number];

const blank = (w: number, h: number): Px => ({ w, h, d: new Uint8ClampedArray(w * h * 4) });
const alpha = (p: Px, x: number, y: number) => (x >= 0 && y >= 0 && x < p.w && y < p.h ? p.d[(y * p.w + x) * 4 + 3] : 0);

function copyPx(p: Px, from: Px, x: number, y: number, fx: number, fy: number): void {
  const i = (y * p.w + x) * 4;
  const j = (fy * from.w + fx) * 4;
  p.d[i] = from.d[j];
  p.d[i + 1] = from.d[j + 1];
  p.d[i + 2] = from.d[j + 2];
  p.d[i + 3] = from.d[j + 3];
}

/** Draw `top` over `p` (opaque pixels win), moved down by dy. */
function over(p: Px, top: Px, dy = 0): void {
  for (let y = 0; y < top.h; y++) {
    const ty = y + dy;
    if (ty < 0 || ty >= p.h) continue;
    for (let x = 0; x < top.w; x++) if (top.d[(y * top.w + x) * 4 + 3]) copyPx(p, top, x, ty, x, y);
  }
}

/** Turn a layer around pivot by `angle` degrees (counter-clockwise on
 * screen, as PIL's rotate), nearest pixel, sampled at k×k sub-pixel centres
 * like rotate_part. */
export function rotatePart(p: Px, angle: number, pivot: XY, k = 4): Px {
  const out = blank(p.w, p.h);
  if (!angle) {
    out.d.set(p.d);
    return out;
  }
  const a = (angle * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const off = (Math.floor(k / 2) + 0.5) / k;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const dx = x + off - pivot[0];
      const dy = y + off - pivot[1];
      const sx = Math.floor(pivot[0] + dx * c - dy * s);
      const sy = Math.floor(pivot[1] + dx * s + dy * c);
      if (alpha(p, sx, sy)) copyPx(out, p, x, y, sx, sy);
    }
  }
  return out;
}

/** Where a point goes when its layer is turned by rotatePart. */
export function turnPoint(q: XY, angle: number, pivot: XY): XY {
  const a = (angle * Math.PI) / 180;
  const dx = q[0] - pivot[0];
  const dy = q[1] - pivot[1];
  return [pivot[0] + dx * Math.cos(a) + dy * Math.sin(a), pivot[1] - dx * Math.sin(a) + dy * Math.cos(a)];
}

function darker(p: Px): Px {
  const o = blank(p.w, p.h);
  for (let i = 0; i < p.d.length; i += 4) {
    o.d[i] = p.d[i] * 0.8;
    o.d[i + 1] = p.d[i + 1] * 0.8;
    o.d[i + 2] = p.d[i + 2] * 0.8;
    o.d[i + 3] = p.d[i + 3];
  }
  return o;
}

/** The largest 8-connected patch of a mask. */
function largestBlob(mask: Uint8Array, w: number, h: number): Uint8Array {
  const seen = new Uint8Array(w * h);
  let best: number[] = [];
  for (let i0 = 0; i0 < w * h; i0++) {
    if (!mask[i0] || seen[i0]) continue;
    const comp = [i0];
    seen[i0] = 1;
    for (let n = 0; n < comp.length; n++) {
      const x = comp[n] % w;
      const y = (comp[n] / w) | 0;
      for (let ny = y - 1; ny <= y + 1; ny++)
        for (let nx = x - 1; nx <= x + 1; nx++) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (mask[j] && !seen[j]) {
            seen[j] = 1;
            comp.push(j);
          }
        }
    }
    if (comp.length > best.length) best = comp;
  }
  const out = new Uint8Array(w * h);
  for (const i of best) out[i] = 1;
  return out;
}

export interface SideStride {
  /** near-leg angle per frame (degrees, forward positive) */
  cycle: number[];
  /** the arms swing against the legs by this much of the leg's angle */
  armSwing: number;
  /** the whole body leaning forward (degrees) */
  lean?: number;
  /** the body lifted off the ground per frame (pixels) */
  lift?: number[];
}

/**
 * Side frames from the standing frame `stand` (a frame of the sheet), the
 * near arm in `band` [x0, x1, y0, y1] (sheet pixels, from the shoulder to
 * the bottom of the fist). Returns the frames and where the fist is in each
 * (the bottom of it, for what the hand holds).
 */
export function sideStride(stand: Px, band: [number, number, number, number], o: SideStride): { frames: Px[]; hands: XY[] } {
  const { w, h } = stand;
  let figTop = h;
  let figBottom = 0;
  const widths = new Array<number>(h).fill(0);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (alpha(stand, x, y)) {
        widths[y]++;
        figTop = Math.min(figTop, y);
        figBottom = Math.max(figBottom, y);
      }
  const fh = figBottom - figTop + 1;
  const maxW = Math.max(...widths);
  let top = figBottom;
  for (let y = figTop + Math.floor(0.6 * fh); y <= figBottom; y++)
    if (widths[y] <= 0.45 * maxW) {
      top = y;
      break;
    }
  // the legs: the largest patch below the hem, without the hand
  const lower = new Uint8Array(w * h);
  for (let y = top; y <= figBottom; y++) for (let x = 0; x < w; x++) if (alpha(stand, x, y)) lower[y * w + x] = 1;
  const legMask = largestBlob(lower, w, h);
  const [x0, x1, y0, y1] = band;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) legMask[y * w + x] = 0;
  let cl = w;
  let cr = -1;
  for (let x = 0; x < w; x++)
    if (legMask[top * w + x]) {
      cl = Math.min(cl, x);
      cr = Math.max(cr, x);
    }
  const hip: XY = [(cl + cr + 1) / 2, top - Math.round(0.1 * fh)];
  const leg = blank(w, h);
  const body = blank(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!alpha(stand, x, y)) continue;
      if (legMask[y * w + x]) copyPx(leg, stand, x, y, x, y);
      else copyPx(body, stand, x, y, x, y);
    }
  // hidden under the clothes: keeps the hip joined
  for (let y = hip[1]; y < top; y++) for (let x = 0; x < w; x++) if (legMask[top * w + x]) copyPx(leg, stand, x, y, x, top);
  // the arm on its own; the body behind it filled from beside it in the row
  const arm = blank(w, h);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (!alpha(stand, x, y)) continue;
      copyPx(arm, stand, x, y, x, y);
      body.d.fill(0, (y * w + x) * 4, (y * w + x) * 4 + 4);
      for (const sx of [2 * x1 - 1 - x, 2 * x0 - 1 - x, x1, x0 - 1]) {
        if (sx >= 0 && sx < w && !(sx >= x0 && sx < x1) && alpha(stand, sx, y)) {
          copyPx(body, stand, x, y, sx, y);
          break;
        }
      }
    }
  const farLeg = darker(leg);
  const farArm = darker(arm);
  const shoulder: XY = [(x0 + x1) / 2, y0 + 2];
  const fist: XY = [(x0 + x1) / 2, y1];
  const frames: Px[] = [];
  const hands: XY[] = [];
  o.cycle.forEach((angle, i) => {
    const swing = -angle * o.armSwing;
    let out = blank(w, h);
    for (const layer of [rotatePart(farArm, -swing, shoulder), rotatePart(farLeg, -angle, hip), rotatePart(leg, angle, hip), body, rotatePart(arm, swing, shoulder)]) over(out, layer);
    let hand = turnPoint(fist, swing, shoulder);
    // leaning into the run, about the feet
    if (o.lean) {
      const feet: XY = [hip[0], figBottom];
      out = rotatePart(out, -o.lean, feet);
      hand = turnPoint(hand, -o.lean, feet);
    }
    let low = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (out.d[(y * w + x) * 4 + 3]) low = y;
    const dy = figBottom - low - (o.lift?.[i] ?? 0);
    const f = blank(w, h);
    over(f, out, dy);
    frames.push(f);
    hands.push([hand[0], hand[1] + dy]);
  });
  return { frames, hands };
}

/** A frame lifted `dy` pixels (the trot's bounce in the front and back views). */
export function lifted(p: Px, dy: number): Px {
  const f = blank(p.w, p.h);
  over(f, p, -dy);
  return f;
}

/** Frame i of a sheet's pixels. */
export function frameOf(sheet: { width: number; height: number; data: Uint8ClampedArray }, i: number, fw: number): Px {
  const h = sheet.height;
  const p = blank(fw, h);
  for (let y = 0; y < h; y++) {
    const j = (y * sheet.width + i * fw) * 4;
    p.d.set(sheet.data.subarray(j, j + fw * 4), y * fw * 4);
  }
  return p;
}
