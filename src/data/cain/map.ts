import type { Pt, Zone } from '../eden/map';

/**
 * Layout of the land east of Eden where Cain and Abel grow up (Genesis 4),
 * in world pixels (tiles are 32 px). A tall map, about the size of Eden's
 * (the maintainer: "more vertical, not bigger"):
 *
 *   north   Abel's pasture: the flock and the sheepfold
 *   centre  meadow and woods; Adam and Eve's house; the place of offering
 *   south   Cain's tilled field
 *
 * The story begins at the far west edge (the maintainer).
 */

export const TILE = 32;
export const WORLD_W = 2944;
export const WORLD_H = 4480;

/** The walkable land; the woods beyond close it in. */
export const BOUNDS = { left: 150, top: 230, right: 2800, bottom: 4290 };

export const PATHS: { points: Pt[]; width: number }[] = [
  // from the west edge to the house
  { width: 58, points: [[0, 2290], [380, 2300], [760, 2270], [1100, 2290], [1330, 2330]] },
  // north from the house to the sheepfold's gate
  { width: 52, points: [[1450, 2190], [1430, 1820], [1480, 1460], [1500, 1080]] },
  // south from the house down to the field
  { width: 52, points: [[1430, 2420], [1390, 2780], [1330, 3120], [1260, 3230]] },
  // east from the house up to the place of offering
  { width: 48, points: [[1600, 2260], [1840, 2120], [2090, 2010], [2200, 1960]] },
  // the way east out of the field (Genesis 4:16)
  { width: 46, points: [[2120, 3500], [2460, 3470], [2944, 3440]] },
];

/** Torches lighting the night (the maintainer): at the house, the altars,
 * the fold's gate, the field's gate and along the paths. */
export const TORCHES: Pt[] = [
  [1300, 2235], [1505, 2240], [1700, 2390], [1250, 2420],
  [2075, 1960], [2425, 1960], [2250, 1830],
  [1395, 1010], [1600, 1010], [1440, 1420], [1500, 1760],
  [1200, 3200], [1340, 3240], [1360, 2800],
  [600, 2240], [1000, 2245], [1860, 2190],
  [900, 3500], [1700, 3600], [2200, 3540], [2600, 3400], [1100, 3950], [1900, 4000],
];

/** Cain's tilled field: rows of crops on brown earth. */
export const FIELD = { x: 470, y: 3180, w: 1880, h: 960 };

/** The sheepfold: a ring of low stone walls with its gate to the south. */
export const FOLD = { x: 1500, y: 760, r: 230, gate: Math.PI / 2, gateWidth: 0.55 };

export const POINTS: Record<string, Pt> = {
  // the far west edge, where the chapter begins
  start: [250, 2300],
  abelStart: [250, 2370],
  godStart: [470, 2250],
  abelLeave: [1460, 1500],
  // the house of Adam and Eve
  hut: [1390, 2170],
  fire: [1560, 2318],
  eve: [1620, 2310],
  adamLog: [1300, 2340],
  houseCenter: [1450, 2320],
  // the place of offering: two altars side by side
  altarCain: [2160, 1890],
  altarAbel: [2340, 1890],
  godAltars: [2250, 1760],
  cainAltar: [2150, 2010],
  abelAltar: [2350, 2010],
  // Abel among his flock (mission 2)
  abelFlock: [1500, 1060],
  // the field (mission 4): the gate where they come in, and the jawbone
  fieldGate: [1270, 3200],
  jawbone: [760, 4010],
  godField: [980, 3830],
  // the way out, east (Genesis 4:16)
  nod: [2900, 3440],
};

export const ZONES: Record<string, Zone> = {
  pasture: { x: 1480, y: 760, r: 620 },
  house: { x: 1450, y: 2310, r: 230 },
  altars: { x: 2250, y: 1920, r: 190 },
  field: { x: 1410, y: 3660, r: 520 },
  fieldGate: { x: 1280, y: 3230, r: 120 },
  nod: { x: 2860, y: 3440, r: 120 },
};

/** Where the chase ends badly: Abel runs home to his parents. */
export const SAFE = { x: 1450, y: 2330, r: 210 };

/** The way Abel runs from the field to the house (mission 4). */
export const ESCAPE: Pt[] = [
  [1180, 3700],
  [1260, 3240],
  [1390, 2780],
  [1440, 2420],
];

/** Produce of the ground Cain gathers for his offering (Genesis 4:3). */
export const PRODUCE: { kind: 'grain' | 'gourd' | 'fruit'; at: Pt }[] = [
  { kind: 'grain', at: [760, 3400] },
  { kind: 'grain', at: [1700, 3460] },
  { kind: 'gourd', at: [1100, 3760] },
  { kind: 'gourd', at: [1960, 3820] },
  { kind: 'fruit', at: [580, 3640] },
  { kind: 'fruit', at: [2230, 3600] },
];

/** The flock in the pasture: the ewes wander, the lambs stay near them. */
export const SHEEP: Pt[] = [
  [1380, 650], [1600, 700], [1500, 860], [1250, 980], [1820, 1000], [1150, 560], [1880, 540], [1700, 420],
];
export const LAMBS: Pt[] = [
  [1440, 700], [1560, 800], [1300, 1020], [1760, 950], [1220, 600],
];

/** Groves of the meadow and woods: centre and radius, with how dense. */
export const GROVES: { x: number; y: number; r: number; n: number }[] = [
  { x: 520, y: 1700, r: 330, n: 16 },
  { x: 700, y: 2800, r: 300, n: 14 },
  { x: 2450, y: 1250, r: 300, n: 12 },
  { x: 2400, y: 2650, r: 340, n: 16 },
  { x: 980, y: 1250, r: 200, n: 7 },
  { x: 1950, y: 2600, r: 200, n: 7 },
  { x: 380, y: 3500, r: 180, n: 6 },
  { x: 2600, y: 3950, r: 220, n: 8 },
];

/** Open places the decoration keeps clear of. */
export const CLEAR: Zone[] = [
  { x: 1500, y: 760, r: 300 },
  { x: 1450, y: 2280, r: 260 },
  { x: 2250, y: 1900, r: 230 },
  { x: 250, y: 2300, r: 170 },
  { x: 2860, y: 3440, r: 120 },
];
