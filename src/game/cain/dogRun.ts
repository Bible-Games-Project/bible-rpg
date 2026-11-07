import { Pixels, limb, tone, type RGB } from './pixels';

/**
 * Abel's dog at a gallop (the maintainer: the run did not look right). The
 * body is the generated running pose cut at the belly; the four legs are drawn
 * again for every frame, each in two parts bending at the joint, so they stay
 * clean instead of smearing as turned pixels did. A gallop: the front legs
 * reach forward as the hind legs stretch back (and the dog is off the
 * ground), then all four gather under it; the far leg of each pair a little
 * behind the near one, and darker.
 */
export interface DogRig {
  /** the row (of the pose) the body is cut at */
  belly: number;
  /** the hip and the shoulder, in the pose's pixels */
  hind: [number, number];
  front: [number, number];
  /** from hip to paw */
  len: number;
}

/** Measured on public/assets/cain/dog-1.png: measure again if it is redrawn. */
export const DOG_RIG: DogRig = { belly: 24, hind: [19, 20], front: [50, 20], len: 16 };

/** The running pose drawn bigger (nearest pixel): generated smaller than the
 * standing one, the dog shrank as it ran (the maintainer). */
export const DOG_RUN_SCALE = 1.2;

export function enlarge(p: Pixels, k: number): Pixels {
  const out = new Pixels(Math.round(p.w * k), Math.round(p.h * k));
  for (let y = 0; y < out.h; y++)
    for (let x = 0; x < out.w; x++) {
      const i = (Math.min(p.h - 1, Math.floor(y / k)) * p.w + Math.min(p.w - 1, Math.floor(x / k))) * 4;
      if (p.data[i + 3]) out.data.set(p.data.subarray(i, i + 4), (y * out.w + x) * 4);
    }
  return out;
}

export function scaledRig(r: DogRig, k: number): DogRig {
  const pt = (q: [number, number]): [number, number] => [Math.round(q[0] * k), Math.round(q[1] * k)];
  return { belly: Math.round(r.belly * k), hind: pt(r.hind), front: pt(r.front), len: Math.round(r.len * k) };
}

/** Colours of a part of the pose, darkest first (quantiles of its brightness). */
function sample(p: Pixels, x0: number, y0: number, x1: number, y1: number, keep: (c: RGB) => boolean): RGB[] {
  const all: RGB[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (p.alpha(x, y) > 128 && keep(p.get(x, y))) all.push(p.get(x, y));
  if (!all.length) return [[120, 70, 40]];
  all.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  return [0.1, 0.3, 0.5, 0.7, 0.9].map((q) => all[Math.min(all.length - 1, Math.floor(q * all.length))]);
}

const lum = (c: RGB) => c[0] + c[1] + c[2];
const edge = (c: RGB): RGB => c.map((v) => Math.round(v * 0.62)) as RGB;

/**
 * The run frames, each `w` by `h`, with the pose put at `ox` and the paws on
 * row `ground` (the lowest leg touching it, the body rising off it when the
 * legs reach out).
 */
export function dogGallop(pose: Pixels, rig: DogRig, o: { frames: number; w: number; h: number; ox: number; ground: number; lift: number }): Pixels[] {
  const cream = sample(pose, rig.front[0] - 8, rig.belly, pose.w - 1, pose.h - 1, (c) => lum(c) > 380);
  const brown = sample(pose, rig.hind[0] - 6, rig.belly - 6, rig.hind[0] + 8, rig.belly, (c) => lum(c) <= 380);
  const body = new Pixels(pose.w, pose.h);
  for (let y = 0; y <= rig.belly; y++) for (let x = 0; x < pose.w; x++) if (pose.alpha(x, y)) body.set(x, y, pose.get(x, y), pose.alpha(x, y));
  const L = rig.len;
  // the legs as thick as the pose is big
  const k = L / DOG_RIG.len;
  const frames: Pixels[] = [];
  for (let i = 0; i < o.frames; i++) {
    const ph = (i / o.frames) * Math.PI * 2;
    // one leg: its swing from the vertical (forward +) and how far its lower part folds back
    const leg = (front: boolean, lag: number, far: boolean): Pixels => {
      const q = ph - lag;
      const swing = front ? 0.75 * Math.cos(q) : -0.6 * Math.cos(q);
      // folded while it comes forward, off the ground
      const fold = Math.max(0, front ? -Math.sin(q) : Math.sin(q));
      const [hx, hy] = front ? rig.front : rig.hind;
      const hip: [number, number] = [hx + (far ? -2 : 0), hy];
      const up = front ? swing : swing + 0.45;
      const down = front ? swing - fold * 1.2 : swing * 0.7 - 0.35 - fold * 0.6;
      const a = front ? 0.5 : 0.48;
      const knee: [number, number] = [hip[0] + Math.sin(up) * L * a, hip[1] + Math.cos(up) * L * a];
      const paw: [number, number] = [knee[0] + Math.sin(down) * L * (1 - a), knee[1] + Math.cos(down) * L * (1 - a)];
      const p = new Pixels(pose.w, pose.h + 8);
      const dark = far ? 0.28 : 0;
      if (front) {
        limb(p, hip[0], hip[1], knee[0], knee[1], 6 * k, 5 * k, (x, y, ac) => tone(cream, 0.6 - dark - ac * 0.2, x, y));
        limb(p, knee[0], knee[1], paw[0], paw[1], 5 * k, 4.4 * k, (x, y, ac) => tone(cream, 0.75 - dark - ac * 0.2, x, y));
      } else {
        limb(p, hip[0], hip[1], knee[0], knee[1], 7 * k, 5 * k, (x, y, ac) => tone(brown, 0.55 - dark - ac * 0.25, x, y));
        limb(p, knee[0], knee[1], paw[0], paw[1], 4.6 * k, 4.4 * k, (x, y, ac, t) => tone(t > 0.55 ? cream : brown, 0.6 - dark - ac * 0.2, x, y));
      }
      p.outline(edge(front ? cream[0] : brown[0]));
      return p;
    };
    const fig = new Pixels(pose.w, pose.h + 8);
    // all four come out from under the body
    fig.draw(leg(false, 0.9, true), 0, 0);
    fig.draw(leg(true, 0.9, true), 0, 0);
    fig.draw(leg(false, 0, false), 0, 0);
    fig.draw(leg(true, 0, false), 0, 0);
    fig.draw(body, 0, 0);
    let low = 0;
    for (let y = 0; y < fig.h; y++) for (let x = 0; x < fig.w; x++) if (fig.alpha(x, y)) low = y;
    // off the ground with the legs stretched out
    const rise = Math.round(o.lift * Math.max(0, Math.cos(ph)));
    const f = new Pixels(o.w, o.h);
    f.draw(fig, o.ox, o.ground - low - rise);
    frames.push(f);
  }
  return frames;
}
