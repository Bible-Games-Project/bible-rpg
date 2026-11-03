import Phaser from 'phaser';
import { MANIFEST, assetUrl, charKey, shadowKey, type Direction, type PortraitAsset, type SheetAsset } from '../manifest';
import { Pixels } from './pixels';
import {
  drawAnger,
  drawFat,
  drawFire,
  drawFurrow,
  drawGourds,
  drawGreens,
  drawHut,
  drawJawbone,
  drawPot,
  drawShadow,
  drawStaff,
  drawStones,
  drawTree,
  drawWheat,
  type Drawing,
  type TreeKind,
} from './drawings';
import { paletteCanvas } from './palette';

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

/** Variants of each tree kind drawn (seeds). */
export const TREE_SEEDS: Record<TreeKind, number[]> = {
  oak: [1, 2, 9],
  oakSmall: [3, 11],
  umbrella: [4],
  cypress: [5, 12],
  fruit: [6],
  bush: [7, 8, 13],
};

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

/** A texture from frames of the same size, side by side, with its manifest entry. */
function addSheet(scene: Phaser.Scene, key: string, frames: Pixels[], ax: number, ay: number, scale = ART, icon = false): void {
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

function addDrawing(scene: Phaser.Scene, key: string, d: Drawing, icon = false): void {
  addSheet(scene, key, d.frames, Math.round(d.ax), Math.round(d.ay) - 1, ART, icon);
}

function loop(scene: Phaser.Scene, key: string, fps: number): void {
  if (!scene.anims.exists(`${key}:loop`)) scene.anims.create({ key: `${key}:loop`, frames: scene.anims.generateFrameNumbers(key, {}), frameRate: fps, repeat: -1 });
}

/** Everything the chapter draws, once per game. */
export function buildCainArt(scene: Phaser.Scene): void {
  if (built) return;
  built = true;
  // trees
  for (const [kind, seeds] of Object.entries(TREE_SEEDS) as [TreeKind, number[]][]) {
    for (const seed of seeds) {
      const t = drawTree(kind, seed);
      const id = `${kind}-${seed}`;
      const base = `cain-tree-${id}`;
      addSheet(scene, `${base}-trunk`, [t.trunk], t.ax, t.ay);
      addSheet(scene, `${base}-crown`, [t.crown], t.ax, t.ay);
      if (t.bare) addSheet(scene, `${base}-bare`, [t.bare], t.ax, t.ay);
      const sw = Math.round(t.crownBox.w * 0.8);
      const sh = Math.max(14, Math.round(sw * 0.32));
      addSheet(scene, `${base}-shadow`, [drawShadow(sw, sh)], sw / 2, sh / 2);
      TREES[id] = { trunk: `${base}-trunk`, crown: `${base}-crown`, bare: t.bare ? `${base}-bare` : undefined, shadow: `${base}-shadow`, w: t.trunk.w, h: t.trunk.h, ax: t.ax, ay: t.ay, crownBox: t.crownBox, foot: t.foot };
    }
  }
  // props
  addDrawing(scene, 'cain-hut', drawHut());
  addDrawing(scene, 'cain-altar', drawStones(80, 54, 3, 1, true));
  addDrawing(scene, 'cain-altar-b', drawStones(80, 54, 3, 4, true));
  for (let i = 0; i < 3; i++) addDrawing(scene, `cain-wall-${i}`, drawStones(46, 30, 2, 10 + i));
  addDrawing(scene, 'cain-fire', drawFire(4));
  addDrawing(scene, 'cain-fire-big', drawFire(2, true));
  loop(scene, 'cain-fire', 8);
  loop(scene, 'cain-fire-big', 7);
  addDrawing(scene, 'cain-pot', drawPot());
  for (let i = 0; i < 3; i++) addSheet(scene, `cain-furrow-${i}`, [drawFurrow(i + 1)], 64, 7);
  for (let i = 0; i < 3; i++) {
    addDrawing(scene, `cain-wheat-${i}`, drawWheat(i + 1));
    addDrawing(scene, `cain-wheat-${i}-reaped`, drawWheat(i + 1, true));
    addDrawing(scene, `cain-greens-${i}`, drawGreens(i + 1));
  }
  addDrawing(scene, 'cain-gourds', drawGourds(1));
  addDrawing(scene, 'cain-gourds-picked', drawGourds(1, true));
  addDrawing(scene, 'cain-jawbone', drawJawbone(), true);
  addDrawing(scene, 'cain-fat', drawFat(), true);
  addDrawing(scene, 'cain-staff', drawStaff());
  addSheet(scene, 'cain-shadow', [drawShadow(60, 20)], 30, 10);
  // the anger over Cain's head is drawn at world size, like the other emotes
  addSheet(scene, 'emote-anger', [drawAnger()], 9, 19, 1);
  buildBrothers(scene);
  buildLamb(scene);
  buildSittingAdam(scene);
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
      scene.textures.addSpriteSheet(key, canvas as unknown as HTMLImageElement, { frameWidth: a.frameWidth, frameHeight: a.frameHeight });
      // the shadow is Adam's (same shapes)
      if (a.shadow && scene.textures.exists(shadowKey(from))) {
        const sh = scene.textures.get(shadowKey(from)).getSourceImage() as HTMLImageElement;
        scene.textures.addSpriteSheet(shadowKey(key), sh, { frameWidth: a.shadow.frameWidth, frameHeight: a.shadow.frameHeight });
      }
      set[dir] = { ...a };
      scene.anims.create({ key: `${key}:idle`, frames: scene.anims.generateFrameNumbers(key, { frames: a.idle ?? [0] }), frameRate: 1.4, repeat: -1 });
      if (a.walk?.length) scene.anims.create({ key: `${key}:walk`, frames: scene.anims.generateFrameNumbers(key, { frames: a.walk }), frameRate: a.walkFps ?? 8, repeat: -1 });
    }
    MANIFEST.characters[who] = { tunic: set };
  }
}

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
 * Adam sitting on a log by the house (the maintainer). Built from his front
 * view in the tunic: the body down to the hem, then the shins straight
 * under it, as someone seated and seen from the front; two frames
 * (breathing), like his idle.
 */
