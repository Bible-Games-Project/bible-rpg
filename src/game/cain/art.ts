import Phaser from 'phaser';
import { MANIFEST, assetUrl, charKey, shadowKey, type Direction, type PortraitAsset, type SheetAsset } from '../manifest';
import { Pixels, ramp, type RGB } from './pixels';
import { DOG_RIG, DOG_RUN_SCALE, dogGallop, enlarge, scaledRig } from './dogRun';
import { drawAnger, drawCainBasket, drawFat, drawFire, drawKnife, drawShadow, type Drawing } from './drawings';
import { nightPixels } from './palette';
import GEN from '../../data/cain/generatedArt.json';

/**
 * Builds the Cain and Abel chapter's textures at runtime: the new trees and
 * props (painted in drawings.ts), Cain and Abel (Adam's sprite in the tunic
 * God made, recoloured: Cain darker with black hair, Abel lighter), Adam
 * sitting on a log, the lambs, and the dialogue portraits mapped to the
 * chapter's palette. Every texture is listed in the manifest like the art
 * files, so the shared code (sizes, anchors, shadows, HUD icons) handles
 * them the same way.
 */

/** World pixels per art pixel (the characters' art scale). */
export const ART = 0.694444;

type GenName = keyof typeof GEN;

/**
 * The world's trees and props come from the generated sheets
 * (art/generated/cain-*, cut by tools/art/cain_ingest.mjs into
 * public/assets/cain/): the tree ids the world places, and the sprite each
 * one is.
 */
const TREE_ART: Record<string, GenName> = {
  'oak-1': 'tree-oak-1',
  'oak-2': 'tree-oak-2',
  'oak-9': 'tree-olive',
  'oakSmall-3': 'tree-young',
  'oakSmall-11': 'tree-oak-small',
  'cypress-5': 'tree-cypress',
  'cypress-12': 'tree-cypress-small',
  'umbrella-4': 'tree-umbrella',
  'fruit-6': 'tree-fruit',
  'bush-7': 'bush-0',
  'bush-8': 'bush-1',
  'bush-13': 'bush-2',
};

/** Loads the generated sprites (from the scene's preload). */
export function loadCainArt(scene: Phaser.Scene): void {
  for (const name of Object.keys(GEN)) {
    const key = `cain-gen:${name}`;
    if (!scene.textures.exists(key)) scene.load.image(key, assetUrl(`assets/cain/${name}.png`));
  }
}

/** A generated sprite's pixels (a fresh copy), mirrored if asked. */
function gen(scene: Phaser.Scene, name: GenName, mirror = false): Pixels {
  const img = scene.textures.get(`cain-gen:${name}`).getSourceImage() as HTMLImageElement;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d')!;
  if (mirror) ctx.setTransform(-1, 0, 0, 1, img.width, 0);
  ctx.drawImage(img, 0, 0);
  const p = new Pixels(img.width, img.height);
  p.data.set(ctx.getImageData(0, 0, img.width, img.height).data);
  return p;
}

/** A generated prop with its base point (sunk `sink` px into the ground). */
function addGen(scene: Phaser.Scene, key: string, name: GenName, o: { mirror?: boolean; icon?: boolean; sink?: number; centre?: boolean; wood?: boolean; tone?: RGB[] } = {}): void {
  const g = GEN[name];
  const p = gen(scene, name, o.mirror);
  const tone = o.tone ?? (o.wood ? WOOD : undefined);
  if (tone) onTone(p, tone);
  const ax = o.mirror ? g.w - 1 - g.ax : g.ax;
  addSheet(scene, key, [p], o.centre ? g.w / 2 : ax, o.centre ? g.h / 2 : g.ay - (o.sink ?? 1), ART, o.icon, !!tone);
}

/** plain brown wood, as the knife's haft and the brothers' tunics (the maintainer: Abel's staff came out pink in the night palette) */
const WOOD = ramp('#22160f', '#3a271a', '#543a26', '#6d4e33', '#876443', '#a07c55');

/**
 * The chapter's base colour (the maintainer chose it: the rosy brown of the
 * paths, the trunks' mauve as it shows at night), dark to light, in one hue.
 * Props drawn in it (`tone`): the furrows, the greens in the field and
 * Adam and Eve's house. Without `tone` they took the night palette like
 * the rest (palette.ts), as they did before 2026-11-09.
 */
