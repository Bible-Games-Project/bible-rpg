/**
 * Layout of the Garden of Eden, in world pixels (1 art pixel = 1 world
 * pixel; tiles are 32 px). The map is designed around the missions:
 *
 *   west        Adam's meadow and the garden plot by the river (mission 1)
 *   river       flows south and parts into four heads (Genesis 2:10)
 *   centre      the midst of the garden: the tree of life and the tree of
 *               the knowledge of good and evil (Genesis 2:9)
 *   north-east  open meadow where the animals are named (mission 3)
 *   east        the great oak where Adam sleeps (mission 4); beyond it the
 *               way out of the garden, guarded afterwards (Genesis 3:24)
 *   south-east  the orchard (mission 5) and fig trees (mission 7)
 *   south       the grove where Adam and Eve hide (mission 8)
 */

export type Pt = [number, number];

export interface Zone {
  x: number;
  y: number;
  r: number;
}

export interface Placement {
  kind: string;          // object kind from objects.ts
  x: number;
  y: number;
  id?: string;           // named objects can be referenced by missions
  flip?: boolean;
}

export const TILE = 32;
export const WORLD_W = 4480;
export const WORLD_H = 3328;

/** Garden boundary (walkable area) and the gap of the east exit. */
export const BOUNDS = { left: 200, top: 240, right: 4140, bottom: 3170 };
export const EXIT_GAP = { top: 1580, bottom: 1860 };

export const RIVER = {
  width: 132,
  points: [[1900, -40], [1860, 420], [1950, 860], [1890, 1300], [1960, 1760], [2040, 2180], [2060, 2560]] as Pt[],
  branchWidth: 88,
  // "from thence it was parted, and became into four heads"
  branches: [
    [[2060, 2560], [1820, 2860], [1560, 3400]],
    [[2060, 2560], [1960, 2950], [1900, 3400]],
    [[2060, 2560], [2180, 2960], [2240, 3400]],
    [[2060, 2560], [2400, 2860], [2620, 3400]],
  ] as Pt[][],
};

/** Stepping stones: walkable strips across the water. */
export const FORDS: { from: Pt; to: Pt }[] = [
  { from: [1800, 1310], to: [1990, 1320] },
  { from: [1935, 2190], to: [2150, 2170] },
  { from: [1790, 610], to: [1980, 620] },
];

export const PATHS: { points: Pt[]; width: number }[] = [
  { width: 60, points: [[560, 1200], [900, 1190], [1200, 1230], [1500, 1300], [1800, 1316], [1990, 1320], [2350, 1400], [2760, 1500]] },
  { width: 56, points: [[2760, 1500], [2920, 1180], [3120, 880], [3320, 660]] },
  { width: 56, points: [[2840, 1560], [3300, 1700], [3800, 1720], [4200, 1720], [4480, 1720]] },
  { width: 56, points: [[2960, 1640], [3160, 1960], [3400, 2240], [3520, 2600]] },
  { width: 52, points: [[2700, 1640], [2560, 1960], [2470, 2260], [2470, 2900]] },
  { width: 48, points: [[3120, 880], [3460, 1060], [3760, 1260]] },
  { width: 46, points: [[2150, 2170], [2470, 2260]] },
];

/** Dry, cracked ground beyond the garden's east edge. */
export const DRY = { x: 4200, y: 0, w: 280, h: WORLD_H };

export const POINTS: Record<string, Pt> = {
  adamStart: [900, 1190],
  stick: [1090, 990],
  grain: [960, 1520],
  gourd: [1760, 1190],
  riverFill: [1790, 1235],
  godAppear: [1620, 1110],
  godPlot: [1560, 1180],
  midst: [2820, 1500],
  godCommand: [2830, 1650],
  adamCommand: [2830, 1740],
  godMeadow: [2990, 770],
  gather: [3220, 770],
  restSpot: [3770, 1290],
  godRest: [3640, 1300],
  eveArrive: [3920, 1330],
  basket: [2990, 1930],
  shareSpot: [3440, 2330],
  eveSerpent: [2980, 1660],
  adamSerpent: [3080, 1700],
  serpentBranch: [3010, 1450],
  sewingStone: [2690, 2010],
  // where the LORD God comes into the grove when they hide (mission 8): a
  // little west of his round, on the near bank of the river
  godHideStart: [2150, 2230],
  // the way into the grove (mission 8's arrow): the hiding starts there
  groveEntry: [2470, 2420],
  eveGrove: [2440, 2460],
  godGrove: [2470, 2230],
  adamBefore: [2420, 2330],
  eveBefore: [2520, 2330],
  serpentGround: [2640, 2290],
  // behind the trunk of the oak below serpentGround, where it comes from in
  // mission 9, and a bend around the mossy rock on the way
  serpentFrom: [2662, 2506],
  serpentBend: [2705, 2405],
  exit: [4330, 1720],
  cherubN: [4170, 1630],
  cherubS: [4170, 1820],
  sword: [4170, 1730],
  ending: [4440, 1720],
  godExit: [3980, 1720],
};

