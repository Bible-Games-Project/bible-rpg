import Phaser from 'phaser';
import { BOUNDS, EXIT_GAP, FORDS, PLACEMENTS, RIVER, WORLD_H, WORLD_W, ZONES, type Placement } from '../../data/eden/map';
import { OBJECTS, type ObjectKind } from '../../data/eden/objects';
import { MANIFEST } from '../manifest';
import { DEPTH_GROUND } from './Actor';
import { distToPolyline, pick, rng } from './geometry';
import type { Terrain } from './Terrain';

export interface TreeInstance {
  id?: string;
  kind: string;
  x: number;
  y: number;
  trunk: Phaser.GameObjects.Image;
  canopy: Phaser.GameObjects.Image;
  /** the canopy with see-through leaves, shown while it hides the player */
  veil: Phaser.GameObjects.Image;
  /** 0 = canopy opaque, 1 = see-through */
  fade: number;
  bounds: Phaser.Geom.Rectangle;
  fruit: FruitInstance[];
}

export interface FruitInstance {
  sprite: Phaser.GameObjects.Image;
  tree: TreeInstance;
  type: string;
  picked: boolean;
  /** opacity of the see-through canopy at this fruit's height */
  veil: number;
}

export interface PropInstance {
  id?: string;
  kind: string;
  x: number;
  y: number;
  image: Phaser.GameObjects.Image;
}

export interface Cover {
  x: number;
  y: number;
  r: number;
}

const FRUIT_OF: Record<string, string> = {
  fig: 'fruit-fig',
  pomegranate: 'fruit-pomegranate',
  date: 'fruit-dates',
  grape: 'fruit-grapes',
  forbidden: 'fruit-forbidden',
  life: 'fruit-life',
};

/**
 * Builds every tree and prop of the garden, their colliders, hiding cover
 * and fruit, and fades tree canopies when the active character walks
 * behind them (the trunk stays opaque, its collider stays solid).
 */
export class WorldObjects {
  readonly trees: TreeInstance[] = [];
  readonly props: PropInstance[] = [];
  readonly covers: Cover[] = [];
  readonly colliders: Phaser.Physics.Arcade.StaticGroup;
  private named = new Map<string, TreeInstance | PropInstance>();
  private occupied: { x: number; y: number; r: number }[] = [];

  constructor(private scene: Phaser.Scene, private terrain: Terrain) {
    this.colliders = scene.physics.add.staticGroup();
    for (const p of PLACEMENTS) this.place(p);
    this.fords();
    this.scatter();
    this.boundaries();
  }

  get<T extends TreeInstance | PropInstance>(id: string): T | undefined {
    return this.named.get(id) as T | undefined;
  }

  tree(id: string): TreeInstance | undefined {
    const t = this.named.get(id);
    return t && 'canopy' in t ? t : undefined;
  }

  prop(id: string): PropInstance | undefined {
    const p = this.named.get(id);
    return p && 'image' in p ? p : undefined;
  }

  place(p: Placement): TreeInstance | PropInstance | undefined {
    const k = OBJECTS[p.kind];
    if (!k) return undefined;
    let inst: TreeInstance | PropInstance | undefined;
    if (k.tree) inst = this.addTree(p, k);
    else inst = this.addProp(p, k);
    if (inst && p.id) this.named.set(p.id, inst);
    if (k.cover) this.covers.push({ x: p.x, y: p.y - (k.tree ? 10 : 4), r: k.cover });
    return inst;
  }

