import Phaser from 'phaser';
import { RIVER, WORLD_H, WORLD_W } from '../../data/eden/map';
import { ART_RESOLUTION } from '../display';
import { DEPTH_GROUND, DEPTH_OVERLAY } from './Actor';
import type { Terrain } from './Terrain';

/** Where a point at height z above the ground casts its shadow (the sun is
 * at the upper left; see SHADOW_X, SHADOW_Y in tools/art/from_generated.py). */
const SHADOW_X = 0.45;
const SHADOW_Y = 0.11;
/** The breeze, world px per second (the cloud shadows drift the same way). */
const WIND = { x: 22, y: 7 };
/** The little pixel shapes ("px-" textures) are drawn in art pixels, like
 * the sprites, so they stay crisp (see EdenScene.applyFilters). */
const PX = 1 / ART_RESOLUTION;
/** The cloud is drawn in chunkier pixels: art pixels per cloud pixel. */
const CLOUD_PIXEL = 3;
/** Where the cloud's shadow falls, per world px of the cloud's height (the
 * maintainer asked for it twice as far from the cloud as before). */
const CLOUD_SHADOW = { x: 0.68, y: 0.8 };
/** Drifting leaves and petals: world px per texture pixel. */
const DRIFT_SCALE = 2 * PX;

interface Drift {
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  x: number;
  y: number;
  z: number;
  fall: number;
  spin: number;
  phase: number;
  life: number;
}

interface Swarm {
  x: number;
  y: number;
  gnats: { img: Phaser.GameObjects.Image; f1: number; f2: number; p: number; r: number }[];
}

interface Fish {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  dir: number;
  speed: number;
  turn: number;
}

/**
 * Small life in the garden, all very subtle (the maintainer's wish): leaves,
 * petals and bits of grass carried on the breeze with their tiny shadows,
 * clouds of gnats hovering by the water and the bushes, now and then a
 * white cloud passing high overhead with its shadow far off toward the lower
 * right (sun, cloud, shadow in line), and in the river the dark shapes of
 * fish moving along the bottom and glints of light on the current. Only
 * what is near the view is moved. Textures are drawn here.
 */
export class Ambience {
  private drifts: Drift[] = [];
  private swarms: Swarm[] = [];
  private fish: Fish[] = [];
  private glints: Phaser.GameObjects.Image[] = [];
  private cloud: Phaser.GameObjects.Image;
  private cloudShadow: Phaser.GameObjects.Image;
  private cloudHeight = 520;
  private cloudWait = 6;
  /** world px per second; each cloud takes its own diagonal and pace */
  private cloudVel = { x: 48, y: 15 };
  private spawn = 0;
  private glintWait = 0;
  private sun = 1;

