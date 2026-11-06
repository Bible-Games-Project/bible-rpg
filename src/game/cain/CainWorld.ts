import Phaser from 'phaser';
import { BOUNDS, CLEAR, ESCAPE, FIELD, FOLD, GROVES, PATHS, POINTS, PRODUCE, TILE, TORCHES, WORLD_H, WORLD_W } from '../../data/cain/map';
import type { Pt } from '../../data/eden/map';
import type { Surface } from '../../data/soundSlots';
import { MANIFEST, sized } from '../manifest';
import { DEPTH_GROUND, DEPTH_OVERLAY, DEPTH_SHADOW } from '../world/Actor';

/** The torches' light lies over the world, under the overlays. */
const DEPTH_LIGHT = DEPTH_OVERLAY - 400;
import { distToPolyline, rng, wobble } from '../world/geometry';
import { extrudedTiles } from '../world/Terrain';
import { addShadow } from '../world/shadows';
import { ART, TREES } from './art';
import { NIGHT_SHADOW, nightSprite, nightTiles } from './palette';

export interface CainTree {
  x: number;
  y: number;
  trunk: Phaser.GameObjects.Image;
  crown: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  bounds: Phaser.Geom.Rectangle;
  fade: number;
  sway: { amp: number; speed: number; phase: number };
  bare?: string;
}

export interface Produce {
  kind: 'grain' | 'gourd' | 'fruit';
  at: Pt;
  picked: boolean;
  sprites: Phaser.GameObjects.Image[];
  tree?: CainTree;
}

const CANOPY_FADE_MS = 380;

/** Distance from a point to the field's edge (< 0 inside), with a ragged border. */
function fieldDistance(x: number, y: number): number {
  const dx = Math.max(FIELD.x - x, x - (FIELD.x + FIELD.w));
  const dy = Math.max(FIELD.y - y, y - (FIELD.y + FIELD.h));
  const out = Math.hypot(Math.max(0, dx), Math.max(0, dy));
  const inside = Math.min(0, Math.max(dx, dy));
  return out + inside + wobble(x, y, 26);
}

/**
 * The land of the chapter: the ground (grass, paths, the tilled field),
 * Cain's furrows and crops, the groves of new trees and the woods closing
 * the land in, Adam and Eve's house, the two altars and the sheepfold.
 */
export class CainWorld {
  readonly cols = Math.ceil(WORLD_W / TILE);
  readonly rows = Math.ceil(WORLD_H / TILE);
  readonly colliders: Phaser.Physics.Arcade.StaticGroup;
  readonly trees: CainTree[] = [];
  readonly produce: Produce[] = [];
  /** where things lie on top of each altar */
  readonly altarTop: Record<'cain' | 'abel', Pt> = { cain: [0, 0], abel: [0, 0] };
  /** the jawbone of an ass lying in the field (mission 4) */
  jawbone!: Phaser.GameObjects.Image;
  /** Abel's grave, after mission 4 (hidden until then) */
  grave!: Phaser.GameObjects.Image;
  private taken: Pt[] = [];
  /** the torches' light, flickering */
  private lights: { img: Phaser.GameObjects.Image; flame: Phaser.GameObjects.Sprite; scale: number; phase: number }[] = [];

  constructor(private scene: Phaser.Scene) {
    this.colliders = scene.physics.add.staticGroup();
    this.ground();
    this.field();
    this.house();
    this.altars();
    this.fold();
    this.torches();
    this.woods();
    this.decor();
  }

  pathDistance(x: number, y: number): number {
    let d = Infinity;
    for (const p of PATHS) d = Math.min(d, distToPolyline(x, y, p.points) - p.width / 2);
    return d + wobble(x + 500, y, 10);
  }

  private yardDistance(x: number, y: number): number {
    const house = Math.hypot(x - 1450, (y - 2300) * 1.3) - 170;
    const altars = Math.hypot(x - 2250, (y - 1920) * 1.4) - 150;
    const fold = Math.hypot(x - FOLD.x, (y - FOLD.y) * 1.2) - FOLD.r * 0.8;
    return Math.min(house, altars, fold) + wobble(x, y + 300, 22);
  }

