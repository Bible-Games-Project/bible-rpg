import Phaser from 'phaser';
import { WORLD_H, WORLD_W } from '../../data/eden/map';
import type { TimeOfDay } from '../WorldApi';
import { DEPTH_OVERLAY } from './Actor';

/** How strong the sunlight is at each time of day (0 = none). */
const SUN: Record<TimeOfDay, number> = { day: 1, afternoon: 0.8, dusk: 0.35, evening: 0 };

const CLOUDS = 7;
const CLOUD_ALPHA = 0.2;
/** Wind (world px per second) that carries the cloud shadows. */
const WIND = { x: 14, y: 5 };
const BEAM_ALPHA = 0.075;
/** How far the sunbeams move against the ground as the camera moves. */
const BEAM_PARALLAX = 0.15;

/**
 * Light shared by everything in the garden, so the ground, plants, animals
 * and people feel like one world (the maintainer felt they did not):
 * soft cloud shadows drifting across the whole map, over trees and people
 * alike; warm sunbeams from the upper left, the side the art is lit from,
 * that slide a little against the ground as the camera moves (parallax);
 * and a gentle vignette. Its textures are drawn here at startup.
 */
export class Atmosphere {
  private clouds: Phaser.GameObjects.Image[] = [];
  private beams: Phaser.GameObjects.TileSprite;
  private glow: Phaser.GameObjects.Image;
  private vignette: Phaser.GameObjects.Image;
  private sun = 1;
  private time = 0;

  constructor(private scene: Phaser.Scene, private still: boolean) {
    makeTextures(scene);
    const rnd = new Phaser.Math.RandomDataGenerator(['eden-sky']);
    for (let i = 0; i < CLOUDS; i++) {
      const c = scene.add.image(rnd.between(0, WORLD_W), rnd.between(0, WORLD_H), 'fx-cloud-shadow');
      c.setDepth(DEPTH_OVERLAY - 300).setAlpha(CLOUD_ALPHA).setScale(rnd.realInRange(1.4, 2.2), rnd.realInRange(1.1, 1.6));
      c.setAngle(rnd.between(-20, 20)).setFlipX(rnd.frac() < 0.5);
      this.clouds.push(c);
    }
    this.beams = scene.add.tileSprite(0, 0, 16, 16, 'fx-sunbeams').setScrollFactor(0).setDepth(DEPTH_OVERLAY - 95);
    this.beams.setBlendMode(Phaser.BlendModes.ADD).setAlpha(BEAM_ALPHA);
    this.glow = scene.add.image(0, 0, 'fx-sun-glow').setScrollFactor(0).setOrigin(0).setDepth(DEPTH_OVERLAY - 96);
    this.glow.setBlendMode(Phaser.BlendModes.ADD);
    this.vignette = scene.add.image(0, 0, 'fx-vignette').setScrollFactor(0).setDepth(DEPTH_OVERLAY - 90);
  }

  /** Fit the screen-wide layers to the view (they are zoomed with the camera). */
  resize(w: number, h: number, zoom: number): void {
    const vw = w / zoom + 8;
    const vh = h / zoom + 8;
    this.beams.setPosition(w / 2, h / 2).setSize(vw, vh);
    this.vignette.setPosition(w / 2, h / 2).setDisplaySize(vw, vh);
    this.glow.setPosition(w / 2 - vw / 2, h / 2 - vh / 2).setDisplaySize(vw * 0.75, vh * 0.75);
  }

  setTime(time: TimeOfDay): void {
    this.sun = SUN[time];
    this.scene.tweens.add({ targets: this.clouds, alpha: CLOUD_ALPHA * (0.25 + 0.75 * this.sun), duration: 1200 });
    this.scene.tweens.add({ targets: this.glow, alpha: this.sun, duration: 1200 });
  }

  update(delta: number, cam: Phaser.Cameras.Scene2D.Camera): void {
    const dt = delta / 1000;
    this.time += dt;
    if (!this.still) {
      for (const c of this.clouds) {
        c.x += WIND.x * dt;
        c.y += WIND.y * dt;
        const mx = c.displayWidth / 2;
        const my = c.displayHeight / 2;
        if (c.x - mx > WORLD_W) c.x = -mx;
        if (c.y - my > WORLD_H) c.y = -my;
      }
    }
    const drift = this.still ? 0 : this.time * 6;
    this.beams.setTilePosition(cam.scrollX * BEAM_PARALLAX + drift, cam.scrollY * BEAM_PARALLAX);
    const breathe = this.still ? 1 : 0.8 + 0.2 * Math.sin(this.time * 0.5);
    this.beams.setAlpha(BEAM_ALPHA * this.sun * breathe);
  }
}

function makeTextures(scene: Phaser.Scene): void {
  const tex = scene.textures;
  if (!tex.exists('fx-cloud-shadow')) {
    // a soft, lumpy blob: overlapping radial gradients in a cool shadow colour
    const w = 512;
    const h = 320;
    const canvas = tex.createCanvas('fx-cloud-shadow', w, h)!;
    const ctx = canvas.getContext();
    const rnd = new Phaser.Math.RandomDataGenerator(['cloud']);
    for (let i = 0; i < 9; i++) {
      const x = w * rnd.realInRange(0.28, 0.72);
      const y = h * rnd.realInRange(0.32, 0.68);
      const r = rnd.realInRange(70, 130);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(18, 38, 40, 0.55)');
      g.addColorStop(0.6, 'rgba(18, 38, 40, 0.3)');
      g.addColorStop(1, 'rgba(18, 38, 40, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    canvas.refresh();
  }
  if (!tex.exists('fx-sunbeams')) {
    // soft diagonal shafts from the upper left; the pattern wraps both ways
    const s = 512;
    const canvas = tex.createCanvas('fx-sunbeams', s, s)!;
    const ctx = canvas.getContext();
    const shafts = [
      { at: 40, width: 70, a: 0.8 },
      { at: 150, width: 34, a: 0.55 },
      { at: 250, width: 110, a: 0.7 },
      { at: 400, width: 48, a: 0.6 },
    ];
    for (const { at, width, a } of shafts) {
      for (const shift of [-s, 0, s]) {
        ctx.save();
        // a band slanting down to the right, away from the light
        ctx.translate(at + shift, 0);
        ctx.transform(1, 0, 1, 1, 0, 0);
        const g = ctx.createLinearGradient(-width / 2, 0, width / 2, 0);
        g.addColorStop(0, 'rgba(255, 236, 180, 0)');
        g.addColorStop(0.5, `rgba(255, 236, 180, ${a})`);
        g.addColorStop(1, 'rgba(255, 236, 180, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(-width / 2, 0, width, s);
        ctx.restore();
      }
    }
    canvas.refresh();
  }
  if (!tex.exists('fx-sun-glow')) {
    const s = 256;
    const canvas = tex.createCanvas('fx-sun-glow', s, s)!;
    const ctx = canvas.getContext();
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
    g.addColorStop(0, 'rgba(255, 228, 160, 0.16)');
    g.addColorStop(1, 'rgba(255, 228, 160, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    canvas.refresh();
  }
  if (!tex.exists('fx-vignette')) {
    const s = 256;
    const canvas = tex.createCanvas('fx-vignette', s, s)!;
    const ctx = canvas.getContext();
    const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s * 0.72);
    g.addColorStop(0, 'rgba(20, 24, 16, 0)');
    g.addColorStop(1, 'rgba(20, 24, 16, 0.32)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    canvas.refresh();
  }
}
