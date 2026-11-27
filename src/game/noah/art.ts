import Phaser from 'phaser';
import { MANIFEST, assetUrl, shadowKey } from '../manifest';
import { castShadows } from '../world/castShadow';
import { loadCainArt } from '../cain/art';
import { drawFire, drawShadow } from '../cain/drawings';
import { Pixels, ellipse, type RGB } from '../cain/pixels';
import CAIN_GEN from '../../data/cain/generatedArt.json';
import GEN from '../../data/noah/generatedArt.json';
import { groundLine } from '../world/groundLine';
import { dayPixels, NOAH_RAMPS, rampAt, type DayOptions } from './colors';
import { buildNoahPeople, loadNoahPeople } from './people';

/**
 * The Noah chapter's textures, built at runtime in its day palette
 * (colors.ts, from the maintainer's reference picture): the trees (the
 * generated ones of Cain's chapter, in day colours), the props generated
 * for this chapter (the ark and its building stages, the houses of the
 * wicked city, the well, the tent, the axe, the logs, the vines, the food),
 * the raven (the dove, black), the rain and the flood's water.
 */

/** World pixels per art pixel (the characters' art scale). */
export const ART = 0.694444;

type CainGen = keyof typeof CAIN_GEN;
type NoahGen = keyof typeof GEN;

/** The tree ids the world places, and the generated sprite each one is. */
const TREE_ART: Record<string, CainGen> = {
  'oak-1': 'tree-oak-1',
  'oak-2': 'tree-oak-2',
  olive: 'tree-olive',
  young: 'tree-young',
  'oak-small': 'tree-oak-small',
  cypress: 'tree-cypress',
  'cypress-small': 'tree-cypress-small',
  umbrella: 'tree-umbrella',
  fruit: 'tree-fruit',
  'bush-0': 'bush-0',
  'bush-1': 'bush-1',
  'bush-2': 'bush-2',
};

/** Props in stone: the day palette's grey walls (their roofs stay red). */
const STONE_PROPS: NoahGen[] = ['house', 'house-small', 'well', 'town-wall', 'stall', 'rubble'];

/** The ark's building stages (the last is the whole ark). */
export const ARK_STAGES = 5;

/**
 * The ark's lowest opaque row in each column of its sprite (-1: an empty
 * column), measured when its stages are made: the world cuts the ark into
 * strips drawn each at its own foot, and fits its colliders to it.
 */
export const ARK_BASE: number[] = [];

/** Loads the generated sprites (from the scene's preload). */
export function loadNoahArt(scene: Phaser.Scene): void {
  loadCainArt(scene);
  for (const name of Object.keys(GEN)) {
    const key = `noah-gen:${name}`;
    if (!scene.textures.exists(key)) scene.load.image(key, assetUrl(`assets/noah/${name}.png`));
  }
  loadNoahPeople(scene);
}

function pixelsOf(scene: Phaser.Scene, texture: string): Pixels {
  const img = scene.textures.get(texture).getSourceImage() as HTMLImageElement;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const p = new Pixels(img.width, img.height);
  p.data.set(ctx.getImageData(0, 0, img.width, img.height).data);
  return p;
}

function canvasOf(p: Pixels): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = p.w;
  c.height = p.h;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.w, p.h), 0, 0);
  return c;
}

/**
 * A texture from frames of one size side by side, with its manifest entry;
 * `shadow`: it casts its own shadow on the ground (like Eden's props).
 */
function addSheet(scene: Phaser.Scene, key: string, frames: Pixels[], ax: number, ay: number, o: { scale?: number; icon?: boolean; shadow?: boolean; ground?: ArrayLike<number>; under?: [number, number] } = {}): void {
  const w = frames[0].w;
  const h = frames[0].h;
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w * frames.length, h)!;
  const ctx = tex.getContext();
  frames.forEach((f, i) => ctx.putImageData(new ImageData(new Uint8ClampedArray(f.data), f.w, f.h), i * w, 0));
  for (let i = 0; i < frames.length; i++) tex.add(i, 0, i * w, 0, w, h);
  tex.refresh();
  const file = o.icon ? canvasOf(frames[0]).toDataURL() : '';
  MANIFEST.sprites[key] = { file, frameWidth: w, frameHeight: h, frames: frames.length, anchorX: ax, anchorY: ay, scale: o.scale ?? ART };
  if (o.shadow) {
    const [strip, shadow] = castShadows(frames.map((f) => ({ w: f.w, h: f.h, d: f.data })), ax, ay, o.ground, o.under);
    if (scene.textures.exists(shadowKey(key))) scene.textures.remove(shadowKey(key));
    scene.textures.addSpriteSheet(shadowKey(key), strip as unknown as HTMLImageElement, { frameWidth: shadow.frameWidth, frameHeight: shadow.frameHeight });
    MANIFEST.sprites[key].shadow = shadow;
  }
}