const BASE = ramp('#140e0f', '#1e1518', '#281c1f', '#342429', '#402b32', '#4c343b', '#5a3d46', '#6b4853', '#7d5863', '#916875', '#a77c89', '#bf919e', '#d8a8b6');
/** the furrows: the path's colour, darker in the grooves */
const FURROW_TONE = BASE.slice(1, 8);
/** the greens in the field: the same, lighter (the maintainer) */
const GREENS_TONE = BASE.slice(6, 13);
/** the house: the whole ramp, so the thatch and the stones keep their light and shade */
const HOUSE_TONE = BASE.slice(1, 13);

/** A generated prop in one colour ramp (wood, the base colour…), kept by its light and shade, in those colours at night. */
function onTone(p: Pixels, tone: RGB[]): void {
  const d = p.data;
  let lo = 255;
  let hi = 0;
  const lum = (i: number) => 0.3 * d[i] + 0.55 * d[i + 1] + 0.15 * d[i + 2];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) [lo, hi] = [Math.min(lo, lum(i)), Math.max(hi, lum(i))];
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const k = (lum(i) - lo) / Math.max(1, hi - lo);
    const c = tone[Math.min(tone.length - 1, Math.round(k * (tone.length - 1)))];
    [d[i], d[i + 1], d[i + 2]] = c;
  }
}

const leafy = (d: Uint8ClampedArray, i: number) => d[i + 3] > 0 && d[i + 1] > d[i] + 2 && d[i + 1] >= d[i + 2];
const fruity = (d: Uint8ClampedArray, i: number) => d[i + 3] > 0 && d[i] > d[i + 1] + 50 && d[i] > d[i + 2] + 40;

/**
 * A generated tree split at the lowest row of its crown (the crown keeps two
 * trunk rows so no seam shows), so that the crown can fade when someone is
 * behind it. A fruit tree also gets its crown without the fruit (picked).
 */
function genTree(scene: Phaser.Scene, id: string, name: GenName): void {
  const g = GEN[name];
  const src = gen(scene, name);
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
  let bare: Pixels | undefined;
  if (id.startsWith('fruit')) {
    bare = new Pixels(w, h);
    bare.data.set(crown.data);
    // the fruit painted out with the leaves around it
    const d = bare.data;
    for (let pass = 0; pass < 12; pass++) {
      const fill: [number, number][] = [];
      for (let i = 0; i < d.length; i += 4) {
        if (!fruity(d, i)) continue;
        for (const j of [i - 4, i + 4, i - w * 4, i + w * 4, i - w * 4 - 4, i + w * 4 + 4]) {
          if (j >= 0 && j < d.length && d[j + 3] && !fruity(d, j)) {
            fill.push([i, j]);
            break;
          }
        }
      }
      for (const [i, j] of fill) d.copyWithin(i, j, j + 4);
    }
    for (let i = 0; i < d.length; i += 4) if (fruity(d, i)) d.set([60, 110, 40], i);
  }
  // the trunk's width a little above the roots: the collider
  let span = 0;
  const fy = Math.max(0, g.ay - 12);
  for (let x = 0; x < w; x++) if (data[(fy * w + x) * 4 + 3]) span++;
  const foot = bush ? { w: Math.round(w * 0.4), h: 10 } : { w: Math.max(10, Math.min(30, Math.round(span * 0.8))), h: 9 };
  const base = `cain-tree-${id}`;
  const ay = g.ay - 2;
  addSheet(scene, `${base}-trunk`, [trunk], g.ax, ay);
  addSheet(scene, `${base}-crown`, [crown], g.ax, ay);
  if (bare) addSheet(scene, `${base}-bare`, [bare], g.ax, ay);
  const crownBox = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  const sw = Math.round(crownBox.w * 0.8);
  const sh = Math.max(14, Math.round(sw * 0.32));
  addSheet(scene, `${base}-shadow`, [drawShadow(sw, sh)], sw / 2, sh / 2);
  TREES[id] = { trunk: `${base}-trunk`, crown: `${base}-crown`, bare: bare ? `${base}-bare` : undefined, shadow: `${base}-shadow`, w, h, ax: g.ax, ay, crownBox, foot };
}

