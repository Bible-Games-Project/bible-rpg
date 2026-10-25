import Phaser from 'phaser';
import { DRY, FORDS, PATHS, RIVER, TILE, WORLD_H, WORLD_W, ZONES } from '../../data/eden/map';
import { MANIFEST } from '../manifest';
import { DEPTH_GROUND } from './Actor';
import { distToPolyline, distToSegment, rng, wobble } from './geometry';

/**
 * Ground tilemap built from the map's shapes. Each overlay terrain (path,
 * water, dry ground) is described by a corner grid; a tile's frame in the
 * Wang set is TL + TR*2 + BL*4 + BR*8.
 */
export class Terrain {
  readonly cols = Math.ceil(WORLD_W / TILE);
  readonly rows = Math.ceil(WORLD_H / TILE);
  private water: Uint8Array;
  private path: Uint8Array;
  private dry: Uint8Array;
  private ford: Uint8Array;
  private waterLayer!: Phaser.Tilemaps.TilemapLayer;
  private waterTiles: { x: number; y: number; idx: number }[] = [];
  private frame = 0;
  /** Invisible layer of the cells that block walking (see buildWaterColliders). */
  colliders!: Phaser.Tilemaps.TilemapLayer;

  constructor(private scene: Phaser.Scene) {
    const n = (this.cols + 1) * (this.rows + 1);
    this.water = new Uint8Array(n);
    this.path = new Uint8Array(n);
    this.dry = new Uint8Array(n);
    this.ford = new Uint8Array(this.cols * this.rows);
    this.computeCorners();
    this.build();
  }

  private ci(cx: number, cy: number): number {
    return cy * (this.cols + 1) + cx;
  }

  /** Distance from a point to the river centre lines minus their half width (<0 = inside). */
  riverDistance(x: number, y: number): number {
    let d = distToPolyline(x, y, RIVER.points) - RIVER.width / 2;
    for (const b of RIVER.branches) d = Math.min(d, distToPolyline(x, y, b) - RIVER.branchWidth / 2);
    return d + wobble(x, y, 18);
  }

  pathDistance(x: number, y: number): number {
    let d = Infinity;
    for (const p of PATHS) d = Math.min(d, distToPolyline(x, y, p.points) - p.width / 2);
    return d + wobble(x + 500, y, 10);
  }

