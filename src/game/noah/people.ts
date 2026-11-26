import Phaser from 'phaser';
import { MANIFEST, assetUrl, charKey, shadowKey, type Direction, type PortraitAsset, type SheetAsset } from '../manifest';
import { castShadows } from '../world/castShadow';
import { SIDE_ARMS, SOURCE_SHEETS, strideSheet } from '../world/strideSheets';
import PORTRAITS from '../../data/noah/portraits.json';

/**
 * Noah's people (the maintainer: Adam as the exact reference for look and
 * movement, each one different and as in their talk portrait, Noah in a
 * full long robe). tools/art/noah_people.mjs makes three bald bodies from
 * Adam's and Eve's tunic sheets (a long robe, a tunic, a dress) and one
 * sheet per person with what is drawn over the body: their hair, beard,
 * scarf, band, gold or apron. Parts are marked by colour: cloth in pure
 * greys, hair and beards in blue greys, the extras in green greys, skin as
 * it is. Here each person's body and overlay are put together, given the
 * walk, run and bending every sheet has (world/strideSheets.ts) and
 * coloured: cloth, hair and extras on a ramp of their colour by the grey's
 * light, the skin a little darker or lighter.
 */

type Body = 'man-robe' | 'man-tunic' | 'woman';

interface Person {
  /** as in tools/art/noah_people.mjs PEOPLE */
  body: Body;
  cloth: string;
  hair: string;
  /** a scarf, a band, gold, an apron, a braid's tie */
  accent?: string;
  skin: [number, number, number];
  /** bigger than a man (the giants, Genesis 6:4) */
  scale?: number;
}

/** The cast, in the colours of their talk portraits (art/generated/noah-portraits-*). */
export const PEOPLE: Record<string, Person> = {
  noah: { body: 'man-robe', hair: '#e9e6df', cloth: '#d9ceb0', skin: [0.98, 0.95, 0.93] },
  'noah-wife': { body: 'woman', hair: '#b3aba3', cloth: '#3f6e8e', accent: '#8a7a5a', skin: [0.98, 0.95, 0.94] },
  shem: { body: 'man-robe', hair: '#3a2416', cloth: '#b0352c', skin: [1, 0.98, 0.96] },
  ham: { body: 'man-robe', hair: '#17110e', cloth: '#c98a2a', skin: [0.74, 0.7, 0.68] },
  japheth: { body: 'man-robe', hair: '#b4521e', cloth: '#2e6a8e', skin: [1.06, 1.04, 1.03] },
  'shem-wife': { body: 'woman', hair: '#2a1a12', cloth: '#8e3a5a', skin: [1, 0.97, 0.95] },
  'ham-wife': { body: 'woman', hair: '#140e0c', cloth: '#6a8a3a', accent: '#4e5e26', skin: [0.78, 0.73, 0.7] },
  'japheth-wife': { body: 'woman', hair: '#a0582a', cloth: '#c07a9a', accent: '#e8b0c0', skin: [1.05, 1.03, 1.02] },
  // the wicked of the earth (Genesis 6:5, 11)
  wicked: { body: 'man-tunic', hair: '#1c1512', cloth: '#40444c', skin: [0.9, 0.86, 0.84] },
  'wicked-b': { body: 'man-tunic', hair: '#2a1a10', cloth: '#6b3a20', skin: [0.8, 0.76, 0.74], scale: 1.06 },
  'wicked-c': { body: 'man-tunic', hair: '#120d0b', cloth: '#7a2424', skin: [0.95, 0.9, 0.88] },
  'wicked-woman': { body: 'woman', hair: '#1a1210', cloth: '#5a3050', accent: '#d9a52a', skin: [0.92, 0.88, 0.86] },
  giant: { body: 'man-tunic', hair: '#120d0b', cloth: '#5a2a2a', skin: [0.82, 0.76, 0.72], scale: 1.45 },
  thief: { body: 'man-tunic', hair: '#15100d', cloth: '#4a5230', skin: [0.92, 0.87, 0.84], scale: 0.96 },
  baker: { body: 'man-robe', hair: '#7a746c', cloth: '#8a6a48', accent: '#cfc6ae', skin: [0.95, 0.9, 0.87] },
  debtor: { body: 'man-tunic', hair: '#8e8a84', cloth: '#7c7c78', skin: [0.9, 0.85, 0.82], scale: 0.95 },
  farmer: { body: 'man-tunic', hair: '#4a2e1a', cloth: '#5e7a44', accent: '#c09a5a', skin: [0.85, 0.8, 0.76] },
  mocker: { body: 'man-tunic', hair: '#7a5230', cloth: '#c09a2a', skin: [0.98, 0.94, 0.91], scale: 0.97 },
};

const BODIES: Body[] = ['man-robe', 'man-tunic', 'woman'];
const DIRS: Direction[] = ['down', 'up', 'right'];
const bodyKey = (b: Body, d: Direction) => `noah-body:${b}-${d}`;
const hairKey = (id: string) => `noah-hair:${id}`;