  private addTree(p: Placement, k: ObjectKind): TreeInstance | undefined {
    const t = MANIFEST.trees[k.tree!];
    if (!t) return undefined;
    const ox = t.anchorX / t.width;
    const oy = (t.anchorY + 1) / t.height;
    const trunk = this.scene.add.image(p.x, p.y, `tree:${k.tree}:trunk`).setOrigin(ox, oy).setDepth(p.y).setFlipX(!!p.flip);
    const canopy = this.scene.add.image(p.x, p.y, `tree:${k.tree}:canopy`).setOrigin(ox, oy).setDepth(p.y + 0.1).setFlipX(!!p.flip);
    const veilTex = canopyVeil(this.scene, k.tree!);
    const veil = this.scene.add.image(p.x, p.y, veilTex.key).setOrigin(ox, oy).setDepth(p.y + 0.1).setFlipX(!!p.flip).setAlpha(0).setVisible(false);
    const shadowW = Math.min(t.width * 0.62, 190);
    const sh = this.scene.add.image(p.x, p.y - 2, 'shadow-large').setDepth(DEPTH_GROUND + 10).setAlpha(0.75);
    sh.setScale(shadowW / 90, Math.max(0.6, shadowW / 180));
    const [cx, cy, cw, ch] = t.collider;
    const colX = p.x - t.anchorX + cx + cw / 2;
    const colY = p.y - t.anchorY + cy + ch / 2;
    const rect = this.scene.add.rectangle(colX, colY, cw, ch).setVisible(false);
    this.colliders.add(rect);
    const bounds = new Phaser.Geom.Rectangle(p.x - t.anchorX, p.y - t.anchorY, t.width, t.anchorY - 14);
    const inst: TreeInstance = { id: p.id, kind: k.tree!, x: p.x, y: p.y, trunk, canopy, veil, fade: 0, bounds, fruit: [] };
    const type = FRUIT_OF[t.kind];
    if (type && t.fruit.length) {
      const slots = t.kind === 'forbidden' || t.kind === 'life' ? t.fruit : t.fruit.slice(0, Math.min(4, t.fruit.length));
      for (const [fx, fy] of slots) {
        const sx = p.x - t.anchorX + (p.flip ? t.width - fx : fx);
        const sy = p.y - t.anchorY + fy;
        const s = this.scene.add.image(sx, sy, type).setOrigin(0.5, 0.15).setDepth(p.y + 0.2);
        inst.fruit.push({ sprite: s, tree: inst, type, picked: false, veil: veilTex.at(fy) });
      }
    }
    this.trees.push(inst);
    this.occupied.push({ x: p.x, y: p.y, r: Math.max(40, t.width * 0.35) });
    return inst;
  }

  private addProp(p: Placement, k: ObjectKind): PropInstance | undefined {
    const a = MANIFEST.sprites[k.sprite!];
    if (!a) return undefined;
    const img = this.scene.add.image(p.x, p.y, k.sprite!).setOrigin(a.anchorX / a.frameWidth, (a.anchorY + 1) / a.frameHeight).setFlipX(!!p.flip);
    if (k.layer === 'ground') img.setDepth(DEPTH_GROUND + p.y * 0.001);
    else if (k.layer === 'water') img.setDepth(DEPTH_GROUND - 500);
    else img.setDepth(p.y);
    if (k.shadow) this.scene.add.image(p.x, p.y - 1, k.shadow).setDepth(DEPTH_GROUND + 10).setAlpha(0.7);
    if (k.collider) {
      const rect = this.scene.add.rectangle(p.x, p.y - (k.collider.dy ?? k.collider.h / 2), k.collider.w, k.collider.h).setVisible(false);
      this.colliders.add(rect);
    }
    const inst: PropInstance = { id: p.id, kind: p.kind, x: p.x, y: p.y, image: img };
    this.props.push(inst);
    if (k.layer === 'ysort') this.occupied.push({ x: p.x, y: p.y, r: 30 });
    return inst;
  }