/**
 * Abel's sheepdog from its two generated poses (standing, trotting), on
 * frames of one size with the feet on the same row. Frames 0–1: idle (the
 * second breathing: the body a pixel higher). Frames 2–9: a gallop made from
 * the running pose (dogGallop() in dogRun.ts: the legs drawn again, bending,
 * reaching out and gathering in turn, the body off the ground as they reach).
 */
const DOG_TROT_FRAMES = 8;
function genDog(scene: Phaser.Scene): void {
  const poses = (['dog-0', 'dog-1'] as const).map((n) => ({ p: gen(scene, n), g: GEN[n] }));
  const SWING = 9;
  const runPose = enlarge(poses[1].p, DOG_RUN_SCALE);
  const W = Math.max(poses[0].g.w, runPose.w) + SWING * 2 + 2;
  const AY = Math.max(...poses.map((q) => q.g.ay)) + 2;
  const H = AY + 2;
  const AX = Math.round(W / 2);
  const legsOf = (p: Pixels, footY: number) => {
    // the belly: going up from the feet, the first row as wide as the body
    const count = (y: number) => {
      let n = 0;
      for (let x = 0; x < p.w; x++) if (p.data[(y * p.w + x) * 4 + 3]) n++;
      return n;
    };
    let max = 0;
    for (let y = 0; y < p.h; y++) max = Math.max(max, count(y));
    let belly = footY;
    while (belly > 0 && count(belly) < max * 0.45) belly--;
    let x0 = p.w;
    let x1 = 0;
    for (let x = 0; x < p.w; x++) if (p.data[(belly * p.w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    return { belly, mid: (x0 + x1) / 2 };
  };
  const frame = (k: number, phase: number | null, lift: number) => {
    const { p, g } = poses[k];
    const { belly, mid } = legsOf(p, g.ay);
    const f = new Pixels(W, H);
    const ox = AX - g.ax;
    const oy = AY - g.ay;
    const put = (x: number, y: number, tx: number, ty: number) => {
      const i = (y * p.w + x) * 4;
      if (!p.data[i + 3] || tx < 0 || ty < 0 || tx >= W || ty >= H) return;
      f.data.set(p.data.subarray(i, i + 4), (ty * W + tx) * 4);
    };
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        if (y <= belly) {
          put(x, y, x + ox, y + oy - lift);
          continue;
        }
        // a leg: swung from the hip; drawn at the lifted height too, so the
        // body never comes away from it
        const t = (y - belly) / Math.max(1, g.ay - belly);
        const s = phase === null ? 0 : Math.sin(phase + (x > mid ? 0 : Math.PI));
        const dx = Math.round(SWING * t * s);
        put(x, y, x + ox + dx, y + oy);
        for (let l = 1; l <= lift; l++) put(x, y, x + ox + dx, y + oy - l);
      }
    }
    return f;
  };
  const frames = [frame(0, null, 0), frame(0, null, 1)];
  // the run: a gallop, the legs drawn again on the running pose (see dogRun.ts)
  frames.push(...dogGallop(runPose, scaledRig(DOG_RIG, DOG_RUN_SCALE), { frames: DOG_TROT_FRAMES, w: W, h: H, ox: AX - Math.round(poses[1].g.ax * DOG_RUN_SCALE), ground: AY, lift: 2 }));
  addSheet(scene, 'cain-dog', frames, AX, AY - 1, ART, false, true);
}

export interface TreeArt {
  trunk: string;
  crown: string;
  bare?: string;
  shadow: string;
  /** in art pixels */
  w: number;
  h: number;
  ax: number;
  ay: number;
  crownBox: { x: number; y: number; w: number; h: number };
  foot: { w: number; h: number };
}

export const TREES: Record<string, TreeArt> = {};

let built = false;

function canvasOf(p: Pixels): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = p.w;
  c.height = p.h;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.w, p.h), 0, 0);
  return c;
}

/** A texture from frames of the same size, side by side, with its manifest
 * entry; in the chapter's night palette unless `natural` (fire, emotes). */