/** A generated prop of this chapter, `noah-<name>`. */
function addProp(scene: Phaser.Scene, name: NoahGen, o: { icon?: boolean; sink?: number; centre?: boolean; shadow?: boolean } = {}): void {
  const g = GEN[name];
  const p = pixelsOf(scene, `noah-gen:${name}`);
  if (STONE_PROPS.includes(name)) dayPixels(p.data, { walls: true });
  const ax = o.centre ? Math.round(g.w / 2) : g.ax;
  // seen at a slant, a prop stands on its front walls' feet, not on one row
  const shadow = o.shadow ?? true;
  addSheet(scene, `noah-${name}`, [p], ax, g.ay - (o.sink ?? 1), { icon: o.icon, shadow, ground: shadow ? groundLine(p).ground : undefined });
}

const leafy = (d: Uint8ClampedArray, i: number) => d[i + 3] > 0 && d[i + 1] > d[i] + 2 && d[i + 1] >= d[i + 2];

export interface TreeArt {
  trunk: string;
  crown: string;
  shadow: string;
  w: number;
  h: number;
  ax: number;
  ay: number;
  crownBox: { x: number; y: number; w: number; h: number };
  foot: { w: number; h: number };
}

export const TREES: Record<string, TreeArt> = {};

/**
 * A tree of Cain's generated set in the day palette, split at the lowest
 * row of its crown so the crown can fade when someone walks behind it.
 */
function genTree(scene: Phaser.Scene, id: string, name: CainGen): void {
  const g = CAIN_GEN[name];
  const src = pixelsOf(scene, `cain-gen:${name}`);
  const { w, h, data } = src;
  const bush = id.startsWith('bush');
  let cut = h - 1;
  if (!bush) {
    for (let y = h - 1; y >= 0; y--) {
      let n = 0;
      for (let x = 0; x < w; x++) if (leafy(data, (y * w + x) * 4)) n++;
      if (n >= Math.max(4, w * 0.05)) {
        cut = y;
        break;
      }
    }
  }
  dayPixels(data);
  const trunk = new Pixels(w, h);
  const crown = new Pixels(w, h);
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!data[i + 3]) continue;
      if (y > cut) trunk.data.set(data.subarray(i, i + 4), i);
      if (y <= cut + 2) {
        crown.data.set(data.subarray(i, i + 4), i);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
  }
  let span = 0;
  const fy = Math.max(0, g.ay - 12);
  for (let x = 0; x < w; x++) if (data[(fy * w + x) * 4 + 3]) span++;
  const foot = bush ? { w: Math.round(w * 0.4), h: 10 } : { w: Math.max(10, Math.min(30, Math.round(span * 0.8))), h: 9 };
  const base = `noah-tree-${id}`;
  const ay = g.ay - 2;
  addSheet(scene, `${base}-trunk`, [trunk], g.ax, ay);
  addSheet(scene, `${base}-crown`, [crown], g.ax, ay);
  const crownBox = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  const sw = Math.round(crownBox.w * 0.8);
  const sh = Math.max(14, Math.round(sw * 0.32));
  addSheet(scene, `${base}-shadow`, [drawShadow(sw, sh)], sw / 2, sh / 2);
  TREES[id] = { trunk: `${base}-trunk`, crown: `${base}-crown`, shadow: `${base}-shadow`, w, h, ax: g.ax, ay, crownBox, foot };
}

/**
 * The ark being built, from the finished one (noah-ark-<k>, k < ARK_STAGES - 1):
 * the hull planked up from the keel to a height, and above it only its ribs,
 * dark, as a frame (Genesis 6:14–16).
 */
