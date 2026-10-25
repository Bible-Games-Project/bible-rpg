import type { Line } from '../ui/DialogueBox';
import type { Actor, Facing } from './world/Actor';
import type { Pt } from '../data/eden/map';
import type { PlayableId } from '../data/characters';

export type TimeOfDay = 'day' | 'afternoon' | 'evening' | 'dusk';

export interface InteractSpec {
  id: string;
  /** world position or a function returning it (moving targets) */
  at: Pt | (() => Pt);
  radius?: number;
  prompt: () => string;
  enabled?: () => boolean;
  onUse: () => void | Promise<void>;
}

/** Target(s) of the objective indicator. */
export type ObjectiveTarget = Pt | Actor | (() => (Pt | Actor)[]) | null;

export interface ObjectiveOptions {
  /** An arrow over every target in view, not only the nearest. */
  markAll?: boolean;
}

/**
 * What missions can do with the world. Missions are written against this
 * interface only, so mission logic stays independent from Phaser and the
 * presentation details.
 */
export interface WorldApi {
  readonly adam: Actor;
  readonly eve: Actor;
  readonly god: Actor;
  readonly serpent: Actor;
  player(): Actor;
  activeId(): PlayableId;

  // dialogue
  say(dialogueId: string, params?: Record<string, string | number>): Promise<void>;
  scripture(id: string): Promise<void>;
  lines(lines: Line[]): Promise<void>;

  // objective and HUD
  objective(text: string, target?: ObjectiveTarget, o?: ObjectiveOptions): void;
  toast(text: string, big?: boolean): void;

  // interaction
  interact(spec: InteractSpec): () => void;
  clearInteractions(): void;
  waitZone(zone: string, who?: Actor | 'player' | 'both'): Promise<void>;
  until(cond: () => boolean): Promise<void>;
  wait(ms: number): Promise<void>;

  // staging
  cutscene(on: boolean): void;
  show(actor: Actor, at: Pt, facing?: Facing): void;
  hide(actor: Actor): void;
  walk(actor: Actor, to: Pt | Pt[], speed?: number): Promise<void>;
  face(actor: Actor, target: Facing | Actor): void;
  cameraTo(at: Pt | Actor, ms?: number): Promise<void>;
  cameraFollow(): void;
  /** Centre the camera on the player at once (no glide). */
  cameraSnap(): void;
  fade(to: number, ms?: number, color?: string): Promise<void>;
  setOutfit(outfit: string): void;
  setTime(t: TimeOfDay): void;
  music(mood: 'none' | 'peaceful' | 'wonder' | 'solemn' | 'tension' | 'sorrow'): void;
  sfx(name: string): void;
  fx(name: 'sparkle' | 'mist' | 'splash' | 'leaves' | 'holy', at: Pt): void;
  /** The closest point in the river's water to `at` (within 200 px). */
  waterNear(at: Pt): Pt;
  godLight(on: boolean): void;

  // party
  setActive(id: PlayableId): void;
  allowSwitch(on: boolean): void;
  follow(on: boolean): void;

  // inventory and flags
  give(item: string, n?: number): void;
  take(item: string, n?: number): void;
  count(item: string): number;
  flag(name: string, value?: boolean | number | string): boolean | number | string | undefined;

  // world features used by the Eden chapter
  setPlot(i: number, state: 'grass' | 'marked' | 'tilled' | 'seeded' | 'watered' | 'sprout' | 'young' | 'grown'): void;
  hideProp(id: string): void;
  showProp(id: string): void;
  fruitOf(treeIds: string[]): { tree: string; index: number; at: Pt; type: string }[];
  pickFruit(tree: string, index: number): void;
  treeAt(id: string): Pt;
  animal(id: string): Actor | undefined;
  /** Keep an animal where a scene put it (true) or let it wander again. */
  animalStay(id: string, on: boolean): void;
  /** Adam lying asleep under the oak (Genesis 2:21). */
  sleeping(on: boolean): void;
  serpentPose(pose: 'hidden' | 'tree' | 'ground'): void;
  thorns(on: boolean): void;
  openExit(open: boolean): void;
  /** With `drop`, they come down from the sky; resolves once both have landed. */
  cherubim(on: boolean, drop?: boolean): Promise<void>;
  stealth(seconds: number): Promise<void>;
  namingPuzzle(animalIds: string[]): Promise<string[]>;
  chapterComplete(): Promise<void>;
}