function addSheet(scene: Phaser.Scene, key: string, frames: Pixels[], ax: number, ay: number, scale = ART, icon = false, natural = false): void {
  if (!natural) for (const f of frames) nightPixels(f.data);
  const w = frames[0].w;
  const h = frames[0].h;
  const tex = scene.textures.createCanvas(key, w * frames.length, h)!;
  const ctx = tex.getContext();
  frames.forEach((f, i) => ctx.putImageData(new ImageData(new Uint8ClampedArray(f.data), f.w, f.h), i * w, 0));
  for (let i = 0; i < frames.length; i++) tex.add(i, 0, i * w, 0, w, h);
  tex.refresh();
  // HUD icons are <img> elements: they need a URL
  const file = icon ? canvasOf(frames[0]).toDataURL() : '';
  MANIFEST.sprites[key] = { file, frameWidth: w, frameHeight: h, frames: frames.length, anchorX: ax, anchorY: ay, scale };
}

function addDrawing(scene: Phaser.Scene, key: string, d: Drawing, icon = false, natural = false): void {
  addSheet(scene, key, d.frames, Math.round(d.ax), Math.round(d.ay) - 1, ART, icon, natural);
}

function loop(scene: Phaser.Scene, key: string, fps: number): void {
  if (!scene.anims.exists(`${key}:loop`)) scene.anims.create({ key: `${key}:loop`, frames: scene.anims.generateFrameNumbers(key, {}), frameRate: fps, repeat: -1 });
}

/** Everything the chapter draws, once per game. */
export function buildCainArt(scene: Phaser.Scene): void {
  if (built) return;
  built = true;
  // trees and props: the generated art
  for (const [id, name] of Object.entries(TREE_ART)) genTree(scene, id, name);
  addGen(scene, 'cain-hut', 'hut', { sink: 3, tone: HOUSE_TONE });
  addGen(scene, 'cain-altar', 'altar', { sink: 2 });
  addGen(scene, 'cain-altar-b', 'altar-b', { sink: 2 });
  for (let i = 0; i < 3; i++) addGen(scene, `cain-wall-${i}`, `wall-${i}` as GenName, { sink: 2 });
  addGen(scene, 'cain-log', 'log', { sink: 2 });
  addHearth(scene);
  addDrawing(scene, 'cain-fire', drawFire(4), false, true);
  addDrawing(scene, 'cain-fire-big', drawFire(2, true), false, true);
  addDrawing(scene, 'cain-flame', drawFire(4, false, false), false, true);
  addGen(scene, 'cain-torch', 'torch');
  torchLight(scene);
  loop(scene, 'cain-fire', 8);
  loop(scene, 'cain-flame', 9);
  loop(scene, 'cain-fire-big', 7);
  for (let i = 0; i < 3; i++) addGen(scene, `cain-furrow-${i}`, 'furrow', { mirror: i === 1, centre: true, tone: FURROW_TONE });
  for (let i = 0; i < 3; i++) {
    addGen(scene, `cain-wheat-${i}`, i === 1 ? 'wheat-1' : 'wheat-0', { mirror: i === 2 });
    addGen(scene, `cain-wheat-${i}-reaped`, 'stubble', { mirror: i === 1 });
    addGen(scene, `cain-greens-${i}`, `greens-${i}` as GenName, { tone: GREENS_TONE });
  }
  addGen(scene, 'cain-gourds', 'gourds', { sink: 2 });
  addGen(scene, 'cain-gourds-picked', 'gourds-picked', { sink: 2 });
  addGen(scene, 'cain-jawbone', 'jawbone', { icon: true, sink: 2 });
  // in its own colours, like the basket of produce (at night it was lost on the stone)
  addDrawing(scene, 'cain-fat', drawFat(), true, true);
  addDrawing(scene, 'cain-basket', drawCainBasket(), true, true);
  addDrawing(scene, 'cain-knife', drawKnife(), false, true);
  addGen(scene, 'cain-staff', 'staff', { wood: true });
  addGen(scene, 'cain-grave', 'grave');
  // Abel's sheepdog: its own colours, like the sheep (dimmed at night in CainScene)
  genDog(scene);
  scene.anims.create({ key: 'cain-dog:idle', frames: scene.anims.generateFrameNumbers('cain-dog', { frames: [0, 1] }), frameRate: 1.6, repeat: -1 });
  scene.anims.create({ key: 'cain-dog:walk', frames: scene.anims.generateFrameNumbers('cain-dog', { start: 2, end: 1 + DOG_TROT_FRAMES }), frameRate: 14, repeat: -1 });
  addSheet(scene, 'cain-shadow', [drawShadow(60, 20)], 30, 10);
  // the anger over Cain's head is drawn at world size, like the other emotes
  addSheet(scene, 'emote-anger', [drawAnger()], 15, 22, 0.85, false, true);
  buildBrothers(scene);
  buildLamb(scene);
  buildSittingAdam(scene);
}

