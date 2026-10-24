import Phaser from 'phaser';
import { DEPTH_GROUND } from './Actor';

const MOTES = 12;

/**
 * The light around the LORD God: a soft column of light coming down from
 * the sky (from the upper left, like the sun), a gentle halo behind him, a
 * pool of light on the ground and motes of light drifting up. Replaces a
 * rotating sunburst the maintainer found cheap. Textures are drawn here.
 */
export class GodLight {
  private beamWide: Phaser.GameObjects.Image;
  private beamCore: Phaser.GameObjects.Image;
  private halo: Phaser.GameObjects.Image;
  private pool: Phaser.GameObjects.Image;
  private motes: { img: Phaser.GameObjects.Image; dx: number; phase: number; speed: number }[] = [];
  private on = false;

  constructor(scene: Phaser.Scene, private still: boolean) {
    makeTextures(scene);
    const add = (key: string) => scene.add.image(0, 0, key).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.pool = add('fx-holy-pool');
    this.halo = add('fx-holy-halo');
    this.beamWide = add('fx-holy-beam').setOrigin(0.5, 1).setRotation(-0.2);
    this.beamCore = add('fx-holy-beam').setOrigin(0.5, 1).setRotation(-0.2);
    for (let i = 0; i < MOTES; i++) {
      this.motes.push({ img: add('fx-holy-mote'), dx: (Math.random() - 0.5) * 90, phase: Math.random(), speed: 0.25 + Math.random() * 0.25 });
    }
  }

  set(on: boolean): void {
    this.on = on;
    for (const o of this.parts()) o.setVisible(on);
    for (const m of this.motes) m.img.setVisible(on && !this.still);
  }

  private parts(): Phaser.GameObjects.Image[] {
    return [this.pool, this.halo, this.beamWide, this.beamCore];
  }

  /** Follow the figure standing at (x, y) (his feet), `height` tall. */
  update(time: number, x: number, y: number, height: number): void {
    if (!this.on) return;
    const t = this.still ? 0 : time / 1000;
    const breathe = 0.85 + 0.15 * Math.sin(t * 1.3);
    this.pool.setPosition(x + 6, y + 2).setDepth(DEPTH_GROUND + 30).setScale(1.1, 1).setAlpha(0.55 * breathe);
    this.halo.setPosition(x, y - height * 0.55).setDepth(y - 1).setScale(height / 140).setAlpha(0.7 * breathe);
    this.beamWide.setPosition(x + 4, y + 4).setDepth(y + 1).setScale(1.3, 1.25).setAlpha(0.22 + 0.06 * Math.sin(t * 0.9));
    this.beamCore.setPosition(x + 2, y + 2).setDepth(y + 1).setScale(0.55, 1.15).setAlpha(0.2 + 0.08 * Math.sin(t * 1.7 + 1));
    for (const m of this.motes) {
      if (this.still) break;
      const k = (m.phase + t * m.speed) % 1;
      m.img.setPosition(x + m.dx + Math.sin((k + m.phase) * 6.28) * 6, y - 8 - k * height * 1.3).setDepth(y + 2);
      m.img.setAlpha(Math.sin(k * Math.PI) * 0.9);
    }
  }
}

function makeTextures(scene: Phaser.Scene): void {
  const tex = scene.textures;
  if (!tex.exists('fx-holy-beam')) {
    // a tall soft shaft: bright in the middle, fading at the sides and the top
    const w = 128;
    const h = 512;
    const canvas = tex.createCanvas('fx-holy-beam', w, h)!;
    const ctx = canvas.getContext();
    const across = ctx.createLinearGradient(0, 0, w, 0);
    across.addColorStop(0, 'rgba(255, 244, 205, 0)');
    across.addColorStop(0.3, 'rgba(255, 244, 205, 0.35)');
    across.addColorStop(0.5, 'rgba(255, 250, 225, 0.8)');
    across.addColorStop(0.7, 'rgba(255, 244, 205, 0.35)');
    across.addColorStop(1, 'rgba(255, 244, 205, 0)');
    ctx.fillStyle = across;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-in';
    const down = ctx.createLinearGradient(0, 0, 0, h);
    down.addColorStop(0, 'rgba(0, 0, 0, 0)');
    down.addColorStop(0.35, 'rgba(0, 0, 0, 0.8)');
    down.addColorStop(0.92, 'rgba(0, 0, 0, 1)');
    down.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = down;
    ctx.fillRect(0, 0, w, h);
    canvas.refresh();
  }
  if (!tex.exists('fx-holy-halo')) {
    const s = 256;
    const canvas = tex.createCanvas('fx-holy-halo', s, s)!;
    const ctx = canvas.getContext();
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255, 250, 228, 0.5)');
    g.addColorStop(0.45, 'rgba(255, 230, 160, 0.18)');
    g.addColorStop(1, 'rgba(255, 220, 140, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    canvas.refresh();
  }
  if (!tex.exists('fx-holy-pool')) {
    const w = 256;
    const h = 96;
    const canvas = tex.createCanvas('fx-holy-pool', w, h)!;
    const ctx = canvas.getContext();
    ctx.translate(w / 2, h / 2);
    ctx.scale(1, h / w);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w / 2);
    g.addColorStop(0, 'rgba(255, 246, 200, 0.6)');
    g.addColorStop(0.6, 'rgba(255, 230, 160, 0.2)');
    g.addColorStop(1, 'rgba(255, 230, 160, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(-w / 2, -w / 2, w, w);
    canvas.refresh();
  }
  if (!tex.exists('fx-holy-mote')) {
    const s = 8;
    const canvas = tex.createCanvas('fx-holy-mote', s, s)!;
    const ctx = canvas.getContext();
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255, 252, 230, 1)');
    g.addColorStop(1, 'rgba(255, 240, 190, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    canvas.refresh();
  }
}
