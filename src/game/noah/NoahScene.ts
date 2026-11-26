import Phaser from 'phaser';
import { audio, type Mood } from '../../core/audio';
import { input, KEY_LABELS, type InputLayer } from '../../core/input';
import { t, tRaw, interpolate } from '../../core/i18n';
import { settings } from '../../core/settings';
import { voices } from '../../core/voices';
import type { FlagValue } from '../../core/save';
import { CHARACTERS } from '../../data/characters';
import { ARK, ARK_DOOR, BOUNDS, CITY_HOUSES, FAMILY, PAIRS, POINTS, SINS, WORLD_H, WORLD_W, ZONES } from '../../data/noah/map';
import type { Pt } from '../../data/eden/map';
import type { Line } from '../../ui/DialogueBox';
import { ui } from '../bridge';
import { ART_RESOLUTION, pixelRatio } from '../display';
import { MANIFEST, textureScale } from '../manifest';
import { Actor, DEPTH_OVERLAY, PLAYER_WALK, type Facing } from '../world/Actor';
import { Atmosphere } from '../world/Atmosphere';
import { GodLight } from '../world/GodLight';
import { ObjectiveMarkers } from '../world/ObjectiveMarkers';
import { Conversation, type Talker } from '../world/talk';
import type { InteractSpec, ObjectiveOptions, ObjectiveTarget } from '../WorldApi';
import { setShadowLight } from '../world/shadows';
import { ART, TREES, buildNoahArt, loadNoahArt } from './art';
import { DAY_BACKGROUND, NAVY } from './colors';
import { NoahRunner } from './missions';
import { NoahWorld } from './NoahWorld';

export interface NoahStartData {
  mode: 'continue' | 'new' | 'restart';
}

const RUN = 1.6;
const VIEW_HEIGHT = 1000;
const VIEW_MIN_WIDTH = 640;
const MIN_ZOOM = 0.5;
const HAND_HEIGHT = 41;
/** the food carried in both arms, against the chest (the maintainer saw it hang at the knees) */
const ARMS_HEIGHT = 52;
const attackKey = (): string => (document.documentElement.classList.contains('touch-ui') ? '⚔' : KEY_LABELS.attack);

/** The spirit of God and the birds fly over everything. */
const SPIRIT_SPEED = 250;
const BIRD_SPEED = 215;
/** what stands above the flood's water, and the water itself */
const WATER_DEPTH = 800000;
const ABOVE_WATER = 850000;
const BIRD_DEPTH = 900000;
const RAIN_DEPTH = 950000;
const FOG_DEPTH = 960000;
/** a blow of the axe; how many fell a gopher tree */
const CHOPS = 3;
const SWING_COOLDOWN = 0.55;
/** the axe in the fist, by its handle */
const AXE_GRIP: [number, number] = [0.14, 0.6];
/** where the birds go out from the ark, and come back to it (the window above the deck) */
const ARK_WINDOW: Pt = [ARK.x - 40, ARK.y - 210];

const ITEM_ICONS: Record<string, string> = {
  axe: 'noah-axe',
  log: 'noah-log',
  sack: 'noah-sack',
  hay: 'noah-hay',
  olive: 'noah-olive',
  grapes: 'noah-grapes',
  wine: 'noah-wine',
};

/** Who speaks with which portrait. */
/** how far the spirit leans flying sideways (radians; the maintainer: 1.15 was too much) */
const SPIRIT_LEAN = 0.38;

const PORTRAITS: Record<string, string> = {
  god: 'god',
  noah: 'noah-noah',
  'noah-wife': 'noah-noah-wife',
  shem: 'noah-shem',
  ham: 'noah-ham',
  japheth: 'noah-japheth',
  'shem-wife': 'noah-shem-wife',
  'ham-wife': 'noah-ham-wife',
  'japheth-wife': 'noah-japheth-wife',
  wicked: 'noah-wicked',
  'wicked-b': 'noah-wicked-b',
  'wicked-c': 'noah-wicked-c',
  'wicked-woman': 'noah-wicked-woman',
  giant: 'noah-giant',
  thief: 'noah-thief',
  baker: 'noah-baker',
  debtor: 'noah-debtor',
  farmer: 'noah-farmer',
  mocker: 'noah-mocker',
};

export type FamilyId = 'noah-wife' | 'shem' | 'ham' | 'japheth' | 'shem-wife' | 'ham-wife' | 'japheth-wife';
export const FAMILY_IDS = Object.keys(FAMILY) as FamilyId[];

/** A number from 0 to 1 of its own for each one (who walks how). */
function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/** One who follows Noah to the ark (the family, the animals two by two). */
export interface Follower {
  actor: Actor;
  kind: 'family' | 'animal';
  /** a pair counts once: both of it in */
  pair?: number;
  /** help: gone for something (the food), back to following after */
  state: 'wait' | 'follow' | 'help' | 'in';
  /** flies (the doves) */
  flies?: boolean;
}

/** A bird's flight over the waters (missions 5–7). */
interface Flight {
  kind: 'raven' | 'dove' | 'olive';
  /** seconds of strength left, and in all */
  left: number;
  total: number;
  /** the dove is called back halfway (the first time) */
  called: boolean;
  carrying: boolean;
  resolve: (ok: boolean) => void;
}

/**
 * Genesis 6–9: the land before the flood, the ark, the waters and the earth
 * after them. Gives the missions (missions.ts) what they need: dialogue,
 * objectives, interactions, staging, and the chapter's own pieces (the
 * spirit of God over the earth, felling gopher wood, the seven days, the
 * flood, the birds, the altar, the bow in the cloud, the vineyard).
 */
