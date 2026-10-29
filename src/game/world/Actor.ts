import Phaser from 'phaser';
import { CHARACTERS } from '../../data/characters';
import { MANIFEST, charKey, shadowOf, sized, textureScale, type Direction } from '../manifest';
import { addShadow, fitShadow } from './shadows';

export type Facing = 'down' | 'up' | 'left' | 'right';

export const DEPTH_GROUND = -100000;
export const DEPTH_SHADOW = -50000;
export const DEPTH_OVERLAY = 1000000;
/** Speed (px/s) at which a character's walk animation plays at its own frame
 * rate: the player's walking speed. Slower or faster walks play it slower or
 * faster, so the feet keep pace with the ground. */
export const WALK_PACE = 170;

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
  private castShadow = false;
  private roundShadow = 'shadow-small';
  facing: Facing;
  moving = false;
  /** current walking speed (px/s) */
  pace = 0;
  charId?: string;
  outfit?: string;
  sheet?: string;
  scripted = false;
  hidden = false;
  private emoteSprite: Phaser.GameObjects.Image | null = null;
  private heldSprite: Phaser.GameObjects.Image | null = null;
  private anchorY = 1;
  private lastAnim = '';
  private grip: 'hand' | 'arms' = 'hand';
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
      // the sprite's own cast shadow when it has one, else a soft round one
      this.roundShadow = o.shadow ?? 'shadow-small';
      this.shadow = addShadow(scene, o.x, o.y, key) ?? scene.add.image(o.x, o.y, this.roundShadow).setDepth(DEPTH_SHADOW).setAlpha(0.9);
      this.castShadow = this.shadow.texture.key.startsWith('shadow:');
      // the shadow moves with the legs, arms and wings: one cell per frame
      this.sprite.on(Phaser.Animations.Events.ANIMATION_UPDATE, () => this.syncShadow());
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
    this.pace = Math.hypot(vx, vy);
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
      this.pace = speed;
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

  /** Show an item in the hand (e.g. the fruit in Genesis 3:6), or carried
   * in front with both arms (`arms`, e.g. the basket). */
  hold(key: string | null, grip: 'hand' | 'arms' = 'hand'): void {
    this.heldSprite?.destroy();
    this.heldSprite = null;
    this.grip = grip;
    if (!key) return;
    this.heldSprite = sized(this.scene.add.image(this.x, this.y - 36, key).setOrigin(0.5, 1).setDepth(this.y + 1));
    this.refresh();
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
    this.sprite.setOrigin(ax, ay).setScale(textureScale(tex));
  }

  /** Sync sprite with the feet and pick the right animation. */
  refresh(force = false): void {
    const x = Math.round(this.feet.x);
    const y = Math.round(this.feet.y);
    this.sprite.setPosition(x, y - this.lift);
    this.sprite.setDepth(y + this.depthBias);
    this.emoteSprite?.setPosition(x, this.topY() - 6);
    if (this.heldSprite) {
      // in the hand, at hand height; seen from behind, the body hides it
      const arms = this.grip === 'arms';
      const dx = (arms ? { left: -9, right: 9, down: 0, up: 0 } : { left: -7, right: 7, down: -12, up: 12 })[this.facing];
      this.heldSprite.setPosition(x + dx, y - (arms ? 22 : 36)).setDepth(this.facing === 'up' ? y - 1 : y + 1);
    }
    const tex = this.textureFor(this.facing);
    if (this.sprite.texture.key !== tex) {
      this.sprite.setTexture(tex);
      this.applyAnchor();
      // a sheet with its own cast shadow, or back to the soft round one
      if (this.shadow && shadowOf(tex)) this.castShadow = true;
      else if (this.shadow && this.castShadow) {
        this.castShadow = false;
        this.shadow.setTexture(this.roundShadow).setOrigin(0.5).setScale(1).setAlpha(0.9);
      }
      force = true;
    }
    this.sprite.setFlipX(this.facing === 'left');
    this.syncShadow();
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
    // each character's walk matches its own usual speed (God walks slower, with shorter steps)
    if (this.charId) this.sprite.anims.timeScale = this.moving ? Phaser.Math.Clamp(this.pace / (CHARACTERS[this.charId]?.speed || WALK_PACE), 0.55, 1.75) : 1;
  }

  /** The shadow cell of the sprite's current frame, flipped like it. */
  private syncShadow(): void {
    if (!this.shadow) return;
    if (this.castShadow) fitShadow(this.shadow, this.sprite.texture.key, Number(this.sprite.frame.name) || 0, this.sprite.flipX);
    this.placeShadow();
  }

  /**
   * The shadow under the feet; lifted off the ground (a dove in flight), it
   * slides away from the sun along the ground (lower right, as the sun is at
   * the upper left: SHADOW_X, SHADOW_Y in tools/art/from_generated.py) and
   * grows smaller and fainter.
   */
  private placeShadow(): void {
    if (!this.shadow) return;
    const x = Math.round(this.feet.x);
    const y = Math.round(this.feet.y);
    const up = Math.max(0, this.lift);
    this.shadow.setPosition(x + up * 0.45, y + up * 0.11);
    if (!this.castShadow) return;
    const k = 1 / (1 + up / 60);
    this.shadow.setScale(textureScale(this.sprite.texture.key) * k).setAlpha(0.35 + 0.65 * k);
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow?.destroy();
    this.feet.destroy();
    this.emoteSprite?.destroy();
    this.heldSprite?.destroy();
  }
}