  private computeCorners(): void {
    for (let cy = 0; cy <= this.rows; cy++) {
      for (let cx = 0; cx <= this.cols; cx++) {
        const x = cx * TILE;
        const y = cy * TILE;
        const i = this.ci(cx, cy);
        const w = this.riverDistance(x, y) < 0;
        this.water[i] = w ? 1 : 0;
        this.path[i] = !w && this.pathDistance(x, y) < 0 ? 1 : 0;
        const dryEdge = DRY.x + wobble(x, y + 900, 40);
        this.dry[i] = x > dryEdge ? 1 : 0;
      }
    }
    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        const x = tx * TILE + TILE / 2;
        const y = ty * TILE + TILE / 2;
        for (const f of FORDS) {
          if (distToSegment(x, y, f.from[0], f.from[1], f.to[0], f.to[1]) < 30) this.ford[ty * this.cols + tx] = 1;
        }
      }
    }
  }

  private cornerIndex(grid: Uint8Array, tx: number, ty: number): number {
    return grid[this.ci(tx, ty)] + grid[this.ci(tx + 1, ty)] * 2 + grid[this.ci(tx, ty + 1)] * 4 + grid[this.ci(tx + 1, ty + 1)] * 8;
  }

  private build(): void {
    const t = MANIFEST.tiles;
    const map = this.scene.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: this.cols, height: this.rows });
    const tileset = map.addTilesetImage('tiles', extrudedTiles(this.scene), TILE, TILE, 1, 2)!;
    const ground = map.createBlankLayer('ground', tileset)!;
    const path = map.createBlankLayer('path', tileset)!;
    const dry = map.createBlankLayer('dry', tileset)!;
    const water = map.createBlankLayer('water', tileset)!;
    ground.setDepth(DEPTH_GROUND - 1000);
    dry.setDepth(DEPTH_GROUND - 990);
    path.setDepth(DEPTH_GROUND - 980);
    water.setDepth(DEPTH_GROUND - 970);
    this.waterLayer = water;
    const r = rng(42);
    const flowerZones = [ZONES.meadow, ZONES.midst, ZONES.orchard];
    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        const x = tx * TILE + TILE / 2;
        const y = ty * TILE + TILE / 2;
        const inFlowers = flowerZones.some((z) => Math.hypot(x - z.x, y - z.y) < z.r * 0.8);
        const roll = r();
        let g = t.grass[roll < 0.55 ? Math.floor(r() * 4) : 4 + Math.floor(r() * 2)];
        if (inFlowers && r() < 0.18) g = t.flowers[Math.floor(r() * t.flowers.length)];
        ground.putTileAt(g, tx, ty);
        const d = this.cornerIndex(this.dry, tx, ty);
        if (d) dry.putTileAt(t.dry + d, tx, ty);
        const p = this.cornerIndex(this.path, tx, ty);
        if (p) path.putTileAt(t.path + p, tx, ty);
        const w = this.cornerIndex(this.water, tx, ty);
        if (w) {
          water.putTileAt(t.water[0] + w, tx, ty);
          this.waterTiles.push({ x: tx, y: ty, idx: w });
        }
      }
    }
    this.buildWaterColliders();
    this.scene.time.addEvent({
      delay: 420,
      loop: true,
      callback: () => {
        this.frame = (this.frame + 1) % 3;
        const base = t.water[this.frame];
        for (const wt of this.waterTiles) {
          const tile = this.waterLayer.getTileAt(wt.x, wt.y);
          if (tile) tile.index = base + wt.idx;
        }
      },
    });
  }

  /** Mostly-water tiles block movement, except the stepping-stone fords. */
  isBlockedTile(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return false;
    if (this.ford[ty * this.cols + tx]) return false;
    const w = this.cornerIndex(this.water, tx, ty);
    let bits = 0;
    for (let b = 0; b < 4; b++) bits += (w >> b) & 1;
    return bits >= 3;
  }

  isWaterAt(x: number, y: number): boolean {
    return this.isBlockedTile(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  /**
   * Water blocks walking along its drawn edge: a hidden tilemap layer of
   * half-size cells, solid where the cell's centre is in the river (the
   * stepping-stone fords excepted). Blocking only mostly-water tiles (the
   * old way) left the half-water tiles of the banks walkable, and pressing
   * diagonally against the bank slid the player along inside the river.
   * Tile collision also has no seams between rows to catch on.
   */
  private buildWaterColliders(): void {
    const cell = TILE / 2;
    const cols = this.cols * 2;
    const rows = this.rows * 2;
    const map = this.scene.make.tilemap({ tileWidth: cell, tileHeight: cell, width: cols, height: rows });
    const tileset = map.addTilesetImage('solid', 'tiles', cell, cell)!;
    const solid = map.createBlankLayer('solid', tileset)!;
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        if (this.ford[(cy >> 1) * this.cols + (cx >> 1)]) continue;
        if (this.riverDistance(cx * cell + cell / 2, cy * cell + cell / 2) < 0) solid.putTileAt(0, cx, cy);
      }
    }
    solid.setCollisionByExclusion([-1]).setVisible(false);
    this.colliders = solid;
  }
}

/**
 * The tile sheet with each tile's edge pixels repeated one pixel outward
 * (margin 1, spacing 2). When the camera zooms below 1 the ground is drawn
 * with linear filtering, which would otherwise blend in the neighbouring
 * tile of the sheet and show thin lines between tiles.
 */
function extrudedTiles(scene: Phaser.Scene): string {
  const key = 'tiles-extruded';
  if (scene.textures.exists(key)) return key;
  const src = scene.textures.get('tiles').getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const cols = Math.floor(src.width / TILE);
  const rows = Math.floor(src.height / TILE);
  const step = TILE + 2;
  const canvas = scene.textures.createCanvas(key, cols * step, rows * step)!;
  const ctx = canvas.getContext();
  ctx.imageSmoothingEnabled = false;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sx = c * TILE;
      const sy = r * TILE;
      const dx = c * step + 1;
      const dy = r * step + 1;
      // the tile stretched by one pixel on every side, then the tile itself on top
      ctx.drawImage(src, sx, sy, TILE, TILE, dx - 1, dy - 1, TILE + 2, TILE + 2);
      ctx.drawImage(src, sx, sy, TILE, TILE, dx, dy, TILE, TILE);
    }
  }
  canvas.refresh();
  return key;
}
