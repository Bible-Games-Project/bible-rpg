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
import { Actor, DEPTH_OVERLAY, type Facing } from '../world/Actor';
import { Atmosphere } from '../world/Atmosphere';
import { GodLight } from '../world/GodLight';
import { ObjectiveMarkers } from '../world/ObjectiveMarkers';
import type { InteractSpec, ObjectiveOptions, ObjectiveTarget } from '../WorldApi';
import { ART, buildCainArt, buildCainPortraits } from './art';
import { CainWorld } from './CainWorld';
import { CainRunner } from './missions';
import { NIGHT_BACKGROUND, NIGHT_SHADOW, NIGHT_TINT } from './palette';
import { setShadowLight } from '../world/shadows';

export interface CainStartData {
  mode: 'continue' | 'new';
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
const FLEE_SPEED = 132;
const FLEE_SLOWER = 7;
const STAGGER = 0.3;
const DASH = 0.65;
const DASH_SPEED = 215;

/**
 * Herding (mission 2, the maintainer): the dog runs ahead of Abel the way
 * he walks; the sheep shy away from it (and a little from Abel), keep
 * together and spread apart a little. How far ahead the dog runs, how far
 * the sheep feel it and Abel, and their speeds.
 */
const DOG_AHEAD = 95;
const DOG_SPEED = 230;
const DOG_FEAR = 175;
const ABEL_FEAR = 95;
const HERD_SPEED = 92;
const GRAZE_SPEED = 16;

const ITEM_ICONS: Record<string, string> = {
  produce: 'basket-full',
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
  /** herding: its current speed, and whether it is in the fold */
  vx: number;
  vy: number;
  penned: boolean;
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
  private stepTimer = 0;
  private followStuck = 0;
  private brotherColliders: Record<Brother, Phaser.Physics.Arcade.Collider[]> = { cain: [], abel: [] };
  /** things laid on the altars, the fire on Abel's */
  private altarThings: Phaser.GameObjects.GameObject[] = [];
  private altarFire: Phaser.GameObjects.Sprite | null = null;
  private smoke: Phaser.Time.TimerEvent | null = null;
  private npcsTalk = true;
  private chaseState: ChaseState | null = null;
  private healthBar!: Phaser.GameObjects.Graphics;

  constructor() {
    super('cain');
  }

  create(data: CainStartData): void {
    // Phaser keeps the scene object between games: everything left from the
    // last one goes (the old, destroyed lambs stayed first in the list and
    // stopped a new game on a black screen)
    this.sheep = [];
    this.lambs = [];
    this.herd = null;
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
    this.stepTimer = 0;
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
    this.cain = new Actor(this, { id: 'cain', x: POINTS.start[0], y: POINTS.start[1], charId: 'cain', outfit: 'tunic', body, facing: 'right' });
    this.abel = new Actor(this, { id: 'abel', x: POINTS.abelStart[0], y: POINTS.abelStart[1], charId: 'abel', outfit: 'tunic', body, facing: 'right' });
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
    if (lines.length === 1 && first.speaker === 'narrator' && first.voice && voices.has(first.voice, first.text)) return ui().dialogue.narrate(first);
    this.player().stop();
    this.facePartners(lines);
    await ui().dialogue.show(lines);
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
          await this.lines([this.line(who, list[i] ?? '…')]);
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

  cutscene(on: boolean): void {
    this.control = !on;
    if (on) {
      this.cain.stop();
      this.abel.stop();
      ui().hud.setPrompt(null);
    }
  }

  show(actor: Actor, at: Pt, facing: Facing = 'down'): void {
    actor.setPosition(at[0], at[1]);
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
        .map(([k, n]) => ({ icon: ITEM_ICONS[k] ?? 'basket-full', label: t(`cain.items.${k}`), count: n > 1 ? n : undefined })),
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
    if (state.cain) this.altarThings.push(sized(this.add.image(top.cain[0], top.cain[1] + 2, 'basket-full').setOrigin(0.5, 1).setDepth(POINTS.altarCain[1] + 1)));
    if (state.abel && state.fire !== 'burning' && state.fire !== 'embers') {
      for (const dx of [-12, 0, 12]) this.altarThings.push(this.add.image(top.abel[0] + dx, top.abel[1] + 4 - Math.abs(dx) / 4, 'cain-fat').setOrigin(0.5, 1).setScale(ART).setDepth(POINTS.altarAbel[1] + 1));
    }
    if (state.fire === 'burning' || state.fire === 'embers') {
      const big = state.fire === 'burning';
      const key = big ? 'cain-fire-big' : 'cain-fire';
      const a = MANIFEST.sprites[key];
      const f = this.add.sprite(top.abel[0], top.abel[1] + 6, key).setOrigin(a.anchorX / a.frameWidth, 1).setScale(ART * (big ? 1 : 0.7)).setDepth(POINTS.altarAbel[1] + 2);
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
    const grazer = (id: string, sheet: string, at: Pt, range: number, speed: number) => {
      const actor = new Actor(this, { id, x: at[0], y: at[1], sheet, body: { w: 22, h: 10 }, facing: Math.random() < 0.5 ? 'left' : 'right' });
      return { actor, home: at, range, speed, target: null, wait: Math.random() * 3, frozen: false, vx: 0, vy: 0, penned: false };
    };
    SHEEP.forEach((p, i) => this.sheep.push(grazer(`sheep${i}`, 'animal-sheep', p, 45, GRAZE_SPEED + 6)));
    LAMBS.forEach((p, i) => this.lambs.push(grazer(`lamb${i}`, 'cain-lamb', p, 35, GRAZE_SPEED + 12)));
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
    });
  }
  private herdProgress: () => void = () => {};

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
   * lies there (Genesis 4:4). Shown with restraint: a flash and a fade. */
  async offerLamb(i: number): Promise<Pt> {
    const l = this.lambs[i];
    const at: Pt = [l.actor.x, l.actor.y];
    this.freezeLamb(i, true);
    l.actor.face(this.player().x < l.actor.x ? 'left' : 'right');
    await this.wait(500);
    this.cameras.main.flash(260, 255, 255, 255);
    audio.play('drop');
    const parts = [l.actor.sprite, l.actor.shadow].filter((o): o is NonNullable<typeof o> => !!o);
    await new Promise<void>((resolve) => this.tweens.add({ targets: parts, alpha: 0, duration: 700, onComplete: () => resolve() }));
    l.actor.setVisible(false);
    parts.forEach((o) => o.setAlpha(1));
    this.fx('sparkle', at);
    return at;
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

  private strike(): void {
    const s = this.chaseState;
    if (!s || s.cooldown > 0) return;
    s.cooldown = STRIKE_COOLDOWN;
    const c = this.cain;
    const a = this.abel;
    c.face(a);
    audio.play('land');
    if (!settings.get().reduceMotion) this.cameras.main.shake(140, 0.004);
    s.hits++;
    this.drawHealth();
    // knocked a little away from Cain
    const dx = a.x - c.x;
    const dy = a.y - c.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    a.setPosition(a.x + (dx / d) * 14, a.y + (dy / d) * 14);
    a.sprite.setTintFill(0xffffff);
    this.time.delayedCall(110, () => a.sprite.clearTint());
    if (s.hits >= HITS) {
      s.mode = 'down';
      a.stop();
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
    ui().hud.toast(t('cain.chase.escaped'), false, 3600);
    this.cain.setPosition(POINTS.jawbone[0] + 20, POINTS.jawbone[1] - 30);
    this.cain.face('right');
    this.abel.setPosition(POINTS.jawbone[0] + 110, POINTS.jawbone[1] - 70);
    this.abel.face('left');
    s.hits = 0;
    s.leg = 0;
    s.cooldown = 0;
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
    const speed = s.mode === 'dash' ? DASH_SPEED : FLEE_SPEED - s.hits * FLEE_SLOWER;
    a.move((dx / d) * speed, (dy / d) * speed);
    if (Math.hypot(a.x - SAFE.x, a.y - SAFE.y) < SAFE.r) void this.resetChase(s);
  }

  // ---------------------------------------------------------------- update

  update(time: number, delta: number): void {
    const dt = Math.min(0.1, delta / 1000);
    const p = this.player();
    const canMove = this.canMove() && !p.scripted && input.movementAllowed(this.layer) && !ui().dialogue.open;
    if (canMove) {
      const v = input.moveVector();
      const speed = CHARACTERS[this.active].speed * (input.isDown('run') ? RUN : 1);
      p.move(v.x * speed, v.y * speed);
      if (p.moving) {
        this.stepTimer -= dt;
        if (this.stepTimer <= 0) {
          audio.step(this.world.surfaceAt(p.x, p.y), { pitch: 0.96 + Math.random() * 0.08, volume: 0.6 });
          this.stepTimer = 0.27 / (p.pace / CHARACTERS[this.active].speed);
        }
      }
    } else if (!p.scripted) {
      p.stop();
    }
    this.updateFollower(dt);
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
      const sp = Math.min(DOG_SPEED, 40 + dist * 3);
      d.move((dx / dist) * sp, (dy / dist) * sp);
    } else {
      d.stop();
      if (this.herd) d.face(this.flockCentre()[0] < d.x ? 'left' : 'right');
    }
    if (view.contains(d.x, d.y) || d.moving) d.refresh();
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
      const away = (ox: number, oy: number, r: number, k: number) => {
        const ex = a.x - ox;
        const ey = a.y - oy;
        const d = Math.hypot(ex, ey) || 1;
        if (d >= r) return;
        const w = (1 - d / r) * k;
        fx += (ex / d) * w;
        fy += (ey / d) * w;
        alarm = Math.max(alarm, 1 - d / r);
      };
      away(dog.x, dog.y, DOG_FEAR, 2.4);
      away(abel.x, abel.y, ABEL_FEAR, 1.1);
      for (const o of out) if (o !== g) away(o.actor.x, o.actor.y, 34, 0.9);
      // keep together
      const tx = cx - a.x;
      const ty = cy - a.y;
      const td = Math.hypot(tx, ty) || 1;
      const pull = Phaser.Math.Clamp((td - 50) / 220, 0, 1) * 0.7;
      fx += (tx / td) * pull;
      fy += (ty / td) * pull;
      // near the gate, drawn in through it
      const gx = FOLD.x - a.x;
      const gy = gateY + 30 - a.y;
      const gd = Math.hypot(gx, gy);
      if (gd < 170 && alarm > 0) {
        const into = Math.hypot(FOLD.x - a.x, FOLD.y - a.y) || 1;
        fx += ((FOLD.x - a.x) / into) * 0.9 * (1 - gd / 170);
        fy += ((FOLD.y - a.y) / into) * 0.9 * (1 - gd / 170);
      }
      // a stray far from the others and out of sight walks back to them
      if (td > 420 && !view.contains(a.x, a.y)) fx += (tx / td) * 1.5;
      const speed = HERD_SPEED * (g.speed > GRAZE_SPEED + 8 ? 1.1 : 1);
      const f = Math.hypot(fx, fy);
      let wx = 0;
      let wy = 0;
      if (f > 0.05) {
        const sp = Math.min(1, f) * (alarm > 0.02 ? speed : GRAZE_SPEED * 2);
        wx = (fx / f) * sp;
        wy = (fy / f) * sp;
      }
      const k = Math.min(1, dt * (alarm > 0 ? 6 : 2.5));
      g.vx += (wx - g.vx) * k;
      g.vy += (wy - g.vy) * k;
      if (Math.hypot(g.vx, g.vy) > 7) a.move(g.vx, g.vy);
      else a.stop();
      if (view.contains(a.x, a.y) || a.moving) a.refresh();
      // in the fold: it stays and grazes there
      if (((a.x - FOLD.x) / inner) ** 2 + ((a.y - FOLD.y) / (inner * 0.75)) ** 2 < 1 && a.y < gateY - 24) {
        g.penned = true;
        g.home = [a.x, Math.min(a.y, FOLD.y + 60)];
        g.range = 60;
        g.target = null;
        g.wait = 1 + Math.random() * 2;
        g.vx = g.vy = 0;
        a.stop();
        audio.play('pickup');
        this.herdProgress();
      }
    }
    if (all.length && all.every((g) => g.penned)) this.herd?.done();
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
    if (dist > 64 || gap > 30) {
      const sp = Math.max(CHARACTERS[f.id].speed, leader.pace) * (dist > 160 ? 1.1 : gap < 60 ? 0.6 : 0.95);
      const before = { x: f.x, y: f.y };
      f.move((dx / gap) * sp, (dy / gap) * sp);
      this.followStuck = Math.hypot(f.x - before.x, f.y - before.y) < 0.2 ? this.followStuck + dt : 0;
    } else {
      f.stop();
      if (!leader.moving) {
        const want: Facing = leader.facing === 'up' || leader.facing === 'down' ? leader.facing : leader.x < f.x ? 'left' : 'right';
        if (f.facing !== want) f.face(want);
      }
    }
  }

  private updateInteractPrompt(): void {
    const p = this.player();
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
    const tg = this.objectiveTarget;
    if (!tg) return [];
    const toPt = (v: Pt | Actor) => (Array.isArray(v) ? { at: v, mark: v } : { at: [v.x, v.y] as Pt, mark: [v.x, v.topY() - 4] as Pt });
    if (typeof tg === 'function') return tg().map(toPt);
    return [toPt(tg as Pt | Actor)];
  }

  private updateObjectiveIndicator(time: number): void {
    const pts = this.objectivePoints();
    const hud = ui().hud;
    if (!pts.length || !this.canMove()) {
      hud.setArrow(null);
      this.markers.hide(time);
      return;
    }
    const p = this.player();
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
