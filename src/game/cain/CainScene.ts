import Phaser from 'phaser';
import { audio, type Mood } from '../../core/audio';
import { input, type InputLayer } from '../../core/input';
import { t, tRaw, interpolate } from '../../core/i18n';
import { settings } from '../../core/settings';
import { voices } from '../../core/voices';
import type { FlagValue } from '../../core/save';
import { CHARACTERS } from '../../data/characters';
import { BOUNDS, ESCAPE, FOLD, LAMBS, PENNED, POINTS, SAFE, SHEEP, WORLD_H, WORLD_W, ZONES } from '../../data/cain/map';
import type { Pt } from '../../data/eden/map';
import type { Line } from '../../ui/DialogueBox';
import { ui } from '../bridge';
import { ART_RESOLUTION, pixelRatio } from '../display';
import { MANIFEST, sized, textureScale } from '../manifest';
import { Actor, DEPTH_OVERLAY, DEPTH_SHADOW, type Facing } from '../world/Actor';
import { Atmosphere } from '../world/Atmosphere';
import { GodLight } from '../world/GodLight';
import { ObjectiveMarkers } from '../world/ObjectiveMarkers';
import { Conversation, TALK_PACE, type Talker } from '../world/talk';
import type { InteractSpec, ObjectiveOptions, ObjectiveTarget } from '../WorldApi';
import { ART, buildCainArt, buildCainPortraits, loadCainArt } from './art';
import { CainWorld } from './CainWorld';
import { CainRunner } from './missions';
import { NIGHT_BACKGROUND, NIGHT_SHADOW, NIGHT_TINT } from './palette';
import { setShadowLight } from '../world/shadows';

export interface CainStartData {
  mode: 'continue' | 'new' | 'restart';
}

export type Brother = 'cain' | 'abel';

const RUN = 1.6;
const VIEW_HEIGHT = 1000;
const VIEW_MIN_WIDTH = 640;
const MIN_ZOOM = 0.5;

/** The blows it takes (the maintainer: five, with a health bar). */
export const HITS = 5;
/** How close Cain must be to strike, and how often he can. */
const REACH = 62;
const STRIKE_COOLDOWN = 0.6;
/** Abel's running: his pace, slower with each blow; the stagger and the dash after it. */
const FLEE_SPEED = 112;
const FLEE_SLOWER = 13;
/** the dash after a blow loses this much per blow too */
const DASH_SLOWER = 20;
const STAGGER = 0.3;
const DASH = 0.65;
const DASH_SPEED = 190;
/** Abel's blood (the maintainer): drops flying from each blow, wounds that grow, a trail more frequent the more he is hurt */
const BLOOD = 0x9a1f2c;
const BLOOD_DARK = 0x6b1420;
/** seconds between drops on the trail after one blow (shorter with each) */
const TRAIL_EVERY = 0.7;
/** a struck body flushes red for a moment (instead of a white flash: the maintainer) */
const HURT_TINT = 0xff6a6a;
/** where Abel grips his flint knife (fractions of the drawing: in the haft) */
const KNIFE_GRIP: [number, number] = [0.21, 0.5];

/**
 * Herding (mission 2, the maintainer): the dog runs ahead of Abel the way
 * he walks; the sheep shy away from it (and a little from Abel), keep
 * together and spread apart a little. How far ahead the dog runs, how far
 * the sheep feel it and Abel, and their speeds.
 */
const DOG_AHEAD = 95;
const DOG_SPEED = 230;
/** the dog when the player runs it (mission 2); faster than the sheep so it can get round them */
const DOG_DRIVE_SPEED = 175;
const DOG_FEAR = 150;
/** a herded sheep is pushed back within this of the map's edges, and goes no further out within EDGE_STOP */
const EDGE_KEEP = 230;
const EDGE_STOP = 140;
const ABEL_FEAR = 70;
/** when the player runs the dog, the sheep only heed it when it barks (E, the
 * maintainer): a bark scares those within BARK_REACH, fading over BARK_SCARE ms */
const BARK_REACH = 190;
const BARK_SCARE = 1800;
/** the sheep's top speed when driven (the maintainer: they ran too fast) */
const HERD_SPEED = 76;
/** the pace at which the sheep's and lambs' walks play at their own rate: their
 * legs keep up with how fast they go (the maintainer saw them skate, then
 * asked for the steps twice as quick) */
const SHEEP_STRIDE = 26;
/** the brothers' fists from the front and back (world px above the feet):
 * what they hold sits in the hand, not under it */
const HAND_HEIGHT = 41;
const LAMB_STRIDE = 20;
const GRAZE_SPEED = 16;

const ITEM_ICONS: Record<string, string> = {
  produce: 'cain-basket',
  fat: 'cain-fat',
  jawbone: 'cain-jawbone',
};

/** Who speaks with which portrait in this chapter (all in its palette). */
const PORTRAITS: Record<string, string> = { cain: 'cain', abel: 'abel', god: 'cain-god', adam: 'cain-adam', eve: 'cain-eve' };

interface Grazer {
  actor: Actor;
  home: Pt;
  range: number;
  speed: number;
  target: Pt | null;
  wait: number;
  frozen: boolean;
  /** herding: how frightened it is (0 calm, 1 fleeing), fading after a bark */
  fright: number;
  /** herding: its current speed, and whether it is in the fold */
  vx: number;
  vy: number;
  penned: boolean;
  /** herding: how long it has pushed without getting anywhere, the way it
   * then sidesteps, and where it was */
  stuck: number;
  side: number;
  was: Pt;
}

/**
 * Genesis 4: the land east of Eden where Adam and Eve live with their sons.
 * Builds the world and the actors and gives the missions (missions.ts)
 * what they need: dialogue, objectives, interactions, staging, and the
 * chapter's own pieces (the offerings, the lambs, the chase in the field).
 */
export class CainScene extends Phaser.Scene {
  world!: CainWorld;
  cain!: Actor;
  abel!: Actor;
  god!: Actor;
  eve!: Actor;
  private adamSitting!: Phaser.GameObjects.Sprite;
  sheep: Grazer[] = [];
  lambs: Grazer[] = [];
  dog!: Actor;
  /** the flock being brought into the fold (mission 2) */
  private herd: { done: () => void; dir: Pt; last: Pt } | null = null;
  private active: Brother = 'cain';
  private following = false;
  private control = true;
  /** a cinematic: the player is held even in its dialogues (cutscene(true, true)) */
  private held = false;
  private talk = new Conversation();
  private busy = false;
  private interactions: InteractSpec[] = [];
  private currentInteract: InteractSpec | null = null;
  private objectiveTarget: ObjectiveTarget = null;
  private objectiveAll = false;
  private markers!: ObjectiveMarkers;
  private atmosphere!: Atmosphere;
  private holy!: GodLight;
  private godLit = false;
  private inventory: Record<string, number> = {};
  private flags: Record<string, FlagValue> = {};
  private layer!: InputLayer;
  private runner!: CainRunner;
  private followStuck = 0;
  private brotherColliders: Record<Brother, Phaser.Physics.Arcade.Collider[]> = { cain: [], abel: [] };
  /** things laid on the altars, the fire on Abel's */
  private altarThings: Phaser.GameObjects.GameObject[] = [];
  private altarFire: Phaser.GameObjects.Sprite | null = null;
  private smoke: Phaser.Time.TimerEvent | null = null;
  private npcsTalk = true;
  private chaseState: ChaseState | null = null;
  private healthBar!: Phaser.GameObjects.Graphics;
  /** the blood on the ground (cleared when the chase begins again, and when Abel is buried) */
  private blood: Phaser.GameObjects.GameObject[] = [];
  /** the wounds on Abel, each at its place on his body (fractions of his height) */
  private wounds: { o: Phaser.GameObjects.Ellipse; fx: number; fy: number }[] = [];
  private trailTimer = 0;

  constructor() {
    super('cain');
  }

  preload(): void {
    loadCainArt(this);
  }

