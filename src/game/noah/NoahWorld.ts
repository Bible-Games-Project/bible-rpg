import Phaser from 'phaser';
import { ARK, BOUNDS, CITY, CITY_HOUSES, CLEAR, FOOD, GOPHER, GROVES, PATHS, POINTS, POND, STALLS, TILE, VINES, WORLD_H, WORLD_W } from '../../data/noah/map';
import type { Pt } from '../../data/eden/map';
import type { Surface } from '../../data/soundSlots';
import { MANIFEST, sized, textureScale } from '../manifest';
import { DEPTH_GROUND, DEPTH_SHADOW } from '../world/Actor';
import { distToPolyline, rng, wobble } from '../world/geometry';
import { extrudedTiles } from '../world/Terrain';
import { addShadow } from '../world/shadows';
import { ARK_STAGES, ART, TREES, daySprite, dayTiles } from './art';

export interface NoahTree {
  id: string;
  x: number;
  y: number;
  trunk: Phaser.GameObjects.Image;
  crown: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  body: Phaser.GameObjects.Rectangle;
  bounds: Phaser.Geom.Rectangle;
  fade: number;
  sway: { amp: number; speed: number; phase: number };
  felled: boolean;
}

/** A gopher tree to fell, and what is left of it. */
export interface Gopher {
  tree: NoahTree;
  stump: Phaser.GameObjects.Image;
  log: Phaser.GameObjects.Image;
  hits: number;
  /** felled, the log taken */
  taken: boolean;
}

export type VineState = 'none' | 'soil' | 'bare' | 'grown';

const CANOPY_FADE_MS = 380;

/** Distance to the city's ring (< 0 inside), a little ragged. */
function cityDistance(x: number, y: number, grow = 0): number {
  const k = Math.hypot((x - CITY.x) / (CITY.rx + grow), (y - CITY.y) / (CITY.ry + grow));
  return (k - 1) * Math.min(CITY.rx, CITY.ry) + wobble(x, y, 18);
}

function pondDistance(x: number, y: number): number {
  const k = Math.hypot((x - POND.x) / POND.rx, (y - POND.y) / POND.ry);
  return (k - 1) * POND.ry + wobble(x + 90, y, 14);
}

/**
 * The land before the flood: grass with red flowers, sandy paths, the pond,
 * Noah's house and the place of the ark, the great forest with its gopher
 * trees, the walled city of the wicked, and the woods closing it all in.
 */
/** How far up (a share of the picture's height) a building's shadow starts. */
const SHADOW_LIFT: Record<string, number> = { 'noah-house': 0.18, 'noah-house-small': 0.18, 'noah-stall': 0.12, 'noah-tent': 0.15, 'noah-well': 0.08 };

export class NoahWorld {
  readonly cols = Math.ceil(WORLD_W / TILE);
  readonly rows = Math.ceil(WORLD_H / TILE);
  readonly colliders: Phaser.Physics.Arcade.StaticGroup;
  readonly trees: NoahTree[] = [];
  readonly gopher: Gopher[] = [];
  /** the ark (its building stage as its texture) */
  ark!: Phaser.GameObjects.Image;
  arkShadow: Phaser.GameObjects.Image | undefined;
  arkStage = -1;
  private arkBodies: Phaser.GameObjects.Rectangle[] = [];
  /** the axe by the woodpile */
  axe!: Phaser.GameObjects.Image;
  /** food lying ready for the ark */
  readonly food: Phaser.GameObjects.Image[] = [];
  /** the city: what stands before the flood, and its ruins after */
  private city: Phaser.GameObjects.GameObject[] = [];
  private ruins: Phaser.GameObjects.GameObject[] = [];
  private cityBodies: Phaser.GameObjects.Rectangle[] = [];
  tent!: Phaser.GameObjects.Image;
  private tentParts: Phaser.GameObjects.GameObject[] = [];
  altar!: Phaser.GameObjects.Image;
  private altarParts: Phaser.GameObjects.GameObject[] = [];
  readonly vines: { at: Pt; soil: Phaser.GameObjects.Image; vine: Phaser.GameObjects.Image; state: VineState }[] = [];
  private taken: Pt[] = [];
  private waterLayer!: Phaser.Tilemaps.TilemapLayer;
  private waterTiles: { x: number; y: number; idx: number }[] = [];
  private waterFrame = 0;
  private waterTime = 0;