  private fords(): void {
    for (const f of FORDS) {
      const n = Math.max(2, Math.round(Math.hypot(f.to[0] - f.from[0], f.to[1] - f.from[1]) / 34));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = f.from[0] + (f.to[0] - f.from[0]) * t;
        const y = f.from[1] + (f.to[1] - f.from[1]) * t + (i % 2 ? 5 : -5);
        if (this.terrain.riverDistance(x, y) < 8) this.place({ kind: 'stepping-stone', x, y: y + 8, flip: i % 2 === 1 });
      }
    }
  }

  private free(x: number, y: number, r: number): boolean {
    for (const o of this.occupied) if (Math.hypot(o.x - x, o.y - y) < o.r + r) return false;
    return true;
  }

  private nearRiver(x: number, y: number, margin: number): boolean {
    return this.terrain.riverDistance(x, y) < margin;
  }

  private inKeyZone(x: number, y: number, pad = 0): boolean {
    const keep = ['plot', 'midst', 'rest', 'share', 'exit', 'godGrove', 'gather'];
    return keep.some((k) => Math.hypot(x - ZONES[k].x, y - ZONES[k].y) < ZONES[k].r + pad);
  }

  /** Forest belts and decoration scattered with a fixed seed. */
  private scatter(): void {
    const r = rng(7);
    const belt = ['oak-large-a', 'oak-large-b', 'oak-medium-a', 'oak-medium-b', 'cypress-a', 'olive-a', 'oak-large-b', 'cypress-b'];
    const inner = ['oak-medium-a', 'oak-medium-b', 'oak-small-a', 'oak-small-b', 'olive-a', 'olive-b', 'blossom', 'cypress-a', 'oak-large-a', 'pomegranate-a'];
    const tryTree = (x: number, y: number, list: string[], spacing: number, beltMode = false) => {
      if (x < 40 || x > WORLD_W - 40 || y < 120 || y > WORLD_H + 60) return;
      if (this.nearRiver(x, y, 50)) return;
      if (!beltMode && (this.terrain.pathDistance(x, y) < 50 || this.inKeyZone(x, y, 80))) return;
      if (beltMode && this.terrain.pathDistance(x, y) < 20) return;
      if (!this.free(x, y, spacing)) return;
      this.place({ kind: pick(r, list), x, y, flip: r() < 0.5 });
    };
    // belts around the garden (two staggered rows)
    for (let row = 0; row < 3; row++) {
      for (let x = 60; x < WORLD_W - 60; x += 120) {
        tryTree(x + r() * 50, BOUNDS.top - 20 - row * 75 + r() * 20, belt, 45, true);
        tryTree(x + r() * 50, BOUNDS.bottom + 100 + row * 70 + r() * 20, belt, 45, true);
      }
      for (let y = 220; y < WORLD_H - 60; y += 120) {
        tryTree(BOUNDS.left - 30 - row * 70 + r() * 20, y + r() * 50, belt, 45, true);
        if (y < EXIT_GAP.top - 120 || y > EXIT_GAP.bottom + 60) tryTree(BOUNDS.right + 70 + row * 60 + r() * 20, y + r() * 50, belt, 45, true);
      }
    }
    // the garden interior: varied trees, never on paths, water or key places
    for (let i = 0; i < 900 && this.trees.length < 230; i++) {
      tryTree(BOUNDS.left + 60 + r() * (BOUNDS.right - BOUNDS.left - 120), BOUNDS.top + 80 + r() * (BOUNDS.bottom - BOUNDS.top - 120), inner, 105);
    }
    // bushes, rocks, ferns
    const small = (kind: string, n: number, pad: number, zone?: { x: number; y: number; r: number }) => {
      for (let i = 0, placed = 0; i < n * 8 && placed < n; i++) {
        let x: number;
        let y: number;
        if (zone) {
          const a = r() * Math.PI * 2;
          const d = Math.sqrt(r()) * zone.r;
          x = zone.x + Math.cos(a) * d;
          y = zone.y + Math.sin(a) * d;
        } else {
          x = BOUNDS.left + r() * (BOUNDS.right - BOUNDS.left);
          y = BOUNDS.top + r() * (BOUNDS.bottom - BOUNDS.top);
        }
        if (this.nearRiver(x, y, 20) || this.terrain.pathDistance(x, y) < 24 || this.inKeyZone(x, y, 10) || !this.free(x, y, pad)) continue;
        this.place({ kind, x, y, flip: r() < 0.5 });
        placed++;
      }
    };
    small('bush-round', 22, 50);
    small('bush-flower', 18, 50);
    small('bush-berry', 8, 50);
    small('bush-dark', 10, 50);
    small('rock-medium', 14, 40);
    small('rock-mossy', 6, 40);
    small('fern-a', 18, 30);
    small('fern-b', 10, 34);
    small('log', 3, 60);
    small('fern-a', 10, 26, ZONES.grove);
    small('fern-b', 8, 30, ZONES.grove);
    small('bush-dark', 4, 46, ZONES.grove);
    // flat decoration: grass tufts and flowers everywhere, more in meadows
    const flat = (kinds: string[], n: number, zone?: { x: number; y: number; r: number }) => {
      for (let i = 0; i < n; i++) {
        let x: number;
        let y: number;
        if (zone) {
          const a = r() * Math.PI * 2;
          const d = Math.sqrt(r()) * zone.r;
          x = zone.x + Math.cos(a) * d;
          y = zone.y + Math.sin(a) * d;
        } else {
          x = 80 + r() * (WORLD_W - 160);
          y = 120 + r() * (WORLD_H - 160);
        }
        if (this.nearRiver(x, y, 6) || this.terrain.pathDistance(x, y) < 4) continue;
        if (x > 4180) continue;
        this.place({ kind: pick(r, kinds), x, y, flip: r() < 0.5 });
      }
    };
    flat(['grass-tuft-0', 'grass-tuft-1', 'grass-tuft-2'], 700);
    flat(['flowers-white', 'flowers-yellow', 'flowers-blue', 'flowers-pink', 'flowers-red', 'flowers-purple'], 260);
    flat(['flowers-white', 'flowers-yellow', 'flowers-pink', 'flowers-blue'], 120, ZONES.meadow);
    flat(['flowers-white', 'flowers-yellow', 'flowers-red', 'flowers-pink'], 50, ZONES.midst);
    flat(['mushrooms', 'rock-small'], 70);
    // reeds along the banks, lily pads on the water
    for (let i = 0; i < 1400; i++) {
      const x = 1200 + r() * 1700;
      const y = r() * WORLD_H;
      const d = this.terrain.riverDistance(x, y);
      if (d > -4 && d < 14 && r() < 0.35) this.place({ kind: 'reeds', x, y: y + 6, flip: r() < 0.5 });
      else if (d < -40 && r() < 0.05 && distToPolyline(x, y, RIVER.points) < RIVER.width) this.place({ kind: 'lily-pad', x, y });
    }
  }

  /** Invisible walls around the garden; the east exit opens in mission 10. */
  exitBarrier!: Phaser.GameObjects.Rectangle;

  private boundaries(): void {
    const wall = (x: number, y: number, w: number, h: number) => {
      const rct = this.scene.add.rectangle(x + w / 2, y + h / 2, w, h).setVisible(false);
      this.colliders.add(rct);
      return rct;
    };
    wall(0, 0, WORLD_W, BOUNDS.top);
    wall(0, BOUNDS.bottom, WORLD_W, WORLD_H - BOUNDS.bottom);
    wall(0, 0, BOUNDS.left, WORLD_H);
    wall(BOUNDS.right, 0, WORLD_W - BOUNDS.right, EXIT_GAP.top);
    wall(BOUNDS.right, EXIT_GAP.bottom, WORLD_W - BOUNDS.right, WORLD_H - EXIT_GAP.bottom);
    this.exitBarrier = wall(BOUNDS.right - 40, EXIT_GAP.top, 30, EXIT_GAP.bottom - EXIT_GAP.top);
  }

  openExit(open: boolean): void {
    const body = this.exitBarrier.body as Phaser.Physics.Arcade.StaticBody;
    body.enable = !open;
  }

  /** While a tree hides the active character its leaves turn see-through,
   * fading in gradually above the trunk (the maintainer disliked a visible
   * cut); the trunk stays opaque. */
  updateCanopies(px: number, py: number, view: Phaser.Geom.Rectangle): void {
    for (const t of this.trees) {
      if (!Phaser.Geom.Rectangle.Overlaps(view, t.bounds)) continue;
      const behind = py < t.y - 4 && Phaser.Geom.Rectangle.Contains(t.bounds, px, py - 40);
      const target = behind ? 1 : 0;
      if (Math.abs(t.fade - target) < 0.01) continue;
      t.fade += (target - t.fade) * 0.18;
      if (Math.abs(t.fade - target) < 0.01) t.fade = target;
      t.canopy.setAlpha(1 - t.fade);
      t.veil.setVisible(t.fade > 0).setAlpha(t.fade);
      for (const f of t.fruit) if (!f.picked) f.sprite.setAlpha(1 - t.fade + t.fade * f.veil);
    }
  }

  isCovered(x: number, y: number): boolean {
    return this.covers.some((c) => Math.hypot(c.x - x, (c.y - y) * 1.3) < c.r);
  }

  /** Trunks between two points block the line of sight (hiding behind a tree). */
  sightBlocked(ax: number, ay: number, bx: number, by: number): boolean {
    for (const t of this.trees) {
      if (t.kind.startsWith('bush')) continue;
      const m = MANIFEST.trees[t.kind];
      const r = Math.max(18, m.collider[2] * 0.75);
      const d = distToPolylineSeg(t.x, t.y - 8, ax, ay, bx, by);
      if (d < r && Math.hypot(bx - t.x, by - t.y) < 140) return true;
    }
    return false;
  }
}

function distToPolylineSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  return distToPolyline(px, py, [[ax, ay], [bx, by]]);
}

/** How see-through the leaves get, and over how many pixels above the
 * lowest leaves they reach it. */
const VEIL_ALPHA = 0.4;
const VEIL_RAMP = 40;
const veilBottoms = new Map<string, number>();

/**
 * A copy of a tree's canopy whose opacity falls from 1 at its lowest leaves
 * to VEIL_ALPHA over VEIL_RAMP pixels, made once per tree kind. `at(row)`
 * gives that opacity for a row of the image (fruit fades with its leaves).
 */
function canopyVeil(scene: Phaser.Scene, kind: string): { key: string; at: (row: number) => number } {
  const key = `tree:${kind}:veil`;
  const src = scene.textures.get(`tree:${kind}:canopy`).getSourceImage() as HTMLImageElement;
  const w = src.width;
  const h = src.height;
  let bottom = h - 1;
  if (!scene.textures.exists(key)) {
    const canvas = scene.textures.createCanvas(key, w, h)!;
    const ctx = canvas.getContext();
    ctx.drawImage(src, 0, 0);
    const alpha = ctx.getImageData(0, 0, w, h).data;
    bottom = lowestRow(alpha, w, h);
    ctx.globalCompositeOperation = 'destination-in';
    const g = ctx.createLinearGradient(0, bottom - VEIL_RAMP, 0, bottom);
    g.addColorStop(0, `rgba(0, 0, 0, ${VEIL_ALPHA})`);
    g.addColorStop(1, 'rgba(0, 0, 0, 1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    canvas.refresh();
    veilBottoms.set(key, bottom);
  } else {
    bottom = veilBottoms.get(key) ?? bottom;
  }
  const at = (row: number) => VEIL_ALPHA + (1 - VEIL_ALPHA) * Phaser.Math.Clamp((row - (bottom - VEIL_RAMP)) / VEIL_RAMP, 0, 1);
  return { key, at };
}

function lowestRow(rgba: Uint8ClampedArray, w: number, h: number): number {
  for (let y = h - 1; y >= 0; y--) {
    for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3] > 0) return y;
  }
  return h - 1;
}
