import { storage } from './storage';

/**
 * Persistent progress. Progress is committed when a mission is completed:
 * the flags and inventory stored here are always the state at the start of
 * the current mission, so an unexpected reload simply restarts the mission
 * that was in progress (never the whole chapter).
 */

export type FlagValue = boolean | number | string;

export interface ChapterProgress {
  /** Mission in progress (or about to start). null when the chapter is finished. */
  currentMission: string | null;
  completedMissions: string[];
  flags: Record<string, FlagValue>;
  inventory: Record<string, number>;
  activeCharacter: string;
  completed: boolean;
  startedAt: number;
  updatedAt: number;
}

export interface SaveData {
  version: 1;
  chapters: Record<string, ChapterProgress>;
  /** Chapter ids the player may open on the story map. */
  unlocked: string[];
  updatedAt: number;
}

const KEY = 'bible-rpg.save.v1';

function fresh(): SaveData {
  return { version: 1, chapters: {}, unlocked: ['eden'], updatedAt: Date.now() };
}

function isValid(d: unknown): d is SaveData {
  if (!d || typeof d !== 'object') return false;
  const s = d as SaveData;
  return s.version === 1 && typeof s.chapters === 'object' && Array.isArray(s.unlocked);
}

class SaveStore {
  private data: SaveData;

  constructor() {
    const raw = storage.read<unknown>(KEY);
    if (raw === null) {
      this.data = fresh();
    } else if (isValid(raw)) {
      this.data = raw;
      if (!this.data.unlocked.includes('eden')) this.data.unlocked.unshift('eden');
    } else {
      // Keep the unreadable save aside instead of silently erasing it.
      storage.write(`${KEY}.unreadable-${Date.now()}`, raw);
      this.data = fresh();
    }
  }

  get(): Readonly<SaveData> {
    return this.data;
  }

  chapter(id: string): ChapterProgress | undefined {
    return this.data.chapters[id];
  }

  hasProgress(id: string): boolean {
    const c = this.data.chapters[id];
    return !!c && (c.completedMissions.length > 0 || c.completed);
  }

  isUnlocked(id: string): boolean {
    return this.data.unlocked.includes(id);
  }

  startChapter(id: string, firstMission: string, activeCharacter: string): ChapterProgress {
    const now = Date.now();
    const c: ChapterProgress = {
      currentMission: firstMission,
      completedMissions: [],
      flags: {},
      inventory: {},
      activeCharacter,
      completed: false,
      startedAt: now,
      updatedAt: now,
    };
    this.data.chapters[id] = c;
    this.persist();
    return c;
  }

  /** Commit the state reached at the end of a mission. */
  commitMission(chapterId: string, missionId: string, next: string | null, state: { flags: Record<string, FlagValue>; inventory: Record<string, number>; activeCharacter: string }): void {
    const c = this.data.chapters[chapterId];
    if (!c) return;
    if (!c.completedMissions.includes(missionId)) c.completedMissions.push(missionId);
    c.currentMission = next;
    c.flags = { ...state.flags };
    c.inventory = { ...state.inventory };
    c.activeCharacter = state.activeCharacter;
    c.updatedAt = Date.now();
    this.persist();
  }

  completeChapter(chapterId: string, unlock: string[]): void {
    const c = this.data.chapters[chapterId];
    if (c) {
      c.completed = true;
      c.currentMission = null;
      c.updatedAt = Date.now();
    }
    for (const u of unlock) if (!this.data.unlocked.includes(u)) this.data.unlocked.push(u);
    this.persist();
  }

  eraseChapter(id: string): void {
    delete this.data.chapters[id];
    this.persist();
  }

  private persist(): void {
    this.data.updatedAt = Date.now();
    storage.write(KEY, this.data);
  }
}

export const save = new SaveStore();
