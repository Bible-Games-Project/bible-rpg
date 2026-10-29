import Phaser from 'phaser';
import { ARROW_HEADINGS, arrowPixel } from '../../ui/HUD';
import { DEPTH_OVERLAY } from './Actor';

/** The frame of the arrow strip that points down (headings go clockwise
 * from pointing right). */
const DOWN = ARROW_HEADINGS / 4;
/** Where the tip is in its cell, from the top. */
const TIP = 0.88;

/**
 * Arrows hovering over objective targets in view: the pixel-art arrow of the
 * game (`ui-arrows`, drawn by tools/art/ui_markers.py, the same as the HUD's
 * edge arrow), pointing down, bobbing a little. Each arrow pixel covers a
 * whole number of screen pixels, so it stays sharp at any zoom. Several can
 * show at once (e.g. every animal still to be named).
 */
export class ObjectiveMarkers {
  private pool: Phaser.GameObjects.Image[] = [];

  constructor(private scene: Phaser.Scene) {}

  /** Show one arrow above each point (world px); hide the rest. */
  show(points: [number, number][], time: number, zoom: number, dpr: number, still: boolean): void {
    while (this.pool.length < points.length) {
      // the tip of the arrow is on the point
      const img = this.scene.add.image(0, 0, 'ui-arrows', DOWN).setOrigin(0.5, TIP).setDepth(DEPTH_OVERLAY - 20);
      this.pool.push(img);
    }
    const scale = arrowPixel(dpr) / zoom;
    this.pool.forEach((img, i) => {
      const p = points[i];
      img.setVisible(!!p);
      if (!p) return;
      // bob by whole arrow pixels
      const bob = still ? 0 : Math.round(Math.sin(time / 260 + i * 0.9) * 1.5) * scale;
      img.setScale(scale).setPosition(p[0], p[1] - 6 + bob);
    });
  }

  hide(): void {
    for (const img of this.pool) img.setVisible(false);
  }
}
