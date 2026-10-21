import Phaser from 'phaser';
import { MANIFEST, charKey, type Direction } from '../manifest';

export type Facing = 'down' | 'up' | 'left' | 'right';

export const DEPTH_GROUND = -100000;
export const DEPTH_SHADOW = -50000;
export const DEPTH_OVERLAY = 1000000;

export interface ActorOptions {
  id: string;
  x: number;
  y: number;
  /** character sprite set (adam, eve, god) or an animal/sprite sheet key */
  charId?: string;
  outfit?: string;
  sheet?: string;
  body?: { w: number; h: number };
  solid?: boolean;
  shadow?: 'shadow-small' | 'shadow-medium' | 'shadow-large' | null;
  facing?: Facing;
}

/**
 * Anything that walks in the world. The physics body is a small box at the
 * feet; the sprite is drawn with its anchor (feet) on that point and its
 * depth is the feet Y, so depth sorting against trees and props is exact.
 */
export class Actor {
  readonly id: string;
  readonly scene: Phaser.Scene;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly feet: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  shadow: Phaser.GameObjects.Image | null = null;
  facing: Facing;
  moving = false;
  charId?: string;
  outfit?: string;
  sheet?: string;
  scripted = false;
  hidden = false;
  private emoteSprite: Phaser.GameObjects.Image | null = null;
  private heldSprite: Phaser.GameObjects.Image | null = null;
  private anchorY = 1;
  private lastAnim = '';
  /** offset the sprite vertically (e.g. a dove hopping or flying) */
  lift = 0;
  /** added to the depth (e.g. the serpent drawn on a branch, in front of the canopy) */
  depthBias = 0;

  constructor(scene: Phaser.Scene, o: ActorOptions) {
    this.scene = scene;
    this.id = o.id;
    this.charId = o.charId;
    this.outfit = o.outfit;
    this.sheet = o.sheet;
    this.facing = o.facing ?? 'down';
    const bw = o.body?.w ?? 22;
    const bh = o.body?.h ?? 10;
    this.feet = scene.add.zone(o.x, o.y, bw, bh);
    scene.physics.add.existing(this.feet);
    this.body = this.feet.body as Phaser.Physics.Arcade.Body;
    this.body.setCollideWorldBounds(true);
    this.body.setImmovable(o.solid === false ? false : !!o.solid);
    const key = this.textureFor(this.facing);
    this.sprite = scene.add.sprite(o.x, o.y, key);
    this.applyAnchor();
    if (o.shadow !== null) {
      this.shadow = scene.add.image(o.x, o.y, o.shadow ?? 'shadow-small').setDepth(DEPTH_SHADOW);
      this.shadow.setAlpha(0.9);
    }
    this.refresh(true);
  }

  get x(): number {
    return this.feet.x;
  }

  get y(): number {
    return this.feet.y;
  }

  setPosition(x: number, y: number): this {
    this.feet.setPosition(x, y);
    this.body.reset(x, y);
    this.refresh(true);
    return this;
  }

  setOutfit(outfit: string): void {
    this.outfit = outfit;
    this.refresh(true);
  }

  setVisible(v: boolean): this {
    this.sprite.setVisible(v);
    this.shadow?.setVisible(v);
    this.body.enable = v && !this.scripted;
    return this;
  }

  get visible(): boolean {
    return this.sprite.visible;
  }

  /** Physical velocity (used by the player controller and animal AI). */
  move(vx: number, vy: number): void {
    this.body.setVelocity(vx, vy);
    this.moving = Math.abs(vx) + Math.abs(vy) > 1;
    if (this.moving) this.faceVector(vx, vy);
  }

  stop(): void {
    this.body.setVelocity(0, 0);
    this.moving = false;
  }

  faceVector(vx: number, vy: number): void {
    if (Math.abs(vx) > Math.abs(vy) * 1.05) this.facing = vx < 0 ? 'left' : 'right';
    else if (Math.abs(vy) > 0.01) this.facing = vy < 0 ? 'up' : 'down';
  }

  face(target: Facing | Actor | { x: number; y: number }): void {
    if (typeof target === 'string') this.facing = target;
    else this.faceVector(target.x - this.x, target.y - this.y);
    this.refresh(true);
  }

