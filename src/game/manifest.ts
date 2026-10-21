import raw from '../data/generated/assets.json';

/** Types for src/data/generated/assets.json (written by tools/art/build_all.py). */

export interface SheetAsset {
  file: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  anchorX: number;
  anchorY: number;
  idle?: number[];
  walk?: number[];
  fly?: number[];
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
