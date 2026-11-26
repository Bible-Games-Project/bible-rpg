import Phaser from 'phaser';
import { MANIFEST, assetUrl, charKey, shadowKey, type Direction, type PortraitAsset, type SheetAsset } from '../manifest';
import { castShadows } from '../world/castShadow';
import { SIDE_ARMS, SOURCE_SHEETS, strideSheet } from '../world/strideSheets';
import PORTRAITS from '../../data/noah/portraits.json';

/**
 * Noah's people (the maintainer: Adam as the exact reference for look and
 * movement, each one different, Noah in a full long robe). Four base sheets
 * made from Adam's and Eve's tunic sheets (tools/art/noah_people.mjs: a
 * long robe, beards, the women's dresses) mark their parts by colour: cloth
 * in pure greys, hair and beards in blue greys, skin as it is. Here each base
 * is given the walk, run and bending every sheet has (world/strideSheets.ts)
 * and then coloured once per person: cloth and hair on a ramp of their
 * colour by the grey's light, the skin a little darker or lighter.
 */

type Base = 'man-robe' | 'man-beard' | 'man' | 'woman';

interface Person {
  base: Base;
  cloth: string;
  hair: string;
  skin: [number, number, number];
  /** bigger than a man (the giants, Genesis 6:4) */
  scale?: number;
}

/** The cast, in the colours of their talk portraits (tools/art/noah_portraits.mjs). */
export const PEOPLE: Record<string, Person> = {
  noah: { base: 'man-robe', hair: '#e9e6df', cloth: '#d9ceb0', skin: [0.98, 0.95, 0.93] },
  'noah-wife': { base: 'woman', hair: '#b3aba3', cloth: '#3f6e8e', skin: [0.98, 0.95, 0.94] },
  shem: { base: 'man-beard', hair: '#3a2416', cloth: '#b0352c', skin: [1, 0.98, 0.96] },
  ham: { base: 'man-beard', hair: '#17110e', cloth: '#c98a2a', skin: [0.74, 0.7, 0.68] },
  japheth: { base: 'man-beard', hair: '#8a4a24', cloth: '#2e6a8e', skin: [1.06, 1.04, 1.03] },
  'shem-wife': { base: 'woman', hair: '#2a1a12', cloth: '#8e3a5a', skin: [1, 0.97, 0.95] },
  'ham-wife': { base: 'woman', hair: '#140e0c', cloth: '#6a8a3a', skin: [0.78, 0.73, 0.7] },
  'japheth-wife': { base: 'woman', hair: '#a0582a', cloth: '#c07a9a', skin: [1.05, 1.03, 1.02] },
  // the wicked of the earth (Genesis 6:5, 11)
  wicked: { base: 'man', hair: '#1c1512', cloth: '#40444c', skin: [0.9, 0.86, 0.84] },
  'wicked-b': { base: 'man', hair: '#2a1a10', cloth: '#6b3a20', skin: [0.8, 0.76, 0.74] },
  'wicked-c': { base: 'man-beard', hair: '#120d0b', cloth: '#7a2424', skin: [0.95, 0.9, 0.88] },
  'wicked-woman': { base: 'woman', hair: '#1a1210', cloth: '#5a3050', skin: [0.92, 0.88, 0.86] },
  giant: { base: 'man-beard', hair: '#120d0b', cloth: '#5a2a2a', skin: [0.82, 0.76, 0.72], scale: 1.45 },
};

const BASES: Base[] = ['man-robe', 'man-beard', 'man', 'woman'];
const DIRS: Direction[] = ['down', 'up', 'right'];
const baseKey = (b: Base, d: Direction) => `noah-base:${b}-${d}`;