  /** Scripted walk (ignores collisions). Resolves on arrival. */
  walkTo(x: number, y: number, speed = 120): Promise<void> {
    return new Promise((resolve) => {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, x, y);
      if (dist < 2) {
        resolve();
        return;
      }
      this.scripted = true;
      this.body.enable = false;
      this.body.setVelocity(0, 0);
      this.faceVector(x - this.x, y - this.y);
      this.moving = true;
      this.scene.tweens.add({
        targets: this.feet,
        x,
        y,
        duration: (dist / speed) * 1000,
        onUpdate: () => this.refresh(),
        onComplete: () => {
          this.moving = false;
          this.scripted = false;
          this.body.enable = this.sprite.visible;
          this.body.reset(x, y);
          this.refresh(true);
          resolve();
        },
      });
    });
  }

  async walkPath(points: [number, number][], speed = 120): Promise<void> {
    for (const [x, y] of points) await this.walkTo(x, y, speed);
  }

  emote(kind: string, ms = 1400): void {
    this.emoteSprite?.destroy();
    const key = `emote-${kind}`;
    if (!this.scene.textures.exists(key)) return;
    const e = this.scene.add.image(this.x, this.topY() - 6, key).setOrigin(0.5, 1).setDepth(DEPTH_OVERLAY - 10);
    this.emoteSprite = e;
    this.scene.tweens.add({ targets: e, y: e.y - 4, duration: 220, yoyo: true });
    this.scene.time.delayedCall(ms, () => {
      if (this.emoteSprite === e) this.emoteSprite = null;
      this.scene.tweens.add({ targets: e, alpha: 0, duration: 200, onComplete: () => e.destroy() });
    });
  }

  /** Show an item held above the head (e.g. the fruit in Genesis 3:6). */
  hold(key: string | null): void {
    this.heldSprite?.destroy();
    this.heldSprite = null;
    if (!key) return;
    this.heldSprite = this.scene.add.image(this.x, this.topY() + 30, key).setOrigin(0.5, 1).setDepth(this.y + 1);
  }

  topY(): number {
    return this.y - this.sprite.displayHeight * this.anchorY;
  }

  private textureFor(facing: Facing): string {
    if (this.charId) {
      const dir: Direction = facing === 'left' ? 'right' : facing;
      const outfits = MANIFEST.characters[this.charId] ?? {};
      const set = outfits[this.outfit ?? 'leaves'] ?? Object.values(outfits)[0] ?? {};
      if (set[dir]) return charKey(this.charId, this.outfit ?? Object.keys(outfits)[0], dir);
      const any = (['right', 'down', 'up'] as Direction[]).find((d) => set[d]);
      return charKey(this.charId, this.outfit ?? 'leaves', any ?? 'down');
    }
    return this.sheet ?? '__MISSING';
  }

  private applyAnchor(): void {
    const tex = this.sprite.texture.key;
    let ax = 0.5;
    let ay = 1;
    if (this.charId) {
      const parts = tex.split(':');
      const a = MANIFEST.characters[parts[1]]?.[parts[2]]?.[parts[3] as Direction];
      if (a) {
        ax = a.anchorX / a.frameWidth;
        ay = (a.anchorY + 1) / a.frameHeight;
      }
    } else if (this.sheet && MANIFEST.sprites[this.sheet]) {
      const a = MANIFEST.sprites[this.sheet];
      ax = a.anchorX / a.frameWidth;
      ay = (a.anchorY + 1) / a.frameHeight;
    }
    this.anchorY = ay;
    this.sprite.setOrigin(ax, ay);
  }

  /** Sync sprite with the feet and pick the right animation. */
  refresh(force = false): void {
    const x = Math.round(this.feet.x);
    const y = Math.round(this.feet.y);
    this.sprite.setPosition(x, y - this.lift);
    this.sprite.setDepth(y + this.depthBias);
    this.shadow?.setPosition(x, y);
    this.emoteSprite?.setPosition(x, this.topY() - 6);
    if (this.heldSprite) this.heldSprite.setPosition(x + (this.facing === 'left' ? -10 : this.facing === 'right' ? 10 : 0), y - 52).setDepth(y + 1);
    const tex = this.textureFor(this.facing);
    if (this.sprite.texture.key !== tex) {
      this.sprite.setTexture(tex);
      this.applyAnchor();
      force = true;
    }
    this.sprite.setFlipX(this.facing === 'left');
    const anims = this.scene.anims;
    let anim = '';
    if (this.charId) {
      anim = `${tex}:${this.moving ? 'walk' : 'idle'}`;
    } else if (this.sheet) {
      anim = this.lift > 4 && anims.exists(`${tex}:fly`) ? `${tex}:fly` : `${tex}:${this.moving ? 'walk' : 'idle'}`;
      if (!anims.exists(anim)) anim = anims.exists(`${tex}:loop`) ? `${tex}:loop` : '';
    }
    if (anim && (force || anim !== this.lastAnim) && anims.exists(anim)) {
      this.sprite.play(anim, true);
      this.lastAnim = anim;
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow?.destroy();
    this.feet.destroy();
    this.emoteSprite?.destroy();
    this.heldSprite?.destroy();
  }
}
