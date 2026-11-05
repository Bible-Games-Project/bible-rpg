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
  drawDog,
  drawStones,
  drawTorch,
  drawTree,
  drawWheat,
  type Drawing,
  type TreeKind,
} from './drawings';
import { nightPixels } from './palette';

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
  addDrawing(scene, 'cain-fire', drawFire(4), false, true);
  addDrawing(scene, 'cain-fire-big', drawFire(2, true), false, true);
  addDrawing(scene, 'cain-flame', drawFire(4, false, false), false, true);
  addDrawing(scene, 'cain-torch', drawTorch());
  torchLight(scene);
  loop(scene, 'cain-fire', 8);
  loop(scene, 'cain-flame', 9);
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
  // Abel's sheepdog: its own colours, like the sheep (dimmed at night in CainScene)
  addDrawing(scene, 'cain-dog', drawDog(), false, true);
  scene.anims.create({ key: 'cain-dog:idle', frames: scene.anims.generateFrameNumbers('cain-dog', { frames: [0, 1] }), frameRate: 2.2, repeat: -1 });
  scene.anims.create({ key: 'cain-dog:walk', frames: scene.anims.generateFrameNumbers('cain-dog', { frames: [2, 3, 4, 5] }), frameRate: 11, repeat: -1 });
  addSheet(scene, 'cain-shadow', [drawShadow(60, 20)], 30, 10);
  // the anger over Cain's head is drawn at world size, like the other emotes
  addSheet(scene, 'emote-anger', [drawAnger()], 9, 19, 1, false, true);
  buildBrothers(scene);
  buildLamb(scene);
  buildSittingAdam(scene);
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
  // Adam seen from the side, sitting, made from his side idle frames: the
  // body down to the hem as it is, the thigh (the upper leg turned to lie
  // forward) and the shin and foot hanging down from the knee.
  const a = MANIFEST.characters.adam?.tunic?.right;
  if (!a) return;
  const img = scene.textures.get(charKey('adam', 'tunic', 'right')).getSourceImage() as HTMLImageElement;
  const fw = a.frameWidth;
  const W = fw + 22;
  const HEM = 107;
  const LEG_X = 21;
  const LEG_W = 12;
  const KNEE = 126;
  const FOOT = a.anchorY + 1;
  const SEAT = HEM - 1;
  const shin = FOOT - KNEE;
  const H = SEAT + shin;
  const key = 'cain-adam-sitting';
  const tex = scene.textures.createCanvas(key, W * 2, H)!;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  for (let f = 0; f < 2; f++) {
    const sx = (a.idle?.[f] ?? f) * fw;
    const dx = f * W;
    // the shin and foot, hanging from the knee in front of the seat
    const kneeX = dx + LEG_X + 25;
    ctx.drawImage(img, sx + LEG_X - 1, KNEE, fw - LEG_X, shin, kneeX - 1, SEAT, fw - LEG_X, shin);
    // the thigh, lying forward from the hip to the knee
    ctx.save();
    ctx.translate(dx + LEG_X + 2, SEAT - LEG_W);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, sx + LEG_X, HEM, LEG_W, KNEE - HEM, -LEG_W + 1, 0, LEG_W, 30);
    ctx.restore();
    // the body, down to the hem of the tunic
    ctx.drawImage(img, sx, 0, fw, HEM, dx, 0, fw, HEM);
    tex.add(f, 0, dx, 0, W, H);
  }
  tex.refresh();
  // the anchor is under the seat (the top of the log)
  MANIFEST.sprites[key] = { file: '', frameWidth: W, frameHeight: H, frames: 2, anchorX: LEG_X + 6, anchorY: H - 1, scale: a.scale, idle: [0, 1], idleFps: 1.4 };
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