/** Loads the body sheets and everyone's hair sheets (from the scene's preload). */
export function loadNoahPeople(scene: Phaser.Scene): void {
  for (const b of BODIES) for (const d of DIRS) if (!scene.textures.exists(bodyKey(b, d))) scene.load.image(bodyKey(b, d), assetUrl(`assets/noah/people/${b}-${d}.png`));
  for (const id of Object.keys(PEOPLE)) if (!scene.textures.exists(hairKey(id))) scene.load.image(hairKey(id), assetUrl(`assets/noah/people/hair/${id}.png`));
}

type V3 = [number, number, number];
const hex = (h: string): V3 => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as V3;

/** A colour's ramp: darker below 0.55, toward white above (as the portraits). */
function ramp(c: V3, t: number, lift = 0.35): V3 {
  if (t < 0.55) {
    const k = 0.3 + (t / 0.55) * 0.7;
    return [c[0] * k, c[1] * k, c[2] * k];
  }
  const k = ((t - 0.55) / 0.45) * lift;
  return [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k];
}

function paint(src: HTMLCanvasElement, p: Person): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const cloth = hex(p.cloth);
  const hair = hex(p.hair);
  const accent = hex(p.accent ?? p.cloth);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    let o: V3;
    if (r === g && g === b) o = ramp(cloth, (r / 255) * 0.95 + 0.05);
    else if (b >= 1.55 * r && b >= 1.35 * g) o = ramp(hair, Math.min(1, (b / 1.25 / 255) * 1.35 + 0.05));
    else if (g >= 1.4 * r && g >= 1.4 * b) o = ramp(accent, Math.min(1, (g / 1.22 / 255) * 1.35 + 0.05));
    else o = [r * p.skin[0], g * p.skin[1], b * p.skin[2]];
    d[i] = Math.min(255, Math.round(o[0]));
    d[i + 1] = Math.min(255, Math.round(o[1]));
    d[i + 2] = Math.min(255, Math.round(o[2]));
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

let built = false;

/** Every person's sheets (charKey(id, 'robe', dir)) and portraits, once per game. */
export function buildNoahPeople(scene: Phaser.Scene): void {
  if (built) return;
  built = true;
  // one shadow per body and direction (the hair hardly changes it), from the first person in it
  const shadows: Partial<Record<string, string>> = {};
  for (const [id, p] of Object.entries(PEOPLE)) {
    const from = p.body === 'woman' ? 'eve' : 'adam';
    const set: Partial<Record<Direction, SheetAsset>> = {};
    DIRS.forEach((dir, row) => {
      const a = SOURCE_SHEETS[charKey(from, 'tunic', dir)];
      if (!a || !scene.textures.exists(bodyKey(p.body, dir))) return;
      const img = scene.textures.get(bodyKey(p.body, dir)).getSourceImage() as HTMLImageElement;
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      // the person's hair and the rest, the rows of their sheet in DIRS order
      if (scene.textures.exists(hairKey(id))) ctx.drawImage(scene.textures.get(hairKey(id)).getSourceImage() as HTMLImageElement, 0, row * img.height, img.width, img.height, 0, 0, img.width, img.height);
      const made = strideSheet(c, { ...a }, dir, SIDE_ARMS[`${from}-tunic`]);
      if (!made) return;
      const [canvas, strided, all] = made;
      const sk = `noah-body-shadow:${p.body}-${dir}`;
      if (!shadows[sk]) {
        const [strip, shadow] = castShadows(all, strided.anchorX, strided.anchorY);
        scene.textures.addSpriteSheet(sk, strip as unknown as HTMLImageElement, { frameWidth: shadow.frameWidth, frameHeight: shadow.frameHeight });
        shadows[sk] = sk;
        SHADOWS[sk] = shadow;
      }
      const key = charKey(id, 'robe', dir);
      const asset: SheetAsset = { ...strided, shadow: SHADOWS[sk], scale: (strided.scale ?? 1) * (p.scale ?? 1) };
      scene.textures.addSpriteSheet(key, paint(canvas, p) as unknown as HTMLImageElement, { frameWidth: asset.frameWidth, frameHeight: asset.frameHeight });
      const sh = scene.textures.get(sk).getSourceImage() as HTMLCanvasElement;
      scene.textures.addSpriteSheet(shadowKey(key), sh as unknown as HTMLImageElement, { frameWidth: asset.shadow!.frameWidth, frameHeight: asset.shadow!.frameHeight });
      const fr = (list: number[]) => scene.anims.generateFrameNumbers(key, { frames: list });
      scene.anims.create({ key: `${key}:idle`, frames: fr(asset.idle ?? [0]), frameRate: 1.4, repeat: -1 });
      if (asset.walk?.length) scene.anims.create({ key: `${key}:walk`, frames: fr(asset.walk), frameRate: asset.walkFps ?? 8, repeat: -1 });
      if (asset.run?.length) scene.anims.create({ key: `${key}:run`, frames: fr(asset.run), frameRate: asset.runFps ?? 22, repeat: -1 });
      set[dir] = asset;
    });
    MANIFEST.characters[id] = { robe: set };
  }
  // the talk portraits, one face each (generated with Adam's as the reference, tools/art/noah_portraits.mjs)
  for (const [id, entry] of Object.entries(PORTRAITS as Record<string, PortraitAsset>)) MANIFEST.portraits[`noah-${id}`] ??= entry;
}

const SHADOWS: Record<string, NonNullable<SheetAsset['shadow']>> = {};
