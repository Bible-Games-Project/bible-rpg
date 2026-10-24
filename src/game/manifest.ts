import raw from '../data/generated/assets.json';

/** Types for src/data/generated/assets.json (written by tools/art/build_all.py). */

/** A shadow cast by a sprite (sun at the upper left), and where the
 * sprite's base point falls in it. */
export interface ShadowAsset {
  file: string;
  anchorX: number;
  anchorY: number;
}

export interface SheetAsset {
  file: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  anchorX: number;
  anchorY: number;
  idle?: number[];
  walk?: number[];
  /** walk animation speed in frames per second (default 8) */
  walkFps?: number;
  fly?: number[];
  /** world pixels per art pixel (sprites drawn with more detail than the world grid) */
  scale?: number;
  shadow?: ShadowAsset;
  /** the cherub's flaming blade, in frame pixels */
  flame?: [number, number];
}

export interface TreeAsset {
  trunk: string;
  canopy: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  collider: [number, number, number, number];
  fruit: [number, number][];
  kind: string;
  scale?: number;
  shadow?: ShadowAsset;
}

export interface PortraitPatch {
  file: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PortraitAsset {
  file: string;
  width: number;
  height: number;
  mouth: PortraitPatch[];
  eyes: PortraitPatch[];
}

export interface TilesAsset {
  file: string;
  tileSize: number;
  columns: number;
  grass: number[];
  flowers: number[];
  path: number;
  water: number[];
  dry: number;
}

export type Direction = 'down' | 'up' | 'right';

export interface Manifest {
  characters: Record<string, Record<string, Partial<Record<Direction, SheetAsset>>>>;
  portraits: Record<string, PortraitAsset>;
  sprites: Record<string, SheetAsset>;
  trees: Record<string, TreeAsset>;
  tiles: TilesAsset;
}

export const MANIFEST = raw as unknown as Manifest;

/** Absolute URL of an asset path from the manifest. */
export function assetUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${file}`;
}

export function charKey(id: string, outfit: string, dir: Direction): string {
  return `char:${id}:${outfit}:${dir}`;
}

/** The manifest entry behind a texture key: a character sheet ("char:…"),
 * a tree part ("tree:kind:part") or a sprite. */
function entryOf(key: string): SheetAsset | TreeAsset | undefined {
  if (key.startsWith('shadow:')) return entryOf(key.slice(7));
  const parts = key.split(':');
  if (parts[0] === 'char') return MANIFEST.characters[parts[1]]?.[parts[2]]?.[parts[3] as Direction];
  if (parts[0] === 'tree') return MANIFEST.trees[parts[1]];
  return MANIFEST.sprites[key];
}

/** World pixels per pixel of a texture (1 for textures drawn on the world grid). */
export function textureScale(key: string): number {
  return entryOf(key)?.scale ?? 1;
}

/** Draw an image at its world size (see SheetAsset.scale). */
export function sized<T extends { texture: { key: string }; setScale(x: number, y?: number): T }>(o: T): T {
  const s = textureScale(o.texture.key);
  return s === 1 ? o : o.setScale(s);
}

export function shadowKey(textureKey: string): string {
  return `shadow:${textureKey}`;
}

/** The shadow of a texture, if it casts one. */
export function shadowOf(textureKey: string): ShadowAsset | undefined {
  return entryOf(textureKey)?.shadow;
}
