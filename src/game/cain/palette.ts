import Phaser from 'phaser';
import { MANIFEST, shadowKey } from '../manifest';

/**
 * The Cain and Abel chapter's colours: a sunset (the maintainer sent a dusk
 * scene as a palette reference: plum shadows, mauve and rose, peach and
 * cream lights, with warm orange as the complement). Only the world is
 * recoloured, texture by texture, when it is built: the ground, trees,
 * stones and props. The characters (Cain, Abel, Adam, Eve, God), the
 * animals and the portraits keep their own colours, like in Eden (the
 * maintainer turned down an earlier filter over the whole screen).
 *
 * Every colour is put on one of five ramps by its kind and then on the ramp
 * by its brightness, so the art keeps its shading:
 *   leaves and grass  plum, mauve, rose
 *   earth and wood    maroon, terracotta, peach, cream
 *   stone             lilac greys
 *   bright colours    the complement: red, orange, gold (fruit, flowers)
 *   blues             violet
 */

type V3 = [number, number, number];
const hex = (h: string): V3 => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as V3;
const ramp = (...c: string[]): V3[] => c.map(hex);

const LEAVES = ramp('#1a0a22', '#2c1030', '#43183a', '#5e2443', '#7d334f', '#9f4a5e', '#c26a72', '#e3958a');
const EARTH = ramp('#2a1020', '#4a1f2e', '#6e3438', '#94503f', '#b8714c', '#d69563', '#ecba84', '#f9dcaa');
const STONE = ramp('#1f1226', '#352238', '#4e344b', '#6a4a5f', '#876378', '#a68192', '#c5a3ae', '#e2c7c8');
const ACCENT = ramp('#3d0f1e', '#7a1f28', '#b8392f', '#e0663a', '#f3954a', '#fbc46a', '#fde6a4');
const BLUE = ramp('#1d1430', '#2f2150', '#4a3570', '#6a4f8e', '#8f73ad', '#b59cc9', '#dcc8e3');

/** The camera's background (beyond the world's edge). */
export const SUNSET_BACKGROUND = '#2c1030';

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

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Distance between two hues (degrees), 0–180. */
const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};
/** How much a hue belongs to a band centred on `c` with half-width `w`. */
const band = (h: number, c: number, w: number) => 1 - smooth(w * 0.6, w, hueGap(h, c));

const out: V3 = [0, 0, 0];

/** One colour (0–255 channels) in the sunset palette. */
export function sunset(r: number, g: number, b: number): V3 {
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
  const grey = 1 - smooth(0.08, 0.24, sat);
  const leaves = Math.max(band(h, 115, 70), 0);
  const blue = band(h, 225, 60);
  const warm = band(h, 32, 32);
  const red = Math.max(band(h, 0, 22), band(h, 330, 30));
  // saturated warm colours (fruit, flowers, fire) take the complement
  const bright = smooth(0.5, 0.75, sat) * smooth(0.25, 0.45, lum);
  let wLeaves = leaves;
  let wEarth = warm * (1 - bright);
  let wAccent = red + warm * bright;
  let wBlue = blue;
  const coloured = wLeaves + wEarth + wAccent + wBlue || 1;
  wLeaves = (wLeaves / coloured) * (1 - grey);
  wEarth = (wEarth / coloured) * (1 - grey);
  wAccent = (wAccent / coloured) * (1 - grey);
  wBlue = (wBlue / coloured) * (1 - grey);
  const t = Math.pow(lum, 0.92);
  out[0] = out[1] = out[2] = 0;
  if (wLeaves) onRamp(LEAVES, t, out, wLeaves);
  if (wEarth) onRamp(EARTH, t, out, wEarth);
  if (wAccent) onRamp(ACCENT, t, out, wAccent);
  if (wBlue) onRamp(BLUE, t, out, wBlue);
  if (grey) onRamp(STONE, t, out, grey);
  return out;
}

/** Recolour RGBA pixels in place. */
export function sunsetPixels(d: Uint8ClampedArray | Uint8Array | number[]): void {
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const c = sunset(d[i], d[i + 1], d[i + 2]);
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
  }
}

function sunsetCanvas(c: HTMLCanvasElement): void {
  const ctx = c.getContext('2d')!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  sunsetPixels(img.data);
  ctx.putImageData(img, 0, 0);
}

function copyCanvas(src: CanvasImageSource & { width: number; height: number }): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0);
  return c;
}

/** Key of the chapter's copy of a shared sprite (`sunsetSprite`). */
export const sun = (key: string) => `cain-sun-${key}`;

/**
 * A copy of a shared sprite (Eden's rocks, ferns, the log…) in the sunset
 * palette, under `sun(key)`, with the same frames, size and shadow. Eden's
 * own texture is left as it is.
 */
export function sunsetSprite(scene: Phaser.Scene, key: string): string {
  const to = sun(key);
  if (scene.textures.exists(to)) return to;
  const a = MANIFEST.sprites[key];
  if (!a || !scene.textures.exists(key)) return key;
  const c = copyCanvas(scene.textures.get(key).getSourceImage() as HTMLImageElement);
  sunsetCanvas(c);
  scene.textures.addSpriteSheet(to, c as unknown as HTMLImageElement, { frameWidth: a.frameWidth, frameHeight: a.frameHeight });
  MANIFEST.sprites[to] = { ...a };
  const sk = shadowKey(key);
  if (a.shadow && scene.textures.exists(sk)) {
    const sh = scene.textures.get(sk).getSourceImage() as HTMLImageElement;
    scene.textures.addSpriteSheet(shadowKey(to), sh, { frameWidth: a.shadow.frameWidth, frameHeight: a.shadow.frameHeight });
  }
  return to;
}

/** The ground tiles (already extruded, see Terrain.extrudedTiles) in the sunset palette. */
export function sunsetTiles(scene: Phaser.Scene, extruded: string): string {
  const to = 'cain-tiles-extruded';
  if (scene.textures.exists(to)) return to;
  const c = copyCanvas(scene.textures.get(extruded).getSourceImage() as HTMLCanvasElement);
  sunsetCanvas(c);
  scene.textures.addCanvas(to, c);
  return to;
}