/** The hearth: its stones and pot in the night colours, the embers glowing as they are. */
function addHearth(scene: Phaser.Scene): void {
  const g = GEN.hearth;
  const p = gen(scene, 'hearth');
  const glow = new Map<number, number[]>();
  const d = p.data;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] > 170 && d[i] > d[i + 1] + 50 && d[i + 2] < 120) glow.set(i, [d[i], d[i + 1], d[i + 2]]);
  nightPixels(d);
  for (const [i, c] of glow) d.set(c, i);
  addSheet(scene, 'cain-hearth', [p], g.ax, g.ay - 2, ART, false, true);
}

/** The warm pool of light around a torch (added over the world). */
function torchLight(scene: Phaser.Scene): void {
  const s = 420;
  const tex = scene.textures.createCanvas('cain-torch-light', s, s)!;
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  // warm (much more red than blue), so that added over the night blue it
  // reads as firelight and not as a pale fog
  g.addColorStop(0, 'rgba(255,150,80,0.4)');
  g.addColorStop(0.2, 'rgba(252,128,84,0.26)');
  g.addColorStop(0.5, 'rgba(246,104,96,0.09)');
  g.addColorStop(0.8, 'rgba(200,90,110,0.02)');
  g.addColorStop(1, 'rgba(200,90,110,0)');
  ctx.fillStyle = g;
  // flattened like the ground seen from above at an angle
  ctx.fillRect(0, 0, s, s);
  tex.refresh();
}

// ------------------------------------------------------------ characters

/** How each brother differs from Adam: brightness of the body and of the hair. */
const BROTHERS: Record<'cain' | 'abel', { body: number; lift: number; hair: number; hairLift: number; warm: number }> = {
  // darker, harder, with black hair
  cain: { body: 0.84, lift: 0, hair: 0.45, hairLift: 0, warm: 1.08 },
  // fairer, softer, with light hair
  abel: { body: 1.0, lift: 26, hair: 1.0, hairLift: 46, warm: 0.94 },
};

/** Hair: the dark pixels of the head (the top of each frame). */
function recolor(src: CanvasImageSource, w: number, h: number, frameH: number, who: 'cain' | 'abel'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const k = BROTHERS[who];
  for (let y = 0; y < h; y++) {
    const head = y % frameH < 44;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!d[i + 3]) continue;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const hair = head && lum < 92;
      const m = hair ? k.hair : k.body;
      const lift = hair ? k.hairLift : k.lift;
      d[i] = Math.min(255, r * m * k.warm + lift);
      d[i + 1] = Math.min(255, g * m + lift * 0.85);
      d[i + 2] = Math.min(255, b * m / k.warm + lift * 0.6);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Recolour a canvas onto a ramp by each pixel's own brightness (not
 * stretched to the picture's range, so every sheet of a character matches):
 * the ramp's colours are placed by their brightness and blended between.
 * `amount` below 1 only leans the picture's own colours that way.
 */
function toneByLight(c: HTMLCanvasElement, tone: RGB[], amount = 1): void {
  const ctx = c.getContext('2d')!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
  const at = tone.map((t) => lum(t[0], t[1], t[2]));
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const l = lum(d[i], d[i + 1], d[i + 2]);
    let k = 0;
    while (k < at.length - 2 && at[k + 1] < l) k++;
    const f = Math.max(0, Math.min(1, (l - at[k]) / Math.max(1, at[k + 1] - at[k])));
    for (let j = 0; j < 3; j++) d[i + j] = Math.round(d[i + j] * (1 - amount) + (tone[k][j] + (tone[k + 1][j] - tone[k][j]) * f) * amount);
  }
  ctx.putImageData(img, 0, 0);
}

/** how far Cain's colours lean to the base colour: a normal, tanned skin that suits the map (the maintainer) */
const CAIN_BASE = 0.3;

