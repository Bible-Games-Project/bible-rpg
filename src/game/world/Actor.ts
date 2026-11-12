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
/** the player walks a quarter slower than the character speed, feet with it; running is unchanged (the maintainer) */
export const PLAYER_WALK = 0.75;
/** How far below the bottom of the fist a held thing ends (world px): the
 * fist closes around its lower part. */
const HELD_BELOW_FIST = 3;
/** how far ahead a carried thing is held walking from the side (world px) */
const WALK_CARRY_AHEAD = 11;
/** how much further ahead a carried thing is held when running from the side (world px) */
const RUN_CARRY_AHEAD = 6;
/** Abel's staff (placeStaff): from the side it leans this far forward (radians) and this much more per px the hand swings ahead; the hand coming up lifts it at most this much (px) */
const STAFF_LEAN = 0.06;
const STAFF_SWING = 0.014;
/** running, he carries it off the ground (px) */
const STAFF_RUN_LIFT = 4;
const STAFF_LIFT = 6;
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
  /** bending down to pick something up (stoop()): 0 standing, 1 lowest */
  private stooping: { k: number } | null = null;
  /** a side-drawn animal leaning the way it goes (see refresh) */
  charId?: string;
  outfit?: string;
  sheet?: string;
  scripted = false;
  hidden = false;
  private emoteSprite: Phaser.GameObjects.Image | null = null;
  private emoteLift = 6;
  private heldSprite: Phaser.GameObjects.Image | null = null;
  /** a thing in the other hand (Abel's knife, the staff still in the first: the maintainer) */
  private offSprite: Phaser.GameObjects.Image | null = null;
  private anchorY = 1;
  private lastAnim = '';
  private grip: 'hand' | 'arms' | 'carry' | 'staff' = 'hand';
  /** offset the sprite vertically (e.g. a dove hopping or flying) */
  lift = 0;
  private shadowOffset: [number, number];
  /** the pace at which a sheet's walk plays at its own rate (the sheep set it lower when they run: quicker legs) */
  stridePace?: number;
  private handHeight: number;
  /** what is held (hold()'s arguments), to give it back after a while */
  private heldArgs: [string, 'hand' | 'arms' | 'carry' | 'staff', [number, number]] | null = null;
  /** a blow in progress (attack()): how far the body steps in (px), how far the held thing turns (rad) and rises (px), how much it points the way they face */
  private blow: { lunge: number; turn: number; lift: number; aim: number; kind: 'swing' | 'stab'; phase: 'wind' | 'land' | 'rest' } | null = null;
  /** what is held sits this much lower (px) in the hand, by the way they face (the maintainer: the jawbone hung below the fist, the fat too high from the front) */
  private heldNudge: Partial<Record<Facing, number>> = {};
  /** going at a run (kept a little below the speed that starts it, so it does not flicker) */
  private running = false;
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
    this.offSprite?.setVisible(v);
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
      // going (nearly) straight up or down, it does not keep turning round
      if (Math.abs(vx) > Math.max(0.5, Math.abs(vy) * 0.25)) this.facing = vx < 0 ? 'left' : 'right';
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

  /** A sign over the head; `lift`: how far above the head's top it sits. */
  emote(kind: string, ms = 1400, lift = 6): void {
    this.emoteLift = lift;
    this.emoteSprite?.destroy();
    const key = `emote-${kind}`;
    if (!this.scene.textures.exists(key)) return;
    const e = sized(this.scene.add.image(this.x, this.topY() - lift, key).setOrigin(0.5, 1).setDepth(DEPTH_OVERLAY - 10));
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
  hold(key: string | null, grip: 'hand' | 'arms' | 'carry' | 'staff' = 'hand', origin: [number, number] = [0.5, 1], nudge: Partial<Record<Facing, number>> = {}): void {
    this.heldNudge = nudge;
    this.heldSprite?.destroy();
    this.heldSprite = null;
    this.grip = grip;
    this.heldArgs = key ? [key, grip, origin] : null;
    if (!key) return;
    this.heldSprite = sized(this.scene.add.image(this.x, this.y - 36, key).setOrigin(origin[0], origin[1]).setDepth(this.y + 1)).setVisible(this.sprite.visible);
    this.refresh();
  }

  /** Something in the other hand as well, held as hold(key, 'hand') would hold it
   * (a blow is made with it); what is in the first hand moves to the far side. */
  holdOther(key: string | null, origin: [number, number] = [0.5, 1]): void {
    this.offSprite?.destroy();
    this.offSprite = null;
    if (!key) return void this.refresh();
    this.offSprite = sized(this.scene.add.image(this.x, this.y - 36, key).setOrigin(origin[0], origin[1]).setDepth(this.y + 1)).setVisible(this.sprite.visible);
    this.refresh();
  }

  private stepFrame = -1;
  /**
   * True once each time a foot comes down (footsteps in time with the legs,
   * the maintainer): frames 0 and 4 of the 8-frame walk (legs furthest
   * apart), 2 and 6 of the run (lowest, on the ground).
   */
  footDown(): boolean {
    const a = this.sprite.anims;
    const key = a.currentAnim?.key ?? '';
    const run = key.endsWith(':run');
    if (!this.moving || !(run || key.endsWith(':walk')) || !a.currentFrame) {
      this.stepFrame = -1;
      return false;
    }
    const i = a.currentFrame.index - 1;
    if (i === this.stepFrame) return false;
    this.stepFrame = i;
    const half = Math.max(1, Math.round(a.currentAnim!.frames.length / 2));
    return i % half === (run ? Math.round(half / 2) : 0);
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
    const b = { lunge: 0, turn: 0, lift: 0, aim: 0, kind, phase: 'wind' as 'wind' | 'land' | 'rest' };
    this.blow = b;
    const swing = kind === 'swing';
    // with the sheet's own poses the arm carries it up and down; else the held thing moves alone
    const posed = this.blowFrame() !== undefined;
    const wind = swing ? { lunge: -3, turn: -2.5, lift: posed ? 0 : -24, aim: 0 } : { lunge: -4, turn: -0.25, lift: posed ? 0 : -3, aim: 1 };
    // a stab ends with the blade down and forward, at something smaller (a lamb: the maintainer)
    const land = swing ? { lunge: 8, turn: 1.1, lift: posed ? 0 : 4, aim: 0 } : { lunge: 10, turn: 0.65, lift: posed ? 0 : 10, aim: 1 };
    const step = (props: Partial<typeof b>, duration: number, ease: string, delay = 0) =>
      new Promise<void>((done) => this.scene.tweens.add({ targets: b, ...props, duration, ease, delay, onComplete: () => done(), onStop: () => done() }));
    this.refresh();
    const landed = step(wind, swing ? 230 : 150, 'Quad.easeOut').then(() => {
      // the arm comes down as the blow starts to fall
      this.scene.time.delayedCall(swing ? 70 : 40, () => {
        if (this.blow !== b) return;
        b.phase = 'land';
        this.refresh();
      });
      return step(land, swing ? 100 : 80, 'Quad.easeIn', swing ? 70 : 40);
    });
    void landed
      .then(() => {
        this.scene.time.delayedCall(posed ? 200 : 0, () => {
          if (this.blow !== b || !posed) return;
          b.phase = 'rest';
          this.refresh(true);
        });
        return step({ lunge: 0, turn: 0, lift: 0, aim: 0 }, 280, 'Sine.easeInOut', 110);
      })
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

  /**
   * Bends down to the ground and straightens again (Cain picking the
   * produce, the maintainer), with the sheet's bending frames (else a
   * crouch). Resolves when the hands are lowest; the rise goes on after.
   */
  stoop(): Promise<void> {
    const st = { k: 0 };
    this.stooping = st;
    this.stop();
    this.refresh(true);
    this.sprite.anims.pause();
    const step = (k: number, duration: number, ease: string, delay = 0) =>
      new Promise<void>((done) => this.scene.tweens.add({ targets: st, k, duration, ease, delay, onUpdate: () => this.refresh(), onComplete: () => done(), onStop: () => done() }));
    const low = step(1, 240, 'Quad.easeOut');
    void low
      .then(() => step(0, 260, 'Sine.easeInOut', 220))
      .then(() => {
        if (this.stooping !== st) return;
        this.stooping = null;
        this.sprite.setScale(textureScale(this.sprite.texture.key));
        this.sprite.anims.resume();
        this.refresh(true);
      });
    return low;
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
    this.emoteSprite?.setPosition(x, this.topY() - this.emoteLift);
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
    // (from 1.15 its walk speed, so Abel following Cain running runs too; once running, it keeps running down to a little slower: Abel following at about that speed flickered between walk and run, stuck on one leg)
    const running = !!this.charId && this.moving && this.pace > pace * (this.running ? 1 : 1.15) && anims.exists(`${tex}:run`);
    this.running = running;
    if (this.charId) {
      anim = `${tex}:${running ? 'run' : this.moving ? 'walk' : 'idle'}`;
    } else if (this.sheet) {
      anim = this.lift > 4 && anims.exists(`${tex}:fly`) ? `${tex}:fly` : `${tex}:${this.moving ? 'walk' : 'idle'}`;
      if (!anims.exists(anim)) anim = anims.exists(`${tex}:loop`) ? `${tex}:loop` : '';
    }
    // in a blow: the sheet's poses for it, else caught mid-stride, leaning into it
    const pose = this.blowFrame();
    if (this.blow && pose === undefined && this.charId && anims.exists(`${tex}:walk`)) anim = `${tex}:walk`;
    if (anim && (force || anim !== this.lastAnim) && anims.exists(anim)) {
      this.sprite.play(anim, true);
      this.lastAnim = anim;
    }
    if (this.blow && pose !== undefined) {
      if (pose === null) {
        if (this.sprite.anims.isPaused) this.sprite.anims.resume();
      } else {
        if (!this.sprite.anims.isPaused) this.sprite.anims.pause();
        if (this.sprite.frame.name !== String(pose)) this.sprite.setFrame(pose);
      }
      this.sprite.setRotation(0);
      this.syncShadow();
    } else if (this.blow && anim.endsWith(':walk')) {
      const frames = this.sprite.anims.currentAnim?.frames ?? [];
      const stride = frames[Math.floor(frames.length / 4)];
      if (stride && this.sprite.anims.currentFrame !== stride) this.sprite.anims.pause(stride);
      else if (!this.sprite.anims.isPaused) this.sprite.anims.pause();
      const side = this.facing === 'left' ? -1 : this.facing === 'right' ? 1 : 0;
      this.sprite.setRotation(side * this.blow.lunge * 0.018);
    }
    // each character's walk matches its own usual speed (God walks slower, with shorter steps)
    if (this.charId) this.sprite.anims.timeScale = !this.moving ? 1 : running ? Phaser.Math.Clamp(this.pace / (pace * 1.6), 0.7, 1.4) : Phaser.Math.Clamp(this.pace / pace, 0.55, 1.75);
    else if (this.stridePace) this.sprite.anims.timeScale = this.moving ? Phaser.Math.Clamp(this.pace / this.stridePace, 0.5, 6) : 1;
    if (this.stooping) {
      const k = this.stooping.k;
      const parts = tex.split(':');
      const bend = parts[0] === 'char' ? MANIFEST.characters[parts[1]]?.[parts[2]]?.[parts[3] as Direction]?.stoop : undefined;
      if (bend?.length) {
        const i = k < 0.3 ? -1 : k < 0.75 ? 0 : 1;
        this.sprite.setFrame(i < 0 ? (this.sprite.anims.currentAnim?.frames[0]?.frame.name ?? 0) : bend[Math.min(i, bend.length - 1)]);
      } else {
        const base = textureScale(tex);
        this.sprite.setScale(base, base * (1 - 0.2 * k));
      }
    }
    // side-drawn animals (the sheep) neither bob nor lean as they go: the
    // maintainer saw them hop, and did not like the lean
    this.placeHeld();
  }

  /**
   * What the character holds: in the hand at hand height, or in front with
   * both arms; seen from behind, the body hides it. From the side it stays
   * in the fist as the arm swings (the frame's hand point from the art
   * pipeline: the maintainer saw held things hang still while the arm moved).
   */
  private placeHeld(): void {
    const x = this.feet.x;
    const y = this.feet.y;
    if (this.offSprite) this.placeInHand(this.offSprite, x, y, false, this.grip === 'staff');
    if (!this.heldSprite) return;
    if (this.grip === 'carry') return this.placeCarried(x, y);
    if (this.grip === 'staff') return this.placeStaff(x, y);
    this.placeInHand(this.heldSprite, x, y, this.grip === 'arms', false);
  }

  /** A thing in the hand (or both arms); `other`: the hand the staff is not in, from the front and back. */
  private placeInHand(s: Phaser.GameObjects.Image, x: number, y: number, arms: boolean, other: boolean): void {
    let dx = (arms ? { left: -9, right: 9, down: 0, up: 0 } : { left: -7, right: 7, down: -12, up: 12 })[this.facing];
    if (other && (this.facing === 'down' || this.facing === 'up')) dx = -dx;
    let dy = arms ? -22 : -this.handHeight;
    const fist = arms ? null : this.fist();
    if (fist) [dx, dy] = [fist[0], fist[1] + HELD_BELOW_FIST];
    else if (!arms) {
      // from the front and back, in the hand of this frame when the sheet records it
      const hand = this.frontHand(dx < 0 ? 0 : 1);
      if (hand) [dx, dy] = [hand[0], hand[1] + HELD_BELOW_FIST];
    }
    if (s === this.heldSprite) dy += this.heldNudge[this.facing] ?? 0;
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
    // from behind, what is in the hand is hidden by the body, the knife too while Abel stabs (the maintainer saw it through his back); a raised arm shows
    const behind = this.facing === 'up' && !(b && b.kind === 'swing' && this.blowFrame() !== undefined);
    s.setPosition(x + dx, y + dy).setRotation(turn).setDepth(behind ? y - 1 : y + 1);
  }

  /**
   * The frame of the sheet's pose for the blow in progress (attack()): the
   * arm raised or drawn back, then brought down or thrust in; from the front
   * and back, with the arm of the hand that holds it. null between poses,
   * undefined when the sheet has none (or no blow).
   */
  private blowFrame(): number | null | undefined {
    const b = this.blow;
    if (!b) return undefined;
    const parts = this.sprite.texture.key.split(':');
    const set = parts[0] === 'char' ? MANIFEST.characters[parts[1]]?.[parts[2]]?.[parts[3] as Direction]?.attack : undefined;
    if (!set) return undefined;
    if (b.phase === 'rest') return null;
    const list = set[b.kind === 'swing' ? (b.phase === 'wind' ? 'raise' : 'strike') : b.phase === 'wind' ? 'draw' : 'thrust'];
    if (list.length < 2) return list[0];
    // the weapon is in the other hand when the first holds a staff (Abel's knife)
    const right = this.facing === 'up' ? !this.offSprite : !!this.offSprite;
    return list[right ? 1 : 0];
  }

  /**
   * `staff` (Abel's crook): the shaft always passes through his hand, its
   * foot at the ground beside the feet. Walking and running it goes with the
   * hand (the maintainer: it did not match the movement): carried forward and
   * back with the arm, tilting with it, lifted a little as the hand comes up.
   * With something in the other hand it is planted ahead instead. `origin` is
   * its foot.
   */
  private placeStaff(x: number, y: number): void {
    const s = this.heldSprite!;
    const side = this.facing === 'left' ? -1 : this.facing === 'right' ? 1 : 0;
    let foot: [number, number];
    let lean: number;
    // with something in the other hand, the staff is in the far hand: planted
    // ahead of the body, behind it and the near arm
    const far = !!this.offSprite && !!side;
    if (far) {
      // it goes with the body as it steps into a blow
      const [bx] = this.blowOffset();
      foot = [side * 9 + bx, -1];
      const hand = [side * 6 + bx, -34];
      lean = Phaser.Math.Clamp(0.7 * Math.atan2(hand[0] - foot[0], foot[1] - hand[1]), -0.2, 0.2);
    } else {
      // the hand of this frame, and of the standing frame
      const i = this.facing === 'down' ? 0 : 1;
      const now = side ? this.fist() : this.frontHand(i);
      const rest = side ? this.fist(0) : this.frontHand(i, 0);
      const k = this.facing === 'down' ? -1 : 1;
      const hand: [number, number] = now ?? (side ? [side * 7, -34] : [k * 12, -34]);
      const swing = now && rest ? now[0] - rest[0] : 0;
      const raised = (now && rest ? Phaser.Math.Clamp(rest[1] - now[1], 0, STAFF_LIFT) : 0) + (this.lastAnim.endsWith(':run') ? STAFF_RUN_LIFT : 0);
      // from the side it leans a little forward, and more as the arm swings forward
      lean = side ? Phaser.Math.Clamp(side * STAFF_LEAN + swing * STAFF_SWING, -0.24, 0.24) : 0;
      const fy = (side ? 1 : this.facing === 'down' ? 2 : -2) - raised;
      foot = [hand[0] - Math.tan(lean) * (fy - hand[1]), fy];
    }
    // the crook faces the way they look
    const flip = this.facing === 'left';
    if (s.flipX !== flip) s.setFlipX(flip).setOrigin(1 - s.originX, s.originY);
    s.setPosition(x + foot[0], y + foot[1]).setRotation(lean).setDepth(this.facing === 'up' || far ? y - 1 : y + 1);
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
    // from the side it is held out ahead, behind the near arm, walking as running (the maintainer)
    const fromSide = !!fist;
    if (fist) {
      const ahead = this.facing === 'left' ? -1 : 1;
      // walking, the arms hold it out in front instead of swinging it back with the near arm
      dx = this.lastAnim.endsWith(':run') ? fist[0] * 0.75 + ahead * RUN_CARRY_AHEAD : fist[0] * 0.25 + ahead * WALK_CARRY_AHEAD;
      dy = fist[1] + 7;
    } else {
      const a = this.sprite.anims;
      const n = a.currentAnim?.frames.length ?? 1;
      const i = a.currentFrame?.index ?? 0;
      const step = this.moving ? Math.sin((i / n) * Math.PI * 4) : 0;
      dx = this.moving ? Math.sin((i / n) * Math.PI * 2) * 1.2 : 0;
      // going away it is held higher, up against the chest (the maintainer)
      dy = (this.facing === 'up' ? -26 : -20) + step * 1.6;
      // running, the arms hold it higher still, against the chest (the maintainer)
      if (this.lastAnim.endsWith(':run')) dy -= 6;
    }
    s.setPosition(x + dx, y + dy).setDepth(this.facing === 'up' || fromSide ? y - 1 : y + 1);
  }

  /** From the front or back, the bottom of a hand (0 the left of the picture, 1 the right)
   * in the current frame (world px from the feet), when the sheet records it. */
  private frontHand(i: 0 | 1, frame?: number): [number, number] | null {
    const parts = this.sprite.texture.key.split(':');
    if (parts[0] !== 'char') return null;
    const a = MANIFEST.characters[parts[1]]?.[parts[2]]?.[parts[3] as Direction];
    const p = a?.sideHands?.[frame ?? (Number(this.sprite.frame.name) || 0)]?.[this.sprite.flipX ? 1 - i : i];
    if (!a || !p) return null;
    const s = a.scale ?? 1;
    const dx = (p[0] - a.anchorX) * s;
    return [this.sprite.flipX ? -dx : dx, (p[1] - a.anchorY - 1) * s];
  }

  /** The bottom of the near fist in the current frame (world px from the
   * feet), when the sheet records it (side views of Adam and Eve). */
  private fist(frame?: number): [number, number] | null {
    const parts = this.sprite.texture.key.split(':');
    if (parts[0] !== 'char') return null;
    const a = MANIFEST.characters[parts[1]]?.[parts[2]]?.[parts[3] as Direction];
    const p = a?.hands?.[frame ?? (Number(this.sprite.frame.name) || 0)];
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
    this.offSprite?.destroy();
  }
}