  constructor(private scene: Phaser.Scene, private terrain: Terrain) {
    makeTextures(scene);
    const rnd = new Phaser.Math.RandomDataGenerator(['eden-life']);
    // gnats by the river banks and in the orchard
    const spots: [number, number][] = [];
    for (let i = 0; i < 400 && spots.length < 14; i++) {
      const x = rnd.between(400, WORLD_W - 400);
      const y = rnd.between(400, WORLD_H - 300);
      const d = terrain.riverDistance(x, y);
      if (d > 10 && d < 90) spots.push([x, y]);
    }
    for (const [x, y] of spots) {
      const gnats = [];
      for (let i = 0; i < rnd.between(4, 7); i++) {
        const img = scene.add.image(x, y, 'px-gnat').setScale(PX).setDepth(DEPTH_OVERLAY - 210).setAlpha(0.7).setVisible(false);
        gnats.push({ img, f1: rnd.realInRange(1.6, 3.4), f2: rnd.realInRange(2.2, 4.6), p: rnd.realInRange(0, 6.3), r: rnd.realInRange(6, 14) });
      }
      this.swarms.push({ x, y, gnats });
    }
    // fish along the river
    for (let i = 0; i < 16; i++) {
      const seg = rnd.between(0, RIVER.points.length - 2);
      const a = RIVER.points[seg];
      const b = RIVER.points[seg + 1];
      const k = rnd.frac();
      const x = a[0] + (b[0] - a[0]) * k;
      const y = a[1] + (b[1] - a[1]) * k;
      if (terrain.riverDistance(x, y) > -24) continue;
      const img = scene.add.image(x, y, 'fx-fish').setDepth(DEPTH_GROUND - 960).setAlpha(0.28);
      this.fish.push({ img, x, y, dir: Math.atan2(b[1] - a[1], b[0] - a[0]) + (rnd.frac() < 0.5 ? Math.PI : 0), speed: rnd.realInRange(10, 22), turn: rnd.realInRange(2, 6) });
    }
    // a few deeper pools here and there (the maintainer disliked a dark
    // channel following the whole river): each a different cluster of
    // overlapping ovals, darker where they overlap, kept inside the water
    const pools = scene.add.graphics().setDepth(DEPTH_GROUND - 965);
    const lines = [RIVER.points, ...RIVER.branches];
    for (let n = 0, tries = 0; n < 14 && tries < 500; tries++) {
      const line = rnd.pick(lines);
      const seg = rnd.between(0, line.length - 2);
      const [ax, ay] = line[seg];
      const [bx, by] = line[seg + 1];
      const k = rnd.frac();
      const cx = ax + (bx - ax) * k + rnd.realInRange(-14, 14);
      const cy = ay + (by - ay) * k + rnd.realInRange(-14, 14);
      if (terrain.riverDistance(cx, cy) > -30) continue;
      const along = Math.atan2(by - ay, bx - ax);
      for (let i = 0; i < rnd.between(4, 8); i++) {
        const ox = cx + Math.cos(along) * rnd.realInRange(-40, 40) + rnd.realInRange(-8, 8);
        const oy = cy + Math.sin(along) * rnd.realInRange(-40, 40) + rnd.realInRange(-8, 8);
        const rw = rnd.realInRange(10, 26);
        const room = -terrain.riverDistance(ox, oy) - 6;
        if (room < rw * 0.7) continue;
        pools.fillStyle(0x0b4a58, 0.11);
        pools.fillEllipse(ox, oy, rw * 2, rw * rnd.realInRange(1.0, 1.5));
      }
      n++;
    }
    this.cloud = scene.add.image(-9999, -9999, 'px-cloud').setScale(CLOUD_PIXEL * PX).setDepth(DEPTH_OVERLAY - 97).setAlpha(0);
    // its shadow: the same shape, flat and dark, on the ground
    this.cloudShadow = scene.add.image(-9999, -9999, 'fx-cloud-shade').setScale(CLOUD_PIXEL * PX).setDepth(DEPTH_OVERLAY - 300).setAlpha(0);
  }

  /** How strong the sunlight is (0 at night): shadows and glints follow. */
  setSun(sun: number): void {
    this.sun = sun;
  }

  update(time: number, delta: number, view: Phaser.Geom.Rectangle): void {
    const dt = Math.min(0.1, delta / 1000);
    const t = time / 1000;
    this.updateDrifts(dt, t, view);
    this.updateSwarms(t, view);
    this.updateFish(dt, t, view);
    this.updateGlints(dt, view);
    this.updateCloud(dt, view);
  }

