import Phaser from 'phaser';
import { DEPTH_OVERLAY } from './Actor';

/** The SVG arrow of the HUD (src/ui/HUD.ts), in its 34 x 34 units. */
const ARROW = 'M31 17 L11.5 5.2 Q8.6 3.6 9.6 6.8 L13.2 17 L9.6 27.2 Q8.6 30.4 11.5 28.8 Z';
const SHINE = 'M26 16 L13 8.6 L15.4 16 Z';
/** Texture pixels per SVG unit, and the margin (units) left for the shadow. */
const K = 3;
const PAD = 4;
/** Height of the arrow on screen, in CSS pixels. */
const SCREEN_SIZE = 30;

/**
 * Arrows hovering over objective targets in view. They are the HUD's edge
 * arrow turned to point down (the maintainer liked that one and not the
 * old bevelled marker), so near and far guidance look the same. Several can
 * show at once (e.g. every animal still to be named).
 */
export class ObjectiveMarkers {
  private pool: Phaser.GameObjects.Image[] = [];

  constructor(private scene: Phaser.Scene) {
    makeTexture(scene);
  }

  /** Show one arrow above each point (world px); hide the rest. */
  show(points: [number, number][], time: number, zoom: number, dpr: number, still: boolean): void {
    while (this.pool.length < points.length) {
      const img = this.scene.add.image(0, 0, 'fx-marker-arrow').setDepth(DEPTH_OVERLAY - 20);
      img.setOrigin(0.5, (17 + 14 + PAD) / (34 + 2 * PAD));
      this.pool.push(img);
    }
    const scale = (SCREEN_SIZE * dpr) / zoom / (34 * K);
    this.pool.forEach((img, i) => {
      const p = points[i];
      img.setVisible(!!p);
      if (!p) return;
      const bob = still ? 0 : Math.sin(time / 260 + i * 0.9) * 3;
      img.setScale(scale).setPosition(p[0], p[1] - 10 + bob);
    });
  }

  hide(): void {
    for (const img of this.pool) img.setVisible(false);
  }
}

function makeTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('fx-marker-arrow')) return;
  const size = (34 + 2 * PAD) * K;
  const canvas = scene.textures.createCanvas('fx-marker-arrow', size, size)!;
  const ctx = canvas.getContext();
  ctx.scale(K, K);
  ctx.translate(PAD, PAD);
  // turn the right-pointing arrow to point down
  ctx.translate(17, 17);
  ctx.rotate(Math.PI / 2);
  ctx.translate(-17, -17);
  const fill = ctx.createLinearGradient(0, 0, 34 * 0.4, 34);
  fill.addColorStop(0, '#d0a6fa');
  fill.addColorStop(1, '#7f42c4');
  const arrow = new Path2D(ARROW);
  ctx.save();
  ctx.shadowColor = 'rgba(30, 10, 50, 0.55)';
  // shadow offsets are in canvas pixels, not in the turned frame
  ctx.shadowOffsetY = 2 * K;
  ctx.shadowBlur = 2 * K;
  ctx.fillStyle = fill;
  ctx.fill(arrow);
  ctx.restore();
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#f4e6ff';
  ctx.stroke(arrow);
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#ead7ff';
  ctx.fill(new Path2D(SHINE));
  canvas.refresh();
}
