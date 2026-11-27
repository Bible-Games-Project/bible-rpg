import type { Pt, Zone } from '../eden/map';

/**
 * The land of Noah before the flood (Genesis 6–9), in world pixels (tiles
 * are 32 px), about the size of Cain and Abel's (the maintainer):
 *
 *   north     Noah's house, and the ark built on the high ground to the east (top right)
 *   centre    the great forest, where the gopher wood grows
 *   south-west the walled city of the wicked (bottom left)
 *   south-east meadows and a pond, where the animals graze
 */

export const TILE = 32;
export const WORLD_W = 2944;
export const WORLD_H = 4480;

/** The walkable land; the woods beyond close it in. */
export const BOUNDS = { left: 150, top: 330, right: 2800, bottom: 4290 };

/** The ark: the middle of its keel (where it stands), and its size in world px. */
export const ARK = { x: 2260, y: 1060, w: 764, h: 358 };
/** the foot of the ark's ramp, where everyone goes in (Genesis 7:7) */
export const ARK_DOOR: Pt = [2150, 1078];

/** The wicked city: a ring of stone walls with a gate to the north-east. */
export const CITY = { x: 820, y: 3660, rx: 560, ry: 420, gate: -1.2, gateWidth: 0.42 };
export const CITY_GATE: Pt = [CITY.x + Math.cos(CITY.gate) * CITY.rx, CITY.y + Math.sin(CITY.gate) * CITY.ry];

/** The pond in the meadows. */
export const POND = { x: 2420, y: 2080, rx: 200, ry: 120 };

export const PATHS: { points: Pt[]; width: number }[] = [
  // from Noah's house east to the ark
  { width: 56, points: [[1250, 1200], [1500, 1230], [1800, 1190], [2050, 1110], [ARK_DOOR[0], ARK_DOOR[1] + 10]] },
  // south from the house through the forest to the city's gate
  { width: 50, points: [[1230, 1230], [1300, 1600], [1220, 2000], [1340, 2400], [1260, 2800], [1180, 3060], [CITY_GATE[0] + 10, CITY_GATE[1] - 30]] },
  // from the forest east to the meadows
  { width: 44, points: [[1320, 2420], [1700, 2560], [2050, 2700], [2300, 2950], [2400, 3400]] },
  // from the house west, where the vineyard and the tent will be
  { width: 44, points: [[1200, 1210], [950, 1290], [700, 1300]] },
  // the city's streets: round its well
  { width: 54, points: [[CITY_GATE[0], CITY_GATE[1] + 20], [CITY.x + 120, CITY.y - 140], [CITY.x, CITY.y - 40], [CITY.x - 220, CITY.y + 40], [CITY.x - 200, CITY.y + 250]] },
  { width: 48, points: [[CITY.x, CITY.y - 40], [CITY.x + 230, CITY.y + 120], [CITY.x + 120, CITY.y + 300]] },
];

export const POINTS: Record<string, Pt> = {
  // Noah's house, his wife at the door, the axe by the woodpile
  house: [1180, 1160],
  noahStart: [1300, 1260],
  wife: [1100, 1250],
  woodpile: [1390, 1170],
  // where God speaks to Noah (Genesis 6:13)
  godHome: [1430, 1080],
  // the lumber by the ark, where the wood is brought
  lumber: [1900, 1180],
  arkWork: [1980, 1150],
  // before the ark, not behind it (the maintainer: God was hidden by the ark)
  godArk: [1690, 1150],
  // where the spirit of God begins (above the world, over the forest)
  spiritStart: [1500, 2300],
  // the city's well
  well: [CITY.x, CITY.y - 10],
  // the altar after the flood (Genesis 8:20) and the bow in the cloud
  altar: [1880, 1420],
  altarFront: [1880, 1500],
  godAltar: [1700, 1330],
  // the vineyard and Noah's tent (Genesis 9:20–21)
  tent: [620, 1240],
  tentDoor: [640, 1290],
  brothers: [900, 1500],
  vineyard: [900, 1380],
  // the dove's island: a mountain top above the water (Genesis 8:5, 11),
  // some 5 s of flight from the ark's window (her strength lasts 15 s)
  island: [1450, 1650],
};

export const ZONES: Record<string, Zone> = {
  house: { x: 1250, y: 1200, r: 220 },
  ark: { x: ARK_DOOR[0], y: ARK_DOOR[1], r: 110 },
  lumber: { x: 1900, y: 1180, r: 110 },
  city: { x: CITY.x, y: CITY.y, r: 520 },
  altar: { x: 1880, y: 1450, r: 110 },
  tent: { x: 640, y: 1300, r: 90 },
  island: { x: 1450, y: 1620, r: 90 },
};

/** The gopher trees Noah fells (Genesis 6:14): cypresses at the forest's paths. */
export const GOPHER: Pt[] = [
  [1130, 1760],
  [1470, 1880],
  [1060, 2150],
  [1520, 2260],
  [1150, 2560],
];
/** How many of them Noah fells and carries to the ark, all at once. */
export const LOGS_NEEDED = 3;