function arkStages(scene: Phaser.Scene): void {
  const g = GEN.ark;
  const whole = pixelsOf(scene, 'noah-gen:ark');
  const { w, h } = whole;
  const ax = Math.round(w / 2);
  const { ground, under } = groundLine(whole, true);
  ARK_BASE.length = 0;
  for (let x = 0; x < w; x++) {
    let b = -1;
    for (let y = h - 1; y >= 0 && b < 0; y--) if (whole.data[(y * w + x) * 4 + 3] > 40) b = y;
    ARK_BASE.push(b);
  }
  for (let k = 0; k < ARK_STAGES - 1; k++) {
    const p = new Pixels(w, h);
    const level = h - ((k + 1) / ARK_STAGES) * h * 0.92;
    // the ribs reach a little higher at each stage, the cabin last
    const ribTop = Math.max(level - 90 - k * 40, h * 0.42 - k * 40);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (!whole.data[i + 3]) continue;
        if (y >= level) p.data.set(whole.data.subarray(i, i + 4), i);
        else if (y >= ribTop && x % 52 < 6) {
          p.data[i] = whole.data[i] * 0.62;
          p.data[i + 1] = whole.data[i + 1] * 0.6;
          p.data[i + 2] = whole.data[i + 2] * 0.58;
          p.data[i + 3] = 255;
        }
      }
    addSheet(scene, `noah-ark-${k}`, [p], ax, g.ay - 4, { shadow: true, ground, under });
  }
  addSheet(scene, `noah-ark-${ARK_STAGES - 1}`, [whole], ax, g.ay - 4, { shadow: true, ground, under });
}

/**
 * The logs Noah carries in both hands, one to three (noah-log-bundle-<n>):
 * two below and one on top (the maintainer: "collect only 3 logs, all
 * together"). All the same size, held by the same point.
 */
function logBundle(scene: Phaser.Scene): void {
  const log = pixelsOf(scene, 'noah-gen:log');
  const places = [[[13, 21]], [[0, 20], [26, 21]], [[0, 20], [26, 21], [13, 1]]];
  places.forEach((at, n) => logPile(scene, log, at, `noah-log-bundle-${n + 1}`));
}

function logPile(scene: Phaser.Scene, log: Pixels, at: number[][], key: string): void {
  const p = new Pixels(82, 62);
  for (const [ox, oy] of at)
    for (let y = 0; y < log.h; y++)
      for (let x = 0; x < log.w; x++) {
        const i = (y * log.w + x) * 4;
        const X = x + ox;
        const Y = y + oy;
        if (log.data[i + 3] < 128 || X >= p.w || Y >= p.h) continue;
        p.data.set(log.data.subarray(i, i + 4), (Y * p.w + X) * 4);
      }
  addSheet(scene, key, [p], 41, 61, { scale: ART * 0.78 });
}

/** The raven: the dove in black feathers with a blue sheen (Genesis 8:7). */
function buildRaven(scene: Phaser.Scene): void {
  const a = MANIFEST.sprites['animal-dove'];
  if (!a || !scene.textures.exists('animal-dove')) return;
  const p = pixelsOf(scene, 'animal-dove');
  const d = p.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    // the beak and feet (warm) stay dark grey, the feathers near black
    const k = 0.12 + l * 0.32;
    d[i] = 255 * k * 0.8;
    d[i + 1] = 255 * k * 0.85;
    d[i + 2] = 255 * k * 1.15;
  }
  const key = 'noah-raven';
  scene.textures.addSpriteSheet(key, canvasOf(p) as unknown as HTMLImageElement, { frameWidth: a.frameWidth, frameHeight: a.frameHeight });
  if (a.shadow && scene.textures.exists(shadowKey('animal-dove'))) {
    const sh = scene.textures.get(shadowKey('animal-dove')).getSourceImage() as HTMLImageElement;
    scene.textures.addSpriteSheet(shadowKey(key), sh, { frameWidth: a.shadow.frameWidth, frameHeight: a.shadow.frameHeight });
  }
  MANIFEST.sprites[key] = { ...a, scale: (a.scale ?? 1) * 1.15 };
  const fr = (list: number[]) => scene.anims.generateFrameNumbers(key, { frames: list });
  if (a.idle) scene.anims.create({ key: `${key}:idle`, frames: fr(a.idle), frameRate: a.idleFps ?? 1.2, repeat: -1 });
  if (a.walk) scene.anims.create({ key: `${key}:walk`, frames: fr(a.walk), frameRate: a.walkFps ?? 7, repeat: -1 });
  if (a.fly) scene.anims.create({ key: `${key}:fly`, frames: fr(a.fly), frameRate: 8, repeat: -1 });
}

