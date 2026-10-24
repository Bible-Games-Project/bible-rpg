import Phaser from 'phaser';
import { audio, type Mood } from '../core/audio';
import { input, type InputLayer } from '../core/input';
import { t, tRaw, interpolate } from '../core/i18n';
import { settings } from '../core/settings';
import { CHARACTERS, type PlayableId } from '../data/characters';
import { ANIMALS } from '../data/animals';
import { GOD_PATROL, PLOT_PATCHES, POINTS, TILE, WORLD_H, WORLD_W, ZONES, type Pt } from '../data/eden/map';
import type { Line } from '../ui/DialogueBox';
import { openNamingPuzzle } from '../ui/NamingPuzzle';
import { ui } from './bridge';
import { ART_RESOLUTION, pixelRatio } from './display';
import { MANIFEST, sized, textureScale } from './manifest';
import { Actor, DEPTH_GROUND, DEPTH_OVERLAY, type Facing } from './world/Actor';
import { Animals } from './world/Animals';
import { Atmosphere } from './world/Atmosphere';
import { addShadow } from './world/shadows';
import { GodLight } from './world/GodLight';
import { Terrain } from './world/Terrain';
import { WorldObjects, type TreeInstance } from './world/WorldObjects';
import type { InteractSpec, ObjectiveTarget, TimeOfDay, WorldApi } from './WorldApi';
import { MissionRunner } from './missions/MissionRunner';
import type { FlagValue } from '../core/save';

export interface EdenStartData {
  mode: 'continue' | 'new';
}

/** World pixels of height on screen, and the narrowest view (portrait phones). */
const VIEW_HEIGHT = 1000;
const VIEW_MIN_WIDTH = 640;
/** Never smaller than this (CSS px per world px), so characters stay readable on small screens. */
const MIN_ZOOM = 0.5;

const ITEM_ICONS: Record<string, string> = {
  stick: 'digging-stick',
  seeds: 'seeds',
  gourd: 'gourd',
  water: 'gourd-full',
  basket: 'basket-full',
  fruit: 'fruit-pomegranate',
  figLeaf: 'fig-leaf',
};

const TINTS: Record<TimeOfDay, { color: number; alpha: number }> = {
  // a faint warm cast in daylight: every sprite and the ground share one light
  day: { color: 0xffeed2, alpha: 0.35 },
  afternoon: { color: 0xf3d8a8, alpha: 0.22 },
  evening: { color: 0x9a7ab8, alpha: 0.42 },
  dusk: { color: 0xd7866a, alpha: 0.36 },
};

/**
 * The Garden of Eden. Builds the world, owns the actors and systems, and
 * implements WorldApi for the missions.
 */
export class EdenScene extends Phaser.Scene implements WorldApi {
  terrain!: Terrain;
  objects!: WorldObjects;
  animals!: Animals;
  adam!: Actor;
  eve!: Actor;
  god!: Actor;
  serpent!: Actor;
  private active: PlayableId = 'adam';
  private canSwitch = false;
  private following = false;
  private control = true;
  /** an interaction is being handled (separate from cutscenes, which own `control`) */
  private busy = false;
  private interactions: InteractSpec[] = [];
  private currentInteract: InteractSpec | null = null;
  private objectiveTarget: ObjectiveTarget = null;
  private marker!: Phaser.GameObjects.Sprite;
  private tint!: Phaser.GameObjects.Rectangle;
  private atmosphere!: Atmosphere;
  private tintTween: Phaser.Tweens.Tween | null = null;
  private holy!: GodLight;
  private godLit = false;
  private inventory: Record<string, number> = {};
  private flags: Record<string, FlagValue> = {};
  private plots: { soil: Phaser.GameObjects.Image; plant: Phaser.GameObjects.Image }[] = [];
  private thornSprites: Phaser.GameObjects.Image[] = [];
  private cherubSprites: Phaser.GameObjects.Sprite[] = [];
  private fireflies: Phaser.GameObjects.Image[] = [];
  private layer!: InputLayer;
  private runner!: MissionRunner;
  private stepTimer = 0;
  private followStuck = 0;

  constructor() {
    super('eden');
  }