  create(data: CainStartData): void {
    // Phaser keeps the scene object between games: everything left from the
    // last one goes (the old, destroyed lambs stayed first in the list and
    // stopped a new game on a black screen)
    this.sheep = [];
    this.lambs = [];
    this.herd = null;
    this.blood = [];
    this.wounds = [];
    this.driving = false;
    this.active = 'cain';
    this.following = false;
    this.control = true;
    this.busy = false;
    this.interactions = [];
    this.currentInteract = null;
    this.objectiveTarget = null;
    this.objectiveAll = false;
    this.godLit = false;
    this.inventory = {};
    this.flags = {};
    this.followStuck = 0;
    this.brotherColliders = { cain: [], abel: [] };
    this.altarThings = [];
    this.altarFire = null;
    this.smoke = null;
    this.npcsTalk = true;
    this.chaseState = null;
    // night: faint shadows falling toward the lower left (the maintainer)
    setShadowLight(true, NIGHT_SHADOW);
    buildCainArt(this);
    void buildCainPortraits();
    this.physics.world.setBounds(BOUNDS.left, BOUNDS.top, BOUNDS.right - BOUNDS.left, BOUNDS.bottom - BOUNDS.top);
    this.world = new CainWorld(this);
    const body = { w: 22, h: 10 };
    this.cain = new Actor(this, { id: 'cain', x: POINTS.start[0], y: POINTS.start[1], charId: 'cain', outfit: 'tunic', body, facing: 'right', handHeight: HAND_HEIGHT });
    this.abel = new Actor(this, { id: 'abel', x: POINTS.abelStart[0], y: POINTS.abelStart[1], charId: 'abel', outfit: 'tunic', body, facing: 'right', handHeight: HAND_HEIGHT });
    this.god = new Actor(this, { id: 'god', x: POINTS.godStart[0], y: POINTS.godStart[1], charId: 'god', outfit: 'robe', body: { w: 26, h: 10 }, solid: true });
    this.god.setVisible(false);
    // Eve stands at the fire, cooking; Adam sits on the log (the maintainer)
    this.eve = new Actor(this, { id: 'eve', x: POINTS.eve[0], y: POINTS.eve[1], charId: 'eve', outfit: 'tunic', body: { w: 22, h: 10 }, solid: true, facing: 'left' });
    const sit = MANIFEST.sprites['cain-adam-sitting'];
    const [lx, ly] = POINTS.adamLog;
    this.adamSitting = sized(this.add.sprite(lx - 4, ly - 2, 'cain-adam-sitting').setOrigin(sit.anchorX / sit.frameWidth, 1).setDepth(ly + 5));
    this.adamSitting.play('cain-adam-sitting:idle');
    this.add.image(lx + 2, ly + 4, 'shadow-small').setDepth(-50000).setAlpha(0.6 * NIGHT_SHADOW);
    this.holy = new GodLight(this, settings.get().reduceMotion);
    this.markers = new ObjectiveMarkers(this);
    this.healthBar = this.add.graphics().setDepth(DEPTH_OVERLAY - 20).setVisible(false);
    this.flock();
    // colliders: each brother collides with the world while played
    for (const who of ['cain', 'abel'] as Brother[]) {
      const a = this.brother(who);
      this.brotherColliders[who] = [
        this.physics.add.collider(a.feet, this.world.colliders),
        this.physics.add.collider(a.feet, this.god.feet),
        this.physics.add.collider(a.feet, this.eve.feet),
      ];
    }
    for (const g of [...this.sheep, ...this.lambs]) this.physics.add.collider(g.actor.feet, this.world.colliders);
    this.physics.add.collider(this.dog.feet, this.world.colliders);
    this.atmosphere = new Atmosphere(this, settings.get().reduceMotion, { w: WORLD_W, h: WORLD_H });
    // night: no sunbeams or sun glow, the cloud shadows barely there
    this.atmosphere.setTime('evening');
    this.nightLight();
    this.steamRising();
    // camera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.setRoundPixels(false);
    cam.setBackgroundColor(NIGHT_BACKGROUND);
    this.applyZoom();
    this.scale.on('resize', this.applyZoom, this);
    this.cameraFollow();
    this.layer = {
      allowMovement: true,
      onAction: (a) => {
        if (a === 'pause') {
          ui().openPause();
          return true;
        }
        if (a === 'interact') {
          // running the dog, E makes it bark: just for fun (the maintainer)
          if (this.driving) {
            if (this.canMove()) this.dogBark();
            return true;
          }
          if (this.canAct() && this.currentInteract) void this.useInteract(this.currentInteract);
          return true;
        }
        return a === 'switch';
      },
    };
    input.push(this.layer);
    this.events.once('shutdown', () => this.teardown());
    this.events.once('destroy', () => this.teardown());
    audio.setAmbience('outside');
    this.npcTalk();
    this.runner = new CainRunner(this, data.mode);
    void this.runner.start();
  }

  halt(): void {
    this.runner?.stop();
  }

  private teardown(): void {
    input.remove(this.layer);
    this.scale.off('resize', this.applyZoom, this);
    audio.setAmbience('none');
    audio.setMood('none');
    this.runner?.stop();
    this.chaseState = null;
  }

  private applyZoom(): void {
    if (!this.cameras?.main) return; // the scene has stopped
    const z = this.viewZoom();
    for (const key of this.textures.getTextureKeys()) {
      const perPixel = z * textureScale(key);
      const smooth = key.startsWith('fx-') || key === 'tiles-extruded' || key === 'cain-tiles-extruded';
      const crisp = key === 'ui-arrows' || (!smooth && perPixel >= 0.98 && Math.abs(perPixel - Math.round(perPixel)) < 0.02);
      this.textures.get(key).setFilter(crisp ? Phaser.Textures.FilterMode.NEAREST : Phaser.Textures.FilterMode.LINEAR);
    }
    this.cameras.main.setZoom(z);
    this.atmosphere.resize(this.scale.width, this.scale.height, z);
  }

  private viewZoom(): number {
    const dpr = pixelRatio();
    const wanted = Math.min(this.scale.height / VIEW_HEIGHT, this.scale.width / VIEW_MIN_WIDTH);
    const perArt = wanted / ART_RESOLUTION;
    return perArt >= 0.8 ? ART_RESOLUTION * Math.max(1, Math.round(perArt)) : Math.max(wanted, MIN_ZOOM * dpr);
  }

  // ------------------------------------------------------------------ party

  brother(id: Brother): Actor {
    return id === 'cain' ? this.cain : this.abel;
  }

  player(): Actor {
    return this.brother(this.active);
  }

  activeId(): Brother {
    return this.active;
  }

  private other(): Actor {
    return this.active === 'cain' ? this.abel : this.cain;
  }

  setActive(id: Brother): void {
    this.player().stop();
    this.active = id;
    for (const who of ['cain', 'abel'] as Brother[]) for (const c of this.brotherColliders[who]) c.active = who === id;
    this.cameraFollow();
    ui().hud.setCharacter(t(CHARACTERS[id].nameKey), null);
  }

  follow(on: boolean): void {
    this.following = on;
  }

  /** Called by the HUD's switch button (there is no switching in this chapter). */
  switchCharacter(): void {}

  // --------------------------------------------------------------- dialogue

  say(id: string, params?: Record<string, string | number>): Promise<void> {
    const raw = tRaw<{ s: string; t: string; ref?: string }[]>(`cain.dialogue.${id}`);
    if (!Array.isArray(raw)) console.warn(`[dialogue] missing: ${id}`);
    return this.lines((Array.isArray(raw) ? raw : []).map((l, i) => this.line(l.s, interpolate(l.t, params), l.ref, `cain.${id}.${i}`)));
  }

  private line(speaker: string, text: string, ref?: string, voice?: string): Line {
    const portrait = PORTRAITS[speaker];
    return { speaker, text, ref, voice, portrait: portrait && MANIFEST.portraits[portrait] ? portrait : undefined };
  }

  scripture(id: string): Promise<void> {
    return this.lines([{ speaker: 'narrator', text: t(`cain.scripture.${id}.text`), ref: t(`cain.scripture.${id}.ref`), scripture: true, voice: `cain.scripture.${id}` }]);
  }

  async lines(lines: Line[]): Promise<void> {
    const [first] = lines;
    // the narrator does not hold the player and cannot be skipped (the maintainer:
    // one can walk while it is told); in a cutscene, only a voiced line goes on by itself
    const voiced = !!first?.voice && voices.has(first.voice, first.text);
    if (lines.length && lines.every((l) => l.speaker === 'narrator') && (this.control || (lines.length === 1 && voiced))) {
      for (const l of lines) await ui().dialogue.narrate(l);
      return;
    }
    this.player().stop();
    this.facePartners(lines);
    this.talk.partner = Conversation.partnerOf(lines.map((l) => l.speaker), this.player(), (id) => this.talkerOf(id));
    try {
      await ui().dialogue.show(lines);
    } finally {
      this.talk.partner = null;
    }
  }

  private actorOf(speaker: string): Actor | null {
    return speaker === 'cain' ? this.cain : speaker === 'abel' ? this.abel : speaker === 'god' ? this.god : speaker === 'eve' ? this.eve : null;
  }

  private facePartners(lines: Line[]): void {
    const speakers = new Set(lines.map((l) => l.speaker));
    if (speakers.has('god') && this.god.visible) {
      for (const a of [this.cain, this.abel]) if (a.visible && !a.scripted && Phaser.Math.Distance.Between(a.x, a.y, this.god.x, this.god.y) < 300) a.face(this.god);
      return;
    }
    const actors = [...speakers].map((s) => this.actorOf(s)).filter((a): a is Actor => !!a && a.visible && a !== this.eve);
    if (actors.length >= 2) {
      actors[0].face(actors[1]);
      actors[1].face(actors[0]);
    }
  }

  // --------------------------------------------------------- objective, HUD

  objective(text: string, target: ObjectiveTarget = null, o: ObjectiveOptions = {}): void {
    ui().hud.setObjective(text);
    this.objectiveTarget = target;
    this.objectiveAll = !!o.markAll;
  }

  toast(text: string, big = false): void {
    ui().hud.toast(text, big);
  }

  // ------------------------------------------------------------- interacts

  interact(spec: InteractSpec): () => void {
    this.interactions.push(spec);
    return () => {
      this.interactions = this.interactions.filter((s) => s !== spec);
    };
  }

  clearInteractions(): void {
    this.interactions = this.interactions.filter((s) => s.id.startsWith('npc:'));
  }