/** A rain streak, a ripple, and a tile of deep water (the flood). */
function weather(scene: Phaser.Scene): void {
  const drop = scene.textures.createCanvas('noah-rain', 3, 26)!;
  const c = drop.getContext();
  const g = c.createLinearGradient(0, 0, 0, 26);
  g.addColorStop(0, 'rgba(190,215,235,0)');
  g.addColorStop(1, 'rgba(200,225,245,0.75)');
  c.fillStyle = g;
  c.fillRect(1, 0, 1, 26);
  drop.refresh();
  // the water of the flood: the picture's blues, in slow swells
  const S = 256;
  const water = scene.textures.createCanvas('noah-water', S, S)!;
  const wc = water.getContext();
  const img = wc.createImageData(S, S);
  const { BLUE } = NOAH_RAMPS;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const t2 = Math.PI * 2;
      const v =
        0.42 +
        0.1 * Math.sin((x / S) * t2 * 2 + Math.sin((y / S) * t2 * 3) * 1.2) +
        0.08 * Math.sin((y / S) * t2 * 5 + (x / S) * t2) +
        0.05 * Math.sin(((x + y) / S) * t2 * 7);
      // a glint on the crests
      const crest = Math.sin((y / S) * t2 * 8 + Math.sin((x / S) * t2 * 2) * 2) > 0.93 ? 0.16 : 0;
      const c3 = rampAt(BLUE, v + crest);
      const i = (y * S + x) * 4;
      img.data[i] = c3[0];
      img.data[i + 1] = c3[1];
      img.data[i + 2] = c3[2];
      img.data[i + 3] = 255;
    }
  wc.putImageData(img, 0, 0);
  water.refresh();
  // a soft white glow, for the spirit of God and the light in the dark
  const glow = scene.textures.createCanvas('noah-glow', 128, 128)!;
  const gc = glow.getContext();
  const rg = gc.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,250,225,0.9)');
  rg.addColorStop(0.35, 'rgba(255,240,200,0.35)');
  rg.addColorStop(1, 'rgba(255,240,200,0)');
  gc.fillStyle = rg;
  gc.fillRect(0, 0, 128, 128);
  glow.refresh();
}

/** Key of the chapter's copy of a shared sprite in its day palette. */
const dayKey = (key: string) => `noah-day-${key}`;

function copyCanvas(src: CanvasImageSource & { width: number; height: number }): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0);
  return c;
}

function dayCanvas(c: HTMLCanvasElement, o: DayOptions = {}): void {
  const ctx = c.getContext('2d')!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  dayPixels(img.data, o);
  ctx.putImageData(img, 0, 0);
}

/** A shared sprite (Eden's rocks, ferns, flowers…) copied into the day palette, with its shadow. */
export function daySprite(scene: Phaser.Scene, key: string, o: DayOptions = {}): string {
  const to = dayKey(key);
  if (scene.textures.exists(to)) return to;
  const a = MANIFEST.sprites[key];
  if (!a || !scene.textures.exists(key)) return key;
  const c = copyCanvas(scene.textures.get(key).getSourceImage() as HTMLImageElement);
  dayCanvas(c, o);
  scene.textures.addSpriteSheet(to, c as unknown as HTMLImageElement, { frameWidth: a.frameWidth, frameHeight: a.frameHeight });
  MANIFEST.sprites[to] = { ...a };
  const sk = shadowKey(key);
  if (a.shadow && scene.textures.exists(sk)) {
    const sh = scene.textures.get(sk).getSourceImage() as HTMLImageElement;
    scene.textures.addSpriteSheet(shadowKey(to), sh, { frameWidth: a.shadow.frameWidth, frameHeight: a.shadow.frameHeight });
  }
  return to;
}

/** The ground tiles (already extruded) in the day palette. */
export function dayTiles(scene: Phaser.Scene, extruded: string): string {
  const to = 'noah-tiles-extruded';
  if (scene.textures.exists(to)) return to;
  const c = copyCanvas(scene.textures.get(extruded).getSourceImage() as HTMLCanvasElement);
  dayCanvas(c, { ground: true });
  scene.textures.addCanvas(to, c);
  return to;
}

let built = false;

