import Phaser from 'phaser';
import { CHARACTERS } from '../../data/characters';
import { MANIFEST, charKey, shadowOf, sized, textureScale, type Direction } from '../manifest';
import { addShadow, fitShadow, shadowStrength, shadowsMirrored } from './shadows';

export type Facing = 'down' | 'up' | 'left' | 'right';

export const DEPTH_GROUND = -100000;
export const DEPTH_SHADOW = -50000;
export const DEPTH_OVERLAY = 1000000;
/** Speed (px/s) at which a character's walk animation plays at its own frame
 * rate: the player's walking speed. Slower or faster walks play it slower or
 * faster, so the feet keep pace with the ground. */
export const WALK_PACE = 170;
/** How far below the bottom of the fist a held thing ends (world px): the
 * fist closes around its lower part. */
const HELD_BELOW_FIST = 3;
/** how much further ahead a carried thing is held when running from the side (world px) */
const RUN_CARRY_AHEAD = 6;
/** How much one axis must outweigh the other before a walker turns from a
 * side view to a front/back view or back (see faceVector). */
const FACING_HOLD = 1.3;

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
  /** nudges the shadow (world px), e.g. the serpent's, a touch down and right */
  shadowOffset?: [number, number];
  /** speed (px/s) at which its walk animation plays at its own rate; the
   * walk plays faster or slower with the real speed so the feet keep pace
   * (a sheep's short steps want a slower pace than a man's) */
  stridePace?: number;
  /** seen from the front or back, how high the hand is (world px above the
   * feet) for what it holds in the hand; 36 if not given */
  handHeight?: number;
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
  private grip: 'hand' | 'arms' | 'carry' | 'staff' = 'hand';
  /** offset the sprite vertically (e.g. a dove hopping or flying) */
  lift = 0;
  private shadowOffset: [number, number];
  private stridePace?: number;
  private handHeight: number;
  /** what is held (hold()'s arguments), to give it back after a while */
  private heldArgs: [string, 'hand' | 'arms' | 'carry' | 'staff', [number, number]] | null = null;
  /** a blow in progress (attack()): how far the body steps in (px), how far the held thing turns (rad) and rises (px), how much it points the way they face */
  private blow: { lunge: number; turn: number; lift: number; aim: number } | null = null;
  /** added to the depth (e.g. the serpent drawn on a branch, in front of the canopy) */
  depthBias = 0;

  constructor(scene: Phaser.Scene, o: ActorOptions) {
    this.scene = scene;
    this.id = o.id;
    this.charId = o.charId;
    this.outfit = o.outfit;
    this.shadowOffset = o.shadowOffset ?? [0, 0];
    this.stridePace = o.stridePace;
    this.handHeight = o.handHeight ?? 36;
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
      this.shadow = addShadow(scene, o.x, o.y, key) ?? scene.add.image(o.x, o.y, this.roundShadow).setDepth(DEPTH_SHADOW).setAlpha(0.9 * shadowStrength());
      this.castShadow = this.shadow.texture.key.startsWith('shadow:');
      // the shadow moves with the legs, arms and wings: one cell per frame
      this.sprite.on(Phaser.Animations.Events.ANIMATION_UPDATE, () => this.syncShadow());
    }
    // what the hand holds swings with the arm, frame by frame
    this.sprite.on(Phaser.Animations.Events.ANIMATION_UPDATE, () => this.placeHeld());
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
    this.heldSprite?.setVisible(v);
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
    // sheets drawn from the side (the serpent, animals) only turn left or
    // right: going up or down they faced right and crawled backwards
    if (this.sheet) {
      if (Math.abs(vx) > 0.5) this.facing = vx < 0 ? 'left' : 'right';
      return;
    }
    // near a diagonal the facing keeps its axis until the other one clearly
    // wins: a stick held at 45° flipped side/front views every few frames,
    // restarting the walk each time
    const ax = Math.abs(vx);
    const ay = Math.abs(vy);
    const side = this.facing === 'left' || this.facing === 'right';
    if (side ? ax * FACING_HOLD >= ay : ax > ay * FACING_HOLD) this.facing = vx < 0 ? 'left' : 'right';
    else if (ay > 0.01) this.facing = vy < 0 ? 'up' : 'down';
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
   * in front with both arms (`arms`, e.g. the basket). `origin` is the
   * point of the image held (default: its bottom centre; a staff is held
   * halfway up). */
  hold(key: string | null, grip: 'hand' | 'arms' | 'carry' | 'staff' = 'hand', origin: [number, number] = [0.5, 1]): void {
    this.heldSprite?.destroy();
    this.heldSprite = null;
    this.grip = grip;
    this.heldArgs = key ? [key, grip, origin] : null;
    if (!key) return;
    this.heldSprite = sized(this.scene.add.image(this.x, this.y - 36, key).setOrigin(origin[0], origin[1]).setDepth(this.y + 1)).setVisible(this.sprite.visible);
    this.refresh();
  }

  /** What is held now (to hold it again later), or null. */
  holding(): [string, 'hand' | 'arms' | 'carry' | 'staff', [number, number]] | null {
    return this.heldArgs;
  }

  /**
   * A blow with what is held in the hand (the maintainer): `swing` raises
   * it high and brings it down hard (Cain's jawbone), `stab` draws it back
   * and thrusts it in (Abel's knife). The body steps into it, caught in a
   * stride. Resolves at the moment it lands; the recovery goes on after.
   */
  attack(kind: 'swing' | 'stab'): Promise<void> {
    const b = { lunge: 0, turn: 0, lift: 0, aim: 0 };
    this.blow = b;
    const swing = kind === 'swing';
    const wind = swing ? { lunge: -3, turn: -2.5, lift: -24, aim: 0 } : { lunge: -4, turn: -0.25, lift: -3, aim: 1 };
    const land = swing ? { lunge: 8, turn: 1.1, lift: 4, aim: 0 } : { lunge: 10, turn: 0.1, lift: 0, aim: 1 };
    const step = (props: Partial<typeof b>, duration: number, ease: string, delay = 0) =>
      new Promise<void>((done) => this.scene.tweens.add({ targets: b, ...props, duration, ease, delay, onComplete: () => done(), onStop: () => done() }));
    const landed = step(wind, swing ? 230 : 150, 'Quad.easeOut').then(() => step(land, swing ? 100 : 80, 'Quad.easeIn', swing ? 70 : 40));
    void landed
      .then(() => step({ lunge: 0, turn: 0, lift: 0, aim: 0 }, 280, 'Sine.easeInOut', 110))
      .then(() => {
        // a newer blow has taken over
        if (this.blow !== b) return;
        this.blow = null;
        this.sprite.setRotation(0);
        this.sprite.anims.resume();
        this.refresh(true);
      });
    return landed;
  }

  /** The step into a blow, as an offset from the feet. */
  private blowOffset(): [number, number] {
    const b = this.blow;
    if (!b) return [0, 0];
    const k = { left: [-1, 0], right: [1, 0], down: [0, 0.5], up: [0, -0.5] }[this.facing];
    return [k[0] * b.lunge, k[1] * b.lunge];
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
    // not rounded to whole world px: the camera follows smoothly, and a
    // sprite snapped to world px (about 3 screen px) shook against it
    const x = this.feet.x;
    const y = this.feet.y;
    const [bx, by] = this.blowOffset();
    this.sprite.setPosition(x + bx, y - this.lift + by);
    this.sprite.setDepth(y + this.depthBias);
    this.emoteSprite?.setPosition(x, this.topY() - 6);
    const tex = this.textureFor(this.facing);
    if (this.sprite.texture.key !== tex) {
      this.sprite.setTexture(tex);
      this.applyAnchor();
      // a sheet with its own cast shadow, or back to the soft round one
      if (this.shadow && shadowOf(tex)) this.castShadow = true;
      else if (this.shadow && this.castShadow) {
        this.castShadow = false;
        this.shadow.setTexture(this.roundShadow).setOrigin(0.5).setScale(1).setFlipX(false).setAlpha(0.9 * shadowStrength());
      }
      force = true;
    }
    this.sprite.setFlipX(this.facing === 'left');
    this.syncShadow();
    const anims = this.scene.anims;
    let anim = '';
    // a character with its own running frames (Cain's trot) uses them
    // when going clearly faster than its walk
    const pace = this.stridePace ?? (this.charId ? CHARACTERS[this.charId]?.speed || WALK_PACE : WALK_PACE);
    const running = !!this.charId && this.moving && this.pace > pace * 1.3 && anims.exists(`${tex}:run`);
    if (this.charId) {
      anim = `${tex}:${running ? 'run' : this.moving ? 'walk' : 'idle'}`;
    } else if (this.sheet) {
      anim = this.lift > 4 && anims.exists(`${tex}:fly`) ? `${tex}:fly` : `${tex}:${this.moving ? 'walk' : 'idle'}`;
      if (!anims.exists(anim)) anim = anims.exists(`${tex}:loop`) ? `${tex}:loop` : '';
    }
    // in a blow: caught mid-stride, leaning into it
    if (this.blow && this.charId && anims.exists(`${tex}:walk`)) anim = `${tex}:walk`;
    if (anim && (force || anim !== this.lastAnim) && anims.exists(anim)) {
      this.sprite.play(anim, true);
      this.lastAnim = anim;
    }
    if (this.blow && anim.endsWith(':walk')) {
      const frames = this.sprite.anims.currentAnim?.frames ?? [];
      const stride = frames[Math.floor(frames.length / 4)];
      if (stride && this.sprite.anims.currentFrame !== stride) this.sprite.anims.pause(stride);
      else if (!this.sprite.anims.isPaused) this.sprite.anims.pause();
      const side = this.facing === 'left' ? -1 : this.facing === 'right' ? 1 : 0;
      this.sprite.setRotation(side * this.blow.lunge * 0.018);
    }
    // each character's walk matches its own usual speed (God walks slower, with shorter steps)
    if (this.charId) this.sprite.anims.timeScale = !this.moving ? 1 : running ? Phaser.Math.Clamp(this.pace / (pace * 1.6), 0.7, 1.4) : Phaser.Math.Clamp(this.pace / pace, 0.55, 1.75);
    else if (this.stridePace) this.sprite.anims.timeScale = this.moving ? Phaser.Math.Clamp(this.pace / this.stridePace, 0.5, 4) : 1;
    this.placeHeld();
  }

  /**
   * What the character holds: in the hand at hand height, or in front with
   * both arms; seen from behind, the body hides it. From the side it stays
   * in the fist as the arm swings (the frame's hand point from the art
   * pipeline: the maintainer saw held things hang still while the arm moved).
   */
  private placeHeld(): void {
    if (!this.heldSprite) return;
    const x = this.feet.x;
    const y = this.feet.y;
    if (this.grip === 'carry') return this.placeCarried(x, y);
    if (this.grip === 'staff') return this.placeStaff(x, y);
    const arms = this.grip === 'arms';
    let dx = (arms ? { left: -9, right: 9, down: 0, up: 0 } : { left: -7, right: 7, down: -12, up: 12 })[this.facing];
    let dy = arms ? -22 : -this.handHeight;
    const fist = arms ? null : this.fist();
    if (fist) [dx, dy] = [fist[0], fist[1] + HELD_BELOW_FIST];
    const s = this.heldSprite;
    // what points ahead points the way they look
    const flip = this.facing === 'left';
    if (!arms && s.flipX !== flip) s.setFlipX(flip).setOrigin(1 - s.originX, s.originY);
    let turn = 0;
    const b = this.blow;
    if (b && !arms) {
      const [bx, by] = this.blowOffset();
      dx += bx * 1.3;
      const side = this.facing === 'left' ? -1 : this.facing === 'right' ? 1 : 0;
      // raised, the hand goes up and back over the shoulder
      dx += side * b.lift * 0.3;
      dy += by * 1.3 + b.lift;
      turn = side ? side * b.turn : (this.facing === 'down' ? 1 : -1) * (b.aim * Math.PI * 0.5 + b.turn * 0.4);
    }
    s.setPosition(x + dx, y + dy).setRotation(turn).setDepth(this.facing === 'up' ? y - 1 : y + 1);
  }

  /**
   * `staff` (Abel's crook): its foot planted on the ground beside the feet
   * (a little ahead, from the side), leaning so the shaft passes through the
   * hand; from the side it rocks with the arm instead of floating with it
   * (the maintainer: the staff looked badly anchored). `origin` is its foot.
   */
  private placeStaff(x: number, y: number): void {
    const s = this.heldSprite!;
    const side = this.facing === 'left' ? -1 : this.facing === 'right' ? 1 : 0;
    const fist = this.fist();
    let foot: [number, number];
    let hand: [number, number];
    if (side) {
      foot = [side * 3, 1];
      hand = fist ?? [side * 7, -34];
    } else {
      const k = this.facing === 'down' ? -1 : 1;
      foot = [k * 13, this.facing === 'down' ? 2 : -2];
      hand = [k * 12, -34];
    }
    const lean = Phaser.Math.Clamp(0.7 * Math.atan2(hand[0] - foot[0], foot[1] - hand[1]), -0.2, 0.2);
    // the crook faces the way they look
    const flip = this.facing === 'left';
    if (s.flipX !== flip) s.setFlipX(flip).setOrigin(1 - s.originX, s.originY);
    s.setPosition(x + foot[0], y + foot[1]).setRotation(lean).setDepth(this.facing === 'up' ? y - 1 : y + 1);
  }

  /**
   * `carry` (Cain and Abel): carried in front with both hands, moving with
   * them. From the side it hangs from the fists of the current frame (pulled
   * a little toward the chest, both arms hold it); from the front it rides
   * up and down with each step.
   */
  private placeCarried(x: number, y: number): void {
    const s = this.heldSprite!;
    const fist = this.fist();
    let dx: number;
    let dy: number;
    // running from the side, it is held out further ahead, behind the near arm (the maintainer)
    const runningSide = !!fist && this.lastAnim.endsWith(':run');
    if (fist) {
      dx = fist[0] * 0.75 + (runningSide ? (this.facing === 'left' ? -RUN_CARRY_AHEAD : RUN_CARRY_AHEAD) : 0);
      dy = fist[1] + 7;
    } else {
      const a = this.sprite.anims;
      const n = a.currentAnim?.frames.length ?? 1;
      const i = a.currentFrame?.index ?? 0;
      const step = this.moving ? Math.sin((i / n) * Math.PI * 4) : 0;
      dx = this.moving ? Math.sin((i / n) * Math.PI * 2) * 1.2 : 0;
      dy = -20 + step * 1.6;
    }
    s.setPosition(x + dx, y + dy).setDepth(this.facing === 'up' || runningSide ? y - 1 : y + 1);
  }

  /** The bottom of the near fist in the current frame (world px from the
   * feet), when the sheet records it (side views of Adam and Eve). */
  private fist(): [number, number] | null {
    const parts = this.sprite.texture.key.split(':');
    if (parts[0] !== 'char') return null;
    const a = MANIFEST.characters[parts[1]]?.[parts[2]]?.[parts[3] as Direction];
    const p = a?.hands?.[Number(this.sprite.frame.name) || 0];
    if (!a || !p) return null;
    const s = a.scale ?? 1;
    const dx = (p[0] - a.anchorX) * s;
    return [this.sprite.flipX ? -dx : dx, (p[1] - a.anchorY - 1) * s];
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
    const x = this.feet.x + this.shadowOffset[0];
    const y = this.feet.y + this.shadowOffset[1];
    const up = Math.max(0, this.lift);
    this.shadow.setPosition(x + up * 0.45 * (shadowsMirrored() ? -1 : 1), y + up * 0.11);
    if (!this.castShadow) return;
    const k = 1 / (1 + up / 60);
    this.shadow.setScale(textureScale(this.sprite.texture.key) * k).setAlpha((0.35 + 0.65 * k) * shadowStrength());
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow?.destroy();
    this.feet.destroy();
    this.emoteSprite?.destroy();
    this.heldSprite?.destroy();
  }
}