  /** Adam and Eve can be talked to (a line at random, fitting the story so far). */
  private npcTalk(): void {
    const talk = (who: 'adam' | 'eve', at: Pt) =>
      this.interactions.push({
        id: `npc:${who}`,
        at,
        radius: 76,
        prompt: () => t('prompt.talk', { name: t(CHARACTERS[who].nameKey) }),
        enabled: () => this.npcsTalk,
        onUse: async () => {
          const phase = this.flags.offered ? 'after' : 'before';
          const pool = tRaw<string[]>(`cain.npc.${who}.${phase}`);
          const list = Array.isArray(pool) ? pool : [];
          const last = this.flags[`npc:${who}`] as number | undefined;
          let i = Math.floor(Math.random() * list.length);
          if (list.length > 1 && i === last) i = (i + 1) % list.length;
          this.flags[`npc:${who}`] = i;
          if (who === 'eve') this.eve.face(this.player());
          await this.lines([this.line(who, list[i] ?? '…', undefined, `cain.npc.${who}.${phase}.${i}`)]);
          if (who === 'eve') this.eve.face('left');
        },
      });
    talk('adam', [POINTS.adamLog[0], POINTS.adamLog[1] - 30]);
    talk('eve', [POINTS.eve[0], POINTS.eve[1] - 30]);
  }

  npcs(on: boolean): void {
    this.npcsTalk = on;
  }

  private canAct(): boolean {
    return this.control && !this.busy && !ui().dialogue.narrating;
  }

  private canMove(): boolean {
    return this.control && (!this.busy || ui().dialogue.narrating);
  }

  /**
   * The player may walk (the maintainer, 2026-11-10): in every dialogue and
   * narration too, cutscenes included, at a slow walk (`talking`), but not
   * in a cinematic (`held`: the eating of the fruit, Adam asleep, the end of
   * Eden; the creation has its own screen), nor in a cutscene between its
   * lines, nor while doing something (digging…) until it is talked about.
   */
  private mayWalk(): boolean {
    if (this.held) return false;
    return this.talking() || (this.control && !this.busy);
  }

  /** a dialogue or a narration is showing: walking slowly, never running */
  private talking(): boolean {
    const d = ui().dialogue;
    return d.open || d.narrating;
  }

  /** The actor of a speaker's id, if they are in the scene. */
  private castOf(id: string): Actor | null {
    return id === 'cain' ? this.cain : id === 'abel' ? this.abel : id === 'eve' ? this.eve : id === 'god' ? this.god : null;
  }

  /** Who the player can talk with: the actors, and Adam sitting on his log. */
  private talkerOf(id: string): Talker | null {
    if (id !== 'adam') return this.castOf(id);
    const s = this.adamSitting;
    return { id, x: s.x, y: s.y, visible: s.visible };
  }

  private async useInteract(spec: InteractSpec): Promise<void> {
    this.busy = true;
    this.player().stop();
    const at = typeof spec.at === 'function' ? spec.at() : spec.at;
    this.player().face({ x: at[0], y: at[1] });
    ui().hud.setPrompt(null);
    this.currentInteract = null;
    try {
      await spec.onUse();
    } finally {
      this.busy = false;
    }
  }

  waitZone(zone: string, who: Actor | 'player' = 'player'): Promise<void> {
    const z = ZONES[zone];
    return this.until(() => {
      const a = who === 'player' ? this.player() : who;
      return Math.hypot(a.x - z.x, a.y - z.y) < z.r;
    });
  }

  until(cond: () => boolean): Promise<void> {
    return new Promise((resolve) => {
      if (cond()) return resolve();
      const ev = this.time.addEvent({
        delay: 100,
        loop: true,
        callback: () => {
          if (cond()) {
            ev.remove();
            resolve();
          }
        },
      });
    });
  }

  wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, () => resolve()));
  }

  // ---------------------------------------------------------------- staging

  cutscene(on: boolean, hold = false): void {
    this.control = !on;
    this.held = on && hold;
    if (on) {
      this.cain.stop();
      this.abel.stop();
      ui().hud.setPrompt(null);
    }
  }

  show(actor: Actor, at: Pt, facing: Facing = 'down'): void {
    actor.setPosition(at[0], at[1]);
    actor.sprite.setAngle(0);
    actor.setVisible(true);
    actor.face(facing);
  }

  hide(actor: Actor): void {
    actor.setVisible(false);
    if (actor === this.god) this.godLight(false);
  }

  async walk(actor: Actor, to: Pt | Pt[], speed?: number): Promise<void> {
    const pts: Pt[] = Array.isArray(to[0]) ? (to as Pt[]) : [to as Pt];
    await actor.walkPath(pts, speed ?? (actor === this.god ? 90 : 150));
  }

  cameraTo(at: Pt | Actor, ms = 900): Promise<void> {
    const cam = this.cameras.main;
    cam.stopFollow();
    const x = Array.isArray(at) ? at[0] : at.x;
    const y = Array.isArray(at) ? at[1] : at.y - 40;
    return new Promise((resolve) => {
      cam.pan(x, y, settings.get().reduceMotion ? 1 : ms, 'Sine.easeInOut', false, (_c, p) => {
        if (p === 1) resolve();
      });
    });
  }

  cameraFollow(actor?: Actor): void {
    const cam = this.cameras.main;
    const { scrollX, scrollY } = cam;
    const lerp = actor ? 0.05 : 0.12;
    cam.startFollow((actor ?? this.player()).sprite, false, lerp, lerp, 0, 40);
    cam.setScroll(scrollX, scrollY);
  }

  cameraSnap(): void {
    const p = this.player();
    const cam = this.cameras.main;
    cam.startFollow(p.sprite, false, 0.12, 0.12, 0, 40);
    cam.centerOn(p.x, p.y - 40);
  }

  fade(to: number, ms = 700, color = '#000'): Promise<void> {
    return ui().hud.fade(to, ms, color);
  }

  music(mood: Mood): void {
    audio.setMood(mood);
  }

  sfx(name: string): void {
    audio.play(name as never);
  }

  fx(name: 'sparkle' | 'holy' | 'mist', at: Pt): void {
    const [x, y] = at;
    const rm = settings.get().reduceMotion;
    if (name === 'sparkle') {
      for (let i = 0; i < (rm ? 2 : 6); i++) {
        const s = this.add.sprite(x + (Math.random() - 0.5) * 40, y - Math.random() * 50, 'fx-sparkle').setDepth(DEPTH_OVERLAY - 30);
        s.play('fx-sparkle:once');
        s.once('animationcomplete', () => s.destroy());
      }
    } else if (name === 'mist') {
      for (let i = 0; i < 6; i++) {
        const m = this.add.image(x + (Math.random() - 0.5) * 50, y - Math.random() * 20, 'fx-mist').setDepth(y + 2).setAlpha(0).setScale(0.5);
        this.tweens.add({ targets: m, alpha: 0.7, y: m.y - 24, scale: 0.8, duration: 900, yoyo: true, hold: 200, onComplete: () => m.destroy() });
      }
    } else {
      const g = this.add.image(x, y - 46, 'fx-holy-burst').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH_OVERLAY - 40).setAlpha(0).setScale(0.3);
      this.tweens.add({ targets: g, scale: 0.72, angle: 18, duration: 2400, ease: 'Sine.easeOut' });
      this.tweens.add({ targets: g, alpha: 0.9, duration: 520, ease: 'Sine.easeOut', hold: 650, yoyo: true, onComplete: () => g.destroy() });
    }
  }

  godLight(on: boolean, beam = false): void {
    this.godLit = on;
    this.holy.set(on, beam);
  }

  appear(actor: Actor, at: Pt, facing: Facing = 'down', opts: { ms?: number; beam?: boolean } = {}): Promise<void> {
    const ms = opts.ms ?? 1100;
    this.show(actor, at, facing);
    const parts = [actor.sprite, actor.shadow].filter((o): o is NonNullable<typeof o> => !!o);
    if (actor === this.god) {
      this.godLight(true, opts.beam);
      this.holy.fadeIn(ms);
    }
    return new Promise((resolve) => {
      parts.forEach((o) => {
        const to = o.alpha;
        this.tweens.killTweensOf(o);
        o.setAlpha(0);
        this.tweens.add({ targets: o, alpha: to, duration: ms });
      });
      this.time.delayedCall(ms, resolve);
    });
  }

  vanish(actor: Actor, ms = 1100): Promise<void> {
    return new Promise((resolve) => {
      if (!actor.visible) return resolve();
      const parts = [actor.sprite, actor.shadow].filter((o): o is NonNullable<typeof o> => !!o);
      const from = parts.map((o) => o.alpha);
      if (actor === this.god) void this.holy.fadeOut(ms);
      this.tweens.add({
        targets: parts,
        alpha: 0,
        duration: ms,
        onComplete: () => {
          this.hide(actor);
          parts.forEach((o, i) => o.setAlpha(from[i]));
          resolve();
        },
      });
    });
  }

  // ------------------------------------------------------ inventory & flags

  give(item: string, n = 1): void {
    this.inventory[item] = (this.inventory[item] ?? 0) + n;
    this.refreshInventory();
  }

  take(item: string, n = 1): void {
    this.inventory[item] = Math.max(0, (this.inventory[item] ?? 0) - n);
    if (!this.inventory[item]) delete this.inventory[item];
    this.refreshInventory();
  }

  count(item: string): number {
    return this.inventory[item] ?? 0;
  }

  flag(name: string, value?: FlagValue): FlagValue | undefined {
    if (value !== undefined) this.flags[name] = value;
    return this.flags[name];
  }

  getState(): { flags: Record<string, FlagValue>; inventory: Record<string, number>; activeCharacter: string } {
    const flags = Object.fromEntries(Object.entries(this.flags).filter(([k]) => !k.startsWith('npc:')));
    return { flags, inventory: { ...this.inventory }, activeCharacter: this.active };
  }

  setState(flags: Record<string, FlagValue>, inventory: Record<string, number>): void {
    this.flags = { ...flags };
    this.inventory = { ...inventory };
    this.refreshInventory();
  }

  private refreshInventory(): void {
    ui().hud.setInventory(
      Object.entries(this.inventory)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => ({ icon: ITEM_ICONS[k] ?? 'cain-basket', label: t(`cain.items.${k}`), count: n > 1 ? n : undefined })),
    );
  }

  // --------------------------------------------------- the chapter's pieces

  /** The produce of the field: picked or growing (for staging and gathering). */
  setPicked(i: number, picked: boolean): void {
    this.world.setPicked(i, picked);
  }

  /** What lies on the altars: Cain's basket of produce, Abel's fat, the fire. */
  setAltars(state: { cain: boolean; abel: boolean; fire?: 'none' | 'burning' | 'embers' }): void {
    for (const o of this.altarThings) o.destroy();
    this.altarThings = [];
    this.smoke?.remove();
    this.smoke = null;
    this.altarFire = null;
    const top = this.world.altarTop;
    if (state.cain) this.altarThings.push(sized(this.add.image(top.cain[0], top.cain[1] + 2, 'cain-basket').setOrigin(0.5, 1).setDepth(POINTS.altarCain[1] + 1)));
    // the fat laid in the middle of the altar's top, big enough to see; the fire burns on it
    if (state.abel && state.fire !== 'embers') {
      for (const [dx, dy] of [[-10, -3], [10, -2], [0, 1]]) this.altarThings.push(this.add.image(top.abel[0] + dx, top.abel[1] + dy, 'cain-fat').setOrigin(0.5, 1).setScale(ART * 1.3).setDepth(POINTS.altarAbel[1] + 1));
    }
    if (state.fire === 'burning' || state.fire === 'embers') {
      const big = state.fire === 'burning';
      const key = big ? 'cain-fire-big' : 'cain-fire';
      const a = MANIFEST.sprites[key];
      // standing on the altar's top (from its front edge it looked cut off)
      const f = this.add.sprite(top.abel[0], top.abel[1] - (big ? 2 : 4), key).setOrigin(a.anchorX / a.frameWidth, 1).setScale(ART * (big ? 1 : 0.7)).setDepth(POINTS.altarAbel[1] + 2);
      f.play(`${key}:loop`);
      this.altarFire = f;
      this.altarThings.push(f);
      // the smoke going up from Abel's offering
      this.smoke = this.time.addEvent({ delay: big ? 260 : 700, loop: true, callback: () => this.puff(top.abel[0], top.abel[1] - (big ? 40 : 16), big ? 0.6 : 0.35) });
    }
  }

  /** The fire coming on Abel's offering (Genesis 4:4): it flares up. */
  kindleAltar(): void {
    this.setAltars({ cain: true, abel: true, fire: 'burning' });
    const f = this.altarFire;
    if (!f) return;
    const s = f.scaleX;
    f.setScale(s * 0.2);
    this.tweens.add({ targets: f, scale: s, duration: 900, ease: 'Back.easeOut' });
    this.fx('holy', [this.world.altarTop.abel[0], this.world.altarTop.abel[1] + 40]);
  }

  private puff(x: number, y: number, alpha: number): void {
    if (settings.get().reduceMotion && Math.random() < 0.6) return;
    const m = this.add.image(x + (Math.random() - 0.5) * 10, y, 'fx-mist').setDepth(DEPTH_OVERLAY - 160).setAlpha(alpha).setScale(0.35);
    this.tweens.add({ targets: m, y: y - 150 - Math.random() * 60, x: m.x + 30 + Math.random() * 40, scale: 1.2, alpha: 0, duration: 3200, onComplete: () => m.destroy() });
  }

  private steamRising(): void {
    const [fx, fy] = POINTS.fire;
    this.time.addEvent({ delay: 900, loop: true, callback: () => this.puff(fx + 2, fy - 22, 0.28) });
  }

  showJawbone(on: boolean): void {
    this.world.jawbone.setVisible(on);
  }

  /**
   * The people and animals keep their own colours (the maintainer), only
   * dimmed and cooled a little by the night; near a torch its added light
   * warms them again. God's light is His own.
   */
  private nightLight(): void {
    const actors = [this.cain, this.abel, this.eve, this.dog, ...this.sheep.map((g) => g.actor), ...this.lambs.map((g) => g.actor)];
    for (const a of actors) a.sprite.setTint(NIGHT_TINT);
    this.adamSitting.setTint(NIGHT_TINT);
  }

  /** The flock: the ewes graze, the lambs keep close to them. */
  private flock(): void {
    const grazer = (id: string, sheet: string, at: Pt, range: number, speed: number, stridePace: number) => {
      const actor = new Actor(this, { id, x: at[0], y: at[1], sheet, body: { w: 22, h: 10 }, facing: Math.random() < 0.5 ? 'left' : 'right', stridePace });
      return { actor, home: at, range, speed, target: null, wait: Math.random() * 3, frozen: false, fright: 0, vx: 0, vy: 0, penned: false, stuck: 0, side: 0, was: [at[0], at[1]] as Pt };
    };
    SHEEP.forEach((p, i) => this.sheep.push(grazer(`sheep${i}`, 'animal-sheep', p, 45, GRAZE_SPEED + 6, SHEEP_STRIDE)));
    LAMBS.forEach((p, i) => this.lambs.push(grazer(`lamb${i}`, 'cain-lamb', p, 35, GRAZE_SPEED + 12, LAMB_STRIDE)));
    const [dx, dy] = POINTS.dogRest;
    this.dog = new Actor(this, { id: 'dog', x: dx, y: dy, sheet: 'cain-dog', body: { w: 20, h: 9 }, facing: 'left' });
  }

  /**
   * The flock in its meadow, scattered but together (before mission 2 is
   * done), or in the fold (after). The dog waits by the fold's gate.
   */
  penFlock(inside: boolean): void {
    [...this.sheep, ...this.lambs].forEach((g, i) => {
      const start = i < SHEEP.length ? SHEEP[i] : LAMBS[i - SHEEP.length];
      g.penned = inside;
      g.home = inside ? PENNED[i % PENNED.length] : start;
      g.range = inside ? 40 : i < SHEEP.length ? 45 : 35;
      g.target = null;
      g.vx = g.vy = 0;
      g.actor.stop();
      if (!g.frozen) g.actor.setPosition(g.home[0], g.home[1]);
    });
    this.herd = null;
    this.dog.stop();
    this.dog.setPosition(POINTS.dogRest[0], POINTS.dogRest[1]);
    this.dog.face('left');
  }

  /** Where the flock is (the middle of those still out of the fold). */
  flockCentre(): Pt {
    const out = [...this.sheep, ...this.lambs].filter((g) => g.actor.visible && !g.penned);
    if (!out.length) return [FOLD.x, FOLD.y];
    return [out.reduce((a, g) => a + g.actor.x, 0) / out.length, out.reduce((a, g) => a + g.actor.y, 0) / out.length];
  }

  /** How many of the flock are in the fold, out of how many. */
  pennedCount(): { n: number; total: number } {
    const all = [...this.sheep, ...this.lambs].filter((g) => g.actor.visible);
    return { n: all.filter((g) => g.penned).length, total: all.length };
  }

  /**
   * Abel and his dog bring the flock into the fold (the maintainer). Ends
   * when every sheep and lamb is in; `progress` is told each time one goes in.
   */
  herdIntoFold(progress: () => void): Promise<void> {
    return new Promise((resolve) => {
      const a = this.abel;
      this.herd = {
        done: () => {
          this.herd = null;
          resolve();
        },
        dir: [0, -1],
        last: [a.x, a.y],
      };
      this.herdProgress = progress;
      // they stop where they graze; calm, only one now and then takes a step
      for (const g of [...this.sheep, ...this.lambs]) {
        g.target = null;
        g.wait = 2 + Math.random() * 10;
        g.fright = 0;
      }
    });
  }
  private herdProgress: () => void = () => {};
  /** the player runs the dog instead of Abel (herding, mission 2) */
  private driving = false;
  /** when the dog may bark again (scene time, ms) */
  private barkAt = 0;
  /** when the player last made the dog bark (scene time, ms) */
  private barkedAt = -Infinity;
  /** whether the HUD shows "Bark" (while the player runs the dog) */
  private barkPrompt = false;

  /** The player runs the dog (on) or Abel again (off); the camera goes with it. */
  driveDog(on: boolean): void {
    this.driving = on;
    this.abel.stop();
    this.dog.stop();
    this.cameraFollow(on ? this.dog : undefined);
  }

  /** Who the keys move: the active brother, or the dog. */
  private controlled(): Actor {
    return this.driving ? this.dog : this.player();
  }

  /** A lamb taken out of the flock (offered), or back (staging). */
  setLamb(i: number, present: boolean): void {
    const l = this.lambs[i];
    if (!l) return;
    l.frozen = !present;
    l.actor.stop();
    if (present) l.actor.setPosition(l.home[0], l.home[1]);
    l.actor.setVisible(present);
  }

  freezeLamb(i: number, on: boolean): void {
    const l = this.lambs[i];
    if (!l) return;
    l.frozen = on;
    l.actor.stop();
  }

  /** The lamb offered: a moment of stillness, then it is gone and its fat
   * lies there (Genesis 4:4). Abel cuts its throat with a flint knife; it bleeds, sinks down and fades. */
  async offerLamb(i: number): Promise<Pt> {
    const l = this.lambs[i];
    const at: Pt = [l.actor.x, l.actor.y];
    const lamb = l.actor;
    const p = this.player();
    this.freezeLamb(i, true);
    // the player on its left: it looks at him, and falls away from him
    const side = p.x < lamb.x ? 1 : -1;
    lamb.face(side > 0 ? 'left' : 'right');
    p.stop();
    p.face(lamb);
    // Abel draws his knife in his other hand; the staff stays in the first (the maintainer)
    p.holdOther('cain-knife', KNIFE_GRIP);
    await this.wait(320);
    audio.play('swing', { volume: 0.6 });
    await p.attack('stab');
    audio.play('cut');
    const marks: Phaser.GameObjects.GameObject[] = [];
    const cut = this.slash(lamb, side, marks);
    this.bleed(lamb, p, 9, marks);
    lamb.sprite.setTint(HURT_TINT);
    this.time.delayedCall(140, () => lamb.sprite.setTint(NIGHT_TINT));
    await this.wait(380);
    // its legs give way and its head drops; the blood pools under it
    cut.destroy();
    const sy = lamb.sprite.scaleY;
    this.tweens.add({ targets: lamb.sprite, scaleY: sy * 0.55, angle: -side * 9, duration: 360, ease: 'Quad.easeIn' });
    const pool = this.add.ellipse(lamb.x + side * 10, lamb.y, 6, 3, BLOOD_DARK).setDepth(DEPTH_SHADOW + 2).setAlpha(0.9);
    marks.push(pool);
    this.tweens.add({ targets: pool, scaleX: 3.5, scaleY: 3, delay: 300, duration: 1400, ease: 'Sine.easeOut' });
    await this.wait(1000);
    p.holdOther(null);
    const parts = [lamb.sprite, lamb.shadow].filter((o): o is NonNullable<typeof o> => !!o);
    await new Promise<void>((resolve) => this.tweens.add({ targets: parts, alpha: 0, duration: 700, onComplete: () => resolve() }));
    lamb.setVisible(false);
    lamb.sprite.setAngle(0).setScale(lamb.sprite.scaleX, sy);
    parts.forEach((o) => o.setAlpha(1));
    // the blood soaks into the ground after a while
    const left = marks.filter((m) => m.active);
    this.tweens.add({ targets: left, alpha: 0, delay: 5000, duration: 3000, onComplete: () => left.forEach((m) => m.destroy()) });
    return at;
  }

  /**
   * The cut of a blade (the maintainer): a quick red streak across the
   * neck, and the open cut left there (returned: it goes when the body falls).
   */
  private slash(a: Actor, side: number, into: Phaser.GameObjects.GameObject[]): Phaser.GameObjects.Ellipse {
    const h = a.y - a.topY();
    const x = a.x - side * a.sprite.displayWidth * 0.26;
    const y = a.topY() + h * 0.42;
    const g = this.add.graphics().setDepth(a.y + 3).setPosition(x, y);
    g.lineStyle(2.2, 0xe04a4a, 1).lineBetween(-side * 9, -7, side * 9, 7);
    g.lineStyle(1, 0xffc0b0, 0.9).lineBetween(-side * 7, -5, side * 7, 5);
    g.setScale(0.2, 1);
    this.tweens.add({ targets: g, scaleX: 1, duration: 90, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: g, alpha: 0, delay: 120, duration: 260, onComplete: () => g.destroy() });
    const cut = this.add.ellipse(x, y + 1, 7, 2.4, BLOOD).setAngle(side * 35).setDepth(a.y + 1);
    into.push(cut);
    return cut;
  }

  /** Abel's staff laid on the ground beside him while his hand carries the fat (the maintainer), or taken away again. */
  layStaff(on: boolean): void {
    this.laidStaff?.destroy();
    this.laidStaff = null;
    if (!on) return;
    const a = this.abel;
    const side = a.facing === 'left' ? 1 : -1;
    this.laidStaff = sized(this.add.image(a.x + side * 22, a.y + 4, 'cain-staff')).setOrigin(0.5, 0.5).setAngle(side * 84).setDepth(DEPTH_SHADOW + 3);
  }

  /** The fat of a lamb lying on the ground until it is taken. */
  dropFat(at: Pt): Phaser.GameObjects.Image {
    return this.add.image(at[0], at[1], 'cain-fat').setOrigin(0.5, 1).setScale(ART).setDepth(at[1]);
  }

  // -------------------------------------------------------------- the chase

  /**
   * In the field (Genesis 4:8). Abel runs for home, to his father and
   * mother; Cain, with the jawbone, must strike him five times before he
   * gets there (the maintainer). Each blow makes Abel stagger, then dash
   * ahead. If he reaches the house, everyone is put back and it begins
   * again. Tuned so it can be won at walking pace (touch has no run).
   */
  chase(): Promise<void> {
    return new Promise((resolve) => {
      const s: ChaseState = { hits: 0, leg: 0, mode: 'start', timer: 0.6, cooldown: 0, resolve, stuck: 0, starting: true };
      this.chaseState = s;
      this.npcs(false);
      this.abel.emote('exclaim');
      this.healthBar.setVisible(true);
      this.drawHealth();
      ui().hud.banner(t('cain.chase.banner'), 2200);
      this.interact({
        id: 'strike',
        at: () => [this.abel.x, this.abel.y - 20],
        radius: REACH,
        prompt: () => t('cain.prompts.strike'),
        enabled: () => !!this.chaseState && this.chaseState.cooldown <= 0 && this.chaseState.mode !== 'down' && this.chaseState.mode !== 'reset',
        onUse: () => this.strike(),
      });
    });
  }

  /** Cain swings the jawbone (the maintainer: a real blow); it lands as it comes down. */
  private async strike(): Promise<void> {
    const s = this.chaseState;
    if (!s || s.cooldown > 0) return;
    s.cooldown = STRIKE_COOLDOWN;
    const c = this.cain;
    const a = this.abel;
    c.stop();
    c.face(a);
    audio.play('swing');
    await c.attack('swing');
    if (this.chaseState !== s || s.mode === 'reset' || s.mode === 'down') return;
    audio.play('hit');
    // and Abel cries out (the maintainer); the last blow, his dying cry
    const last = s.hits + 1 >= HITS;
    this.time.delayedCall(60, () => audio.recording(last ? 'death' : 'hurt', { pitch: last ? 1 : 0.97 + Math.random() * 0.06 }));
    if (!settings.get().reduceMotion) this.cameras.main.shake(180, 0.007);
    s.hits++;
    this.drawHealth();
    // knocked a little away from Cain
    const dx = a.x - c.x;
    const dy = a.y - c.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    a.setPosition(a.x + (dx / d) * 14, a.y + (dy / d) * 14);
    // the blow shows in red, not a white flash
    a.sprite.setTint(HURT_TINT);
    this.time.delayedCall(140, () => a.sprite.setTint(NIGHT_TINT));
    this.bleed(a, c, 4 + s.hits * 2);
    this.wound();
    if (s.hits >= HITS) {
      s.mode = 'down';
      a.stop();
      this.fall();
      this.cutscene(true);
      this.healthBar.setVisible(false);
      this.chaseState = null;
      this.interactions = this.interactions.filter((i) => i.id !== 'strike');
      s.resolve();
      return;
    }
    s.mode = 'stagger';
    s.timer = STAGGER;
    a.stop();
  }

  /** Drops of blood flying from someone struck, away from the blow, staining the ground where they fall. */
  private bleed(a: Actor, by: Actor, n: number, into = this.blood): void {
    const away = Math.atan2(a.y - by.y, a.x - by.x);
    const h = a.y - a.topY();
    for (let i = 0; i < n; i++) {
      const ang = away + (Math.random() - 0.5) * 1.8;
      const dist = 8 + Math.random() * (18 + n * 2);
      const gx = a.x + Math.cos(ang) * dist;
      const gy = a.y + Math.sin(ang) * dist * 0.5 + (Math.random() - 0.5) * 6;
      const r = 1.3 + Math.random() * 1.6;
      const from = a.y - h * (0.45 + Math.random() * 0.2);
      const d = this.add.circle(a.x + (Math.random() - 0.5) * 8, from, r, BLOOD).setDepth(a.y + 2);
      const ms = 240 + Math.random() * 200;
      this.tweens.add({ targets: d, x: gx, duration: ms });
      this.tweens.add({
        targets: d,
        y: { from: from - 10 - Math.random() * 14, to: gy },
        ease: 'Quad.easeIn',
        duration: ms,
        onComplete: () => {
          d.destroy();
          this.stain(gx, gy, r * 1.3, into);
        },
      });
      into.push(d);
    }
  }

  /** A spot of blood on the ground. */
  private stain(x: number, y: number, r: number, into = this.blood): void {
    into.push(this.add.ellipse(x, y, r * 2.2, r * 1.3, BLOOD_DARK).setDepth(DEPTH_SHADOW + 1).setAlpha(0.85));
  }

  /** A new wound on Abel where the blow fell; the older ones spread. */
  private wound(): void {
    for (const w of this.wounds) w.o.setScale(w.o.scaleX * 1.25);
    const o = this.add.ellipse(0, 0, 5 + Math.random() * 3, 4 + Math.random() * 2, BLOOD).setAlpha(0.92);
    this.wounds.push({ o, fx: (Math.random() - 0.5) * 0.14, fy: 0.3 + Math.random() * 0.28 });
    this.placeWounds();
  }

  private placeWounds(): void {
    const a = this.abel;
    const h = a.y - a.topY();
    for (const w of this.wounds) w.o.setPosition(a.x + w.fx * h, a.topY() + w.fy * h).setDepth(a.sprite.depth + 0.5).setVisible(a.visible);
  }

  /** Abel falls (the fifth blow): the staff drops from his hand first, the blood pools under him. */
  private laidStaff: Phaser.GameObjects.Image | null = null;

  private fall(): void {
    const a = this.abel;
    a.hold(null);
    for (const w of this.wounds) w.o.destroy();
    this.wounds = [];
    const side = a.x >= this.cain.x ? 1 : -1;
    this.blood.push(sized(this.add.image(a.x - side * 20, a.y + 6, 'cain-staff')).setOrigin(0.5, 0.5).setAngle(-side * 80).setDepth(a.y - 1));
    this.tweens.add({ targets: a.sprite, angle: side * 86, duration: 420, ease: 'Quad.easeIn' });
    const pool = this.add.ellipse(a.x + side * 26, a.y, 8, 4, BLOOD_DARK).setDepth(DEPTH_SHADOW + 2).setAlpha(0.9);
    this.blood.push(pool);
    this.tweens.add({ targets: pool, scaleX: 5, scaleY: 4, delay: 400, duration: 1800, ease: 'Sine.easeOut' });
  }

  private clearBlood(): void {
    for (const o of [...this.blood, ...this.wounds.map((w) => w.o)]) o.destroy();
    this.blood = [];
    this.wounds = [];
    this.trailTimer = 0;
  }

  /** After the fall (in the dark): Abel gone, the blood gone, his grave in the field. */
  /** Heard over black after the murder (the maintainer): digging, dragging
   * the body, covering it with stones, one after the other. */
  async burialSounds(): Promise<void> {
    for (const id of ['dig', 'drag', 'stones']) {
      const d = audio.recording(id);
      if (d) await this.wait(Math.max(800, d * 1000 - 250));
    }
  }

  buryAbel(): void {
    this.abel.sprite.setAngle(0);
    this.hide(this.abel);
    this.clearBlood();
    this.showGrave(true);
  }

  showGrave(on: boolean): void {
    this.world.grave.setVisible(on);
  }

  private drawHealth(): void {
    const s = this.chaseState;
    const g = this.healthBar;
    g.clear();
    if (!s) return;
    const seg = 9;
    const gap = 2;
    const w = HITS * seg + (HITS - 1) * gap;
    g.fillStyle(0x000000, 0.75).fillRect(-w / 2 - 2, -2, w + 4, 8);
    for (let i = 0; i < HITS; i++) {
      const left = i < HITS - s.hits;
      g.fillStyle(left ? 0xe8f7a0 : 0x0a2038, 1).fillRect(-w / 2 + i * (seg + gap), 0, seg, 4);
    }
  }

  /** Abel back where the chase began, unhurt, and it begins again. */
  private async resetChase(s: ChaseState): Promise<void> {
    s.mode = 'reset';
    this.abel.stop();
    this.cutscene(true);
    await this.fade(1, 500);
    // why it begins again, told plainly and read at the player's pace (the maintainer)
    await this.lines([this.line('narrator', t('cain.chase.escaped'), undefined, 'cain.chase.escaped')]);
    this.cain.setPosition(POINTS.jawbone[0] + 20, POINTS.jawbone[1] - 30);
    this.cain.face('right');
    this.abel.setPosition(POINTS.jawbone[0] + 110, POINTS.jawbone[1] - 70);
    this.abel.face('left');
    s.hits = 0;
    s.leg = 0;
    s.cooldown = 0;
    this.clearBlood();
    this.drawHealth();
    this.cameraSnap();
    await this.wait(400);
    await this.fade(0, 500);
    this.cutscene(false);
    this.abel.emote('exclaim');
    ui().hud.banner(t('cain.chase.banner'), 2200);
    s.mode = 'start';
    s.timer = 0.6;
  }

  private updateChase(dt: number): void {
    const s = this.chaseState;
    if (!s) return;
    const a = this.abel;
    this.healthBar.setPosition(a.x, a.topY() - 10);
    this.placeWounds();
    s.cooldown -= dt;
    if (s.mode === 'reset' || s.mode === 'down') return;
    if (ui().dialogue.open) {
      a.stop();
      return;
    }
    s.timer -= dt;
    if (s.mode === 'start' || s.mode === 'stagger') {
      a.stop();
      if (s.mode === 'stagger') a.face(this.cain);
      if (s.timer <= 0) {
        s.mode = s.mode === 'stagger' ? 'dash' : 'flee';
        s.timer = DASH;
      }
      return;
    }
    if (s.mode === 'dash' && s.timer <= 0) s.mode = 'flee';
    // along the way home; past the last bend, straight to the house
    const way: Pt[] = [...ESCAPE, [SAFE.x, SAFE.y]];
    // skip the bends already behind him
    while (s.leg < way.length - 1 && Math.hypot(way[s.leg][0] - a.x, way[s.leg][1] - a.y) < 40) s.leg++;
    const [tx, ty] = way[s.leg];
    const dx = tx - a.x;
    const dy = ty - a.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const speed = s.mode === 'dash' ? DASH_SPEED - s.hits * DASH_SLOWER : FLEE_SPEED - s.hits * FLEE_SLOWER;
    a.move((dx / d) * speed, (dy / d) * speed);
    // the more he is hurt, the more often a drop falls behind him
    if (s.hits > 0) {
      this.trailTimer -= dt;
      if (this.trailTimer <= 0) {
        this.trailTimer = (TRAIL_EVERY / s.hits) * (0.6 + Math.random() * 0.8);
        this.stain(a.x + (Math.random() - 0.5) * 14, a.y - 2 + (Math.random() - 0.5) * 6, 1.6 + Math.random() * (1 + s.hits * 0.4));
      }
    }
    if (Math.hypot(a.x - SAFE.x, a.y - SAFE.y) < SAFE.r) void this.resetChase(s);
  }

  // ---------------------------------------------------------------- update

  update(time: number, delta: number): void {
    const dt = Math.min(0.1, delta / 1000);
    const p = this.controlled();
    const canMove = this.mayWalk() && !p.scripted && input.movementAllowed(this.layer);
    if (canMove) {
      const v = input.moveVector();
      this.keepInView(p, v);
      // talking, only a slow walk (the maintainer)
      const pace = this.talking() ? TALK_PACE : input.isDown('run') ? (this.driving ? 1.25 : RUN) : 1;
      const speed = (this.driving ? DOG_DRIVE_SPEED : CHARACTERS[this.active].speed) * pace;
      p.move(v.x * speed, v.y * speed);
      if (p.moving && !this.driving) {
        // in time with the feet coming down
        if (p.footDown()) {
          audio.step(this.world.surfaceAt(p.x, p.y), { pitch: 0.96 + Math.random() * 0.08, volume: 0.6 });
        }
      }
    } else if (!p.scripted) {
      p.stop();
    }
    this.updateFollower(dt);
    this.talk.update(p, (id) => (this.chaseState ? null : this.castOf(id)));
    this.updateChase(dt);
    this.updateFlock(dt);
    for (const a of [this.cain, this.abel, this.god, this.eve]) if (!a.scripted) a.refresh();
    const cam = this.cameras.main;
    this.atmosphere.update(delta, cam);
    this.world.updateCanopies(p.x, p.y, cam.worldView, delta);
    this.world.updateLights(time, cam.worldView, settings.get().reduceMotion);
    if (!settings.get().reduceMotion) this.world.updateWind(time, cam.worldView);
    if (this.godLit && this.god.visible) this.holy.update(time, this.god.x, this.god.y, this.god.sprite.displayHeight, this.god.moving);
    this.updateInteractPrompt();
    this.updateObjectiveIndicator(time);
  }

  private updateFlock(dt: number): void {
    const view = this.cameras.main.worldView;
    this.updateDog(dt, view);
    if (this.herd && this.canMove()) this.updateHerd(dt, view);
    for (const g of [...this.sheep, ...this.lambs]) {
      const a = g.actor;
      if (!a.visible) continue;
      if (this.herd && !g.penned && !g.frozen) {
        if (!this.canMove()) a.stop();
        continue;
      }
      if (g.frozen) {
        a.stop();
        a.refresh();
        continue;
      }
      g.wait -= dt;
      if (g.target) {
        const dx = g.target[0] - a.x;
        const dy = g.target[1] - a.y;
        const d = Math.hypot(dx, dy);
        if (d < 6 || g.wait < -6) {
          g.target = null;
          g.wait = 2 + Math.random() * 4;
          a.stop();
        } else a.move((dx / d) * g.speed, (dy / d) * g.speed);
      } else {
        a.stop();
        if (g.wait <= 0) {
          const ang = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * g.range;
          g.target = [g.home[0] + Math.cos(ang) * r, g.home[1] + Math.sin(ang) * r * 0.7];
          g.wait = 0;
        }
      }
      if (view.contains(a.x, a.y) || a.moving) a.refresh();
    }
  }

  /**
   * The dog: while herding, it runs to a point ahead of Abel the way he last
   * walked (so walking Abel round behind the flock sends the dog behind
   * it); otherwise it waits by the fold's gate.
   */
  private updateDog(dt: number, view: Phaser.Geom.Rectangle): void {
    const d = this.dog;
    // its trot goes with its speed
    d.sprite.anims.timeScale = d.moving ? Phaser.Math.Clamp(d.pace / 170, 0.6, 1.5) : 1;
    if (this.driving) {
      if (!this.canMove()) d.stop();
      d.refresh();
      return;
    }
    let to: Pt = POINTS.dogRest;
    if (this.herd && !this.canMove()) {
      d.stop();
      d.refresh();
      return;
    }
    if (this.herd) {
      const a = this.abel;
      const h = this.herd;
      const mx = a.x - h.last[0];
      const my = a.y - h.last[1];
      const m = Math.hypot(mx, my);
      if (m > 0.6) {
        // turn smoothly toward where Abel walks
        const k = Math.min(1, dt * 5);
        const nx = h.dir[0] + (mx / m - h.dir[0]) * k;
        const ny = h.dir[1] + (my / m - h.dir[1]) * k;
        const n = Math.hypot(nx, ny) || 1;
        h.dir = [nx / n, ny / n];
      }
      h.last = [a.x, a.y];
      to = [a.x + h.dir[0] * DOG_AHEAD, a.y + h.dir[1] * DOG_AHEAD * 0.8];
    }
    const dx = to[0] - d.x;
    const dy = to[1] - d.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 700) d.setPosition(to[0], to[1]);
    if (dist > 10) {
      let sp = Math.min(DOG_SPEED, 40 + dist * 3);
      // it presses on the flock rather than running through it
      if (this.herd) {
        for (const g of [...this.sheep, ...this.lambs]) {
          if (g.penned || !g.actor.visible) continue;
          const ex = g.actor.x - d.x;
          const ey = g.actor.y - d.y;
          const e = Math.hypot(ex, ey);
          if (e < 80 && (ex * dx + ey * dy) / (e * dist || 1) > 0.3) sp = Math.min(sp, 30 + e);
        }
      }
      d.move((dx / dist) * sp, (dy / dist) * sp);
    } else {
      d.stop();
      if (this.herd) d.face(this.flockCentre()[0] < d.x ? 'left' : 'right');
    }
    if (view.contains(d.x, d.y) || d.moving) d.refresh();
  }

  /** The player makes the dog bark (E): the sheep near it run from it. */
  private dogBark(): void {
    if (this.time.now < this.barkAt) return;
    audio.play('bark', { pitch: 0.95 + Math.random() * 0.1 });
    this.barkAt = this.time.now + 400;
    this.barkedAt = this.time.now;
  }

  /**
   * The flock while herded: each sheep shies away from the dog and Abel,
   * keeps to the others without crowding them, and near the gate is drawn
   * in (a kind nudge so it goes through rather than along the wall). In
   * the fold it stays: it grazes there again.
   */
  private updateHerd(dt: number, view: Phaser.Geom.Rectangle): void {
    const all = [...this.sheep, ...this.lambs].filter((g) => g.actor.visible && !g.frozen);
    const out = all.filter((g) => !g.penned);
    const [cx, cy] = this.flockCentre();
    const dog = this.dog;
    const abel = this.abel;
    const gateY = FOLD.y + FOLD.r * 0.75;
    const inner = FOLD.r - 30;
    for (const g of out) {
      const a = g.actor;
      let fx = 0;
      let fy = 0;
      let alarm = 0;
      const away = (ox: number, oy: number, r: number, k: number, scary = true) => {
        const ex = a.x - ox;
        const ey = a.y - oy;
        const d = Math.hypot(ex, ey) || 1;
        if (d >= r) return;
        const w = (1 - d / r) * k;
        fx += (ex / d) * w;
        fy += (ey / d) * w;
        if (scary) alarm = Math.max(alarm, 1 - d / r);
      };
      // the dog Abel sends ahead scares them; the dog the player runs only when it barks
      const scare = this.driving ? 1 - Phaser.Math.Clamp((this.time.now - this.barkedAt) / BARK_SCARE, 0, 1) : 1;
      if (scare > 0) away(dog.x, dog.y, this.driving ? BARK_REACH : DOG_FEAR, 2.4 * (0.4 + 0.6 * scare));
      away(abel.x, abel.y, ABEL_FEAR, 1.1);
      // fright fades over a second or two; frightened sheep near it frighten it a little
      g.fright = Math.max(alarm, g.fright - dt * 0.7);
      const fear = alarm;
      // go the way the sheep near it go (a flock moves as one)
      let ax = 0;
      let ay = 0;
      for (const o of out) {
        if (o === g) continue;
        const d = Math.hypot(o.actor.x - a.x, o.actor.y - a.y);
        if (d < 34) away(o.actor.x, o.actor.y, 34, 0.9, false);
        if (d < 130 && o.fright > 0.05) {
          ax += o.vx * o.fright;
          ay += o.vy * o.fright;
          g.fright = Math.max(g.fright, o.fright * 0.55);
        }
      }
      const al = Math.hypot(ax, ay);
      if (al > 1) {
        const k = Math.min(1, al / (HERD_SPEED * 3)) * 0.8;
        fx += (ax / al) * k;
        fy += (ay / al) * k;
      }
      // keep together, closer when afraid: toward the sheep around it (those
      // already in the fold too), or the nearest one when it is alone
      let lx = 0;
      let ly = 0;
      let ln = 0;
      let near: Grazer | null = null;
      let nearD = Infinity;
      for (const o of all) {
        if (o === g) continue;
        const d = Math.hypot(o.actor.x - a.x, o.actor.y - a.y);
        if (d < 260) {
          lx += o.actor.x;
          ly += o.actor.y;
          ln++;
        }
        if (d < nearD) {
          nearD = d;
          near = o;
        }
      }
      const [ox, oy] = ln ? [lx / ln, ly / ln] : near ? [near.actor.x, near.actor.y] : [cx, cy];
      const tx = ox - a.x;
      const ty = oy - a.y;
      const td = Math.hypot(tx, ty) || 1;
      const pull = Phaser.Math.Clamp((td - 45) / 200, 0, 1) * (0.6 + fear * 1.2);
      fx += (tx / td) * pull;
      fy += (ty / td) * pull;
      // near the gate, drawn in through it
      const gx = FOLD.x - a.x;
      const gy = gateY + 30 - a.y;
      const gd = Math.hypot(gx, gy);
      if (gd < 170 && g.fright > 0.05) {
        const into = Math.hypot(FOLD.x - a.x, FOLD.y - a.y) || 1;
        fx += ((FOLD.x - a.x) / into) * 0.9 * (1 - gd / 170);
        fy += ((FOLD.y - a.y) / into) * 0.9 * (1 - gd / 170);
      }
      // beside or behind the fold's wall: it goes round the wall toward the
      // gate instead of pressing against the stones
      const rx = a.x - FOLD.x;
      const ry = (a.y - FOLD.y) / 0.75;
      const rd = Math.hypot(rx, ry) || 1;
      if (rd < FOLD.r + 110 && rd > FOLD.r - 20 && g.fright > 0.05) {
        const th = Math.atan2(ry, rx);
        const dth = Phaser.Math.Angle.Wrap(FOLD.gate - th);
        if (Math.abs(dth) > 0.35) {
          const sg = Math.sign(dth);
          const near = 1 - Phaser.Math.Clamp((rd - FOLD.r) / 110, 0, 1);
          fx += (-Math.sin(th) * sg + (rx / rd) * 0.35) * 1.1 * near;
          fy += (Math.cos(th) * 0.75 * sg + (ry / rd) * 0.35) * 1.1 * near;
        }
      }
      // the map's edges push it back: it never gets so far out that the dog
      // cannot get round it (the maintainer had sheep stuck at the edge)
      const edges: [number, number, number][] = [
        [a.x - BOUNDS.left, 1, 0],
        [BOUNDS.right - a.x, -1, 0],
        [a.y - BOUNDS.top, 0, 1],
        [BOUNDS.bottom - a.y, 0, -1],
      ];
      for (const [d, ex, ey] of edges) {
        if (d >= EDGE_KEEP) continue;
        const w = (1 - Math.max(0, d) / EDGE_KEEP) * 3.2;
        fx += ex * w;
        fy += ey * w;
      }
      // pushed against something without getting anywhere: it sidesteps
      if (g.stuck > 0.35) {
        const f0 = Math.hypot(fx, fy) || 1;
        const c = Math.cos(1.2 * g.side);
        const sn = Math.sin(1.2 * g.side);
        const nx = (fx * c - fy * sn) / f0;
        const ny = (fx * sn + fy * c) / f0;
        fx = nx;
        fy = ny;
      }
      // a stray far from the others and out of sight walks back to them
      if (td > 420 && !view.contains(a.x, a.y)) fx += (tx / td) * 1.5;
      const speed = HERD_SPEED * (g.speed > GRAZE_SPEED + 8 ? 1.1 : 1);
      const f = Math.hypot(fx, fy);
      let wx = 0;
      let wy = 0;
      if (f > 0.05) {
        // frightened it runs; calm it only ambles back when it has strayed
        // from the others (the maintainer: calm sheep stay almost still)
        const calm = g.fright < 0.05;
        const sp = calm ? (td > 170 ? GRAZE_SPEED : 0) : Math.min(1, f) * speed * (0.45 + 0.55 * Math.min(1, g.fright * 1.5));
        wx = (fx / f) * sp;
        wy = (fy / f) * sp;
      }
      // calm, now and then one takes a few slow steps near where it stands
      if (g.fright < 0.05 && !wx && !wy) {
        g.wait -= dt;
        if (g.target) {
          const dx = g.target[0] - a.x;
          const dy = g.target[1] - a.y;
          const d = Math.hypot(dx, dy);
          if (d < 4 || g.wait < -4) {
            g.target = null;
            g.wait = 4 + Math.random() * 8;
          } else {
            wx = (dx / d) * GRAZE_SPEED * 0.7;
            wy = (dy / d) * GRAZE_SPEED * 0.7;
          }
        } else if (g.wait <= 0 && td < 160) {
          const ang = Math.random() * Math.PI * 2;
          g.target = [a.x + Math.cos(ang) * 22, a.y + Math.sin(ang) * 14];
          g.wait = 0;
        }
      } else g.target = null;
      // and close to an edge it does not step any further out
      for (const [d, ex, ey] of edges) {
        if (d >= EDGE_STOP) continue;
        if (ex && wx * ex < 0) wx = 0;
        if (ey && wy * ey < 0) wy = 0;
      }
      const k = Math.min(1, dt * (g.fright > 0.05 ? 6 : 2.5));
      g.vx += (wx - g.vx) * k;
      g.vy += (wy - g.vy) * k;
      if (Math.hypot(g.vx, g.vy) > 7) a.move(g.vx, g.vy);
      else a.stop();
      // how far it really got (the walls and trees stop it)
      const want = Math.hypot(g.vx, g.vy) * dt;
      const got = Math.hypot(a.x - g.was[0], a.y - g.was[1]);
      g.was = [a.x, a.y];
      if (want > 0.6 && got < want * 0.35) {
        if (g.stuck <= 0.35) g.side = Math.random() < 0.5 ? -1 : 1;
        g.stuck = Math.min(1.6, g.stuck + dt);
      } else if (g.stuck > 0) {
        g.stuck = g.stuck > 0.35 ? g.stuck - dt * 0.5 : 0;
      }
      if (g.stuck >= 1.6) {
        // that way did not work either: the other way
        g.side = -g.side;
        g.stuck = 0.5;
      }
      if (view.contains(a.x, a.y) || a.moving) a.refresh();
      // in the fold: it stays and grazes there
      if (((a.x - FOLD.x) / inner) ** 2 + ((a.y - FOLD.y) / (inner * 0.75)) ** 2 < 1 && a.y < gateY - 24) {
        g.penned = true;
        // it walks on in, clearing the gate for the next
        g.home = PENNED[[...this.sheep, ...this.lambs].indexOf(g) % PENNED.length];
        g.range = 40;
        g.target = g.home;
        g.wait = 0;
        g.vx = g.vy = 0;
        a.stop();
        audio.play('pickup');
        this.herdProgress();
      }
    }
    if (all.length && all.every((g) => g.penned)) this.herd?.done();
  }

  private followSpeed = 0;

  /** Walking during a cutscene that moved the camera away, it comes back to the player. */
  private keepInView(p: Actor, v: { x: number; y: number }): void {
    if (this.control || (!v.x && !v.y)) return;
    const cam = this.cameras.main as Phaser.Cameras.Scene2D.Camera & { _follow: unknown };
    if (cam._follow !== p.sprite && !cam.panEffect.isRunning) this.cameraFollow(p === this.player() ? undefined : p);
  }

  private updateFollower(dt: number): void {
    const leader = this.player();
    const f = this.other();
    if (!this.following || !f.visible || f.scripted || !this.canMove()) {
      if (!f.scripted && !this.chaseState) f.stop();
      return;
    }
    const dist = Math.hypot(leader.x - f.x, leader.y - f.y);
    if (dist > 520) {
      f.setPosition(leader.x - 30, leader.y + 12);
      return;
    }
    const side = f.x < leader.x ? -1 : 1;
    const tx = leader.x + side * 46;
    const ty = leader.y + 6;
    const dx = tx - f.x;
    const dy = ty - f.y;
    const gap = Math.hypot(dx, dy);
    // starts after the leader when he is a little away, stops once beside him
    if (dist > 64 || gap > (f.moving ? 16 : 30)) {
      // the speed eases from one to the next (jumping between them, Abel's legs flickered between walk and run)
      const want = Math.max(CHARACTERS[f.id].speed, leader.pace) * (dist > 160 ? 1.1 : gap < 60 ? 0.75 : 0.95);
      this.followSpeed += (want - this.followSpeed) * Math.min(1, dt * 4);
      const sp = Math.max(this.followSpeed, CHARACTERS[f.id].speed * 0.6);
      const before = { x: f.x, y: f.y };
      f.move((dx / gap) * sp, (dy / gap) * sp);
      this.followStuck = Math.hypot(f.x - before.x, f.y - before.y) < 0.2 ? this.followStuck + dt : 0;
    } else {
      f.stop();
      this.followSpeed = 0;
      if (!leader.moving) {
        const want: Facing = leader.facing === 'up' || leader.facing === 'down' ? leader.facing : leader.x < f.x ? 'left' : 'right';
        if (f.facing !== want) f.face(want);
      }
    }
  }

  private updateInteractPrompt(): void {
    const p = this.player();
    // running the dog: E barks
    const bark = this.driving && this.canMove() && !ui().dialogue.open;
    if (bark !== this.barkPrompt) {
      this.barkPrompt = bark;
      this.currentInteract = null;
      ui().hud.setPrompt(bark ? t('cain.prompts.bark') : null);
    }
    if (bark) return;
    if (!this.canAct() || ui().dialogue.open) {
      if (this.currentInteract) ui().hud.setPrompt(null);
      this.currentInteract = null;
      return;
    }
    let best: InteractSpec | null = null;
    let bestScore = Infinity;
    for (const s of this.interactions) {
      if (s.enabled && !s.enabled()) continue;
      const at = typeof s.at === 'function' ? s.at() : s.at;
      const d = Phaser.Math.Distance.Between(p.x, p.y - 20, at[0], at[1]);
      if (d > (s.radius ?? 70)) continue;
      const fx = p.facing === 'left' ? -1 : p.facing === 'right' ? 1 : 0;
      const fy = p.facing === 'up' ? -1 : p.facing === 'down' ? 1 : 0;
      const dot = ((at[0] - p.x) * fx + (at[1] - p.y + 20) * fy) / Math.max(1, d);
      const score = d - dot * 25;
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    if (best !== this.currentInteract) {
      this.currentInteract = best;
      ui().hud.setPrompt(best ? best.prompt() : null);
    }
  }

  private objectivePoints(): { at: Pt; mark: Pt }[] {
    const toPt = (v: Pt | Actor) => (Array.isArray(v) ? { at: v, mark: v } : { at: [v.x, v.y] as Pt, mark: [v.x, v.topY() - 4] as Pt });
    // walked away from a conversation: back to the one they were talking with
    const away = this.talk.away;
    if (away) return [away instanceof Actor ? toPt(away) : { at: [away.x, away.y], mark: [away.x, away.y - 90] }];
    const tg = this.objectiveTarget;
    if (!tg) return [];
    if (typeof tg === 'function') return tg().map(toPt);
    return [toPt(tg as Pt | Actor)];
  }

  private updateObjectiveIndicator(time: number): void {
    const pts = this.objectivePoints();
    const hud = ui().hud;
    if (!pts.length || (!this.canMove() && !this.talk.away)) {
      hud.setArrow(null);
      this.markers.hide(time);
      return;
    }
    const p = this.controlled();
    const dist = (q: Pt) => Phaser.Math.Distance.Between(p.x, p.y, q[0], q[1]);
    let best = pts[0];
    for (const q of pts) if (dist(q.at) < dist(best.at)) best = q;
    const cam = this.cameras.main;
    const view = cam.worldView;
    const dpr = pixelRatio();
    const margin = (30 * dpr) / cam.zoom;
    const inView = (q: Pt) => q[0] > view.x + margin && q[0] < view.right - margin && q[1] > view.y + margin && q[1] < view.bottom - margin;
    const marked = (this.objectiveAll ? pts : [best]).filter((q) => inView(q.mark) && dist(q.at) >= 90);
    this.markers.show(marked.map((q) => q.mark), time, cam.zoom, dpr, settings.get().reduceMotion);
    if (inView(best.mark)) {
      hud.setArrow(null);
      return;
    }
    const sw = this.scale.width / dpr;
    const sh = this.scale.height / dpr;
    const cx = sw / 2;
    const cy = sh / 2;
    const tx = ((best.mark[0] - view.x) * cam.zoom) / dpr;
    const ty = ((best.mark[1] - view.y) * cam.zoom) / dpr;
    const ang = Math.atan2(ty - cy, tx - cx);
    const kx = Math.cos(ang) > 0 ? (sw - 38 - cx) / Math.cos(ang) : (38 - cx) / Math.cos(ang);
    const ky = Math.sin(ang) > 0 ? (sh - 60 - cy) / Math.sin(ang) : (120 - cy) / Math.sin(ang);
    const k = Math.min(Math.abs(kx), Math.abs(ky));
    hud.setArrow(cx + Math.cos(ang) * k, cy + Math.sin(ang) * k, ang);
  }

  chapterComplete(): Promise<void> {
    ui().chapterComplete();
    return Promise.resolve();
  }
}

interface ChaseState {
  hits: number;
  /** the bend of the way home Abel runs to */
  leg: number;
  mode: 'start' | 'flee' | 'stagger' | 'dash' | 'down' | 'reset';
  timer: number;
  cooldown: number;
  stuck: number;
  starting: boolean;
  resolve: () => void;
}