  private updateDrifts(dt: number, t: number, view: Phaser.Geom.Rectangle): void {
    this.spawn -= dt;
    if (this.spawn <= 0 && this.drifts.length < 7) {
      this.spawn = 0.9 + Math.random() * 1.6;
      const roll = Math.random();
      const key = roll < 0.55 ? 'px-drift-leaf' : roll < 0.8 ? 'px-drift-petal' : 'px-drift-grass';
      const img = this.scene.add.image(0, 0, key).setDepth(DEPTH_OVERLAY - 205);
      if (key === 'px-drift-petal') img.setTint(Phaser.Utils.Array.GetRandom([0xffffff, 0xffd6e4, 0xfff2a8]));
      const shadow = this.scene.add.image(0, 0, 'px-drift-shadow').setScale(DRIFT_SCALE).setDepth(DEPTH_GROUND + 30).setAlpha(0);
      // start upwind of the view so it floats across
      this.drifts.push({
        img,
        shadow,
        x: view.x + Math.random() * view.width * 0.8 - view.width * 0.15,
        y: view.y + Math.random() * view.height * 0.9,
        z: 40 + Math.random() * 70,
        fall: 4 + Math.random() * 6,
        spin: 2 + Math.random() * 3,
        phase: Math.random() * 6.3,
        life: 0,
      });
    }
    this.drifts = this.drifts.filter((d) => {
      d.life += dt;
      d.x += (WIND.x + Math.sin(t * 1.3 + d.phase) * 10) * dt;
      d.y += (WIND.y + Math.cos(t * 0.9 + d.phase) * 4) * dt;
      d.z -= d.fall * dt * (0.6 + 0.4 * Math.sin(t * 2 + d.phase));
      const fade = Math.min(1, d.life / 0.8) * Math.min(1, Math.max(0, d.z) / 12);
      // tumbling: the leaf turns and shows its edge now and then
      d.img.setPosition(d.x, d.y - d.z).setRotation(Math.sin(t * d.spin + d.phase) * 1.2).setScale(DRIFT_SCALE * Math.cos(t * d.spin * 0.7 + d.phase), DRIFT_SCALE).setAlpha(0.9 * fade);
      d.shadow.setPosition(d.x + d.z * SHADOW_X, d.y + d.z * SHADOW_Y).setAlpha(0.22 * fade * this.sun);
      const away = d.x < view.x - 200 || d.x > view.right + 200 || d.y < view.y - 200 || d.y > view.bottom + 200;
      const gone = d.z <= 0 || d.life > 14 || away;
      if (gone) {
        d.img.destroy();
        d.shadow.destroy();
      }
      return !gone;
    });
  }

  private updateSwarms(t: number, view: Phaser.Geom.Rectangle): void {
    for (const s of this.swarms) {
      const near = view.contains(s.x, s.y) || Phaser.Geom.Rectangle.Overlaps(view, new Phaser.Geom.Rectangle(s.x - 40, s.y - 80, 80, 100));
      for (const g of s.gnats) {
        g.img.setVisible(near);
        if (!near) continue;
        const jitter = Math.sin(t * 23 + g.p * 5) * 0.8;
        g.img.setPosition(s.x + Math.sin(t * g.f1 + g.p) * g.r + jitter, s.y - 30 + Math.sin(t * g.f2 + g.p * 1.3) * g.r * 0.6);
      }
    }
  }

  private updateFish(dt: number, t: number, view: Phaser.Geom.Rectangle): void {
    for (const f of this.fish) {
      if (!Phaser.Geom.Rectangle.Contains(view, f.x, f.y)) {
        f.img.setVisible(false);
        continue;
      }
      f.img.setVisible(true);
      f.turn -= dt;
      if (f.turn <= 0) {
        f.turn = 2 + Math.random() * 5;
        f.dir += (Math.random() - 0.5) * 1.4;
      }
      const sp = f.speed * (0.7 + 0.3 * Math.sin(t * 1.7 + f.turn));
      const nx = f.x + Math.cos(f.dir) * sp * dt;
      const ny = f.y + Math.sin(f.dir) * sp * dt;
      // stay well inside the water; turn back at the banks
      if (this.terrain.riverDistance(nx, ny) < -18) {
        f.x = nx;
        f.y = ny;
      } else {
        f.dir += Math.PI * (0.6 + Math.random() * 0.4);
      }
      // the tail beats as it swims
      f.img.setPosition(f.x, f.y).setRotation(f.dir + Math.sin(t * 7 + f.speed) * 0.12).setAlpha(0.26 * (0.5 + 0.5 * this.sun) + 0.04);
    }
  }

  private updateGlints(dt: number, view: Phaser.Geom.Rectangle): void {
    this.glintWait -= dt;
    if (this.glintWait <= 0 && this.sun > 0.2) {
      this.glintWait = 0.18;
      for (let i = 0; i < 4; i++) {
        const x = view.x + Math.random() * view.width;
        const y = view.y + Math.random() * view.height;
        if (this.terrain.riverDistance(x, y) > -10) continue;
        const g = this.scene.add.image(x, y, 'fx-glint').setDepth(DEPTH_GROUND - 955).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
        this.glints.push(g);
        // a glint slides a little with the current, then fades
        this.scene.tweens.add({
          targets: g,
          alpha: { from: 0, to: 0.55 * this.sun },
          x: x + 6,
          y: y + 10,
          duration: 700 + Math.random() * 500,
          yoyo: true,
          onComplete: () => {
            g.destroy();
            this.glints = this.glints.filter((o) => o !== g);
          },
        });
        break;
      }
    }
  }