function buildBrothers(scene: Phaser.Scene): void {
  const src = MANIFEST.characters.adam?.tunic;
  if (!src) return;
  for (const who of ['cain', 'abel'] as const) {
    const set: Partial<Record<Direction, SheetAsset>> = {};
    for (const dir of ['down', 'up', 'right'] as Direction[]) {
      const a = src[dir];
      if (!a) continue;
      const from = charKey('adam', 'tunic', dir);
      const key = charKey(who, 'tunic', dir);
      const img = scene.textures.get(from).getSourceImage() as HTMLImageElement;
      const canvas = recolor(img, img.width, img.height, a.frameHeight, who);
      // Cain leaning to the chapter's base colour (the maintainer); wholly in
      // it (CAIN_BASE 1, until 2026-11-09) his skin was purple
      if (who === 'cain') toneByLight(canvas, BASE, CAIN_BASE);
      // Adam's sheet already has the walk, run, bending and blows (world/strideSheets.ts)
      const asset: SheetAsset = { ...a };
      scene.textures.addSpriteSheet(key, canvas as unknown as HTMLImageElement, { frameWidth: asset.frameWidth, frameHeight: asset.frameHeight });
      // the shadow is Adam's (same shapes)
      if (a.shadow && scene.textures.exists(shadowKey(from))) {
        const sh = scene.textures.get(shadowKey(from)).getSourceImage() as HTMLImageElement;
        scene.textures.addSpriteSheet(shadowKey(key), sh, { frameWidth: a.shadow.frameWidth, frameHeight: a.shadow.frameHeight });
      }
      set[dir] = asset;
      scene.anims.create({ key: `${key}:idle`, frames: scene.anims.generateFrameNumbers(key, { frames: a.idle ?? [0] }), frameRate: 1.4, repeat: -1 });
      if (a.walk?.length) scene.anims.create({ key: `${key}:walk`, frames: scene.anims.generateFrameNumbers(key, { frames: a.walk }), frameRate: (a.walkFps ?? 8) * (who === 'cain' ? CAIN_WALK_RATE : 1), repeat: -1 });
      if (asset.run?.length) scene.anims.create({ key: `${key}:run`, frames: scene.anims.generateFrameNumbers(key, { frames: asset.run }), frameRate: asset.runFps ?? 22, repeat: -1 });
    }
    MANIFEST.characters[who] = { tunic: set };
  }
}

/** Cain walks slower than Adam (the maintainer): his steps at this share of Adam's rate (his speed is lower to match) */
const CAIN_WALK_RATE = 0.8;

/** The lambs: the sheep, smaller. */
function buildLamb(scene: Phaser.Scene): void {
  const a = MANIFEST.sprites['animal-sheep'];
  if (!a) return;
  const key = 'cain-lamb';
  const img = scene.textures.get('animal-sheep').getSourceImage() as HTMLImageElement;
  scene.textures.addSpriteSheet(key, img, { frameWidth: a.frameWidth, frameHeight: a.frameHeight });
  if (a.shadow && scene.textures.exists(shadowKey('animal-sheep'))) {
    const sh = scene.textures.get(shadowKey('animal-sheep')).getSourceImage() as HTMLImageElement;
    scene.textures.addSpriteSheet(shadowKey(key), sh, { frameWidth: a.shadow.frameWidth, frameHeight: a.shadow.frameHeight });
  }
  MANIFEST.sprites[key] = { ...a, scale: (a.scale ?? 1) * 0.62, walkFps: (a.walkFps ?? 7) * 1.3 };
  if (a.idle) scene.anims.create({ key: `${key}:idle`, frames: scene.anims.generateFrameNumbers(key, { frames: a.idle }), frameRate: a.idleFps ?? 1.2, repeat: -1 });
  if (a.walk) scene.anims.create({ key: `${key}:walk`, frames: scene.anims.generateFrameNumbers(key, { frames: a.walk }), frameRate: (a.walkFps ?? 7) * 1.3, repeat: -1 });
}

/**
 * Adam sitting on a log by the house (the maintainer). A generated drawing
 * (art/generated/cain-adam-sitting, made from his tunic sprite): seen from
 * the side, whole legs, thighs along the log and shins down to the ground.
 * Two frames for breathing, like his idle: the second has the upper body
 * one pixel lower. The base point is on the ground under the seat.
 * Before 2026-11-09 he was built from his side idle (stride.ts sitFrame),
 * with the legs cut short.
 */