function buildSittingAdam(scene: Phaser.Scene): void {
  const a = MANIFEST.characters.adam?.tunic?.down;
  if (!a) return;
  const img = scene.textures.get(charKey('adam', 'tunic', 'down')).getSourceImage() as HTMLImageElement;
  const hem = 110;
  const knee = 124;
  const foot = a.anchorY + 1;
  const h = hem + (foot - knee);
  const key = 'cain-adam-sitting';
  const tex = scene.textures.createCanvas(key, a.frameWidth * 2, h)!;
  const ctx = tex.getContext();
  for (let f = 0; f < 2; f++) {
    const fx = a.idle?.[f] ?? f;
    const sx = fx * a.frameWidth;
    const dx = f * a.frameWidth;
    ctx.drawImage(img, sx, knee, a.frameWidth, foot - knee, dx, hem, a.frameWidth, foot - knee);
    ctx.drawImage(img, sx, 0, a.frameWidth, hem, dx, 0, a.frameWidth, hem);
    tex.add(f, 0, dx, 0, a.frameWidth, h);
  }
  tex.refresh();
  MANIFEST.sprites[key] = { file: '', frameWidth: a.frameWidth, frameHeight: h, frames: 2, anchorX: a.anchorX, anchorY: h - 1, scale: a.scale, idle: [0, 1], idleFps: 1.4 };
  scene.anims.create({ key: `${key}:idle`, frames: scene.anims.generateFrameNumbers(key, { frames: [0, 1] }), frameRate: 1.4, repeat: -1 });
}

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
    paletteCanvas(c);
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

/** The portraits of the chapter, in its palette (ids cain-adam, cain-eve, cain-god, cain, abel). */
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