export const ZONES: Record<string, Zone> = {
  plot: { x: 1450, y: 1200, r: 170 },
  midst: { x: 2830, y: 1500, r: 230 },
  meadow: { x: 3300, y: 650, r: 520 },
  gather: { x: 3220, y: 770, r: 210 },
  rest: { x: 3770, y: 1290, r: 70 },
  orchard: { x: 3450, y: 2300, r: 520 },
  share: { x: 3440, y: 2330, r: 110 },
  forbidden: { x: 3020, y: 1640, r: 190 },
  figs: { x: 2600, y: 2000, r: 260 },
  grove: { x: 2470, y: 2620, r: 420 },
  godGrove: { x: 2470, y: 2240, r: 160 },
  exit: { x: 4330, y: 1720, r: 110 },
};

/** Garden plot patches for the farming activity (mission 1). */
export const PLOT_PATCHES: Pt[] = [
  [1398, 1176],
  [1446, 1176],
  [1494, 1176],
];

/** God's walk through the grove in the cool of the day (mission 8). */
export const GOD_PATROL: Pt[] = [
  [2200, 2330], [2760, 2330], [2780, 2620], [2700, 2960], [2240, 2960], [2180, 2640],
];

/** Hand-placed landmarks and mission objects. Decoration is scattered in code. */
export const PLACEMENTS: Placement[] = [
  // midst of the garden
  { kind: 'tree-of-life', x: 2600, y: 1370, id: 'treeOfLife' },
  { kind: 'forbidden-tree', x: 3020, y: 1560, id: 'forbiddenTree' },
  { kind: 'flowers-white', x: 2700, y: 1480 },
  { kind: 'flowers-yellow', x: 2900, y: 1420 },
  { kind: 'flowers-pink', x: 2760, y: 1610 },
  // Adam's meadow and the plot
  { kind: 'rock-large', x: 1150, y: 960, id: 'stickRock' },
  { kind: 'digging-stick', x: 1090, y: 994, id: 'stick' },
  { kind: 'grain-plant', x: 930, y: 1512, id: 'grain' },
  { kind: 'grain-plant', x: 990, y: 1530 },
  { kind: 'grain-plant', x: 1040, y: 1508 },
  { kind: 'gourd', x: 1760, y: 1192, id: 'gourd' },
  { kind: 'oak-large-a', x: 760, y: 980 },
  { kind: 'oak-medium-a', x: 1260, y: 1050 },
  { kind: 'blossom', x: 620, y: 1420 },
  { kind: 'olive-a', x: 1300, y: 1560 },
  // the great oak where Adam rests (mission 4)
  { kind: 'oak-large-b', x: 3770, y: 1180, id: 'restOak' },
  // orchard
  { kind: 'fig-a', x: 3140, y: 2120, id: 'fig1' },
  { kind: 'pomegranate-a', x: 3420, y: 2060, id: 'pom1' },
  { kind: 'pomegranate-b', x: 3760, y: 2180, id: 'pom2' },
  { kind: 'fig-b', x: 3600, y: 2420, id: 'fig2' },
  { kind: 'palm-a', x: 3300, y: 2560, id: 'palm1' },
  { kind: 'palm-b', x: 3760, y: 2700, id: 'palm2' },
  { kind: 'grapevine', x: 3920, y: 2420, id: 'vine1' },
  { kind: 'grapevine', x: 3140, y: 2760, id: 'vine2' },
  { kind: 'basket', x: 2990, y: 1934, id: 'basket' },
  // fig trees for the coverings (mission 7)
  { kind: 'fig-a', x: 2480, y: 1930, id: 'fig3' },
  { kind: 'fig-b', x: 2760, y: 2080, id: 'fig4' },
  { kind: 'flat-stone', x: 2650, y: 2010, id: 'sewingStone' },
  // grove (mission 8): dense trees and cover
  { kind: 'oak-large-a', x: 2260, y: 2560 },
  { kind: 'oak-medium-b', x: 2660, y: 2520 },
  { kind: 'olive-b', x: 2340, y: 2840 },
  { kind: 'oak-large-b', x: 2700, y: 2860 },
  { kind: 'cypress-a', x: 2580, y: 2700 },
  { kind: 'oak-medium-a', x: 2190, y: 2770 },
  { kind: 'log', x: 2420, y: 2700 },
  { kind: 'rock-mossy', x: 2640, y: 2380 },
  { kind: 'bush-dark', x: 2330, y: 2440 },
  { kind: 'bush-round', x: 2560, y: 2470 },
  { kind: 'bush-dark', x: 2780, y: 2640 },
  { kind: 'bush-round', x: 2240, y: 2380 },
  { kind: 'bush-dark', x: 2520, y: 2980 },
  { kind: 'fern-b', x: 2380, y: 2500 },
  { kind: 'fern-b', x: 2520, y: 2560 },
  { kind: 'fern-a', x: 2300, y: 2650 },
  { kind: 'fern-b', x: 2620, y: 2620 },
  { kind: 'fern-a', x: 2460, y: 2790 },
  { kind: 'fern-b', x: 2760, y: 2760 },
  { kind: 'fern-a', x: 2200, y: 2900 },
  { kind: 'fern-b', x: 2600, y: 2920 },
  { kind: 'fern-a', x: 2350, y: 2340 },
  { kind: 'fern-b', x: 2700, y: 2420 },
  // the way east
  { kind: 'cypress-b', x: 4060, y: 1540 },
  { kind: 'cypress-a', x: 4060, y: 1920 },
];