  private updateCloud(dt: number, view: Phaser.Geom.Rectangle): void {
    const c = this.cloud;
    if (c.alpha <= 0 && c.x < 0) {
      this.cloudWait -= dt;
      if (this.cloudWait > 0) return;
      // a new cloud, left of the view, crossing it to the right on a slant
      // of its own (always the same path looked mechanical): half way across,
      // the cloud and its shadow are around the middle of the view
      this.cloudHeight = 420 + Math.random() * 200;
      const slant = -0.22 + Math.random() * 0.6;
      const pace = WIND.x * (1.8 + Math.random() * 0.8);
      this.cloudVel = { x: pace * Math.cos(slant), y: pace * Math.sin(slant) };
      const half = view.width / 2 + 500;
      const middle = view.centerY + (Math.random() - 0.5) * 0.6 * view.height - this.cloudHeight * CLOUD_SHADOW.y * 0.5;
      const size = CLOUD_PIXEL * PX * (0.85 + Math.random() * 0.35);
      c.setPosition(view.x - 500, middle - Math.tan(slant) * half).setFlipX(Math.random() < 0.5).setScale(size);
      c.setAlpha(0.001);
      this.cloudShadow.setFlipX(c.flipX).setScale(size);
    }
    c.x += this.cloudVel.x * dt;
    c.y += this.cloudVel.y * dt;
    // fade in at the start, out once it has crossed
    const across = (c.x - (view.x - 500)) / (view.width + 1000);
    const a = Math.max(0, Math.min(1, across * 6, (1 - across) * 6));
    c.setAlpha(Math.max(0.001, 0.62 * a));
    // its shadow on the ground, away from the sun and well below it (the
    // maintainer wanted it lower than the low sun of the objects' shadows)
    this.cloudShadow.setPosition(c.x + this.cloudHeight * CLOUD_SHADOW.x, c.y + this.cloudHeight * CLOUD_SHADOW.y).setAlpha(0.27 * a * this.sun);
    if (across > 1 || c.x > WORLD_W + 600) {
      c.setPosition(-9999, -9999).setAlpha(0);
      this.cloudShadow.setAlpha(0);
      this.cloudWait = 25 + Math.random() * 30;
    }
  }
}