function buildSittingAdam(scene: Phaser.Scene): void {
  const a = MANIFEST.characters.adam?.tunic?.right;
  const p = gen(scene, 'adam-sitting');
  const { w: W, h: H } = p;
  const breath = new Uint8ClampedArray(p.data);
  const chest = Math.round(H * SIT_BREATH);
  for (let y = chest; y > 0; y--) breath.copyWithin(y * W * 4, (y - 1) * W * 4, y * W * 4);
  breath.fill(0, 0, W * 4);
  const key = 'cain-adam-sitting';
  const tex = scene.textures.createCanvas(key, W * 2, H)!;
  const ctx = tex.getContext();
  [p.data, breath].forEach((d, f) => {
    ctx.putImageData(new ImageData(new Uint8ClampedArray(d), W, H), f * W, 0);
    tex.add(f, 0, f * W, 0, W, H);
  });
  tex.refresh();
  MANIFEST.sprites[key] = { file: '', frameWidth: W, frameHeight: H, frames: 2, anchorX: Math.round(W * SIT_SEAT), anchorY: H - 1, scale: a?.scale ?? 1, idle: [0, 1], idleFps: 1.4 };
  scene.anims.create({ key: `${key}:idle`, frames: scene.anims.generateFrameNumbers(key, { frames: [0, 1] }), frameRate: 1.4, repeat: -1 });
}

/** where the seat is across the sitting drawing, and where his chest ends (fractions of its width and height) */
const SIT_SEAT = 0.25;
const SIT_BREATH = 0.62;

// ------------------------------------------------------------- portraits

function loadImage(file: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = assetUrl(file);
  });
}

type Adjust = (c: HTMLCanvasElement) => void;

async function portraitCopy(fromId: string, toId: string, opts: { mirror?: boolean; adjust?: Adjust } = {}): Promise<void> {
  const from = MANIFEST.portraits[fromId];
  if (!from || MANIFEST.portraits[toId]) return;
  const W = from.width;
  const convert = async (file: string, w: number, h: number): Promise<string> => {
    const im = await loadImage(file);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    if (opts.mirror) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(im, 0, 0);
    opts.adjust?.(c);
    return c.toDataURL();
  };
  const patches = async (list: PortraitAsset['mouth']) =>
    Promise.all(list.map(async (p) => ({ ...p, x: opts.mirror ? W - p.x - p.w : p.x, file: await convert(p.file, p.w, p.h) })));
  const entry: PortraitAsset = { file: await convert(from.file, from.width, from.height), width: from.width, height: from.height, mouth: await patches(from.mouth), eyes: await patches(from.eyes) };
  MANIFEST.portraits[toId] = entry;
}

/** Darker or lighter, with the same hair rule as the sprites. */
function brother(who: 'cain' | 'abel'): Adjust {
  return (c) => {
    const ctx = c.getContext('2d')!;
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    const k = BROTHERS[who];
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const hair = lum < 80 && (d[i] - d[i + 2]) > 6;
      const m = hair ? k.hair : k.body;
      const lift = hair ? k.hairLift : k.lift;
      d[i] = Math.min(255, d[i] * m * k.warm + lift);
      d[i + 1] = Math.min(255, d[i + 1] * m + lift * 0.85);
      d[i + 2] = Math.min(255, (d[i + 2] * m) / k.warm + lift * 0.6);
    }
    ctx.putImageData(img, 0, 0);
  };
}

let portraits: Promise<void> | null = null;

/** The portraits of the chapter (ids cain-adam, cain-eve, cain-god, cain, abel). */
export function buildCainPortraits(): Promise<void> {
  portraits ??= Promise.all([
    portraitCopy('adam-tunic', 'cain-adam'),
    portraitCopy('eve-tunic', 'cain-eve'),
    portraitCopy('god', 'cain-god'),
    portraitCopy('adam-tunic', 'cain', { adjust: brother('cain') }),
    portraitCopy('adam-tunic', 'abel', { mirror: true, adjust: brother('abel') }),
  ])
    .then(() => undefined)
    .catch((e) => console.warn('[cain] portraits', e));
  return portraits;
}