  surfaceAt(x: number, y: number): Surface {
    return this.pathDistance(x, y) < 0 || fieldDistance(x, y) < 0 || this.yardDistance(x, y) < 0 ? 'dirt' : 'grass';
  }

  // ------------------------------------------------------------- ground

  private ground(): void {
    const t = MANIFEST.tiles;
    const n = (this.cols + 1) * (this.rows + 1);
    const path = new Uint8Array(n);
    const dry = new Uint8Array(n);
    const ci = (cx: number, cy: number) => cy * (this.cols + 1) + cx;
    for (let cy = 0; cy <= this.rows; cy++) {
      for (let cx = 0; cx <= this.cols; cx++) {
        const x = cx * TILE;
        const y = cy * TILE;
        dry[ci(cx, cy)] = fieldDistance(x, y) < 0 ? 1 : 0;
        path[ci(cx, cy)] = !dry[ci(cx, cy)] && (this.pathDistance(x, y) < 0 || this.yardDistance(x, y) < 0) ? 1 : 0;
      }
    }
    const corner = (g: Uint8Array, tx: number, ty: number) => g[ci(tx, ty)] + g[ci(tx + 1, ty)] * 2 + g[ci(tx, ty + 1)] * 4 + g[ci(tx + 1, ty + 1)] * 8;
    const map = this.scene.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: this.cols, height: this.rows });
    const tileset = map.addTilesetImage('tiles', nightTiles(this.scene, extrudedTiles(this.scene)), TILE, TILE, 1, 2)!;
    const ground = map.createBlankLayer('ground', tileset)!.setDepth(DEPTH_GROUND - 1000);
    const dryL = map.createBlankLayer('dry', tileset)!.setDepth(DEPTH_GROUND - 990);
    const pathL = map.createBlankLayer('path', tileset)!.setDepth(DEPTH_GROUND - 980);
    const r = rng(7);
    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        let g = t.grass[r() < 0.55 ? Math.floor(r() * 4) : 4 + Math.floor(r() * 2)];
        const meadow = Math.hypot(tx * TILE - 900, ty * TILE - 2000) < 500 || Math.hypot(tx * TILE - 1900, ty * TILE - 1350) < 420;
        if (meadow && r() < 0.14) g = t.flowers[Math.floor(r() * t.flowers.length)];
        ground.putTileAt(g, tx, ty);
        const d = corner(dry, tx, ty);
        if (d) dryL.putTileAt(t.dry + d, tx, ty);
        const p = corner(path, tx, ty);
        if (p) pathL.putTileAt(t.path + p, tx, ty);
      }
    }
  }

  // -------------------------------------------------------------- field

  /** Cain's field: furrows across the tilled earth, crops in rows (Genesis 4:2). */
  private field(): void {
    const r = rng(31);
    const keep = (x: number, y: number, d: number) =>
      PRODUCE.some((p) => Math.hypot(p.at[0] - x, p.at[1] - y) < d) || Math.hypot(POINTS.jawbone[0] - x, POINTS.jawbone[1] - y) < d || Math.hypot(POINTS.grave[0] - x, POINTS.grave[1] - y) < d + 50 || distToPolyline(x, y, ESCAPE) < 34 || this.pathDistance(x, y) < 10;
    // furrows dug by hand: rows that wander, bunch up and spread apart, with
    // gaps (the maintainer: ruler-straight rows looked fake)
    const rowY = (base: number, x: number) => base + 9 * Math.sin(x / 260 + base * 0.013) + 4 * Math.sin(x / 93 + base * 0.031) + (x - FIELD.x) * 0.012 * Math.sin(base * 0.007);
    const rows: number[] = [];
    for (let y = FIELD.y + 40; y < FIELD.y + FIELD.h - 20; y += 24 + r() * 12) rows.push(y);
    for (const base of rows) {
      for (let x = FIELD.x + 30 + r() * 40; x < FIELD.x + FIELD.w - 30; x += 70 + r() * 26) {
        if (r() < 0.07) continue;
        const fx = x + (r() - 0.5) * 8;
        const fy = rowY(base, fx) + (r() - 0.5) * 3;
        if (fieldDistance(fx, fy) > -24 || this.pathDistance(fx, fy) < 0) continue;
        const slope = (rowY(base, fx + 20) - rowY(base, fx - 20)) / 40;
        const f = this.scene.add.image(fx, fy, `cain-furrow-${Math.floor(r() * 3)}`).setDepth(DEPTH_GROUND + 4 + fy * 0.0001);
        f.setScale(ART * (0.85 + r() * 0.3), ART * (0.8 + r() * 0.4)).setRotation(Math.atan(slope) + (r() - 0.5) * 0.06);
        f.setFlipX(r() < 0.5);
      }
    }
    // the crops along every other furrow (east half grain, west half greens,
    // mixed), not quite in line, thicker in some places than others
    for (let i = 1; i < rows.length - 1; i += 2) {
      const base = rows[i];
      for (let x = FIELD.x + 40 + r() * 30; x < FIELD.x + FIELD.w - 50; x += 30 + r() * 46) {
        const y = rowY(base, x) - 8 + (r() - 0.5) * 9;
        const cx = x + (r() - 0.5) * 10;
        if (fieldDistance(cx, y) > -40 || keep(cx, y, 70) || r() < 0.3 + 0.2 * Math.sin(x / 170 + i)) continue;
        const grain = r() < (cx - FIELD.x) / FIELD.w;
        const key = grain ? `cain-wheat-${Math.floor(r() * 3)}` : `cain-greens-${Math.floor(r() * 3)}`;
        const img = sized(this.scene.add.image(cx, y, key).setOrigin(0.5, 1).setDepth(y)).setFlipX(r() < 0.5);
        img.setScale(img.scaleX * (0.85 + r() * 0.3));
      }
    }
    // what Cain gathers
    for (const p of PRODUCE) {
      const [x, y] = p.at;
      const sprites: Phaser.GameObjects.Image[] = [];
      let tree: CainTree | undefined;
      if (p.kind === 'grain') {
        for (const [dx, dy] of [[-16, -6], [14, -4], [0, 6]] as Pt[]) sprites.push(sized(this.scene.add.image(x + dx, y + dy, `cain-wheat-${sprites.length}`).setOrigin(0.5, 1).setDepth(y + dy)));
      } else if (p.kind === 'gourd') {
        sprites.push(sized(this.scene.add.image(x, y, 'cain-gourds').setOrigin(0.5, 1).setDepth(y)));
      } else {
        tree = this.addTree('fruit-6', x, y - 10, r() < 0.5);
      }
      this.produce.push({ kind: p.kind, at: p.kind === 'fruit' ? [x, y - 10] : p.at, picked: false, sprites, tree });
    }
    // the jawbone, lying in the earth at the far side of the field
    this.jawbone = this.scene.add.image(POINTS.jawbone[0], POINTS.jawbone[1], 'cain-jawbone').setOrigin(0.5, 1).setScale(ART).setDepth(DEPTH_GROUND + 30);
    this.grave = this.scene.add.image(POINTS.grave[0], POINTS.grave[1], 'cain-grave').setOrigin(0.5, 0.9).setScale(ART).setDepth(POINTS.grave[1]).setVisible(false);
  }

  /** A produce spot gathered (or not, when a saved game is restored). */
  setPicked(i: number, picked: boolean): void {
    const p = this.produce[i];
    if (!p) return;
    p.picked = picked;
    if (p.kind === 'grain') p.sprites.forEach((s, j) => s.setTexture(picked ? `cain-wheat-${j}-reaped` : `cain-wheat-${j}`));
    else if (p.kind === 'gourd') p.sprites[0].setTexture(picked ? 'cain-gourds-picked' : 'cain-gourds');
    else if (p.tree) p.tree.crown.setTexture(picked ? p.tree.bare! : TREES['fruit-6'].crown);
  }

  // -------------------------------------------------------------- house

  private house(): void {
    const s = this.scene;
    const [hx, hy] = POINTS.hut;
    this.place('cain-hut', hx, hy);
    this.solid(hx, hy - 20, 190, 44);
    this.taken.push([hx, hy - 40]);
    // the log Adam sits on
    const [lx, ly] = POINTS.adamLog;
    // a low log, so that Adam's seat (the top of it) is at the height of his hem
    this.place('cain-log', lx - 12, ly - 2).setScale(ART * 0.9, ART * 0.7);
    this.solid(lx, ly - 8, 40, 12);
    // the fire Eve cooks on, with the pot
    const [fx, fy] = POINTS.fire;
    this.place('cain-hearth', fx, fy);
    // small flames licking up under the pot
    sized(s.add.sprite(fx, fy - 9, 'cain-flame').setOrigin(0.5, 1).setDepth(fy - 0.5)).setScale(ART * 0.35).play('cain-flame:loop');
    this.solid(fx, fy - 6, 34, 14);
    // a basket and some wood by the house
    this.place('basket', hx + 74, hy + 22);
    this.place('rock-small', hx - 86, hy + 30);
  }

  // ------------------------------------------------------------- altars

  private altars(): void {
    const top = 34;
    for (const [who, key, at] of [['cain', 'cain-altar', POINTS.altarCain], ['abel', 'cain-altar-b', POINTS.altarAbel]] as const) {
      this.place(key, at[0], at[1]);
      this.solid(at[0], at[1] - 10, 52, 22);
      this.altarTop[who] = [at[0], at[1] - top];
    }
  }

  // --------------------------------------------------------------- fold

  /** A ring of low stone walls with its gate toward the house. */
  private fold(): void {
    const r = rng(5);
    const steps = 44;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      let da = Math.abs(a - FOLD.gate);
      da = Math.min(da, Math.PI * 2 - da);
      if (da < FOLD.gateWidth / 2) continue;
      const x = FOLD.x + Math.cos(a) * FOLD.r;
      const y = FOLD.y + Math.sin(a) * FOLD.r * 0.75;
      this.place(`cain-wall-${Math.floor(r() * 3)}`, x, y + 8);
      // tall enough that the boxes overlap on the steep sides: no gaps for a sheep
      this.solid(x, y, 34, 30);
    }
  }

  // ------------------------------------------------------------- torches

  /**
   * Torches on poles (the maintainer: the night lit by torches, yet all of
   * the screen easy to see). Each throws a soft warm pool of light around
   * it (added light, so it brightens what it falls on) that flickers. The
   * hearth by the house gets one too.
   */
  private torches(): void {
    const s = this.scene;
    const pool = (x: number, y: number, scale: number) => {
      return s.add.image(x, y, 'cain-torch-light').setDepth(DEPTH_LIGHT).setBlendMode(Phaser.BlendModes.ADD).setScale(scale, scale * 0.8);
    };
    for (const [x, y] of TORCHES) {
      this.place('cain-torch', x, y);
      this.solid(x, y - 3, 10, 6);
      this.taken.push([x, y]);
      const a = MANIFEST.sprites['cain-torch'];
      const top = y - (a.anchorY + 1) * (a.scale ?? ART) + 4;
      const flame = sized(s.add.sprite(x, top, 'cain-flame').setOrigin(0.5, 0.92).setDepth(y + 0.5)).setScale(ART * 0.6).play({ key: 'cain-flame:loop', startFrame: Math.floor(Math.random() * 4) });
      this.lights.push({ img: pool(x, top + 20, 1), flame, scale: 1, phase: Math.random() * 10 });
    }
    const [fx, fy] = POINTS.fire;
    this.lights.push({ img: pool(fx, fy - 10, 1.25), flame: null!, scale: 1.25, phase: 3.1 });
  }

  /** The torches flicker (slowly and gently with reduced motion). */
  updateLights(time: number, view: Phaser.Geom.Rectangle, still: boolean): void {
    const s = time / 1000;
    for (const l of this.lights) {
      if (!view.contains(l.img.x, l.img.y) && Math.abs(l.img.x - view.centerX) > view.width) continue;
      const f = still ? 0 : Math.sin(s * 7.3 + l.phase) * 0.5 + Math.sin(s * 12.9 + l.phase * 2.1) * 0.3 + Math.sin(s * 3.1 + l.phase) * 0.2;
      const k = l.scale * (1 + f * 0.035);
      l.img.setScale(k, k * 0.8).setAlpha(0.92 + f * 0.08);
    }
  }

  // --------------------------------------------------------------- trees

  private free(x: number, y: number, d: number): boolean {
    if (CLEAR.some((z) => Math.hypot(z.x - x, z.y - y) < z.r)) return false;
    if (this.pathDistance(x, y) < 26) return false;
    if (fieldDistance(x, y) < 40) return false;
    if (Math.hypot(x - FOLD.x, (y - FOLD.y) / 0.75) < FOLD.r + 50) return false;
    return !this.taken.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < d);
  }

  addTree(id: string, x: number, y: number, flip = false): CainTree | undefined {
    const art = TREES[id];
    if (!art) return undefined;
    const ox = (flip ? art.w - art.ax : art.ax) / art.w;
    const oy = (art.ay + 1) / art.h;
    const part = (key: string, depth: number) => this.scene.add.image(x, y, key).setOrigin(ox, oy).setDepth(depth).setScale(ART).setFlipX(flip);
    const trunk = part(art.trunk, y);
    const crown = part(art.crown, y + 0.1);
    const shadow = this.scene.add.image(x - 14, y - 2, art.shadow).setScale(ART).setDepth(DEPTH_SHADOW).setAlpha(0.32 * NIGHT_SHADOW);
    this.solid(x, y - art.foot.h * ART * 0.5, art.foot.w * ART, art.foot.h * ART);
    const cb = art.crownBox;
    const left = flip ? x - (cb.x + cb.w - art.ax) * ART : x + (cb.x - art.ax) * ART;
    const bounds = new Phaser.Geom.Rectangle(left, y + (cb.y - art.ay) * ART, cb.w * ART, cb.h * ART);
    const r = rng(Math.round(x * 7 + y * 13));
    const bush = id.startsWith('bush');
    const t: CainTree = { x, y, trunk, crown, shadow, bounds, fade: 0, sway: { amp: (bush ? 0.02 : 0.01) * (0.7 + 0.6 * r()), speed: (Math.PI * 2) / (3.2 + 2.6 * r()), phase: r() * Math.PI * 2 }, bare: art.bare };
    this.trees.push(t);
    this.taken.push([x, y]);
    return t;
  }

  private woods(): void {
    const r = rng(11);
    const kinds = ['oak-1', 'oak-2', 'oak-9', 'oakSmall-3', 'oakSmall-11', 'cypress-5', 'cypress-12', 'umbrella-4'];
    const pick = (list: string[]) => list[Math.floor(r() * list.length)];
    // the groves of the meadow
    for (const g of GROVES) {
      let placed = 0;
      for (let tries = 0; tries < g.n * 12 && placed < g.n; tries++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * g.r;
        const x = g.x + Math.cos(a) * d;
        const y = g.y + Math.sin(a) * d * 0.85;
        if (x < BOUNDS.left + 20 || x > BOUNDS.right - 20 || y < BOUNDS.top + 60 || y > BOUNDS.bottom) continue;
        if (!this.free(x, y, 96)) continue;
        this.addTree(r() < 0.18 ? pick(['bush-7', 'bush-8', 'bush-13']) : pick(kinds), x, y, r() < 0.5);
        placed++;
      }
    }
    // the woods all around, closing the land in
    const ring: Pt[] = [];
    for (let x = 40; x < WORLD_W; x += 110) {
      ring.push([x, BOUNDS.top - 30 - r() * 120]);
      ring.push([x, BOUNDS.top + 30 + r() * 40]);
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
      // the way in from the west and the way out east stay open
      if (Math.abs(y - POINTS.start[1]) < 120 && x < BOUNDS.left + 40) continue;
      if (Math.abs(y - POINTS.nod[1]) < 110 && x > BOUNDS.right - 60) continue;
      if (this.taken.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < 70)) continue;
      this.addTree(pick([...kinds, 'oak-1', 'oak-2', 'cypress-5']), x, y, r() < 0.5);
    }
    // bushes and a few lone trees in the meadows
    for (let i = 0; i < 70; i++) {
      const x = BOUNDS.left + r() * (BOUNDS.right - BOUNDS.left);
      const y = BOUNDS.top + 80 + r() * (BOUNDS.bottom - BOUNDS.top - 80);
      if (!this.free(x, y, 120)) continue;
      this.addTree(r() < 0.8 ? pick(['bush-7', 'bush-8', 'bush-13']) : pick(kinds), x, y, r() < 0.5);
    }
  }

  private decor(): void {
    const r = rng(23);
    const keys = ['grass-tuft-0', 'grass-tuft-1', 'grass-tuft-2', 'grass-tuft-0', 'flowers-white', 'flowers-yellow', 'fern-a', 'fern-b', 'rock-small', 'mushrooms'];
    for (let i = 0; i < 420; i++) {
      const x = 60 + r() * (WORLD_W - 120);
      const y = 120 + r() * (WORLD_H - 160);
      if (this.pathDistance(x, y) < 6 || fieldDistance(x, y) < 10 || this.yardDistance(x, y) < 0) continue;
      const shared = keys[Math.floor(r() * keys.length)];
      if (!MANIFEST.sprites[shared]) continue;
      const key = nightSprite(this.scene, shared);
      const a = MANIFEST.sprites[key];
      sized(this.scene.add.image(x, y, key).setOrigin(a.anchorX / a.frameWidth, 1).setDepth(key.startsWith('rock') ? y : DEPTH_GROUND + 20 + y * 0.0001)).setFlipX(r() < 0.5);
    }
    for (const [x, y, k] of [[1000, 1500, 'rock-mossy'], [2050, 2900, 'rock-large'], [600, 2550, 'rock-medium'], [2550, 1700, 'boulder-a'], [350, 1200, 'boulder-b']] as [number, number, string][]) {
      if (!MANIFEST.sprites[k]) continue;
      this.place(k, x, y);
      this.solid(x, y - 6, 30, 12);
    }
  }

  // -------------------------------------------------------------- helpers

  /** A sprite standing on the ground at its base point, sorted by it. */
  place(shared: string, x: number, y: number, depth = y): Phaser.GameObjects.Image {
    // the chapter's own art is drawn in its palette; Eden's sprites are copied into it
    const key = shared.startsWith('cain-') ? shared : nightSprite(this.scene, shared);
    const a = MANIFEST.sprites[key];
    const img = sized(this.scene.add.image(x, y, key).setOrigin(a ? a.anchorX / a.frameWidth : 0.5, a ? (a.anchorY + 1) / a.frameHeight : 1).setDepth(depth));
    addShadow(this.scene, x, y, key);
    return img;
  }

  private solid(x: number, y: number, w: number, h: number): void {
    const rect = this.scene.add.rectangle(x, y, w, h).setVisible(false);
    this.colliders.add(rect);
  }

  /** Leaves turn see-through while they hide the player (like in Eden). */
  updateCanopies(px: number, py: number, view: Phaser.Geom.Rectangle, delta: number): void {
    const step = delta / CANOPY_FADE_MS;
    for (const t of this.trees) {
      if (!Phaser.Geom.Rectangle.Overlaps(view, t.bounds)) continue;
      const behind = py < t.y - 4 && Phaser.Geom.Rectangle.Contains(t.bounds, px, py - 40);
      const target = behind ? 1 : 0;
      if (t.fade === target) continue;
      t.fade = Phaser.Math.Clamp(t.fade + (target > t.fade ? step : -step), 0, 1);
      t.crown.setAlpha(1 - 0.62 * t.fade * t.fade * (3 - 2 * t.fade));
    }
  }

  /** A light breeze through the leaves (the trunks stay still). */
  updateWind(time: number, view: Phaser.Geom.Rectangle): void {
    const s = time / 1000;
    for (const t of this.trees) {
      if (!Phaser.Geom.Rectangle.Overlaps(view, t.bounds)) continue;
      const gust = 0.55 + 0.45 * Math.sin(s * 0.33 - t.x * 0.0021 - t.y * 0.0013);
      const a = t.sway.amp * gust * (Math.sin(s * t.sway.speed + t.sway.phase) * 0.8 + Math.sin(s * t.sway.speed * 2.3 + t.sway.phase * 1.7) * 0.2);
      t.crown.setRotation(a);
      t.shadow.setRotation(a * 0.45);
    }
  }
}
