/**
 * Noah's chapter's colours (pure functions, no Phaser: tools can preview
 * them). The maintainer's reference picture (Paleta_Noe.jpg), taken only for
 * its colours: a navy night-blue background, deep to bright greens, red
 * roofs, grey stone walls, sandy flagstone paths with brown cracks, blue
 * water, dark rocks, brown wood and red flowers. Day, not night: the art is
 * put on these ramps by the kind of colour it is and then by its light, so
 * it keeps its shading (as cain/palette.ts does for the night).
 */

export type V3 = [number, number, number];
const hex = (h: string): V3 => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as V3;
const ramp = (...c: string[]): V3[] => c.map(hex);

/** grass on the ground: the picture's three greens and their steps */
const GRASS = ramp('#22401a', '#2b4d1e', '#335a22', '#3f6e2a', '#4b7d2d', '#5a8f30', '#6aa136', '#7cb342', '#94c75c');
/** leaves: the same greens, deeper in the shade */
const LEAVES = ramp('#0f1c0c', '#162a10', '#1f3a15', '#2a4c1b', '#3f6e2a', '#4e8030', '#5a8f30', '#6ea43a', '#8cc252', '#a8d670');
/** the paths: sandy flagstones, their cracks brown */
const SAND = ramp('#6e4226', '#8a5432', '#a0663c', '#b98252', '#d4a574', '#e0b886', '#e8c99a', '#f2dcb6');
/** wood: trunks, beams, the ark */
const WOOD = ramp('#1e0f06', '#2e170a', '#3e2210', '#52301a', '#6b3a20', '#7e4a2c', '#8a5030', '#a06a44');
/** straw, grain, thatch: warm sand */
const STRAW = ramp('#3a2614', '#5a3c1e', '#7c5630', '#a07448', '#c49464', '#d4a574', '#e8c99a', '#f6e4c4');
/** stone: walls and rocks, from the dark rocks to the light walls */
const STONE = ramp('#1c1f25', '#2c3038', '#40444c', '#565b63', '#70767e', '#8a9098', '#9aa0a8', '#b2b7be', '#c8ccd0', '#e4e6e8');
/** red: roofs and flowers */
const RED = ramp('#3a0a08', '#5e1410', '#861e18', '#a82620', '#c0302a', '#e04a3a', '#f07a60', '#f8b4a0');
/** water and blue things */
const BLUE = ramp('#0c1e30', '#14324c', '#1e4a6a', '#2e6a8e', '#4a8ab0', '#72a8cc', '#a6cce4');

export const NOAH_RAMPS = { GRASS, LEAVES, SAND, WOOD, STRAW, STONE, RED, BLUE } as const;

/** The camera's background: the grass's average, so no seam shows between tiles. */
export const DAY_BACKGROUND = '#4b7d2d';
/** the picture's navy, for the sky over the flood and the black between scenes */
export const NAVY = '#1a2a3a';

function onRamp(stops: V3[], t: number, out: V3, w: number): void {
  const n = stops.length - 1;
  const x = Math.max(0, Math.min(1, t)) * n;
  const i = Math.min(n - 1, Math.floor(x));
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  out[0] += (a[0] + (b[0] - a[0]) * f) * w;
  out[1] += (a[1] + (b[1] - a[1]) * f) * w;
  out[2] += (a[2] + (b[2] - a[2]) * f) * w;
}

/** The colour at `t` (0–1) along a ramp. */
export function rampAt(stops: V3[], t: number): V3 {
  const o: V3 = [0, 0, 0];
  onRamp(stops, t, o, 1);
  return [Math.round(o[0]), Math.round(o[1]), Math.round(o[2])];
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};
const band = (h: number, c: number, w: number) => 1 - smooth(w * 0.6, w, hueGap(h, c));

export interface DayOptions {
  /** a ground tile: green on the grass ramp, earth on the sand */
  ground?: boolean;
  /** straw and thatch become red roof tiles (the houses' roofs) */
  roofs?: boolean;
  /** pale earth and straw become grey stone (walls, altars); saturated wood stays wood */
  walls?: boolean;
}

const out: V3 = [0, 0, 0];

/** One colour (0–255 channels) in the chapter's palette. */
export function day(r: number, g: number, b: number, o: DayOptions = {}): V3 {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const sat = mx ? (mx - mn) / mx : 0;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  let h = 0;
  if (mx !== mn) {
    const d = mx - mn;
    if (mx === r) h = ((g - b) / d) * 60;
    else if (mx === g) h = ((b - r) / d) * 60 + 120;
    else h = ((r - g) / d) * 60 + 240;
    if (h < 0) h += 360;
  }
  const grey = 1 - smooth(0.06, 0.2, sat);
  // on walls, the greyish greens of the mortar are stone too, not moss
  const leafy = band(h, 110, 62);
  const mossy = o.walls ? 1 - smooth(0.22, 0.4, sat) : 0;
  const leaves = leafy * (1 - mossy);
  const blue = band(h, 215, 55);
  const warm = band(h, 18, 16);
  const straw = band(h, 40, 18);
  const red = Math.max(band(h, 0, 16), band(h, 335, 28));
  // saturated warm things (fruit, flowers) stay bright red
  const bright = o.ground ? 0 : smooth(0.5, 0.75, sat) * smooth(0.25, 0.45, lum);
  const stone = o.walls ? 1 - smooth(0.32, 0.48, sat) : 0;
  const w = { leaves, earth: warm * (1 - bright) * (1 - stone), straw: straw * (1 - stone), red: red + warm * bright, blue, stone: (warm + straw) * stone + leafy * mossy };
  const sum = w.leaves + w.earth + w.straw + w.red + w.blue + w.stone || 1;
  const k = (1 - grey) / sum;
  const t = Math.pow(lum, 0.95);
  out[0] = out[1] = out[2] = 0;
  if (w.leaves) onRamp(o.ground ? GRASS : LEAVES, o.ground ? t * 1.05 : t, out, w.leaves * k);
  if (w.earth) onRamp(o.ground ? SAND : WOOD, o.ground ? t * 1.15 : t * 0.88, out, w.earth * k);
  if (w.straw) onRamp(o.roofs ? RED : o.ground ? SAND : STRAW, o.roofs ? t * 0.95 : t * 1.05, out, w.straw * k);
  if (w.red) onRamp(RED, t, out, w.red * k);
  if (w.blue) onRamp(BLUE, t, out, w.blue * k);
  if (w.stone) onRamp(STONE, t * 1.1, out, w.stone * k);
  if (grey) onRamp(STONE, t * 1.05, out, grey);
  return out;
}

/** Recolour RGBA pixels in place. */
export function dayPixels(d: Uint8ClampedArray | Uint8Array | number[], o: DayOptions = {}): void {
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const c = day(d[i], d[i + 1], d[i + 2], o);
    d[i] = Math.round(c[0]);
    d[i + 1] = Math.round(c[1]);
    d[i + 2] = Math.round(c[2]);
  }
}
