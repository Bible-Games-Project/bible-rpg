/**
 * Catalogue of world objects. Trees come from the tree manifest (trunk +
 * canopy layers, collider and fruit slots); everything else is a sprite.
 *
 * layer 'ground'  flat on the ground, always under characters
 * layer 'ysort'   depth from the base (feet) position, so characters walk
 *                 behind or in front naturally
 * collider        solid footprint around the base, in world pixels
 * cover           radius in which a character counts as hidden (mission 8)
 */
export interface ObjectKind {
  sprite?: string;
  tree?: string;
  layer: 'ground' | 'ysort' | 'water';
  collider?: { w: number; h: number; dy?: number };
  cover?: number;
  shadow?: 'shadow-small' | 'shadow-medium' | 'shadow-large';
}

const tree = (key: string, cover = 0): ObjectKind => ({ tree: key, layer: 'ysort', cover });

export const OBJECTS: Record<string, ObjectKind> = {
  'oak-large-a': tree('oak-large-a', 70),
  'oak-large-b': tree('oak-large-b', 70),
  'oak-medium-a': tree('oak-medium-a', 56),
  'oak-medium-b': tree('oak-medium-b', 56),
  'oak-small-a': tree('oak-small-a', 40),
  'oak-small-b': tree('oak-small-b', 40),
  blossom: tree('blossom', 56),
  'cypress-a': tree('cypress-a', 30),
  'cypress-b': tree('cypress-b', 30),
  'fig-a': tree('fig-a', 60),
  'fig-b': tree('fig-b', 60),
  'pomegranate-a': tree('pomegranate-a', 44),
  'pomegranate-b': tree('pomegranate-b', 44),
  'olive-a': tree('olive-a', 56),
  'olive-b': tree('olive-b', 56),
  'palm-a': tree('palm-a'),
  'palm-b': tree('palm-b'),
  'forbidden-tree': tree('forbidden-tree', 80),
  'tree-of-life': tree('tree-of-life', 80),
  'bush-round': tree('bush-round', 40),
  'bush-dark': tree('bush-dark', 40),
  'bush-flower': tree('bush-flower', 40),
  'bush-berry': tree('bush-berry', 40),
  grapevine: tree('grapevine', 30),

  'grass-tuft-0': { sprite: 'grass-tuft-0', layer: 'ground' },
  'grass-tuft-1': { sprite: 'grass-tuft-1', layer: 'ground' },
  'grass-tuft-2': { sprite: 'grass-tuft-2', layer: 'ground' },
  'flowers-white': { sprite: 'flowers-white', layer: 'ground' },
  'flowers-yellow': { sprite: 'flowers-yellow', layer: 'ground' },
  'flowers-red': { sprite: 'flowers-red', layer: 'ground' },
  'flowers-blue': { sprite: 'flowers-blue', layer: 'ground' },
  'flowers-pink': { sprite: 'flowers-pink', layer: 'ground' },
  'flowers-purple': { sprite: 'flowers-purple', layer: 'ground' },
  mushrooms: { sprite: 'mushrooms', layer: 'ground' },
  'rock-small': { sprite: 'rock-small', layer: 'ground' },
  'lily-pad': { sprite: 'lily-pad', layer: 'water' },
  'stepping-stone': { sprite: 'stepping-stone', layer: 'water' },
  'fern-a': { sprite: 'fern-a', layer: 'ysort', cover: 30 },
  'fern-b': { sprite: 'fern-b', layer: 'ysort', cover: 38 },
  reeds: { sprite: 'reeds', layer: 'ysort' },
  'grain-plant': { sprite: 'grain-plant', layer: 'ysort' },
  thistle: { sprite: 'thistle', layer: 'ysort' },
  thorns: { sprite: 'thorns', layer: 'ysort' },
  'rock-medium': { sprite: 'rock-medium', layer: 'ysort', collider: { w: 34, h: 12 }, shadow: 'shadow-medium' },
  'rock-large': { sprite: 'rock-large', layer: 'ysort', collider: { w: 62, h: 18 }, shadow: 'shadow-large' },
  'rock-mossy': { sprite: 'rock-mossy', layer: 'ysort', collider: { w: 46, h: 14 }, shadow: 'shadow-medium', cover: 26 },
  log: { sprite: 'log', layer: 'ysort', collider: { w: 76, h: 12 }, shadow: 'shadow-large', cover: 30 },
  'flat-stone': { sprite: 'flat-stone', layer: 'ysort', collider: { w: 40, h: 10 } },
  'digging-stick': { sprite: 'digging-stick', layer: 'ground' },
  gourd: { sprite: 'gourd', layer: 'ysort', shadow: 'shadow-small' },
  basket: { sprite: 'basket', layer: 'ysort', shadow: 'shadow-small' },
};