/** Everything the chapter draws, once per game. */
export function buildNoahArt(scene: Phaser.Scene): void {
  if (built) return;
  built = true;
  for (const [id, name] of Object.entries(TREE_ART)) genTree(scene, id, name);
  for (const name of STONE_PROPS) addProp(scene, name, { sink: name === 'rubble' ? 3 : 2 });
  for (const name of ['house-mud', 'house-tall', 'house-thatch', 'house-awning'] as const) addProp(scene, name, { sink: 2 });
  addProp(scene, 'tent', { sink: 3 });
  addProp(scene, 'stump', { sink: 3 });
  addProp(scene, 'logs', { sink: 2 });
  addProp(scene, 'planks', { sink: 2 });
  addProp(scene, 'jars', { sink: 2 });
  addProp(scene, 'vine', { sink: 2 });
  addProp(scene, 'vine-bare', { sink: 2 });
  addProp(scene, 'axe', { icon: true, centre: true, shadow: false });
  addProp(scene, 'log', { icon: true, centre: true, shadow: false });
  logBundle(scene);
  addProp(scene, 'sack', { icon: true, sink: 2 });
  addProp(scene, 'hay', { icon: true, sink: 2 });
  addProp(scene, 'olive', { icon: true, centre: true, shadow: false });
  // the altar of stones (Genesis 8:20): Cain's chapter's altar in grey stone
  const alt = pixelsOf(scene, 'cain-gen:altar');
  dayPixels(alt.data, { walls: true });
  addSheet(scene, 'noah-altar', [alt], CAIN_GEN.altar.ax, CAIN_GEN.altar.ay - 2, { shadow: true });
  arkStages(scene);
  buildRaven(scene);
  weather(scene);
  addSheet(scene, 'noah-shadow', [drawShadow(60, 20)], 30, 10);
  // the fire of the burnt offerings (Genesis 8:20)
  const fire = drawFire(2, true);
  addSheet(scene, 'noah-fire', fire.frames, Math.round(fire.ax), Math.round(fire.ay) - 1);
  if (!scene.anims.exists('noah-fire:loop')) scene.anims.create({ key: 'noah-fire:loop', frames: scene.anims.generateFrameNumbers('noah-fire', {}), frameRate: 7, repeat: -1 });
  smallThings(scene);
  buildNoahPeople(scene);
}

/** The garment of Genesis 9:23, the grapes and the wine, drawn in code. */
function smallThings(scene: Phaser.Scene): void {
  const { RED, STRAW, WOOD, LEAVES } = NOAH_RAMPS;
  const c = (r: readonly number[][], i: number) => r[Math.max(0, Math.min(r.length - 1, i))] as RGB;
  // a cloak held between two: a long fold of red cloth with a hem
  const g = new Pixels(30, 11);
  for (let x = 1; x < 29; x++) {
    const sag = Math.round(Math.sin((x / 28) * Math.PI) * 2);
    for (let y = 1 + sag; y < 9 + sag; y++) {
      const fold = Math.sin(x * 0.9) > 0.55 ? -1 : 0;
      g.set(x, y, c(RED, y === 8 + sag ? 2 : 4 + fold - (y > 6 + sag ? 1 : 0)));
    }
    g.set(x, 7 + sag, c(STRAW, 5));
  }
  g.outline(c(RED, 0));
  addSheet(scene, 'noah-garment', [g], 15, 6, { shadow: false });
  // a bunch of grapes on its stem
  const gr = new Pixels(11, 13);
  for (const [x, y] of [[3, 4], [6, 4], [9, 4], [4, 7], [7, 7], [5, 10], [3, 10 - 3], [8, 10 - 3], [6, 12 - 1]] as const)
    ellipse(gr, x - 0.5, y - 0.5, 1.6, 1.6, (_x, _y, nx, ny) => (nx + ny < -0.6 ? [150, 110, 190] : [92, 50, 120]));
  gr.set(5, 0, c(WOOD, 4));
  gr.set(5, 1, c(WOOD, 4));
  gr.set(6, 1, c(LEAVES, 4));
  gr.set(7, 1, c(LEAVES, 4));
  gr.outline([40, 20, 50]);
  addSheet(scene, 'noah-grapes', [gr], 5, 12, { icon: true });
  // a clay jar of wine
  const j = new Pixels(11, 14);
  ellipse(j, 5, 8.5, 4.2, 4.6, (_x, _y, nx) => c(STRAW, nx < -0.3 ? 5 : nx > 0.4 ? 2 : 3));
  for (let y = 1; y < 5; y++) for (let x = 3; x < 8; x++) j.set(x, y, c(STRAW, x === 3 ? 5 : 3));
  for (let x = 2; x < 9; x++) j.set(x, 1, c(STRAW, 6));
  for (let x = 3; x < 8; x++) j.set(x, 0, [92, 30, 60]);
  j.outline(c(WOOD, 1));
  addSheet(scene, 'noah-wine', [j], 5, 13, { icon: true });
}