  constructor(private scene: Phaser.Scene) {
    this.colliders = scene.physics.add.staticGroup();
    this.ground();
    this.home();
    this.arkSite();
    this.buildCity();
    this.afterFlood();
    this.forest();
    this.decor();
  }

  pathDistance(x: number, y: number): number {
    let d = Infinity;
    for (const p of PATHS) d = Math.min(d, distToPolyline(x, y, p.points) - p.width / 2);
    return d + wobble(x + 500, y, 10);
  }

  /** the open sandy ground: round the house, the ark's place and inside the city */
  private yardDistance(x: number, y: number): number {
    const house = Math.hypot(x - 1230, (y - 1200) * 1.3) - 150;
    const ark = Math.hypot((x - 2120) * 0.8, (y - 1130) * 1.8) - 200;
    return Math.min(house, ark, cityDistance(x, y, -40)) + wobble(x, y + 300, 22);
  }

  surfaceAt(x: number, y: number): Surface {
    return this.pathDistance(x, y) < 0 || this.yardDistance(x, y) < 0 ? 'dirt' : 'grass';
  }

  // ------------------------------------------------------------- ground

  private ground(): void {
    const t = MANIFEST.tiles;
    const n = (this.cols + 1) * (this.rows + 1);
    const path = new Uint8Array(n);
    const water = new Uint8Array(n);
    const ci = (cx: number, cy: number) => cy * (this.cols + 1) + cx;
    for (let cy = 0; cy <= this.rows; cy++) {
      for (let cx = 0; cx <= this.cols; cx++) {
        const x = cx * TILE;
        const y = cy * TILE;
        water[ci(cx, cy)] = pondDistance(x, y) < 0 ? 1 : 0;
        path[ci(cx, cy)] = !water[ci(cx, cy)] && (this.pathDistance(x, y) < 0 || this.yardDistance(x, y) < 0) ? 1 : 0;
      }
    }
    const corner = (g: Uint8Array, tx: number, ty: number) => g[ci(tx, ty)] + g[ci(tx + 1, ty)] * 2 + g[ci(tx, ty + 1)] * 4 + g[ci(tx + 1, ty + 1)] * 8;
    const map = this.scene.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: this.cols, height: this.rows });
    const tileset = map.addTilesetImage('tiles', dayTiles(this.scene, extrudedTiles(this.scene)), TILE, TILE, 1, 2)!;
    const ground = map.createBlankLayer('ground', tileset)!.setDepth(DEPTH_GROUND - 1000);
    const pathL = map.createBlankLayer('path', tileset)!.setDepth(DEPTH_GROUND - 980);
    const waterL = map.createBlankLayer('water', tileset)!.setDepth(DEPTH_GROUND - 970);
    this.waterLayer = waterL;
    const r = rng(9);
    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        let g = t.grass[r() < 0.55 ? Math.floor(r() * 4) : 4 + Math.floor(r() * 2)];
        // flowers in the meadows (the picture's red flowers come as decoration)
        const meadow = tx * TILE > 1750 && ty * TILE > 2500;
        if (meadow && r() < 0.12) g = t.flowers[Math.floor(r() * t.flowers.length)];
        ground.putTileAt(g, tx, ty);
        const p = corner(path, tx, ty);
        if (p) pathL.putTileAt(t.path + p, tx, ty);
        const w = corner(water, tx, ty);
        if (w) {
          waterL.putTileAt(t.water[0] + w, tx, ty);
          this.waterTiles.push({ x: tx, y: ty, idx: w });
          if (w === 15) this.solid(tx * TILE + TILE / 2, ty * TILE + TILE / 2, TILE, TILE);
        }
      }
    }
    // reeds round the pond
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + r() * 0.2;
      const x = POND.x + Math.cos(a) * (POND.rx + 8);
      const y = POND.y + Math.sin(a) * (POND.ry + 6);
      if (r() < 0.45) this.place('reeds', x, y);
    }
  }

  /** The pond's water ripples (three frames, like Eden's river). */
  updateWater(delta: number): void {
    this.waterTime += delta;
    if (this.waterTime < 650) return;
    this.waterTime = 0;
    this.waterFrame = (this.waterFrame + 1) % 3;
    const base = MANIFEST.tiles.water[this.waterFrame];
    for (const wt of this.waterTiles) {
      const tile = this.waterLayer.getTileAt(wt.x, wt.y);
      if (tile) tile.index = base + wt.idx;
    }
  }

  // -------------------------------------------------------------- home

  private home(): void {
    const [hx, hy] = POINTS.house;
    this.place('noah-house', hx, hy);
    this.solid(hx - 10, hy - 40, 170, 70);
    this.taken.push([hx, hy - 40]);
    const [wx, wy] = POINTS.woodpile;
    this.place('noah-logs', wx, wy);
    this.solid(wx - 4, wy - 10, 50, 18);
    this.axe = this.scene.add.image(wx + 34, wy + 14, 'noah-axe').setScale(ART).setAngle(-18).setDepth(wy + 14);
    this.place('noah-day-basket', hx + 110, hy + 30, undefined, 'basket');
    this.place('noah-jars', hx - 120, hy + 6);
    for (const f of FOOD) {
      const img = this.place(`noah-${f.kind}`, f.at[0], f.at[1]);
      img.setVisible(false);
      this.food.push(img);
    }
  }

  // -------------------------------------------------------------- ark

  private arkSite(): void {
    const [lx, ly] = POINTS.lumber;
    this.place('noah-planks', lx - 40, ly);
    this.place('noah-logs', lx + 30, ly + 10);
    this.solid(lx - 5, ly - 8, 110, 20);
    this.ark = this.scene.add.image(ARK.x, ARK.y, 'noah-ark-0').setVisible(false);
    // the hull, beside the ramp
    const body = (x: number, y: number, w: number, h: number) => {
      const b = this.solid(x, y, w, h);
      this.arkBodies.push(b);
    };
    body(ARK.x + 60, ARK.y - 90, 600, 130);
    body(ARK.x - 300, ARK.y - 110, 150, 110);
    body(ARK.x - 150, ARK.y - 150, 170, 80);
    this.setArk(-1);
  }

  /** The ark at a stage of building (-1: not begun; ARK_STAGES - 1: finished). */
  setArk(stage: number): void {
    this.arkStage = stage;
    this.arkShadow?.destroy();
    this.arkShadow = undefined;
    const on = stage >= 0;
    for (const b of this.arkBodies) (b.body as Phaser.Physics.Arcade.StaticBody).enable = on;
    this.ark.setVisible(on);
    if (!on) return;
    const key = `noah-ark-${Math.min(stage, ARK_STAGES - 1)}`;
    const a = MANIFEST.sprites[key];
    this.ark.setTexture(key).setOrigin(a.anchorX / a.frameWidth, (a.anchorY + 1) / a.frameHeight).setScale(ART).setDepth(ARK.y);
    this.arkShadow = addShadow(this.scene, ARK.x, ARK.y, key);
  }

  // ------------------------------------------------------------- city

  /** The city of the wicked: a ring of walls, houses with red roofs, stalls and a well. */
  private buildCity(): void {
    const r = rng(17);
    const add = (o: Phaser.GameObjects.GameObject | undefined) => o && this.city.push(o);
    const steps = 30;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      let da = Math.abs(a - ((CITY.gate + Math.PI * 2) % (Math.PI * 2)));
      da = Math.min(da, Math.PI * 2 - da);
      if (da < CITY.gateWidth / 2) continue;
      // only some stretches of wall still stand (the maintainer): two and a gap
      if (i % 5 >= 2) continue;
      const x = CITY.x + Math.cos(a) * CITY.rx;
      const y = CITY.y + Math.sin(a) * CITY.ry;
      const img = this.place('noah-town-wall', x, y + 10);
      add(img);
      add(this.lastShadow);
      this.cityBodies.push(this.solid(x, y, 104, 34));
      if (r() < 0.3) this.ruins.push(this.place('noah-rubble', x + (r() - 0.5) * 30, y + 12).setVisible(false));
    }
    for (const h of CITY_HOUSES) {
      const [x, y] = h.at;
      const img = this.place(h.small ? 'noah-house-small' : 'noah-house', x, y, y, undefined, !!h.flip);
      add(img);
      add(this.lastShadow);
      this.cityBodies.push(this.solid(x, y - 30, h.small ? 120 : 170, 60));
      this.taken.push([x, y - 30]);
      this.ruins.push(this.place('noah-rubble', x, y).setVisible(false));
      this.ruins.push(this.place('noah-rubble', x + 50, y - 20).setVisible(false));
    }
    for (const [x, y] of STALLS) {
      add(this.place('noah-stall', x, y));
      add(this.lastShadow);
      this.cityBodies.push(this.solid(x - 8, y - 8, 80, 16));
      add(this.place('noah-jars', x + 50, y + 8));
    }
    const [wx, wy] = POINTS.well;
    add(this.place('noah-well', wx, wy));
    this.solid(wx, wy - 10, 56, 24);
  }

  /** After the flood the city is gone: ruins in its place (Genesis 7:23). */
  /** whether the city stands (before the flood) */
  cityStanding = true;

  setCity(standing: boolean): void {
    this.cityStanding = standing;
    for (const o of this.city) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(standing);
    for (const o of this.ruins) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(!standing);
    for (const b of this.cityBodies) (b.body as Phaser.Physics.Arcade.StaticBody).enable = standing;
  }

  // ------------------------------------------------------ after the flood

  private afterFlood(): void {
    const [tx, ty] = POINTS.tent;
    this.tent = this.place('noah-tent', tx, ty);
    this.tentParts.push(this.tent);
    if (this.lastShadow) this.tentParts.push(this.lastShadow);
    this.tentParts.push(this.solid(tx, ty - 30, 110, 50));
    const [ax, ay] = POINTS.altar;
    this.altar = this.place('noah-altar', ax, ay);
    this.altarParts.push(this.altar);
    if (this.lastShadow) this.altarParts.push(this.lastShadow);
    this.altarParts.push(this.solid(ax, ay - 10, 52, 22));
    for (const at of VINES) {
      const soil = this.scene.add.image(at[0], at[1] + 4, daySprite(this.scene, 'soil-tilled')).setScale(ART).setDepth(DEPTH_GROUND + 10).setVisible(false);
      const vine = this.place('noah-vine', at[0], at[1]).setVisible(false);
      this.vines.push({ at, soil, vine, state: 'none' });
    }
    this.showTent(false);
    this.showAltar(false);
  }

  showTent(on: boolean): void {
    for (const o of this.tentParts) {
      if (o instanceof Phaser.GameObjects.Rectangle) (o.body as Phaser.Physics.Arcade.StaticBody).enable = on;
      else (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(on);
    }
  }

  showAltar(on: boolean): void {
    for (const o of this.altarParts) {
      if (o instanceof Phaser.GameObjects.Rectangle) (o.body as Phaser.Physics.Arcade.StaticBody).enable = on;
      else (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(on);
    }
  }

  setVine(i: number, state: VineState): void {
    const v = this.vines[i];
    if (!v) return;
    v.state = state;
    v.soil.setVisible(state !== 'none');
    v.vine.setVisible(state === 'bare' || state === 'grown').setTexture(state === 'grown' ? 'noah-vine' : 'noah-vine-bare');
  }

  // --------------------------------------------------------------- trees

  private free(x: number, y: number, d: number): boolean {
    if (CLEAR.some((z) => Math.hypot(z.x - x, z.y - y) < z.r)) return false;
    if (this.pathDistance(x, y) < 26) return false;
    if (cityDistance(x, y, 90) < 0) return false;
    if (pondDistance(x, y) < 40) return false;
    return !this.taken.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < d);
  }

  addTree(id: string, x: number, y: number, flip = false): NoahTree | undefined {
    const art = TREES[id];
    if (!art) return undefined;
    const ox = (flip ? art.w - art.ax : art.ax) / art.w;
    const oy = (art.ay + 1) / art.h;
    const part = (key: string, depth: number) => this.scene.add.image(x, y, key).setOrigin(ox, oy).setDepth(depth).setScale(ART).setFlipX(flip);
    const trunk = part(art.trunk, y);
    const crown = part(art.crown, y + 0.1);
    const shadow = this.scene.add.image(x + 16, y - 2, art.shadow).setScale(ART).setDepth(DEPTH_SHADOW).setAlpha(0.3);
    const body = this.solid(x, y - art.foot.h * ART * 0.5, art.foot.w * ART, art.foot.h * ART);
    const cb = art.crownBox;
    const left = flip ? x - (cb.x + cb.w - art.ax) * ART : x + (cb.x - art.ax) * ART;
    const bounds = new Phaser.Geom.Rectangle(left, y + (cb.y - art.ay) * ART, cb.w * ART, cb.h * ART);
    const r = rng(Math.round(x * 7 + y * 13));
    const bush = id.startsWith('bush');
    const t: NoahTree = { id, x, y, trunk, crown, shadow, body, bounds, fade: 0, sway: { amp: (bush ? 0.02 : 0.01) * (0.7 + 0.6 * r()), speed: (Math.PI * 2) / (3.2 + 2.6 * r()), phase: r() * Math.PI * 2 }, felled: false };
    this.trees.push(t);
    this.taken.push([x, y]);
    return t;
  }

  /** A gopher tree standing (or felled, its log taken or lying), for a saved game. */
  setGopher(i: number, state: 'standing' | 'felled' | 'taken'): void {
    const g = this.gopher[i];
    if (!g) return;
    const t = g.tree;
    t.felled = state !== 'standing';
    t.trunk.setVisible(!t.felled).setAngle(0).setAlpha(1);
    t.crown.setVisible(!t.felled).setAngle(0).setAlpha(1);
    t.shadow.setVisible(!t.felled);
    (t.body.body as Phaser.Physics.Arcade.StaticBody).enable = !t.felled;
    g.stump.setVisible(t.felled);
    g.log.setVisible(state === 'felled');
    g.taken = state === 'taken';
    g.hits = 0;
  }

  /** The tree falls (to the side away from Noah), leaving its stump and a log. */
  fell(i: number, side: number): Promise<void> {
    const g = this.gopher[i];
    const t = g.tree;
    t.felled = true;
    (t.body.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    g.stump.setVisible(true);
    return new Promise((resolve) => {
      this.scene.tweens.add({ targets: [t.trunk, t.crown], angle: side * 84, duration: 900, ease: 'Quad.easeIn' });
      this.scene.tweens.add({
        targets: [t.trunk, t.crown, t.shadow],
        alpha: 0,
        delay: 850,
        duration: 450,
        onComplete: () => {
          t.trunk.setVisible(false);
          t.crown.setVisible(false);
          t.shadow.setVisible(false);
          g.log.setVisible(true).setAlpha(0);
          this.scene.tweens.add({ targets: g.log, alpha: 1, duration: 250 });
          resolve();
        },
      });
    });
  }

  private forest(): void {
    const r = rng(11);
    const kinds = ['oak-1', 'oak-2', 'olive', 'young', 'oak-small', 'cypress', 'cypress-small', 'umbrella', 'oak-1', 'cypress'];
    const pick = (list: string[]) => list[Math.floor(r() * list.length)];
    // the gopher trees first: tall cypresses beside the paths
    for (const [x, y] of GOPHER) {
      const tree = this.addTree('cypress', x, y, r() < 0.5)!;
      const stump = this.place('noah-stump', x, y + 2).setVisible(false);
      const log = this.place('noah-log', x + 34, y + 14).setVisible(false);
      this.gopher.push({ tree, stump, log, hits: 0, taken: false });
    }
    for (const g of GROVES) {
      let placed = 0;
      for (let tries = 0; tries < g.n * 12 && placed < g.n; tries++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * g.r;
        const x = g.x + Math.cos(a) * d;
        const y = g.y + Math.sin(a) * d * 0.85;
        if (x < BOUNDS.left + 20 || x > BOUNDS.right - 20 || y < BOUNDS.top + 60 || y > BOUNDS.bottom) continue;
        if (!this.free(x, y, 88)) continue;
        this.addTree(r() < 0.16 ? pick(['bush-0', 'bush-1', 'bush-2']) : pick(kinds), x, y, r() < 0.5);
        placed++;
      }
    }
    // the woods all around, closing the land in
    const ring: Pt[] = [];
    for (let x = 40; x < WORLD_W; x += 110) {
      ring.push([x, BOUNDS.top - 30 - r() * 120]);
      ring.push([x, BOUNDS.top - 170 - r() * 60]);
      ring.push([x, BOUNDS.bottom + 60 + r() * 100]);
      ring.push([x, WORLD_H - 20]);
    }
    for (let y = BOUNDS.top; y < WORLD_H; y += 105) {
      ring.push([BOUNDS.left - 40 - r() * 100, y]);
      ring.push([BOUNDS.right + 40 + r() * 90, y]);
      ring.push([30, y + 50]);
    }
    for (const [x0, y0] of ring) {
      const x = x0 + (r() - 0.5) * 50;
      const y = y0 + (r() - 0.5) * 40;
      if (this.taken.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < 70)) continue;
      this.addTree(pick(kinds), x, y, r() < 0.5);
    }
    // bushes and lone trees everywhere else
    for (let i = 0; i < 160; i++) {
      const x = BOUNDS.left + r() * (BOUNDS.right - BOUNDS.left);
      const y = BOUNDS.top + 80 + r() * (BOUNDS.bottom - BOUNDS.top - 80);
      if (!this.free(x, y, 110)) continue;
      this.addTree(r() < 0.55 ? pick(['bush-0', 'bush-1', 'bush-2']) : pick(kinds), x, y, r() < 0.5);
    }
  }

  private decor(): void {
    const r = rng(23);
    const keys = ['grass-tuft-0', 'grass-tuft-1', 'grass-tuft-2', 'grass-tuft-0', 'flowers-red', 'flowers-red', 'flowers-white', 'fern-a', 'fern-b', 'rock-small', 'mushrooms', 'flowers-red'];
    for (let i = 0; i < 520; i++) {
      const x = 60 + r() * (WORLD_W - 120);
      const y = 120 + r() * (WORLD_H - 160);
      if (this.pathDistance(x, y) < 6 || this.yardDistance(x, y) < 0 || pondDistance(x, y) < 20) continue;
      const shared = keys[Math.floor(r() * keys.length)];
      if (!MANIFEST.sprites[shared]) continue;
      // the red flowers keep their own red (the picture's), the rest the chapter's greens
      const key = shared === 'flowers-red' ? shared : daySprite(this.scene, shared);
      const a = MANIFEST.sprites[key];
      const img = sized(this.scene.add.image(x, y, key).setOrigin(a.anchorX / a.frameWidth, 1).setDepth(key.includes('rock') ? y : DEPTH_GROUND + 20 + y * 0.0001)).setFlipX(r() < 0.5);
      if (cityDistance(x, y) < 0) this.city.push(img);
    }
    for (const [x, y, k] of [[2050, 1900, 'rock-mossy'], [2600, 2950, 'rock-large'], [400, 2150, 'rock-medium'], [2550, 1700, 'boulder-a'], [350, 3300, 'boulder-b'], [1700, 3400, 'boulder-c']] as [number, number, string][]) {
      if (!MANIFEST.sprites[k] || !this.free(x, y, 60)) continue;
      this.place(k, x, y);
      this.solid(x, y - 6, 30, 12);
    }
  }

  // -------------------------------------------------------------- helpers

  /** the shadow of the last thing placed */
  private lastShadow: Phaser.GameObjects.Image | undefined;

  /** A sprite standing on the ground at its base point, sorted by it. */
  place(key: string, x: number, y: number, depth = y, shared?: string, flip = false): Phaser.GameObjects.Image {
    const k = shared ? daySprite(this.scene, shared) : key.startsWith('noah-') ? key : daySprite(this.scene, key);
    const a = MANIFEST.sprites[k];
    const img = sized(this.scene.add.image(x, y, k).setOrigin(a ? a.anchorX / a.frameWidth : 0.5, a ? (a.anchorY + 1) / a.frameHeight : 1).setDepth(depth).setFlipX(flip));
    if (flip && a) img.setOrigin(1 - a.anchorX / a.frameWidth, img.originY);
    this.lastShadow = addShadow(this.scene, x, y, k, flip);
    // buildings are drawn from above: their base runs back up the picture, so the shadow starts higher (the maintainer: it looked like they floated)
    const lift = SHADOW_LIFT[k];
    if (lift && this.lastShadow) this.lastShadow.y -= lift * a!.frameHeight * textureScale(k);
    // the shadow comes and goes with its thing (hidden food, rubble and vines left their shadows lying about: the maintainer saw six under Noah's house)
    const shadow = this.lastShadow;
    if (shadow) {
      const show = img.setVisible.bind(img);
      img.setVisible = (on: boolean) => {
        shadow.setVisible(on);
        return show(on);
      };
    }
    return img;
  }

  private solid(x: number, y: number, w: number, h: number): Phaser.GameObjects.Rectangle {
    const rect = this.scene.add.rectangle(x, y, w, h).setVisible(false);
    this.colliders.add(rect);
    return rect;
  }

  /** Leaves turn see-through while they hide the player. */
  updateCanopies(px: number, py: number, view: Phaser.Geom.Rectangle, delta: number): void {
    const step = delta / CANOPY_FADE_MS;
    for (const t of this.trees) {
      if (t.felled || !Phaser.Geom.Rectangle.Overlaps(view, t.bounds)) continue;
      const behind = py < t.y - 4 && Phaser.Geom.Rectangle.Contains(t.bounds, px, py - 40);
      const target = behind ? 1 : 0;
      if (t.fade === target) continue;
      t.fade = Phaser.Math.Clamp(t.fade + (target > t.fade ? step : -step), 0, 1);
      t.crown.setAlpha(1 - 0.62 * t.fade * t.fade * (3 - 2 * t.fade));
    }
  }

  /** A breeze through the leaves; `wind` above 1 bends them harder (the wind after the flood). */
  updateWind(time: number, view: Phaser.Geom.Rectangle, wind = 1): void {
    const s = time / 1000;
    for (const t of this.trees) {
      if (t.felled || !Phaser.Geom.Rectangle.Overlaps(view, t.bounds)) continue;
      const gust = 0.55 + 0.45 * Math.sin(s * 0.33 - t.x * 0.0021 - t.y * 0.0013);
      const a = t.sway.amp * wind * gust * (Math.sin(s * t.sway.speed * Math.sqrt(wind) + t.sway.phase) * 0.8 + Math.sin(s * t.sway.speed * 2.3 + t.sway.phase * 1.7) * 0.2);
      t.crown.setRotation(a);
      t.shadow.setRotation(a * 0.45);
    }
  }
}