  create(data: EdenStartData): void {
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.terrain = new Terrain(this);
    this.objects = new WorldObjects(this, this.terrain);
    this.animals = new Animals(this, this.terrain);
    const c = CHARACTERS;
    this.adam = new Actor(this, { id: 'adam', x: POINTS.adamStart[0], y: POINTS.adamStart[1], charId: 'adam', outfit: c.adam.outfit, body: { w: 22, h: 10 } });
    this.eve = new Actor(this, { id: 'eve', x: POINTS.eveArrive[0], y: POINTS.eveArrive[1], charId: 'eve', outfit: c.eve.outfit, body: { w: 22, h: 10 } });
    this.god = new Actor(this, { id: 'god', x: POINTS.godAppear[0], y: POINTS.godAppear[1], charId: 'god', outfit: 'robe', body: { w: 26, h: 10 }, solid: true });
    this.serpent = new Actor(this, { id: 'serpent', x: POINTS.serpentBranch[0], y: POINTS.serpentBranch[1], sheet: 'serpent-tree', shadow: null, body: { w: 10, h: 6 } });
    this.eve.setVisible(false);
    this.god.setVisible(false);
    this.serpent.setVisible(false);
    this.holy = new GodLight(this, settings.get().reduceMotion);
    this.marker = sized(this.add.sprite(0, 0, 'marker').setOrigin(0.5, 1).setDepth(DEPTH_OVERLAY - 20).setVisible(false));
    this.marker.play('marker:loop');
    for (const [x, y] of PLOT_PATCHES) {
      const soil = sized(this.add.image(x, y, 'soil-marked').setDepth(DEPTH_GROUND + 5));
      const plant = sized(this.add.image(x, y + 8, 'plant-sprout').setOrigin(0.5, 1).setDepth(y + 8).setVisible(false));
      this.plots.push({ soil, plant });
    }
    // colliders
    for (const actor of [this.adam, this.eve]) {
      this.physics.add.collider(actor.feet, this.terrain.colliders);
      this.physics.add.collider(actor.feet, this.objects.colliders);
      this.physics.add.collider(actor.feet, this.god.feet);
      for (const b of this.animals.brains) if (b.def.solid) this.physics.add.collider(actor.feet, b.actor.feet);
    }
    for (const b of this.animals.brains) {
      if (b.def.flies) continue;
      this.physics.add.collider(b.actor.feet, this.terrain.colliders);
      this.physics.add.collider(b.actor.feet, this.objects.colliders);
    }
    // tint overlay for the time of day
    this.tint = this.add.rectangle(0, 0, 10, 10, TINTS.day.color, TINTS.day.alpha).setOrigin(0).setScrollFactor(0).setDepth(DEPTH_OVERLAY - 100);
    this.tint.setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.atmosphere = new Atmosphere(this, settings.get().reduceMotion);
    // camera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.setRoundPixels(true);
    cam.setBackgroundColor('#1d3c1a');
    this.applyZoom();
    this.scale.on('resize', () => this.applyZoom());
    this.cameraFollow();
    // input
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
        if (a === 'switch') {
          this.switchCharacter();
          return true;
        }
        return false;
      },
    };
    input.push(this.layer);
    this.events.once('shutdown', () => this.teardown());
    this.events.once('destroy', () => this.teardown());
    audio.setAmbience('garden');
    // missions
    this.runner = new MissionRunner(this, data.mode);
    void this.runner.start();
  }

  /** Stop the mission scripts (before the scene is left). */
  halt(): void {
    this.runner?.stop();
  }

  private teardown(): void {
    input.remove(this.layer);
    audio.setAmbience('none');
    audio.setMood('none');
    this.runner?.stop();
  }

  /**
   * About VIEW_HEIGHT world px of height on screen (the maintainer wanted the
   * world seen from farther away). Where the screen allows, the zoom puts
   * each art pixel of the sprites on a whole number of screen pixels, drawn
   * sharp; otherwise the art is scaled smoothly (linear filtering).
   */
  private applyZoom(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const dpr = pixelRatio();
    const wanted = Math.min(h / VIEW_HEIGHT, w / VIEW_MIN_WIDTH); // device px per world px
    const perArt = wanted / ART_RESOLUTION;
    const z = perArt >= 0.8 ? ART_RESOLUTION * Math.max(1, Math.round(perArt)) : Math.max(wanted, MIN_ZOOM * dpr);
    this.applyFilters(z);
    this.cameras.main.setZoom(z);
    this.tint.setSize(w / z + 64, h / z + 64);
    this.tint.setPosition(w / 2 - w / z / 2 - 32, h / 2 - h / z / 2 - 32);
    this.atmosphere.resize(w, h, z);
  }

  /** Sharp pixels for textures drawn at a whole number of screen pixels per
   * pixel; smooth scaling for the rest, the ground and the light effects. */
  private applyFilters(zoom: number): void {
    for (const key of this.textures.getTextureKeys()) {
      const perPixel = zoom * textureScale(key);
      const smooth = key.startsWith('fx-') || key === 'tiles-extruded';
      const crisp = !smooth && perPixel >= 0.98 && Math.abs(perPixel - Math.round(perPixel)) < 0.02;
      this.textures.get(key).setFilter(crisp ? Phaser.Textures.FilterMode.NEAREST : Phaser.Textures.FilterMode.LINEAR);
    }
  }

  // ------------------------------------------------------------------ party

  player(): Actor {
    return this.active === 'adam' ? this.adam : this.eve;
  }

  activeId(): PlayableId {
    return this.active;
  }

  private other(): Actor {
    return this.active === 'adam' ? this.eve : this.adam;
  }

  setActive(id: PlayableId): void {
    this.player().stop();
    this.active = id;
    this.cameraFollow();
    this.updateCharacterChip();
  }

  allowSwitch(on: boolean): void {
    this.canSwitch = on;
    this.updateCharacterChip();
  }

  follow(on: boolean): void {
    this.following = on;
  }

  switchCharacter(): void {
    if (!this.canSwitch || !this.canAct() || !this.eve.visible || ui().dialogue.open) return;
    this.setActive(this.active === 'adam' ? 'eve' : 'adam');
    audio.play('uiSelect');
  }

  private updateCharacterChip(): void {
    const name = t(CHARACTERS[this.active].nameKey);
    const otherId = this.active === 'adam' ? 'eve' : 'adam';
    ui().hud.setCharacter(this.eve.visible ? name : null, this.canSwitch ? t(CHARACTERS[otherId].nameKey) : null);
  }

  // --------------------------------------------------------------- dialogue

  say(id: string, params?: Record<string, string | number>): Promise<void> {
    const raw = tRaw<{ s: string; t: string; ref?: string }[]>(`eden.dialogue.${id}`);
    if (!Array.isArray(raw)) console.warn(`[dialogue] missing: ${id}`);
    const lines: Line[] = (Array.isArray(raw) ? raw : []).map((l) => ({
      speaker: l.s,
      text: interpolate(l.t, params),
      ref: l.ref,
      portrait: this.portraitFor(l.s),
    }));
    return this.lines(lines);
  }

  /** Adam's and Eve's portraits follow what they are wearing ("eve-fig"). */
  private portraitFor(speaker: string): string | undefined {
    const actor = speaker === 'adam' ? this.adam : speaker === 'eve' ? this.eve : null;
    const key = actor?.outfit && actor.outfit !== 'leaves' ? `${speaker}-${actor.outfit}` : null;
    return key && MANIFEST.portraits[key] ? key : undefined;
  }

  scripture(id: string): Promise<void> {
    return this.lines([{ speaker: 'narrator', text: t(`eden.scripture.${id}.text`), ref: t(`eden.scripture.${id}.ref`), scripture: true }]);
  }

  async lines(lines: Line[]): Promise<void> {
    this.player().stop();
    this.facePartners(lines);
    await ui().dialogue.show(lines);
  }

  /** During dialogue, the speakers turn towards each other. */
  private facePartners(lines: Line[]): void {
    const speakers = new Set(lines.map((l) => l.speaker));
    const actors = [...speakers].map((s) => (s === 'adam' ? this.adam : s === 'eve' ? this.eve : s === 'god' ? this.god : null)).filter((a): a is Actor => !!a && a.visible);
    if (speakers.has('god') && this.god.visible) {
      for (const a of [this.adam, this.eve]) if (a.visible && Phaser.Math.Distance.Between(a.x, a.y, this.god.x, this.god.y) < 260) a.face(this.god);
      const p = this.player();
      if (p.visible) this.god.face(p);
    } else if (actors.length >= 2) {
      actors[0].face(actors[1]);
      actors[1].face(actors[0]);
    } else if (speakers.has('serpent') && this.serpent.visible) {
      for (const a of [this.adam, this.eve]) if (a.visible && Phaser.Math.Distance.Between(a.x, a.y, this.serpent.x, this.serpent.y) < 300) a.face(this.serpent);
    }
  }

  // --------------------------------------------------------- objective, HUD

  objective(text: string, target: ObjectiveTarget = null): void {
    ui().hud.setObjective(text);
    this.objectiveTarget = target;
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
    this.interactions = [];
  }

  /** The player may move and use things (no cutscene, no interaction in progress). */
  private canAct(): boolean {
    return this.control && !this.busy;
  }

  private async useInteract(spec: InteractSpec): Promise<void> {
    this.busy = true;
    this.player().stop();
    const at = typeof spec.at === 'function' ? spec.at() : spec.at;
    this.player().face({ x: at[0], y: at[1] });
    ui().hud.setPrompt(null);
    try {
      await spec.onUse();
    } finally {
      this.busy = false;
    }
  }

  waitZone(zone: string, who: Actor | 'player' | 'both' = 'player'): Promise<void> {
    const z = ZONES[zone];
    return this.until(() => {
      const inside = (a: Actor) => Math.hypot(a.x - z.x, a.y - z.y) < z.r;
      if (who === 'player') return inside(this.player());
      if (who === 'both') return inside(this.adam) && inside(this.eve);
      return inside(who);
    });
  }

  until(cond: () => boolean): Promise<void> {
    return new Promise((resolve) => {
      if (cond()) {
        resolve();
        return;
      }
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
      this.adam.stop();
      this.eve.stop();
      ui().hud.setPrompt(null);
    }
  }

  show(actor: Actor, at: Pt, facing: Facing = 'down'): void {
    actor.setPosition(at[0], at[1]);
    actor.setVisible(true);
    actor.face(facing);
    if (actor === this.eve) this.updateCharacterChip();
  }

  hide(actor: Actor): void {
    actor.setVisible(false);
    if (actor === this.god) this.godLight(false);
    if (actor === this.eve) this.updateCharacterChip();
  }

  async walk(actor: Actor, to: Pt | Pt[], speed?: number): Promise<void> {
    const pts: Pt[] = Array.isArray(to[0]) ? (to as Pt[]) : [to as Pt];
    const sp = speed ?? (actor === this.god ? 90 : 150);
    await actor.walkPath(pts, sp);
  }

  face(actor: Actor, target: Facing | Actor): void {
    actor.face(target);
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

  /** Follow the active character, gliding there from where the camera is
   * (Phaser's startFollow jumps straight to the target, which showed as a
   * jolt at the end of missions). */
  cameraFollow(): void {
    const cam = this.cameras.main;
    const { scrollX, scrollY } = cam;
    cam.startFollow(this.player().sprite, true, 0.12, 0.12, 0, 40);
    cam.setScroll(scrollX, scrollY);
  }

  /** Jump to the active character (only while the screen is faded out). */
  cameraSnap(): void {
    const p = this.player();
    const cam = this.cameras.main;
    cam.startFollow(p.sprite, true, 0.12, 0.12, 0, 40);
    cam.centerOn(p.x, p.y - 40);
  }

  fade(to: number, ms = 700, color = '#000'): Promise<void> {
    return ui().hud.fade(to, ms, color);
  }

  setOutfit(outfit: string): void {
    this.adam.setOutfit(outfit);
    this.eve.setOutfit(outfit);
  }

  setTime(time: TimeOfDay): void {
    // the light changes colour gradually (it used to switch colour at once)
    const tt = TINTS[time];
    const from = Phaser.Display.Color.ValueToColor(this.tint.fillColor);
    const to = Phaser.Display.Color.ValueToColor(tt.color);
    const alpha = this.tint.fillAlpha;
    this.tintTween?.stop();
    this.tintTween = this.tweens.addCounter({
      from: 0,
      to: 100,
      duration: 2200,
      ease: 'Sine.easeInOut',
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 100;
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, 100, k);
        this.tint.fillColor = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
        this.tint.fillAlpha = alpha + ((tt.alpha - alpha) * k) / 100;
      },
    });
    this.atmosphere.setTime(time);
    this.tint.fillColor = tt.color;
    audio.setAmbience(time === 'evening' ? 'evening' : time === 'dusk' ? 'outside' : 'garden');
    for (const f of this.fireflies) f.destroy();
    this.fireflies = [];
    if (time === 'evening' && !settings.get().reduceMotion) {
      for (let i = 0; i < 40; i++) {
        const x = 2000 + Math.random() * 1000;
        const y = 2100 + Math.random() * 1000;
        const f = this.add.image(x, y, 'fx-firefly').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH_OVERLAY - 200);
        this.tweens.add({ targets: f, x: x + (Math.random() - 0.5) * 80, y: y + (Math.random() - 0.5) * 60, alpha: { from: 0.2, to: 1 }, duration: 2000 + Math.random() * 2000, yoyo: true, repeat: -1 });
        this.fireflies.push(f);
      }
    }
  }

  music(mood: Mood): void {
    audio.setMood(mood);
  }

  sfx(name: string): void {
    audio.play(name as never);
  }

  fx(name: 'sparkle' | 'mist' | 'splash' | 'leaves' | 'holy', at: Pt): void {
    const [x, y] = at;
    const rm = settings.get().reduceMotion;
    if (name === 'sparkle') {
      for (let i = 0; i < (rm ? 2 : 6); i++) {
        const s = this.add.sprite(x + (Math.random() - 0.5) * 40, y - Math.random() * 50, 'fx-sparkle').setDepth(DEPTH_OVERLAY - 30);
        s.play('fx-sparkle:once');
        s.once('animationcomplete', () => s.destroy());
      }
    } else if (name === 'splash') {
      const s = this.add.sprite(x, y, 'fx-splash').setDepth(y + 1);
      s.play('fx-splash:once');
      s.once('animationcomplete', () => s.destroy());
    } else if (name === 'mist') {
      for (let i = 0; i < 10; i++) {
        const m = this.add.image(x + (Math.random() - 0.5) * 160, y + (Math.random() - 0.5) * 60, 'fx-mist').setDepth(DEPTH_OVERLAY - 150).setAlpha(0);
        this.tweens.add({ targets: m, alpha: 0.9, y: m.y - 20, duration: 1400, yoyo: true, hold: 600, onComplete: () => m.destroy() });
      }
    } else if (name === 'leaves') {
      for (let i = 0; i < 8; i++) {
        const l = this.add.image(x + (Math.random() - 0.5) * 60, y - 60 - Math.random() * 40, 'fx-leaf').setDepth(DEPTH_OVERLAY - 30);
        this.tweens.add({ targets: l, y: y + 10, x: l.x + (Math.random() - 0.5) * 40, angle: 180, duration: 1200 + Math.random() * 600, onComplete: () => l.destroy() });
      }
    } else if (name === 'holy') {
      const g = this.add.image(x, y, 'god-glow').setBlendMode(Phaser.BlendModes.ADD).setOrigin(0.5, 0.82).setDepth(DEPTH_OVERLAY - 40).setAlpha(0).setScale(0.4);
      this.tweens.add({ targets: g, alpha: 1, scale: 1.3, duration: 900, yoyo: true, onComplete: () => g.destroy() });
    }
  }

  godLight(on: boolean): void {
    this.godLit = on;
    this.holy.set(on);
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
    return { flags: { ...this.flags }, inventory: { ...this.inventory }, activeCharacter: this.active };
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
        .map(([k, n]) => ({ icon: ITEM_ICONS[k] ?? 'seeds', label: t(`eden.items.${k}`), count: n > 1 || k === 'fruit' || k === 'figLeaf' ? n : undefined })),
    );
  }

  // ---------------------------------------------------- Eden world features

  setPlot(i: number, state: 'grass' | 'marked' | 'tilled' | 'seeded' | 'watered' | 'sprout' | 'young' | 'grown'): void {
    const p = this.plots[i];
    if (!p) return;
    const soil = { grass: null, marked: 'soil-marked', tilled: 'soil-tilled', seeded: 'soil-seeded', watered: 'soil-watered', sprout: 'soil-watered', young: 'soil-tilled', grown: 'soil-tilled' }[state];
    p.soil.setVisible(!!soil);
    if (soil) p.soil.setTexture(soil);
    const plant = state === 'sprout' || state === 'young' || state === 'grown' ? `plant-${state}` : null;
    p.plant.setVisible(!!plant);
    if (plant) p.plant.setTexture(plant);
  }

  hideProp(id: string): void {
    const p = this.objects.prop(id);
    p?.image.setVisible(false);
    p?.shadow?.setVisible(false);
  }

  showProp(id: string): void {
    const p = this.objects.prop(id);
    p?.image.setVisible(true);
    p?.shadow?.setVisible(true);
  }

  waterNear(at: Pt): Pt {
    let best: Pt = at;
    let bestD = Infinity;
    for (let dy = -200; dy <= 200; dy += 8) {
      for (let dx = -200; dx <= 200; dx += 8) {
        const x = at[0] + dx;
        const y = at[1] + dy;
        const d = dx * dx + dy * dy;
        if (d < bestD && this.terrain.riverDistance(x, y) < -14) {
          best = [x, y];
          bestD = d;
        }
      }
    }
    return best;
  }

  fruitOf(treeIds: string[]): { tree: string; index: number; at: Pt; type: string }[] {
    const out: { tree: string; index: number; at: Pt; type: string }[] = [];
    for (const id of treeIds) {
      const tr = this.objects.tree(id);
      tr?.fruit.forEach((f, i) => {
        if (!f.picked) out.push({ tree: id, index: i, at: [f.sprite.x, f.sprite.y], type: f.type });
      });
    }
    return out;
  }

  pickFruit(tree: string, index: number): void {
    const f = this.objects.tree(tree)?.fruit[index];
    if (!f || f.picked) return;
    f.picked = true;
    this.tweens.add({ targets: f.sprite, y: f.sprite.y + 12, alpha: 0, duration: 300, onComplete: () => f.sprite.setVisible(false) });
  }

  treeAt(id: string): Pt {
    const tr = this.objects.tree(id) as TreeInstance | undefined;
    return tr ? [tr.x, tr.y] : [0, 0];
  }

  animal(id: string): Actor | undefined {
    return this.animals.get(id);
  }

  animalStay(id: string, on: boolean): void {
    this.animals.freeze(id, on);
  }

  private sleepImage: Phaser.GameObjects.Image | null = null;

  sleeping(on: boolean): void {
    this.sleepImage?.destroy();
    this.sleepImage = null;
    if (!on) {
      this.adam.setVisible(true);
      return;
    }
    const a = MANIFEST.sprites['adam-sleeping'];
    this.sleepImage = sized(
      this.add
        .image(this.adam.x, this.adam.y, 'adam-sleeping')
        .setOrigin(a.anchorX / a.frameWidth, (a.anchorY + 1) / a.frameHeight)
        .setDepth(this.adam.y),
    );
    this.adam.setVisible(false);
  }

  serpentPose(pose: 'hidden' | 'tree' | 'ground'): void {
    const s = this.serpent;
    if (pose === 'hidden') {
      s.setVisible(false);
      return;
    }
    s.sheet = pose === 'tree' ? 'serpent-tree' : 'serpent-ground';
    s.setVisible(true);
    s.depthBias = 0;
    if (pose === 'tree') {
      s.setPosition(POINTS.serpentBranch[0], POINTS.serpentBranch[1]);
      s.depthBias = this.treeAt('forbiddenTree')[1] - POINTS.serpentBranch[1] + 2;
    }
    s.refresh(true);
  }

  thorns(on: boolean): void {
    for (const s of this.thornSprites) s.destroy();
    this.thornSprites = [];
    if (!on) return;
    const r = Phaser.Math.RND;
    r.sow(['thorns']);
    const spots: Pt[] = [];
    for (const z of [ZONES.plot, ZONES.midst, ZONES.godGrove, ZONES.exit]) {
      for (let i = 0; i < 9; i++) {
        const a = r.frac() * Math.PI * 2;
        const d = z.r * (0.7 + r.frac() * 0.5);
        spots.push([z.x + Math.cos(a) * d, z.y + Math.sin(a) * d]);
      }
    }
    for (const [x, y] of spots) {
      if (this.terrain.isWaterAt(x, y)) continue;
      const key = r.frac() < 0.5 ? 'thistle' : 'thorns';
      const a = MANIFEST.sprites[key];
      const s = sized(this.add.image(x, y, key).setOrigin(a.anchorX / a.frameWidth, 1).setDepth(y).setAlpha(0));
      this.tweens.add({ targets: s, alpha: 1, duration: 900, delay: r.frac() * 800 });
      this.thornSprites.push(s);
    }
  }

  openExit(open: boolean): void {
    this.objects.openExit(open);
  }

  /** The cherubim at the east of the garden (Genesis 3:24), facing east with
   * the flaming sword in hand; the blade flickers. */
  cherubim(on: boolean): void {
    for (const o of this.cherubSprites) o.destroy();
    this.cherubSprites = [];
    if (!on) return;
    const a = MANIFEST.sprites.cherub;
    const k = a.scale ?? 1;
    for (const p of [POINTS.cherubN, POINTS.cherubS]) {
      const c = sized(this.add.sprite(p[0], p[1], 'cherub').setOrigin(a.anchorX / a.frameWidth, (a.anchorY + 1) / a.frameHeight).setDepth(p[1]));
      c.play('cherub:loop');
      const shadow = addShadow(this, p[0], p[1], 'cherub');
      const [fx, fy] = a.flame ?? [a.anchorX, a.frameHeight / 3];
      const fire = this.add.image(p[0] + (fx - a.anchorX) * k, p[1] + (fy - a.anchorY - 1) * k, 'god-glow');
      fire.setBlendMode(Phaser.BlendModes.ADD).setTint(0xff9a50).setScale(0.35, 0.5).setDepth(p[1] + 1).setAlpha(0.55);
      if (!settings.get().reduceMotion) {
        this.tweens.add({ targets: fire, alpha: 0.85, scaleX: 0.42, duration: 180, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Math.random() * 200 });
      }
      this.cherubSprites.push(c, fire as unknown as Phaser.GameObjects.Sprite);
      if (shadow) this.cherubSprites.push(shadow as unknown as Phaser.GameObjects.Sprite);
    }
  }

  // -------------------------------------------------------------- stealth

  /**
   * Mission 8: stay hidden while the LORD God walks through the grove in the
   * cool of the day. Being seen sends the player back to the start of the
   * challenge; after three tries the story continues anyway.
   */
  /**
   * Hiding from the LORD God (Genesis 3:8). He walks his round of the grove,
   * but comes toward anyone he sees or hears moving in the open, goes to
   * where he last noticed them and looks around there before returning to
   * his round. Being seen for a moment only sends the player back.
   */
  stealth(seconds: number): Promise<void> {
    return new Promise((resolve) => {
      const hud = ui().hud;
      const god = this.god;
      let remaining = seconds;
      let failures = 0;
      let done = false;
      const sight = this.add.image(god.x, god.y, 'shadow-large').setTint(0xfff2c0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.35).setDepth(DEPTH_GROUND + 20).setScale(4, 3.2);
      const startPos: Pt = POINTS.groveStart;
      let mode: 'round' | 'search' | 'look' = 'round';
      let round = 0;
      let target: Pt = GOD_PATROL[0];
      let lookFor = 0;
      const nearestStop = (): number => {
        let best = 0;
        GOD_PATROL.forEach((q, i) => {
          if (Math.hypot(q[0] - god.x, q[1] - god.y) < Math.hypot(GOD_PATROL[best][0] - god.x, GOD_PATROL[best][1] - god.y)) best = i;
        });
        return best;
      };
      god.scripted = false;
      let grace = 1.5;
      let exposedFor = 0;
      const tick = this.time.addEvent({
        delay: 100,
        loop: true,
        callback: () => {
          if (done) return;
          if (ui().dialogue.open) {
            god.stop();
            return;
          }
          remaining -= 0.1;
          grace -= 0.1;
          sight.setPosition(god.x, god.y);
          const p = this.player();
          const d = Phaser.Math.Distance.Between(p.x, p.y, god.x, god.y);
          const covered = this.objects.isCovered(p.x, p.y);
          const blocked = this.objects.sightBlocked(god.x, god.y - 20, p.x, p.y - 10);
          const exposed = d < 190 && !covered && !blocked;
          const heard = d < 330 && p.moving && !covered;
          if ((exposed || heard) && grace <= 0) {
            mode = 'search';
            target = [p.x, p.y];
          }
          // walking: his round, or toward where he last noticed someone
          if (mode === 'look') {
            god.stop();
            lookFor -= 0.1;
            if (Math.random() < 0.08) god.face((['left', 'right', 'up', 'down'] as const)[Math.floor(Math.random() * 4)]);
            if (lookFor <= 0) {
              mode = 'round';
              round = nearestStop();
              target = GOD_PATROL[round];
            }
          } else {
            const dx = target[0] - god.x;
            const dy = target[1] - god.y;
            const left = Math.hypot(dx, dy);
            if (left < 12) {
              if (mode === 'search') {
                mode = 'look';
                lookFor = 1.8;
              } else {
                round = (round + 1) % GOD_PATROL.length;
                target = GOD_PATROL[round];
              }
            } else {
              const speed = mode === 'search' ? 95 : 62;
              god.move((dx / left) * speed, (dy / left) * speed);
            }
          }
          hud.setTimer(remaining, seconds, exposed ? t('stealth.exposed') : t('stealth.hidden'));
          exposedFor = exposed ? exposedFor + 0.1 : 0;
          if (exposedFor >= 0.6 && grace <= 0) {
            failures++;
            exposedFor = 0;
            if (failures >= 3) {
              finish();
              return;
            }
            audio.play('detected');
            this.cutscene(true);
            god.stop();
            mode = 'round';
            void (async () => {
              await this.fade(1, 400);
              hud.toast(t('stealth.seen'), false, 3600);
              this.player().setPosition(startPos[0], startPos[1]);
              this.other().setPosition(startPos[0] - 30, startPos[1] + 10);
              remaining = seconds;
              grace = 2;
              await this.fade(0, 500);
              this.cutscene(false);
            })();
          }
          if (remaining <= 0) finish();
        },
      });
      const finish = () => {
        done = true;
        tick.remove();
        sight.destroy();
        hud.setTimer(null);
        god.stop();
        resolve();
      };
    });
  }

  namingPuzzle(animalIds: string[]): Promise<string[]> {
    const items = animalIds.map((id) => ({ id, species: ANIMALS.find((a) => a.id === id)!.species }));
    return openNamingPuzzle(items);
  }

  chapterComplete(): Promise<void> {
    ui().chapterComplete();
    return Promise.resolve();
  }

  // ---------------------------------------------------------------- update

  update(time: number, delta: number): void {
    const dt = delta / 1000;
    const p = this.player();
    const canMove = this.canAct() && !p.scripted && input.movementAllowed(this.layer) && !ui().dialogue.open;
    if (canMove) {
      const v = input.moveVector();
      const speed = CHARACTERS[this.active].speed;
      p.move(v.x * speed, v.y * speed);
      if (p.moving) {
        this.stepTimer -= dt;
        if (this.stepTimer <= 0) {
          audio.play('step', { pitch: this.terrain.pathDistance(p.x, p.y) < 0 ? 0.7 : 1.15, volume: 0.6 });
          this.stepTimer = 0.27; // two steps per walk cycle (8 frames at 15 fps)
        }
      }
    } else if (!p.scripted) {
      p.stop();
    }
    this.updateFollower(dt);
    for (const a of [this.adam, this.eve, this.god, this.serpent]) if (!a.scripted) a.refresh();
    this.animals.update(time, dt);
    const cam = this.cameras.main;
    this.atmosphere.update(delta, cam);
    this.objects.updateCanopies(p.x, p.y, cam.worldView, delta);
    this.updateGod(time);
    this.updateInteractPrompt();
    this.updateObjectiveIndicator(time);
    // river sound when near the water
    const rd = this.terrain.riverDistance(p.x, p.y);
    audio.setWaterLevel(1 - Math.min(1, Math.max(0, rd) / 380));
  }

  private updateFollower(dt: number): void {
    const leader = this.player();
    const f = this.other();
    if (!this.following || !f.visible || f.scripted || !this.canAct()) {
      if (!f.scripted) f.stop();
      return;
    }
    const dist = Math.hypot(leader.x - f.x, leader.y - f.y);
    if (dist > 520) {
      // too far (e.g. after a scene change): reappear just behind the leader
      f.setPosition(leader.x - 30, leader.y + 12);
      this.followStuck = 0;
      return;
    }
    // walk to a spot beside the leader (never on top of them)
    const side = f.x < leader.x ? -1 : 1;
    const tx = leader.x + side * 46;
    const ty = leader.y + 6;
    const dx = tx - f.x;
    const dy = ty - f.y;
    const gap = Math.hypot(dx, dy);
    if (dist > 64 || gap > 30) {
      const sp = CHARACTERS[f.id].speed * (dist > 160 ? 1.1 : gap < 60 ? 0.6 : 0.95);
      const before = { x: f.x, y: f.y };
      f.move((dx / gap) * sp, (dy / gap) * sp);
      this.followStuck = Math.hypot(f.x - before.x, f.y - before.y) < 0.2 ? this.followStuck + dt : 0;
      if (this.followStuck > 1.2 && !this.cameras.main.worldView.contains(f.x, f.y)) {
        f.setPosition(tx, ty);
        this.followStuck = 0;
      }
    } else {
      f.stop();
      if (!leader.moving) {
        const want: Facing = leader.facing === 'up' || leader.facing === 'down' ? leader.facing : leader.x < f.x ? 'left' : 'right';
        if (f.facing !== want) f.face(want);
      }
    }
  }

  private updateGod(time: number): void {
    const g = this.god;
    if (!this.godLit || !g.visible) return;
    this.holy.update(time, g.x, g.y, g.sprite.displayHeight);
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
      const r = s.radius ?? 70;
      if (d > r) continue;
      // prefer what the character is facing
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

  private objectivePoints(): Pt[] {
    const tg = this.objectiveTarget;
    if (!tg) return [];
    const toPt = (v: Pt | Actor): Pt => (Array.isArray(v) ? v : [v.x, v.y - 60]);
    if (typeof tg === 'function') return tg().map(toPt);
    return [toPt(tg as Pt | Actor)];
  }

  private updateObjectiveIndicator(time: number): void {
    const pts = this.objectivePoints();
    const hud = ui().hud;
    if (!pts.length || !this.canAct()) {
      hud.setArrow(null);
      this.marker.setVisible(false);
      return;
    }
    const p = this.player();
    let best = pts[0];
    let bd = Infinity;
    for (const q of pts) {
      const d = Phaser.Math.Distance.Between(p.x, p.y, q[0], q[1]);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    const cam = this.cameras.main;
    const view = cam.worldView;
    const dpr = pixelRatio();
    const margin = (30 * dpr) / cam.zoom;
    const onScreen = best[0] > view.x + margin && best[0] < view.right - margin && best[1] > view.y + margin && best[1] < view.bottom - margin;
    if (onScreen) {
      hud.setArrow(null);
      const near = bd < 90;
      this.marker.setVisible(!near);
      this.marker.setPosition(best[0], best[1] - 18 - Math.sin(time / 250) * 2);
      return;
    }
    this.marker.setVisible(false);
    // arrow at the screen edge, pointing from the screen centre to the target
    // in CSS pixels, like the HUD
    const sw = this.scale.width / dpr;
    const sh = this.scale.height / dpr;
    const cx = sw / 2;
    const cy = sh / 2;
    const tx = ((best[0] - view.x) * cam.zoom) / dpr;
    const ty = ((best[1] - view.y) * cam.zoom) / dpr;
    const ang = Math.atan2(ty - cy, tx - cx);
    const padX = 38;
    const padTop = 120;
    const padBottom = 60;
    const kx = Math.cos(ang) > 0 ? (sw - padX - cx) / Math.cos(ang) : (padX - cx) / Math.cos(ang);
    const ky = Math.sin(ang) > 0 ? (sh - padBottom - cy) / Math.sin(ang) : (padTop - cy) / Math.sin(ang);
    const k = Math.min(Math.abs(kx), Math.abs(ky));
    hud.setArrow(cx + Math.cos(ang) * k, cy + Math.sin(ang) * k, ang);
  }
}

export const WORLD_TILE = TILE;