export class NoahScene extends Phaser.Scene {
  world!: NoahWorld;
  noah!: Actor;
  god!: Actor;
  family: Record<FamilyId, Actor> = {} as Record<FamilyId, Actor>;
  /** the people of the earth: those the spirit sees (by sin), and the giant */
  sinners: Record<string, Actor[]> = {};
  mockers: Actor[] = [];
  raven!: Actor;
  dove!: Actor;
  followers: Follower[] = [];
  private ctrl!: Actor;
  private ctrlKind: 'human' | 'spirit' | 'bird' = 'human';
  private colliders = new Map<Actor, Phaser.Physics.Arcade.Collider>();
  private control = true;
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
  /** the spirit flies: no steps, leaning over to the side it flies (the maintainer) */
  private spiritOn = false;
  private spiritTilt = 0;
  private inventory: Record<string, number> = {};
  private flags: Record<string, FlagValue> = {};
  private layer!: InputLayer;
  private runner!: NoahRunner;
  /** what the people say when talked to: before the flood, in the seven days, after it */
  phase: 'before' | 'days' | 'after' | 'none' = 'before';
  private swingAt = 0;
  /** Noah's footsteps, for those who follow him */
  private trail: Pt[] = [];
  /** the flood: its water, the rain, the fog over the birds' sight */
  private water!: Phaser.GameObjects.TileSprite;
  private rain: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private storm: Phaser.Time.TimerEvent | null = null;
  /** the one of the people Noah is talking with (small talk) */
  private chatting: Actor | null = null;
  private fog!: Phaser.GameObjects.Image;
  private fogRadius = 0;
  private bar!: Phaser.GameObjects.Graphics;
  private flight: Flight | null = null;
  private island: Phaser.GameObjects.GameObject[] = [];
  private arkBob: Phaser.Tweens.Tween | null = null;
  private altarFire: Phaser.GameObjects.Sprite | null = null;
  private smoke: Phaser.Time.TimerEvent | null = null;
  private bow: Phaser.GameObjects.Graphics | null = null;
  /** the wind after the flood (Genesis 8:1): the trees bend harder */
  private wind = 1;
  /** Shem and Japheth go backward (Genesis 9:23): the player faces away from where they go */
  private backward = false;
  /** counts the times the followers were reset, so a boarding from before is dropped */
  private boarding = 0;
  /** one who walks beside the player (Japheth beside Shem) */
  private buddy: Actor | null = null;
  /** the seven days: those still waiting are called, not talked to */
  gathering = false;

  constructor() {
    super('noah');
  }

  preload(): void {
    loadNoahArt(this);
  }

  create(data: NoahStartData): void {
    this.family = {} as Record<FamilyId, Actor>;
    this.sinners = {};
    this.mockers = [];
    this.followers = [];
    this.colliders = new Map();
    this.ctrlKind = 'human';
    this.control = true;
    this.held = false;
    this.busy = false;
    this.interactions = [];
    this.currentInteract = null;
    this.objectiveTarget = null;
    this.objectiveAll = false;
    this.godLit = false;
    this.spiritOn = false;
    this.spiritTilt = 0;
    this.inventory = {};
    this.flags = {};
    this.phase = 'before';
    this.trail = [];
    this.rain = null;
    this.flight = null;
    this.island = [];
    this.arkBob = null;
    this.altarFire = null;
    this.smoke = null;
    this.bow = null;
    this.wind = 1;
    this.backward = false;
    this.buddy = null;
    this.gathering = false;
    input.setAttack(false);
    setShadowLight(false, 1);
    buildNoahArt(this);
    this.physics.world.setBounds(BOUNDS.left, BOUNDS.top, BOUNDS.right - BOUNDS.left, BOUNDS.bottom - BOUNDS.top);
    this.world = new NoahWorld(this);
    const body = { w: 22, h: 10 };
    const person = (id: string, charId: string, at: Pt, facing: Facing = 'down') => new Actor(this, { id, x: at[0], y: at[1], charId, outfit: 'robe', body, facing, handHeight: HAND_HEIGHT, armsHeight: ARMS_HEIGHT, solid: id !== 'noah' });
    this.noah = person('noah', 'noah', POINTS.noahStart, 'right');
    for (const id of FAMILY_IDS) this.family[id] = person(id, id, FAMILY[id]);
    this.god = new Actor(this, { id: 'god', x: POINTS.godHome[0], y: POINTS.godHome[1], charId: 'god', outfit: 'robe', body: { w: 26, h: 10 } });
    this.god.setVisible(false);
    // the people of the city: two in each of the sins the spirit sees
    const cast: Record<string, [string, string]> = { robbery: ['thief', 'baker'], violence: ['giant', 'debtor'], harass: ['wicked', 'wicked-woman'], lies: ['wicked-c', 'farmer'] };
    for (const s of SINS) {
      const [a, b] = cast[s.id];
      this.sinners[s.id] = [person(`${s.id}-a`, a, [s.at[0] - 40, s.at[1]], 'right'), person(`${s.id}-b`, b, [s.at[0] + 40, s.at[1]], 'left')];
    }
    // those who mock Noah building on dry land (inspired)
    this.mockers = [person('mock-a', 'wicked-b', [1830, 1330], 'up'), person('mock-b', 'mocker', [1890, 1350], 'up')];
    this.animals();
    this.raven = new Actor(this, { id: 'raven', x: ARK_WINDOW[0], y: ARK_WINDOW[1], sheet: 'noah-raven', body: { w: 16, h: 8 }, facing: 'left' });
    this.dove = new Actor(this, { id: 'dove', x: ARK_WINDOW[0], y: ARK_WINDOW[1], sheet: 'animal-dove', body: { w: 16, h: 8 }, facing: 'left' });
    for (const b of [this.raven, this.dove]) {
      b.depthBias = BIRD_DEPTH;
      b.setVisible(false);
    }
    for (const a of [this.noah, this.family.ham, this.family.shem, this.family.japheth]) {
      const c = this.physics.add.collider(a.feet, this.world.colliders);
      c.active = a === this.noah;
      this.colliders.set(a, c);
    }
    this.ctrl = this.noah;
    this.holy = new GodLight(this, settings.get().reduceMotion);
    this.markers = new ObjectiveMarkers(this);
    this.flood();
    this.atmosphere = new Atmosphere(this, settings.get().reduceMotion, { w: WORLD_W, h: WORLD_H });
    this.atmosphere.setTime('day');
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.setRoundPixels(false);
    cam.setBackgroundColor(DAY_BACKGROUND);
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
          if (this.canAct() && this.currentInteract && !this.currentInteract.attack) void this.useInteract(this.currentInteract);
          return true;
        }
        if (a === 'attack') {
          if (!this.canAct()) return true;
          if (this.currentInteract?.attack) void this.useInteract(this.currentInteract);
          else if (this.ctrl === this.noah && this.noah.holding()?.[0] === 'noah-axe') void this.swing();
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
    this.runner = new NoahRunner(this, data.mode);
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
    this.flight = null;
    this.storm = null;
    input.setAttack(false);
  }