/** What the spirit of God sees on the earth (Genesis 6:5, 11–12). */
export const SINS: { id: string; at: Pt }[] = [
  { id: 'robbery', at: [560, 3500] },
  { id: 'violence', at: [1080, 3840] },
  { id: 'harass', at: [560, 3900] },
  { id: 'lies', at: [1020, 3480] },
];

/** Houses of the city (their base points) and its market stalls. */
export type HouseKind = 'house' | 'house-small' | 'house-mud' | 'house-tall' | 'house-thatch' | 'house-awning';
/** The city's houses, each of its own kind (the maintainer: "the houses are all the same"). */
export const CITY_HOUSES: { at: Pt; kind: HouseKind; flip?: boolean }[] = [
  { at: [520, 3420], kind: 'house' },
  { at: [760, 3360], kind: 'house-mud' },
  { at: [1150, 3600], kind: 'house-small', flip: true },
  { at: [420, 3720], kind: 'house-thatch' },
  { at: [700, 3960], kind: 'house-tall' },
  { at: [1000, 4000], kind: 'house-awning', flip: true },
  { at: [380, 3990], kind: 'house-small', flip: true },
];
export const STALLS: Pt[] = [[600, 3560], [1060, 3540], [880, 3820]];

/** Pairs of animals that come to the ark (Genesis 7:2–3, 8–9): seven pairs of clean beasts and fowl, one of the unclean. */
export const PAIRS: { species: string; clean: boolean; at: Pt }[] = [
  { species: 'sheep', clean: true, at: [2150, 3250] },
  { species: 'sheep', clean: true, at: [2480, 3680] },
  { species: 'goat', clean: true, at: [1850, 3960] },
  { species: 'goat', clean: true, at: [2650, 3100] },
  { species: 'deer', clean: true, at: [2220, 2650] },
  { species: 'deer', clean: true, at: [1750, 3150] },
  { species: 'dove', clean: true, at: [1600, 3600] },
  { species: 'lion', clean: false, at: [480, 2500] },
];

/** Food for the ark (Genesis 6:21): sacks of grain at the house, hay in the meadows. */
export const FOOD: { kind: 'sack' | 'hay'; at: Pt }[] = [
  { kind: 'sack', at: [1030, 1120] },
  { kind: 'sack', at: [1080, 1100] },
  { kind: 'sack', at: [1420, 1240] },
  // the hay in the field below the path to the ark (the maintainer: the meadows were too far)
  { kind: 'hay', at: [1600, 1350] },
  { kind: 'hay', at: [1740, 1310] },
  { kind: 'hay', at: [1480, 1410] },
];

/** Where the family are when the seven days begin (Genesis 7:1, 7). */
export const FAMILY: Record<string, Pt> = {
  'noah-wife': [1100, 1250],
  shem: [1960, 1240],
  'shem-wife': [980, 1200],
  ham: [1320, 1720],
  'ham-wife': [1500, 1290],
  japheth: [2120, 1560],
  'japheth-wife': [1700, 1520],
};

/** The vineyard: where Noah plants (Genesis 9:20). */
export const VINES: Pt[] = [
  [820, 1360], [920, 1360], [1020, 1360],
  [820, 1450], [920, 1450], [1020, 1450],
];

/** Groves of the land (centre, radius, how many trees): the forest is thick. */
export const GROVES: { x: number; y: number; r: number; n: number }[] = [
  { x: 700, y: 1800, r: 420, n: 30 },
  { x: 1700, y: 1800, r: 360, n: 22 },
  { x: 900, y: 2400, r: 420, n: 30 },
  { x: 1800, y: 2350, r: 300, n: 16 },
  { x: 500, y: 2900, r: 320, n: 18 },
  { x: 1500, y: 2900, r: 300, n: 16 },
  { x: 2500, y: 1500, r: 260, n: 12 },
  { x: 2650, y: 2500, r: 200, n: 8 },
  { x: 600, y: 800, r: 300, n: 14 },
  { x: 1600, y: 700, r: 260, n: 10 },
  { x: 2600, y: 4050, r: 220, n: 8 },
  { x: 1600, y: 4150, r: 200, n: 7 },
];

/** Open places the decoration keeps clear of. */
export const CLEAR: Zone[] = [
  { x: 1220, y: 1180, r: 230 },
  { x: 2200, y: 1020, r: 480 },
  { x: 1880, y: 1420, r: 150 },
  { x: 800, y: 1330, r: 300 },
  ...PAIRS.map((p) => ({ x: p.at[0], y: p.at[1], r: 90 })),
  ...FOOD.map((p) => ({ x: p.at[0], y: p.at[1], r: 60 })),
  ...Object.values(FAMILY).map((p) => ({ x: p[0], y: p[1], r: 70 })),
  ...GOPHER.map((p) => ({ x: p[0], y: p[1], r: 90 })),
];