function makeTextures(scene: Phaser.Scene): void {
  const tex = scene.textures;
  // small pixel shapes, one texture pixel per world pixel
  const pixels = (key: string, rows: string[], colours: Record<string, string>) => {
    if (tex.exists(key)) return;
    const canvas = tex.createCanvas(key, rows[0].length, rows.length)!;
    const ctx = canvas.getContext();
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (!colours[ch]) return;
        ctx.fillStyle = colours[ch];
        ctx.fillRect(x, y, 1, 1);
      }),
    );
    canvas.refresh();
  };
  // a leaf of the garden's green, lit from the upper left
  pixels('px-drift-leaf', ['..lL...', '.lLLM..', 'lLMMmm.', '.MMmmd.', '...mdd.', '.....d.'], { l: '#d5e658', L: '#c0d337', M: '#a7c02c', m: '#7f9a22', d: '#5c7418' });
  pixels('px-drift-petal', ['.w.', 'wWs', '.s.'], { w: '#ffffff', W: '#f4ece4', s: '#d9cfc6' });
  pixels('px-drift-grass', ['g...', '.gG.', '..Gd', '...d'], { g: '#d5e658', G: '#b3ce36', d: '#8aa323' });
  pixels('px-drift-shadow', ['.ss.', 'ssss', '.ss.'], { s: '#0e1e18' });
  pixels('px-gnat', ['kk', 'kk'], { k: '#1d2010' });
  if (!tex.exists('fx-fish')) {
    // the dark, blurred shape of a fish seen through the water
    const canvas = tex.createCanvas('fx-fish', 34, 14)!;
    const ctx = canvas.getContext();
    ctx.filter = 'blur(1.2px)';
    ctx.fillStyle = '#0d2a33';
    ctx.beginPath();
    ctx.ellipse(19, 7, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(9, 7);
    ctx.lineTo(2, 2.5);
    ctx.lineTo(3.5, 7);
    ctx.lineTo(2, 11.5);
    ctx.closePath();
    ctx.fill();
    canvas.refresh();
  }
  if (!tex.exists('fx-glint')) {
    const canvas = tex.createCanvas('fx-glint', 8, 3)!;
    const ctx = canvas.getContext();
    ctx.fillStyle = 'rgba(255, 255, 240, 0.9)';
    ctx.fillRect(1, 1, 6, 1);
    ctx.fillStyle = 'rgba(255, 255, 240, 0.4)';
    ctx.fillRect(0, 1, 1, 1);
    ctx.fillRect(7, 1, 1, 1);
    ctx.fillRect(3, 0, 2, 1);
    canvas.refresh();
  }
  if (!tex.exists('px-cloud')) {
    // a cumulus in pixel art like the clouds of the story map painting:
    // round puffs, white where the sun (upper left) lights them, blue-grey
    // underneath, in four flat tones. Smaller puffs hang under the big ones
    // at uneven depths (a flat base looked cut with a ruler).
    const w = 128;
    const h = 66;
    const canvas = tex.createCanvas('px-cloud', w, h)!;
    const ctx = canvas.getContext();
    const rnd = new Phaser.Math.RandomDataGenerator(['pixel-cloud']);
    const base = h - 18;
    const puffs: { x: number; y: number; r: number }[] = [];
    for (let i = 0; i < 9; i++) {
      const x = 16 + (i / 8) * (w - 32) + rnd.realInRange(-3, 3);
      const middle = 1 - Math.abs(i - 4) / 4.5;
      const r = 9 + middle * 15 + rnd.realInRange(-2, 2);
      puffs.push({ x, y: base - r * 0.55 + rnd.realInRange(-2, 3), r });
    }
    for (let i = 0; i < 7; i++) {
      const edge = Math.abs(i - 3) / 3;
      const r = (6 + rnd.realInRange(0, 5)) * (1 - 0.35 * edge);
      const x = 18 + (i / 6) * (w - 36) + rnd.realInRange(-5, 5);
      puffs.push({ x, y: base + rnd.realInRange(-3, 6) * (1 - 0.5 * edge) - r * 0.35, r });
    }
    const tones = ['#ffffff', '#eef2f8', '#d2dceb', '#b4c3da'];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let lit = -2;
        for (const p of puffs) {
          const dx = (x + 0.5 - p.x) / p.r;
          const dy = (y + 0.5 - p.y) / p.r;
          if (dx * dx + dy * dy > 1) continue;
          // facing the light: toward the upper left of each puff
          lit = Math.max(lit, -(dx * 0.6 + dy * 0.8));
        }
        if (lit < -1.5) continue;
        const low = (y - (base - 6)) / 8;
        const v = lit - Math.max(0, low) * 0.8;
        const tone = v > 0.35 ? 0 : v > -0.15 ? 1 : v > -0.55 ? 2 : 3;
        ctx.fillStyle = tones[tone];
        ctx.fillRect(x, y, 1, 1);
      }
    }
    canvas.refresh();
    // its shadow: the same outline, dark, with soft edges (a tinted copy of
    // the cloud showed a light rim)
    const pad = 4;
    const shade = tex.createCanvas('fx-cloud-shade', w + pad * 2, h + pad * 2)!;
    const sctx = shade.getContext();
    sctx.filter = 'blur(1.5px)';
    sctx.drawImage(canvas.getSourceImage() as HTMLCanvasElement, pad, pad);
    sctx.filter = 'none';
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = 'rgb(14, 30, 24)';
    sctx.fillRect(0, 0, w + pad * 2, h + pad * 2);
    shade.refresh();
  }
}