/** Loads the base sheets (from the scene's preload). */
export function loadNoahPeople(scene: Phaser.Scene): void {
  for (const b of BASES) for (const d of DIRS) if (!scene.textures.exists(baseKey(b, d))) scene.load.image(baseKey(b, d), assetUrl(`assets/noah/people/${b}-${d}.png`));
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
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    let o: V3;
    if (r === g && g === b) o = ramp(cloth, (r / 255) * 0.95 + 0.05);
    else if (b >= 1.55 * r && b >= 1.35 * g) o = ramp(hair, Math.min(1, (b / 1.25 / 255) * 1.35 + 0.05));
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
  const strided: Partial<Record<string, { canvas: HTMLCanvasElement; asset: SheetAsset }>> = {};
  for (const b of BASES) {
    const from = b === 'woman' ? 'eve' : 'adam';
    for (const dir of DIRS) {
      const a = SOURCE_SHEETS[charKey(from, 'tunic', dir)];
      if (!a || !scene.textures.exists(baseKey(b, dir))) continue;
      const img = scene.textures.get(baseKey(b, dir)).getSourceImage() as HTMLImageElement;
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d')!.drawImage(img, 0, 0);
      const made = strideSheet(c, { ...a }, dir, SIDE_ARMS[`${from}-tunic`]);
      if (!made) continue;
      const [canvas, asset, all] = made;
      const [strip, shadow] = castShadows(all, asset.anchorX, asset.anchorY);
      const sk = `noah-base-shadow:${b}-${dir}`;
      scene.textures.addSpriteSheet(sk, strip as unknown as HTMLImageElement, { frameWidth: shadow.frameWidth, frameHeight: shadow.frameHeight });
      asset.shadow = shadow;
      strided[`${b}-${dir}`] = { canvas, asset };
    }
  }
  for (const [id, p] of Object.entries(PEOPLE)) {
    const set: Partial<Record<Direction, SheetAsset>> = {};
    for (const dir of DIRS) {
      const s = strided[`${p.base}-${dir}`];
      if (!s) continue;
      const key = charKey(id, 'robe', dir);
      const asset: SheetAsset = { ...s.asset, scale: (s.asset.scale ?? 1) * (p.scale ?? 1) };
      scene.textures.addSpriteSheet(key, paint(s.canvas, p) as unknown as HTMLImageElement, { frameWidth: asset.frameWidth, frameHeight: asset.frameHeight });
      const sh = scene.textures.get(`noah-base-shadow:${p.base}-${dir}`).getSourceImage() as HTMLCanvasElement;
      scene.textures.addSpriteSheet(shadowKey(key), sh as unknown as HTMLImageElement, { frameWidth: asset.shadow!.frameWidth, frameHeight: asset.shadow!.frameHeight });
      const fr = (list: number[]) => scene.anims.generateFrameNumbers(key, { frames: list });
      scene.anims.create({ key: `${key}:idle`, frames: fr(asset.idle ?? [0]), frameRate: 1.4, repeat: -1 });
      if (asset.walk?.length) scene.anims.create({ key: `${key}:walk`, frames: fr(asset.walk), frameRate: asset.walkFps ?? 8, repeat: -1 });
      if (asset.run?.length) scene.anims.create({ key: `${key}:run`, frames: fr(asset.run), frameRate: asset.runFps ?? 22, repeat: -1 });
      set[dir] = asset;
    }
    MANIFEST.characters[id] = { robe: set };
  }
  // the talk portraits (drawn from Adam's and Eve's, tools/art/noah_portraits.mjs)
  for (const [id, entry] of Object.entries(PORTRAITS as Record<string, PortraitAsset>)) MANIFEST.portraits[`noah-${id}`] ??= entry;
  // the wicked share their portraits
  for (const w of ['wicked-b', 'wicked-c']) MANIFEST.portraits[`noah-${w}`] ??= MANIFEST.portraits['noah-wicked'];
  if (MANIFEST.portraits['noah-noah-wife']) MANIFEST.portraits['noah-wicked-woman'] ??= MANIFEST.portraits['noah-shem-wife'];
}
