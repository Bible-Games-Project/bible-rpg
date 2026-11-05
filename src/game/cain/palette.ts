import Phaser from 'phaser';
import { MANIFEST, shadowKey } from '../manifest';

/**
 * The Cain and Abel chapter's colours: night, in the five colours the
 * maintainer chose (#F8B195 peach, #F67280 coral, #C06C84 mauve, #6C5B7B
 * purple grey, #355C7D blue), their darker and lighter steps, and the warm
 * end as the complement for small things (fruit, flowers, grain) and for
 * the torchlight. Only the world is recoloured, texture by texture, when it
 * is built: the ground, trees, stones and props. The characters, animals
 * and portraits keep their own colours (only dimmed a little at night, in
 * CainScene), like in Eden; the maintainer turned down a filter over the
 * whole screen.
 *
 * Every colour is put on one of the ramps by its kind and then on the ramp
 * by its brightness, so the art keeps its shading:
 *   grass on the ground  night blue (#355C7D)
 *   leaves               indigo, between the blue and the purple grey
 *   earth on the ground  purple grey (#6C5B7B): paths and the field
 *   wood, thatch, clay   mauve to peach (#C06C84, #F8B195)
 *   stone                cool lilac greys
 *   bright colours       coral and peach (#F67280, #F8B195)
 */

type V3 = [number, number, number];
const hex = (h: string): V3 => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as V3;
const ramp = (...c: string[]): V3[] => c.map(hex);

const GRASS = ramp('#121b2e', '#18243b', '#1e2d48', '#253755', '#2c4262', '#344e70', '#3d5b7e', '#4c6a8c');
const LEAVES = ramp('#10121f', '#171a2c', '#1f2339', '#292d48', '#343857', '#414466', '#535475', '#6c6b8c');
const EARTH_GROUND = ramp('#1c1a2b', '#252337', '#2f2c43', '#3a3650', '#46415e', '#524c6b', '#5f5878', '#6e6787');
const EARTH = ramp('#22131e', '#36192b', '#4d2239', '#672e4b', '#843d5f', '#a35472', '#c27486', '#de9c9a');
const STONE = ramp('#181826', '#222234', '#2e2d42', '#3b3950', '#4a465f', '#5b5570', '#706883', '#8a8199');
const ACCENT = ramp('#3a1424', '#6e2338', '#a33a50', '#d8586b', '#F67280', '#F8B195', '#fbd3bd');
const BLUE = ramp('#121b2e', '#1b2a45', '#253a5b', '#2f4a6d', '#355C7D', '#4d7393', '#6a8ba8');

/** How dark shadows are at night (Eden's are 1): very faint (the maintainer). */
export const NIGHT_SHADOW = 0.4;

/** People and animals at night: their own colours, a little dimmer and cooler. */
export const NIGHT_TINT = 0xc4c6e0;

/** The camera's background (beyond the world's edge). */
export const NIGHT_BACKGROUND = '#121a2b';

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

/** One colour (0–255 channels) in the night palette. `ground`: a ground
 * tile (grass and earth on their own ramps, no bright accents). */
export function night(r: number, g: number, b: number, ground = false): V3 {
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
  const bright = ground ? 0 : smooth(0.5, 0.75, sat) * smooth(0.25, 0.45, lum);
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
  if (wLeaves) onRamp(ground ? GRASS : LEAVES, t, out, wLeaves);
  if (wEarth) onRamp(ground ? EARTH_GROUND : EARTH, ground ? t : t * 0.92, out, wEarth);
  if (wAccent) onRamp(ACCENT, t, out, wAccent);
  if (wBlue) onRamp(BLUE, t, out, wBlue);
  if (grey) onRamp(STONE, t, out, grey);
  return out;
}

/** Recolour RGBA pixels in place. */
export function nightPixels(d: Uint8ClampedArray | Uint8Array | number[], ground = false): void {
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const c = night(d[i], d[i + 1], d[i + 2], ground);
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
  }
}

function nightCanvas(c: HTMLCanvasElement, ground = false): void {
  const ctx = c.getContext('2d')!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  nightPixels(img.data, ground);
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

/** Key of the chapter's copy of a shared sprite (`nightSprite`). */
export const sun = (key: string) => `cain-night-${key}`;

/**
 * A copy of a shared sprite (Eden's rocks, ferns, the log…) in the night
 * palette, under `sun(key)`, with the same frames, size and shadow. Eden's
 * own texture is left as it is.
 */
export function nightSprite(scene: Phaser.Scene, key: string): string {
  const to = sun(key);
  if (scene.textures.exists(to)) return to;
  const a = MANIFEST.sprites[key];
  if (!a || !scene.textures.exists(key)) return key;
  const c = copyCanvas(scene.textures.get(key).getSourceImage() as HTMLImageElement);
  nightCanvas(c);
  scene.textures.addSpriteSheet(to, c as unknown as HTMLImageElement, { frameWidth: a.frameWidth, frameHeight: a.frameHeight });
  MANIFEST.sprites[to] = { ...a };
  const sk = shadowKey(key);
  if (a.shadow && scene.textures.exists(sk)) {
    const sh = scene.textures.get(sk).getSourceImage() as HTMLImageElement;
    scene.textures.addSpriteSheet(shadowKey(to), sh, { frameWidth: a.shadow.frameWidth, frameHeight: a.shadow.frameHeight });
  }
  return to;
}

/** The ground tiles (already extruded, see Terrain.extrudedTiles) in the night palette. */
export function nightTiles(scene: Phaser.Scene, extruded: string): string {
  const to = 'cain-tiles-extruded';
  if (scene.textures.exists(to)) return to;
  const c = copyCanvas(scene.textures.get(extruded).getSourceImage() as HTMLCanvasElement);
  nightCanvas(c, true);
  scene.textures.addCanvas(to, c);
  return to;
}