  private applyZoom(): void {
    if (!this.cameras?.main) return;
    const z = this.viewZoom();
    for (const key of this.textures.getTextureKeys()) {
      const perPixel = z * textureScale(key);
      const smooth = key.startsWith('fx-') || key.endsWith('tiles-extruded') || key === 'noah-water' || key === 'noah-fog' || key === 'noah-glow';
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

  player(): Actor {
    return this.ctrl;
  }

  /** Who the player is: Noah, Ham or Shem walking; the spirit of God or a bird flying. */
  setPlayer(actor: Actor, name: string | null = null): void {
    this.ctrl.stop();
    this.ctrl = actor;
    this.ctrlKind = actor === this.god ? 'spirit' : actor === this.raven || actor === this.dove ? 'bird' : 'human';
    for (const [a, c] of this.colliders) c.active = a === actor;
    this.cameraFollow();
    const id = actor === this.god ? 'god' : actor.charId ?? actor.id;
    ui().hud.setCharacter(name ?? (CHARACTERS[id] ? t(CHARACTERS[id].nameKey) : ''), null);
  }

  /** Called by the HUD's switch button (there is no switching in this chapter). */
  switchCharacter(): void {}

  /** The spirit of God moving over the earth: light, half seen, flying (the maintainer). */
  spirit(on: boolean): void {
    const g = this.god;
    g.sprite.setBlendMode(on ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL).setAlpha(on ? 0.62 : 1);
    g.shadow?.setAlpha(on ? 0.25 : 1);
    g.lift = on ? 16 : 0;
    this.spiritOn = on;
    this.spiritTilt = 0;
    g.sprite.setRotation(0);
    g.depthBias = on ? 2000 : 0;
    g.body.setCollideWorldBounds(true);
    if (on) {
      this.show(g, POINTS.spiritStart, 'down');
      this.godLight(true);
      this.holy.fadeIn(800);
    } else {
      this.godLight(false);
    }
  }

  /**
   * The spirit does not walk: it keeps still (its idle frames) and lies over
   * on its side towards where it flies, turning round its middle.
   */
  private flySpirit(dt: number): void {
    const g = this.god;
    const sp = g.sprite;
    const tex = sp.texture.key;
    if (this.anims.exists(`${tex}:idle`) && sp.anims.currentAnim?.key !== `${tex}:idle`) sp.play(`${tex}:idle`, true);
    const v = g.body.velocity;
    const speed = Math.hypot(v.x, v.y);
    const target = g.moving && speed > 1 ? (v.x / speed) * SPIRIT_LEAN : 0;
    this.spiritTilt += (target - this.spiritTilt) * Math.min(1, dt * 6);
    const a = this.spiritTilt;
    const half = sp.displayHeight / 2;
    sp.setRotation(a);
    sp.setPosition(sp.x - half * Math.sin(a), sp.y - half + half * Math.cos(a));
  }

  // --------------------------------------------------------------- dialogue

  say(id: string, params?: Record<string, string | number>): Promise<void> {
    const raw = tRaw<{ s: string; t: string; ref?: string }[]>(`noah.dialogue.${id}`);
    if (!Array.isArray(raw)) console.warn(`[dialogue] missing: ${id}`);
    return this.lines((Array.isArray(raw) ? raw : []).map((l, i) => this.line(l.s, interpolate(l.t, params), l.ref, `noah.${id}.${i}`)));
  }

  private line(speaker: string, text: string, ref?: string, voice?: string): Line {
    const portrait = PORTRAITS[speaker];
    return { speaker, text, ref, voice, portrait: portrait && MANIFEST.portraits[portrait] ? portrait : undefined };
  }

  scripture(id: string): Promise<void> {
    return this.lines([{ speaker: 'narrator', text: t(`noah.scripture.${id}.text`), ref: t(`noah.scripture.${id}.ref`), scripture: true, voice: `noah.scripture.${id}` }]);
  }

  async lines(lines: Line[]): Promise<void> {
    const [first] = lines;
    const voiced = !!first?.voice && voices.has(first.voice, first.text);
    // a narration in a cutscene is about whoever stands nearest: the arrow
    // points there when the player walks off (the maintainer)
    const narration = lines.length > 0 && lines.every((l) => l.speaker === 'narrator');
    const spot = narration && !this.control ? this.nearestCast() : null;
    if (narration && (this.control || (lines.length === 1 && voiced))) {
      this.talk.spot = spot;
      try {
        for (const l of lines) await ui().dialogue.narrate(l);
      } finally {
        if (this.talk.spot === spot) this.talk.spot = null;
      }
      return;
    }
    this.talk.spot = spot;
    this.player().stop();
    this.talk.among = Conversation.amongOthers(lines.map((l) => l.speaker), this.player(), (id) => this.castOf(id));
    this.talk.partner = Conversation.partnerOf(
      lines.map((l) => l.speaker),
      this.player(),
      (id) => this.castOf(id),
    );
    try {
      await ui().dialogue.show(lines);
    } finally {
      this.talk.partner = null;
      this.talk.among = false;
      if (this.talk.spot === spot) this.talk.spot = null;
    }
  }

  /** The one of the story nearest the player (not the player), within 500 px. */
  private nearestCast(): Actor | null {
    const p = this.player();
    let best: Actor | null = null;
    let bd = 500;
    for (const a of [this.noah, this.god, ...Object.values(this.family)]) {
      if (a === p || !a.visible) continue;
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  /** The actor of a speaker's id, if in the scene. */
  private castOf(id: string): Actor | null {
    if (id === 'noah') return this.noah;
    if (id === 'god') return this.god.visible ? this.god : null;
    if (id in this.family) return this.family[id as FamilyId];
    // the people of the earth (small talk, the mockers): the one talked to first
    if (this.chatting?.charId === id && this.chatting.visible) return this.chatting;
    for (const a of [...this.mockers, ...Object.values(this.sinners).flat()]) if (a.charId === id && a.visible) return a;
    return null;
  }

  private talkerOf(id: string): Talker | null {
    return this.castOf(id);
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

  /**
   * The family and the people can be talked to: a line at random, fitting
   * the time (the maintainer: secondary dialogues with Noah's family and
   * the wicked that bear the story out).
   */
  private npcTalk(): void {
    const talk = (who: string, actor: Actor) =>
      this.interactions.push({
        id: `npc:${actor.id}`,
        at: () => [actor.x, actor.y - 30],
        radius: 76,
        prompt: () => t('prompt.talk', { name: t(CHARACTERS[who].nameKey) }),
        enabled: () => actor.visible && !actor.scripted && this.ctrl !== actor && this.ctrlKind === 'human' && Array.isArray(tRaw(`noah.npc.${who}.${this.phase}`)) && !this.followerOf(actor) && !this.followers.some((f) => f.actor === actor && f.state === 'help') && !(this.gathering && this.followers.some((f) => f.actor === actor && f.state === 'wait')),
        onUse: async () => {
          const pool = tRaw<string[]>(`noah.npc.${who}.${this.phase}`);
          const list = Array.isArray(pool) ? pool : [];
          const key = `npc:${actor.id}`;
          const last = this.flags[key] as number | undefined;
          let i = Math.floor(Math.random() * list.length);
          if (list.length > 1 && i === last) i = (i + 1) % list.length;
          this.flags[key] = i;
          const was = actor.facing;
          actor.face(this.player());
          this.chatting = actor;
          try {
            await this.lines([this.line(who, list[i] ?? '…', undefined, `noah.npc.${who}.${this.phase}.${i}`)]);
          } finally {
            this.chatting = null;
          }
          if (!actor.scripted && !this.followerOf(actor)) actor.face(was);
        },
      });
    for (const id of FAMILY_IDS) talk(id, this.family[id]);
    talk('noah', this.noah);
    talk('wicked-b', this.mockers[0]);
    talk('mocker', this.mockers[1]);
    for (const [a, b] of Object.values(this.sinners)) {
      talk(a.charId!, a);
      talk(b.charId!, b);
    }
  }

  private canAct(): boolean {
    return this.control && !this.busy && !ui().dialogue.narrating;
  }

  private canMove(): boolean {
    return this.control && (!this.busy || ui().dialogue.narrating);
  }

  private mayWalk(): boolean {
    if (this.held) return false;
    return this.talking() || (this.control && !this.busy);
  }

  private talking(): boolean {
    const d = ui().dialogue;
    return d.open || d.narrating;
  }

  private async useInteract(spec: InteractSpec): Promise<void> {
    this.busy = true;
    this.player().stop();
    const at = typeof spec.at === 'function' ? spec.at() : spec.at;
    if (this.ctrlKind === 'human' && !this.backward) this.player().face({ x: at[0], y: at[1] });
    ui().hud.setPrompt(null);
    this.currentInteract = null;
    try {
      await spec.onUse();
    } finally {
      this.busy = false;
    }
  }

  near(at: Pt, r: number, who: Actor = this.player()): boolean {
    return Math.hypot(who.x - at[0], who.y - at[1]) < r;
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
      this.ctrl.stop();
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
    await actor.walkPath(pts, speed ?? (actor === this.god ? 90 : 130));
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
    const a = actor ?? this.player();
    cam.startFollow(a.sprite, false, lerp, lerp, 0, a.lift > 4 ? 0 : 40);
    cam.setScroll(scrollX, scrollY);
  }

  cameraAt(at: Pt): void {
    const cam = this.cameras.main;
    cam.stopFollow();
    cam.centerOn(at[0], at[1]);
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

  fx(name: 'sparkle' | 'holy' | 'mist' | 'splash', at: Pt, depth?: number): void {
    const [x, y] = at;
    const rm = settings.get().reduceMotion;
    if (name === 'sparkle') {
      for (let i = 0; i < (rm ? 2 : 6); i++) {
        const s = this.add.sprite(x + (Math.random() - 0.5) * 40, y - Math.random() * 50, 'fx-sparkle').setDepth(depth ?? DEPTH_OVERLAY - 30);
        s.play('fx-sparkle:once');
        s.once('animationcomplete', () => s.destroy());
      }
    } else if (name === 'splash') {
      const s = this.add.sprite(x, y, 'fx-splash').setDepth(depth ?? BIRD_DEPTH + 10).setScale(1.4);
      s.play('fx-splash:once');
      s.once('animationcomplete', () => s.destroy());
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

  /**
   * Someone leaving the scene: they walk round the nearest house (or tree)
   * and on behind it, fading out on the last steps in case any of them still
   * shows (the maintainer: they vanished all at once, in the open).
   */
  async leave(actor: Actor, speed = 150): Promise<void> {
    const covers: { x: number; y: number; l: number; r: number }[] = [];
    if (this.world.cityStanding)
      for (const h of CITY_HOUSES) {
        const [l, r] = h.small ? [94, 106] : [124, 146];
        const k = ART * 0.9;
        covers.push({ x: h.at[0], y: h.at[1], l: (h.flip ? r : l) * k, r: (h.flip ? l : r) * k });
      }
    for (const t of this.world.trees) if (t.trunk.visible) covers.push({ x: t.x, y: t.y, l: 14, r: 14 });
    const near = covers.sort((a, b) => Phaser.Math.Distance.Between(actor.x, actor.y, a.x, a.y) - Phaser.Math.Distance.Between(actor.x, actor.y, b.x, b.y))[0];
    if (!near || Phaser.Math.Distance.Between(actor.x, actor.y, near.x, near.y) > 700) {
      await Promise.all([this.walk(actor, [actor.x - 160, actor.y - 60], speed), this.vanish(actor, (170 / speed) * 1000)]);
      return;
    }
    const left = actor.x < near.x;
    const side = left ? near.x - near.l - 16 : near.x + near.r + 16;
    // a house is drawn from above: behind it is well up its picture; a trunk hides little, the crown the rest
    const behind: Pt = [left ? near.x - near.l * 0.35 : near.x + near.r * 0.35, near.y - (near.l > 20 ? 46 : 12)];
    const path: Pt[] = [];
    if (actor.y > near.y - 20) path.push([side, near.y + 12], [side, behind[1]]);
    await this.walk(actor, path, speed);
    const last = Phaser.Math.Distance.Between(actor.x, actor.y, behind[0], behind[1]);
    await Promise.all([this.walk(actor, behind, speed * 0.8), this.vanish(actor, Math.max(400, (last / (speed * 0.8)) * 1000))]);
  }

  vanish(actor: Actor, ms = 1100): Promise<void> {
    return new Promise((resolve) => {
      if (!actor.visible) return resolve();
      const parts = [actor.sprite, actor.shadow, ...actor.carried].filter((o): o is NonNullable<typeof o> => !!o);
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
    return { flags, inventory: { ...this.inventory }, activeCharacter: 'noah' };
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
        .map(([k, n]) => ({ icon: ITEM_ICONS[k] ?? 'noah-sack', label: t(`noah.items.${k}`), count: n > 1 ? n : undefined })),
    );
  }

  // ------------------------------------------------------------- the axe

  /** Noah with the axe in his hand, or not. */
  holdAxe(on: boolean): void {
    this.noah.hold(on ? 'noah-axe' : null, 'hand', AXE_GRIP);
  }

  /** A blow of the axe at the air (a left click, the touch ⚔). */
  private async swing(): Promise<void> {
    if (this.busy || this.time.now < this.swingAt) return;
    this.swingAt = this.time.now + SWING_COOLDOWN * 1000;
    this.busy = true;
    this.noah.stop();
    audio.play('swing', { volume: 0.7 });
    try {
      await this.noah.attack('swing');
    } finally {
      this.busy = false;
    }
  }

  /** A blow at a gopher tree: it shakes; the last one fells it. True when it falls. */
  async chop(i: number): Promise<boolean> {
    const g = this.world.gopher[i];
    this.swingAt = this.time.now + SWING_COOLDOWN * 1000;
    audio.play('swing', { volume: 0.7 });
    await this.noah.attack('swing');
    audio.play('cut');
    if (!settings.get().reduceMotion) {
      this.tweens.add({ targets: g.tree.crown, angle: { from: -2.5, to: 2.5 }, duration: 70, yoyo: true, repeat: 2, onComplete: () => g.tree.crown.setAngle(0) });
      this.cameras.main.shake(90, 0.003);
    }
    for (let k = 0; k < 3; k++) {
      const chip = this.add.rectangle(g.tree.x + (Math.random() - 0.5) * 10, g.tree.y - 14, 3, 2, 0xc49464).setDepth(g.tree.y + 2);
      this.tweens.add({ targets: chip, x: chip.x + (Math.random() - 0.5) * 50, y: chip.y + 10 + Math.random() * 10, alpha: 0, duration: 500, onComplete: () => chip.destroy() });
    }
    g.hits++;
    if (g.hits < CHOPS) return false;
    audio.play('leaves');
    // the crash as the trunk reaches the ground (it falls over 0.9 s)
    this.time.delayedCall(720, () => audio.play('treeFall'));
    await this.world.fell(i, this.noah.x < g.tree.x ? 1 : -1);
    return true;
  }

  // ------------------------------------------------------- the seven days

  /** The animals that come two by two: each pair waits in its place. */
  private animals(): void {
    PAIRS.forEach((p, i) => {
      for (const side of [-1, 1]) {
        const actor = new Actor(this, { id: `${p.species}-${i}-${side}`, x: p.at[0] + side * 26, y: p.at[1] + (side > 0 ? 8 : 0), sheet: `animal-${p.species}`, body: { w: 20, h: 9 }, facing: side < 0 ? 'right' : 'left', stridePace: p.species === 'dove' ? undefined : 40 });
        this.followers.push({ actor, kind: 'animal', pair: i, state: 'wait', flies: p.species === 'dove' });
      }
    });
    for (const id of FAMILY_IDS) this.followers.push({ actor: this.family[id], kind: 'family', state: 'wait' });
  }

  private followerOf(actor: Actor): Follower | undefined {
    return this.followers.find((f) => f.actor === actor && f.state === 'follow');
  }

  /** Everyone back where they wait (the seven days begin again), or in the ark. */
  resetFollowers(inArk: boolean): void {
    this.boarding++;
    for (const f of this.followers) {
      f.state = inArk ? 'in' : 'wait';
      const a = f.actor;
      this.tweens.killTweensOf(a.feet);
      a.scripted = false;
      a.stop();
      a.lift = 0;
      if (f.kind === 'animal') {
        const p = PAIRS[f.pair!];
        const side = a.id.endsWith('--1') ? -1 : 1;
        a.setPosition(p.at[0] + side * 26, p.at[1] + (side > 0 ? 8 : 0));
        a.face(side < 0 ? 'right' : 'left');
      } else {
        const id = a.id as FamilyId;
        a.setPosition(FAMILY[id][0], FAMILY[id][1]);
        a.face('down');
      }
      a.setVisible(!inArk);
    }
    this.trail = [];
  }

  /** Come with Noah: they follow him, the last in line behind the others. */
  lead(actor: Actor): void {
    const f = this.followers.find((x) => x.actor === actor);
    if (!f || f.state !== 'wait') return;
    f.state = 'follow';
    if (f.kind === 'animal') {
      // the pair comes together
      for (const o of this.followers) if (o.pair === f.pair && o.state === 'wait') o.state = 'follow';
    }
  }

  /** The animals of a pair, waiting. */
  pairActors(i: number): Actor[] {
    return this.followers.filter((f) => f.pair === i).map((f) => f.actor);
  }

  isIn(actor: Actor): boolean {
    return this.followers.find((f) => f.actor === actor)?.state === 'in';
  }

  pairIn(i: number): boolean {
    return this.followers.filter((f) => f.pair === i).every((f) => f.state === 'in');
  }

  following(): number {
    return this.followers.filter((f) => f.state === 'follow').length;
  }

  /** Those following go up into the ark (Genesis 7:7–9). Resolves when all are in. */
  async boardFollowers(onIn: (f: Follower) => void): Promise<void> {
    const going = this.followers.filter((f) => f.state === 'follow');
    const round = this.boarding;
    await Promise.all(
      going.map(async (f, k) => {
        f.state = 'in';
        await this.wait(k * 260);
        if (round !== this.boarding) return;
        const a = f.actor;
        await a.walkPath([ARK_DOOR, [ARK_DOOR[0] + 70, ARK_DOOR[1] - 80]], 150);
        if (round !== this.boarding) return;
        a.setVisible(false);
        a.lift = 0;
        onIn(f);
      }),
    );
  }

  /**
   * Those following walk after Noah as people do, not in a single file (the
   * maintainer): two by two along his way, each a little to one side, at a
   * pace of their own, drifting a little, and standing round him when he
   * stops instead of closing up behind him.
   */
  private updateFollowers(dt: number): void {
    const leader = this.noah;
    if (!leader.visible) return;
    const trail = this.trail;
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(leader.x - last[0], leader.y - last[1]) > 10) {
      trail.push([leader.x, leader.y]);
      if (trail.length > 400) trail.shift();
    }
    let place = 0;
    for (const f of this.followers) {
      if (f.state !== 'follow' || f.actor.scripted) continue;
      place++;
      const a = f.actor;
      const seed = seedOf(a.id);
      // rows of two, the pair of animals side by side
      const row = Math.ceil(place / 2);
      const side = place % 2 ? -1 : 1;
      const back = Math.min(trail.length - 1, row * 5 + 1 + Math.round(seed * 2));
      const i = trail.length - 1 - back;
      const at = trail[i] ?? [leader.x, leader.y];
      const ahead = trail[Math.min(trail.length - 1, i + 2)] ?? at;
      const behind = trail[Math.max(0, i - 2)] ?? at;
      let dx = ahead[0] - behind[0];
      let dy = ahead[1] - behind[1];
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl;
      dy /= dl;
      const wide = side * (20 + seed * 16) + Math.sin(this.time.now / (1700 + seed * 900) + seed * 6) * 7;
      const target: Pt = [at[0] - dy * wide, at[1] + dx * wide];
      const ox = target[0] - a.x;
      const oy = target[1] - a.y;
      const d = Math.hypot(ox, oy);
      if (f.flies) a.lift = 24 + Math.sin(this.time.now / 160 + place) * 3;
      // they set off when left a stride behind, and stop near their place
      const moving = a.moving ? d > 10 : d > 34;
      if (moving) {
        const pace = 0.88 + seed * 0.24;
        const sp = Math.min(Math.max(80, d * 2.4), 290) * pace;
        a.move((ox / d) * sp, (oy / d) * sp);
        // far behind (stuck out of sight): put back near
        if (d > 600 && !this.cameras.main.worldView.contains(a.x, a.y)) a.setPosition(target[0], target[1]);
      } else if (a.moving) {
        a.stop();
        // standing, they look to Noah
        if (f.kind === 'family') a.face(leader);
      }
      void dt;
    }
  }

  // ---------------------------------------------------------------- the flood

  private flood(): void {
    this.water = this.add.tileSprite(0, 0, WORLD_W, WORLD_H, 'noah-water').setOrigin(0).setDepth(WATER_DEPTH).setAlpha(0).setVisible(false);
    // the fog over a bird's sight: clear round it, dark beyond
    if (!this.textures.exists('noah-fog')) {
      const size = 1024;
      const tex = this.textures.createCanvas('noah-fog', size, size)!;
      const ctx = tex.getContext();
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(26,42,58,0)');
      g.addColorStop(0.1, 'rgba(26,42,58,0)');
      g.addColorStop(0.2, 'rgba(26,42,58,0.97)');
      g.addColorStop(1, 'rgba(26,42,58,1)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      tex.refresh();
    }
    this.fog = this.add.image(0, 0, 'noah-fog').setDepth(FOG_DEPTH).setVisible(false);
    this.bar = this.add.graphics().setDepth(FOG_DEPTH + 10).setVisible(false);
    // the island: a mountain top above the waters, an olive tree on it (Genesis 8:5, 11)
    const [ix, iy] = POINTS.island;
    const hill = this.add.graphics().setDepth(ABOVE_WATER);
    hill.fillStyle(0x2c3038, 1).fillEllipse(ix, iy + 6, 200, 86);
    hill.fillStyle(0x565b63, 1).fillEllipse(ix - 6, iy - 2, 176, 70);
    hill.fillStyle(0x4b7d2d, 1).fillEllipse(ix - 8, iy - 8, 150, 52);
    hill.fillStyle(0x5a8f30, 1).fillEllipse(ix - 18, iy - 12, 96, 30);
    const tree = TREES.olive;
    const parts = [tree.trunk, tree.crown].map((k, n) => this.add.image(ix + 20, iy - 4, k).setOrigin(tree.ax / tree.w, (tree.ay + 1) / tree.h).setScale(ART * 0.8).setDepth(ABOVE_WATER + 1 + n));
    this.island = [hill, ...parts];
    this.showIsland(false);
  }

  showIsland(on: boolean): void {
    for (const o of this.island) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(on);
  }

  /** The waters over the earth: 0 none, 1 covering all; over `ms`. */
  setWater(level: number, ms = 0): Promise<void> {
    const w = this.water;
    w.setVisible(level > 0 || w.alpha > 0);
    return new Promise((resolve) => {
      this.tweens.killTweensOf(w);
      if (!ms) {
        w.setAlpha(level).setVisible(level > 0);
        return resolve();
      }
      this.tweens.add({
        targets: w,
        alpha: level,
        duration: ms,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          w.setVisible(level > 0);
          resolve();
        },
      });
    });
  }

  /** Rain over the land (Genesis 7:12): streaks falling across the view. */
  /**
   * Thunder now and then, each with a flash of lightning (the maintainer:
   * from halfway through the building of the ark, through the seven days).
   */
  setStorm(on: boolean): void {
    this.storm?.remove();
    this.storm = null;
    if (!on) return;
    const strike = () => {
      this.storm = this.time.delayedCall(16000 + Math.random() * 16000, () => {
        this.lightning();
        strike();
      });
    };
    this.storm = this.time.delayedCall(4000 + Math.random() * 5000, () => {
      this.lightning();
      strike();
    });
  }

  /** A flash of lightning over the whole view, then its thunder a moment after. */
  lightning(): void {
    const cam = this.cameras.main;
    const soft = settings.get().reduceMotion;
    const flash = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0xeef2ff)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(FOG_DEPTH + 10)
      .setAlpha(0);
    // the camera's zoom must not shrink a screen-wide flash
    flash.setScale(1 / cam.zoom).setPosition(cam.width / 2 - cam.width / 2 / cam.zoom, cam.height / 2 - cam.height / 2 / cam.zoom);
    const peak = soft ? 0.18 : 0.5;
    this.tweens.chain({
      targets: flash,
      tweens: [
        { alpha: peak, duration: 40 },
        { alpha: peak * 0.2, duration: 70 },
        { alpha: peak * 0.8, duration: 40 },
        { alpha: 0, duration: 420, ease: 'Quad.easeOut' },
      ],
      onComplete: () => flash.destroy(),
    });
    this.time.delayedCall(350 + Math.random() * 900, () => audio.play('thunder', { volume: 0.7 + Math.random() * 0.3, pitch: 0.9 + Math.random() * 0.15 }));
  }

  setRain(on: boolean): void {
    if (!on) {
      this.rain?.stop();
      const r = this.rain;
      this.rain = null;
      if (r) this.time.delayedCall(1500, () => r.destroy());
      return;
    }
    if (this.rain) return;
    const view = this.cameras.main.worldView;
    this.rain = this.add.particles(0, 0, 'noah-rain', {
      x: { min: -view.width, max: view.width },
      y: { min: -view.height * 0.8, max: -view.height * 0.4 },
      speedY: { min: 900, max: 1200 },
      speedX: { min: -140, max: -100 },
      lifespan: 1300,
      quantity: settings.get().reduceMotion ? 2 : 7,
      frequency: 16,
      alpha: { start: 0.55, end: 0.25 },
      rotate: 6,
      scale: 1.2,
    });
    this.rain.setDepth(RAIN_DEPTH);
  }

  /** The ark lifted up above the earth (Genesis 7:17), bobbing on the water. */
  setAfloat(on: boolean): void {
    const ark = this.world.ark;
    this.arkBob?.stop();
    this.arkBob = null;
    ark.y = ARK.y;
    ark.setAngle(0);
    this.world.arkShadow?.setVisible(!on);
    ark.setDepth(on ? ABOVE_WATER : ARK.y);
    if (!on || settings.get().reduceMotion) return;
    this.arkBob = this.tweens.add({ targets: ark, y: ARK.y - 6, angle: 0.8, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  // ------------------------------------------------------------- the birds

  /**
   * A bird let out of the ark's window, flown by the player (Genesis
   * 8:6–12). The raven sees little and finds nowhere to land; the dove
   * sees further and is called back halfway; the second time she flies to
   * the olive tree on the mountain top and brings its leaf back. Resolves
   * true when done, false when her strength ran out (the dove tries again).
   */
  fly(kind: 'raven' | 'dove' | 'olive'): Promise<boolean> {
    const bird = kind === 'raven' ? this.raven : this.dove;
    bird.hold(null);
    bird.sprite.setAngle(0).setAlpha(1);
    this.show(bird, ARK_WINDOW, 'left');
    bird.lift = 46;
    bird.body.setCollideWorldBounds(true);
    this.setPlayer(bird);
    this.cameraSnap();
    this.fogRadius = kind === 'raven' ? 170 : 330;
    this.fog.setVisible(true);
    this.bar.setVisible(true);
    const total = kind === 'raven' ? 32 : kind === 'dove' ? 40 : 55;
    return new Promise((resolve) => {
      this.flight = { kind, left: total, total, called: false, carrying: false, resolve };
    });
  }

  /** Where the bird is in its flight. */
  flightState(): Flight | null {
    return this.flight;
  }

  /** The bird is let go of: the flight ends. */
  endFlight(): void {
    this.flight = null;
    this.fog.setVisible(false);
    this.bar.setVisible(false).clear();
  }

  /** The olive leaf in the dove's beak (Genesis 8:11). */
  pluckOlive(): void {
    if (!this.flight) return;
    this.flight.carrying = true;
    this.dove.hold('noah-olive', 'hand', [0.5, 0.5]);
    audio.play('leafPick');
    this.fx('sparkle', [POINTS.island[0] + 20, POINTS.island[1] - 40], BIRD_DEPTH + 5);
  }

  callBack(): void {
    if (this.flight) this.flight.called = true;
  }

  private async birdFalls(bird: Actor): Promise<void> {
    this.cutscene(true, true);
    this.tweens.add({ targets: bird, lift: 0, duration: 900, ease: 'Quad.easeIn' });
    await this.wait(900);
    audio.play('splash');
    this.fx('splash', [bird.x, bird.y]);
    bird.setVisible(false);
  }

  private updateFlight(dt: number): void {
    const f = this.flight;
    if (!f) return;
    const bird = f.kind === 'raven' ? this.raven : this.dove;
    bird.lift = 46 + Math.sin(this.time.now / 260) * 4;
    this.fog.setPosition(bird.x, bird.y - bird.lift).setScale(this.fogRadius / 51);
    const home = this.near(ARK_WINDOW, 110, bird);
    const out = !home || f.left < f.total - 3;
    if (this.canMove() && out) f.left = Math.max(0, f.left - dt);
    // the bar of her strength over her
    const g = this.bar.clear();
    const w = 64;
    const x = bird.x - w / 2;
    const y = bird.topY() - 18;
    const k = f.left / f.total;
    g.fillStyle(0x1a2a3a, 0.8).fillRoundedRect(x - 2, y - 2, w + 4, 10, 4);
    g.fillStyle(k > 0.5 ? 0x7cb342 : k > 0.25 ? 0xe8c99a : 0xe04a3a, 1).fillRoundedRect(x, y, Math.max(2, w * k), 6, 3);
    if (f.left <= 0) {
      const done = f;
      this.endFlight();
      void this.birdFalls(bird).then(() => done.resolve(false));
      return;
    }
    // back at the ark: done (the dove called back, or bringing the leaf)
    const back = (f.kind === 'dove' && f.called) || (f.kind === 'olive' && f.carrying);
    if (back && home) {
      const done = f;
      this.endFlight();
      bird.stop();
      done.resolve(true);
    }
  }

  // -------------------------------------------------------- after the flood

  /** The fire on the altar (Genesis 8:20): its flames and the smoke going up. */
  setAltarFire(on: boolean): void {
    this.altarFire?.destroy();
    this.altarFire = null;
    this.smoke?.remove();
    this.smoke = null;
    if (!on) return;
    const [ax, ay] = POINTS.altar;
    const a = MANIFEST.sprites['noah-fire'];
    const top = ay - 34;
    const f = this.add.sprite(ax, top, 'noah-fire').setOrigin(a.anchorX / a.frameWidth, 1).setScale(ART).setDepth(ay + 2);
    f.play('noah-fire:loop');
    this.altarFire = f;
    this.smoke = this.time.addEvent({ delay: 280, loop: true, callback: () => this.puff(ax, top - 40, 0.55) });
  }

  private puff(x: number, y: number, alpha: number): void {
    if (settings.get().reduceMotion && Math.random() < 0.6) return;
    const m = this.add.image(x + (Math.random() - 0.5) * 10, y, 'fx-mist').setDepth(DEPTH_OVERLAY - 160).setAlpha(alpha).setScale(0.35);
    this.tweens.add({ targets: m, y: y - 170 - Math.random() * 60, x: m.x + 20 + Math.random() * 30, scale: 1.2, alpha: 0, duration: 3400, onComplete: () => m.destroy() });
  }

  /** The bow in the cloud (Genesis 9:13), over the altar. */
  setBow(on: boolean, ms = 0): void {
    if (!on) {
      this.bow?.destroy();
      this.bow = null;
      return;
    }
    if (this.bow) return;
    const g = this.add.graphics().setDepth(DEPTH_OVERLAY - 300).setBlendMode(Phaser.BlendModes.SCREEN).setAlpha(0);
    const [cx, cy] = [POINTS.altar[0] + 40, POINTS.altar[1] + 260];
    const colours = [0xe04a3a, 0xf08a3a, 0xf6e04a, 0x7cb342, 0x4a8ab0, 0x5a4ab0, 0x8a4ab0];
    colours.forEach((c, i) => {
      g.lineStyle(14, c, 0.85);
      g.beginPath();
      g.arc(cx, cy, 760 - i * 14, Math.PI * 1.08, Math.PI * 1.92);
      g.strokePath();
    });
    this.bow = g;
    this.tweens.add({ targets: g, alpha: 0.75, duration: ms || 1 });
  }

  /** Walking backward (Genesis 9:23): the player keeps facing away. */
  setBackward(on: boolean): void {
    this.backward = on;
  }

  /** Someone walking beside the player, or no one. */
  setBuddy(a: Actor | null): void {
    this.buddy?.stop();
    this.buddy = a;
  }

  private updateBuddy(): void {
    const b = this.buddy;
    const p = this.ctrl;
    if (!b || b.scripted || !b.visible) return;
    const tx = p.x + 44;
    const ty = p.y + 4;
    const d = Math.hypot(tx - b.x, ty - b.y);
    if (d > 6) {
      const sp = Math.min(Math.max(60, d * 4), 260);
      b.move(((tx - b.x) / d) * sp, ((ty - b.y) / d) * sp);
      if (this.backward) b.facing = 'down';
    } else {
      b.stop();
      if (b.facing !== p.facing) b.face(p.facing);
    }
  }

  /** The wind God made to pass over the earth (Genesis 8:1). */
  setWind(k: number): void {
    this.wind = k;
  }

  /** The people of the city where they live (before the flood), or gone. */
  showCity(on: boolean): void {
    this.world.setCity(on);
    for (const [a, b] of Object.values(this.sinners)) {
      for (const x of [a, b]) {
        x.sprite.setAngle(0).setAlpha(1);
        x.hold(null);
        if (on) x.setVisible(true);
        else this.hide(x);
      }
    }
    SINS.forEach((s) => {
      const [a, b] = this.sinners[s.id];
      if (on) {
        this.show(a, [s.at[0] - 40, s.at[1]], 'right');
        this.show(b, [s.at[0] + 40, s.at[1]], 'left');
      }
    });
  }

  // ------------------------------------------------------------------ frame

  update(time: number, delta: number): void {
    const dt = Math.min(0.1, delta / 1000);
    const p = this.ctrl;
    const flying = this.ctrlKind !== 'human';
    input.setAttack(this.control && p === this.noah && this.noah.holding()?.[0] === 'noah-axe');
    const canMove = this.mayWalk() && !p.scripted && input.movementAllowed(this.layer);
    if (canMove) {
      const v = input.moveVector();
      const pace = input.isDown('run') && this.ctrlKind === 'human' && !this.backward ? RUN : this.ctrlKind === 'human' ? PLAYER_WALK : 1;
      const base = this.ctrlKind === 'spirit' ? SPIRIT_SPEED : this.ctrlKind === 'bird' ? BIRD_SPEED : CHARACTERS[p.charId ?? 'noah']?.speed ?? 150;
      const speed = base * pace * (this.backward ? 0.6 : 1);
      p.move(v.x * speed, v.y * speed);
      if (this.backward && p.moving) p.facing = 'down';
      if (p.moving && !flying && p.footDown()) audio.step(this.world.surfaceAt(p.x, p.y), { pitch: 0.96 + Math.random() * 0.08, volume: 0.6 });
    } else if (!p.scripted) {
      p.stop();
    }
    if (this.ctrlKind === 'spirit') this.god.lift = 16 + Math.sin(time / 420) * 4;
    this.updateFollowers(dt);
    this.updateBuddy();
    this.updateFlight(dt);
    this.talk.update(p, (id) => this.castOf(id));
    const actors = [this.noah, this.god, ...Object.values(this.family), ...this.mockers, this.raven, this.dove];
    for (const a of actors) if (!a.scripted) a.refresh();
    for (const f of this.followers) if (f.kind === 'animal' && !f.actor.scripted) f.actor.refresh();
    for (const pair of Object.values(this.sinners)) for (const a of pair) if (!a.scripted) a.refresh();
    if (this.spiritOn && !this.god.scripted) this.flySpirit(dt);
    const cam = this.cameras.main;
    this.atmosphere.update(delta, cam);
    this.world.updateWater(delta);
    if (this.water.visible) this.water.tilePositionX = time * 0.012;
    if (this.rain) this.rain.setPosition(cam.worldView.centerX, cam.worldView.centerY);
    this.world.updateCanopies(p.x, p.y, cam.worldView, delta);
    if (!settings.get().reduceMotion) this.world.updateWind(time, cam.worldView, this.wind);
    if (this.godLit && this.god.visible) this.holy.update(time, this.god.x, this.god.y - this.god.lift, this.god.sprite.displayHeight, this.god.moving);
    this.updateInteractPrompt();
    this.updateObjectiveIndicator(time);
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
      // small talk never hides a mission step at the same person
      const score = d - dot * 25 + (s.id.startsWith('npc:') ? 1000 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    if (best !== this.currentInteract) {
      this.currentInteract = best;
      ui().hud.setPrompt(best ? best.prompt() : null, best?.attack ? attackKey() : undefined);
    }
  }

  private objectivePoints(): { at: Pt; mark: Pt }[] {
    const toPt = (v: Pt | Actor) => (Array.isArray(v) ? { at: v, mark: v } : { at: [v.x, v.y] as Pt, mark: [v.x, v.topY() - 4] as Pt });
    const tg = this.objectiveTarget;
    if (!tg) return [];
    if (typeof tg === 'function') return tg().map(toPt);
    return [toPt(tg as Pt | Actor)];
  }

  private updateObjectiveIndicator(time: number): void {
    const pts = this.objectivePoints();
    const hud = ui().hud;
    const talk = this.mayWalk() ? this.talk.place(this.player(), (id) => this.talkerOf(id)) : null;
    if (talk) {
      this.markers.hide(time);
      this.edgeArrow(Conversation.mark(talk));
      return;
    }
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
    // the birds see only round them: no arrow to what is out of their sight
    const sees = (q: Pt) => this.ctrlKind !== 'bird' || dist(q) < this.fogRadius * 1.6;
    const marked = (this.objectiveAll ? pts : [best]).filter((q) => inView(q.mark) && dist(q.at) >= 90 && sees(q.at));
    this.markers.show(
      marked.map((q) => q.mark),
      time,
      cam.zoom,
      dpr,
      settings.get().reduceMotion,
    );
    this.edgeArrow(best.mark);
  }

  private edgeArrow(mark: Pt): void {
    const hud = ui().hud;
    const cam = this.cameras.main;
    const view = cam.worldView;
    const dpr = pixelRatio();
    const margin = (30 * dpr) / cam.zoom;
    if (mark[0] > view.x + margin && mark[0] < view.right - margin && mark[1] > view.y + margin && mark[1] < view.bottom - margin) {
      hud.setArrow(null);
      return;
    }
    const sw = this.scale.width / dpr;
    const sh = this.scale.height / dpr;
    const cx = sw / 2;
    const cy = sh / 2;
    const tx = ((mark[0] - view.x) * cam.zoom) / dpr;
    const ty = ((mark[1] - view.y) * cam.zoom) / dpr;
    const ang = Math.atan2(ty - cy, tx - cx);
    const kx = Math.cos(ang) > 0 ? (sw - 38 - cx) / Math.cos(ang) : (38 - cx) / Math.cos(ang);
    const ky = Math.sin(ang) > 0 ? (sh - 60 - cy) / Math.sin(ang) : (120 - cy) / Math.sin(ang);
    const k = Math.min(Math.abs(kx), Math.abs(ky));
    hud.setArrow(cx + Math.cos(ang) * k, cy + Math.sin(ang) * k, ang);
  }

  /** The navy of the reference picture, for the black between scenes. */
  readonly navy = NAVY;

  chapterComplete(): Promise<void> {
    ui().chapterComplete();
    return Promise.resolve();
  }
}
