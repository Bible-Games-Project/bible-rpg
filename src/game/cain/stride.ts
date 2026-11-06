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

/** A layer turned by several turns one after the other (each about its
 * pivot, as rotatePart), sampled once so the pixels stay crisp: a shin bent
 * at the knee and then swung with the thigh from the hip. */
export function turnSteps(p: Px, steps: { angle: number; pivot: XY }[], k = 4): Px {
  const out = blank(p.w, p.h);
  const trig = steps.map(({ angle, pivot }) => ({ c: Math.cos((angle * Math.PI) / 180), s: Math.sin((angle * Math.PI) / 180), pivot }));
  const off = (Math.floor(k / 2) + 0.5) / k;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      let qx = x + off;
      let qy = y + off;
      for (let i = trig.length - 1; i >= 0; i--) {
        const { c, s, pivot } = trig[i];
        const dx = qx - pivot[0];
        const dy = qy - pivot[1];
        qx = pivot[0] + dx * c - dy * s;
        qy = pivot[1] + dx * s + dy * c;
      }
      const sx = Math.floor(qx);
      const sy = Math.floor(qy);
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
  const { w, h, leg, body, arm, hip, figBottom } = splitSide(stand, band);
  const farLeg = darker(leg);
  const farArm = darker(arm);
  const [x0, x1, y0, y1] = band;
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

export interface SideRun {
  frames: number;
  /** how far the thighs swing forward and back (degrees) */
  thigh: number;
  /** the knee: always this much bent, and up to this much more as the leg comes through */
  knee: [number, number];
  /** the upper arms swing this much of the thigh's angle, against the legs */
  armSwing: number;
  /** the elbows bent forward (degrees) */
  elbow: number;
  /** the body lifted off the ground per frame (pixels) */
  lift: number[];
}

/** Where a part's row `y` crosses it: the middle of its pixels there. */
function middleAt(p: Px, y: number, fallback: number): number {
  let l = p.w;
  let r = -1;
  for (let x = 0; x < p.w; x++)
    if (p.d[(y * p.w + x) * 4 + 3]) {
      l = Math.min(l, x);
      r = Math.max(r, x);
    }
  return r < 0 ? fallback : (l + r + 1) / 2;
}

/** Rows [from, to) of a layer. */
function rows(p: Px, from: number, to: number): Px {
  const o = blank(p.w, p.h);
  const a = Math.max(0, from) * p.w * 4;
  const b = Math.min(p.h, to) * p.w * 4;
  o.d.set(p.d.subarray(a, b), a);
  return o;
}

/**
 * A running trot from the side (the maintainer wanted knees and elbows that
 * bend, not the walk leaning): each leg is split at the knee and the arm at
 * the elbow; the thigh swings from the hip and the shin folds back under it
 * as the leg comes through, straightening to land; the arms are held bent
 * and pump against the legs. The body stays upright and bobs.
 */
export function sideRun(stand: Px, band: [number, number, number, number], o: SideRun): { frames: Px[]; hands: XY[] } {
  const { w, h, leg, body, arm, hip, figBottom } = splitSide(stand, band);
  const [x0, x1, y0, y1] = band;
  const kneeY = Math.round(hip[1] + 0.52 * (figBottom - hip[1]));
  const knee: XY = [middleAt(leg, kneeY, hip[0]), kneeY + 0.5];
  // the thigh a little over the shin so the knee stays closed when it bends
  const thigh = rows(leg, 0, kneeY + 2);
  const shin = rows(leg, kneeY - 1, h);
  const elbowY = Math.round(y0 + 0.46 * (y1 - y0));
  const elbow: XY = [middleAt(arm, elbowY, (x0 + x1) / 2), elbowY + 0.5];
  const upper = rows(arm, 0, elbowY + 2);
  const fore = rows(arm, elbowY - 1, h);
  const shoulder: XY = [(x0 + x1) / 2, y0 + 2];
  const fist: XY = [(x0 + x1) / 2, y1];
  const dark = { thigh: darker(thigh), shin: darker(shin), upper: darker(upper), fore: darker(fore) };
  const legAt = (th: Px, sh: Px, phase: number): Px[] => {
    const angle = o.thigh * Math.cos(phase);
    const bend = o.knee[0] + o.knee[1] * Math.max(0, -Math.sin(phase - 0.35));
    // the shin folds backwards (clockwise when facing right)
    return [turnSteps(sh, [{ angle: -bend, pivot: knee }, { angle, pivot: hip }]), turnSteps(th, [{ angle, pivot: hip }])];
  };
  // the hand comes up as the arm goes forward and opens a little behind
  const bendAt = (swing: number) => o.elbow + 0.7 * swing;
  const armAt = (up: Px, fo: Px, swing: number): Px[] => [
    turnSteps(fo, [{ angle: bendAt(swing), pivot: elbow }, { angle: swing, pivot: shoulder }]),
    turnSteps(up, [{ angle: swing, pivot: shoulder }]),
  ];
  const frames: Px[] = [];
  const hands: XY[] = [];
  for (let i = 0; i < o.frames; i++) {
    const ph = (i / o.frames) * Math.PI * 2;
    const swing = -o.thigh * Math.cos(ph) * o.armSwing;
    const out = blank(w, h);
    const layers = [
      // the far arm mostly behind the body
      ...armAt(dark.upper, dark.fore, -swing * 0.6),
      ...legAt(dark.thigh, dark.shin, ph + Math.PI),
      ...legAt(thigh, shin, ph),
      body,
      ...armAt(upper, fore, swing),
    ];
    for (const layer of layers) over(out, layer);
    const hand = turnPoint(turnPoint(fist, bendAt(swing), elbow), swing, shoulder);
    let low = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (out.d[(y * w + x) * 4 + 3]) low = y;
    const dy = figBottom - low - (o.lift[i] ?? 0);
    const f = blank(w, h);
    over(f, out, dy);
    frames.push(f);
    hands.push([hand[0], hand[1] + dy]);
  }
  return { frames, hands };
}

/**
 * A running frame seen from the front or the back, from a walking frame:
 * the leg that is off the ground comes up higher (its shin drawn shorter, the
 * knee coming towards or away from us), and the whole body bobs.
 */
export function frontRun(p: Px, mid: number, knee: number, extra: number, lift: number, arms?: FrontArms): Px {
  const out = blank(p.w, p.h);
  out.d.set(p.d);
  const bottom = (l: number, r: number) => {
    let b = 0;
    for (let y = knee; y < p.h; y++) for (let x = l; x < r; x++) if (p.d[(y * p.w + x) * 4 + 3]) b = y;
    return b;
  };
  const left = bottom(0, Math.round(mid));
  const right = bottom(Math.round(mid), p.w);
  if (left !== right && extra > 0) {
    const [l, r, b] = left < right ? [0, Math.round(mid), left] : [Math.round(mid), p.w, right];
    const raise = Math.abs(left - right);
    const nb = b - Math.round(extra + raise * 0.6);
    for (let y = knee; y < p.h; y++) for (let x = l; x < r; x++) out.d.fill(0, (y * p.w + x) * 4, (y * p.w + x) * 4 + 4);
    for (let y = knee; y <= nb; y++) {
      const sy = Math.round(knee + ((y - knee) * (b - knee)) / Math.max(1, nb - knee));
      for (let x = l; x < r; x++) if (p.d[(sy * p.w + x) * 4 + 3]) copyPx(out, p, x, y, x, sy);
    }
    // the arm opposite the raised knee pumps up, bent at the elbow; the other swings back
    if (arms) {
      const pumped = left < right ? 1 : -1;
      pumpArm(out, p, mid, pumped, arms, arms.pump, arms.inward);
      pumpArm(out, p, mid, -pumped, arms, arms.back, 0);
    }
  }
  return lifted(out, lift);
}

/** The forearms in a front or back running frame (fractions of the frame height). */
export interface FrontArms {
  /** the elbow and the bottom of the hand */
  elbow: number;
  hand: number;
  /** nothing nearer the middle than this is arm (px) */
  inner: number;
  /** the forearm drawn this much shorter: bent towards us (pumped) or swung back */
  pump: number;
  back: number;
  /** the pumped hand comes this far in, across the body (px) */
  inward: number;
}

/**
 * One forearm (side -1 the left of the picture, 1 the right) drawn shorter,
 * as it looks bent at the elbow towards or away from us, and moved in. Arm
 * pixels in a row are the ones from the outer edge in to the first gap.
 */
function pumpArm(out: Px, p: Px, mid: number, side: number, a: FrontArms, squash: number, inward: number): void {
  const y0 = Math.round(a.elbow * p.h);
  const y1 = Math.round(a.hand * p.h);
  const runs: [number, number][] = [];
  for (let y = y0; y <= y1; y++) {
    let from = -1;
    let to = -1;
    const limit = Math.round(mid + side * a.inner);
    for (let i = 0; ; i++) {
      const x = side < 0 ? i : p.w - 1 - i;
      if (side < 0 ? x > limit : x < limit) break;
      const on = p.d[(y * p.w + x) * 4 + 3] > 0;
      if (on && from < 0) from = x;
      if (from >= 0 && !on) break;
      if (on) to = x;
    }
    runs.push(from < 0 ? [0, -1] : [Math.min(from, to), Math.max(from, to)]);
  }
  runs.forEach(([l, r], k) => {
    for (let x = l; x <= r; x++) out.d.fill(0, ((y0 + k) * p.w + x) * 4, ((y0 + k) * p.w + x) * 4 + 4);
  });
  const ny1 = y0 + Math.round((y1 - y0) * squash);
  for (let y = y0; y <= ny1; y++) {
    const k = Math.min(runs.length - 1, Math.round((y - y0) / squash));
    const [l, r] = runs[k];
    for (let x = l; x <= r; x++) {
      const nx = x - side * inward;
      if (nx >= 0 && nx < p.w) copyPx(out, p, nx, y, x, y0 + k);
    }
  }
}

/** A frame moved `pad` pixels right in a wider frame (room for longer strides). */
export function padded(p: Px, pad: number): Px {
  const o = blank(p.w + pad * 2, p.h);
  for (let y = 0; y < p.h; y++) o.d.set(p.d.subarray(y * p.w * 4, (y + 1) * p.w * 4), (y * o.w + pad) * 4);
  return o;
}

interface SideParts {
  w: number;
  h: number;
  leg: Px;
  body: Px;
  arm: Px;
  hip: XY;
  figBottom: number;
}

/** The standing side frame in layers: the near leg (joined up to the hip
 * under the clothes), the near arm, and the body with the arm taken out. */
function splitSide(stand: Px, band: [number, number, number, number]): SideParts {
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
  return { w, h, leg, body, arm, hip, figBottom };
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

