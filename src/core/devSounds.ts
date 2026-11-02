import { SLOT, type SoundSlot } from '../data/soundSlots';
import { devMode } from './dev';
import { storage } from './storage';

/**
 * The maintainer's voice and sound library (src/ui/DevLibrary.ts) and the
 * sounds chosen there. Its data is loaded only when used:
 * public/assets/dev/library.json lists the voices (ElevenLabs Voice Library,
 * played from their own preview links) and the CC0 sound options by
 * category, whose recordings are packed into one file (sounds.mp3, built by
 * tools/audio/pack_dev_library.py: one file instead of a hundred keeps the
 * Claude artifact under its file limit).
 *
 * A sound chosen for a slot plays in the game at once, in that browser and
 * only in dev mode; to make it permanent, the maintainer sends the list from
 * the library and its files go into public/assets/sfx.
 */

export interface VoiceGroup {
  key: string;
  title: string;
  note: string;
  /** [voice id, name, description, preview url] */
  voices: [string, string, string, string][];
}

export interface CastMember {
  id: string;
  name: string;
  portrait: string | null;
  /** the voice the game uses now */
  voice: string;
}

export interface SoundCategory {
  title: string;
  note: string;
  /** [sound, name, description]: a path under public/ or a pack id */
  options: [string, string, string][];
}

export interface LibraryData {
  voiceGroups: VoiceGroup[];
  cast: CastMember[];
  categories: Record<string, SoundCategory>;
  pack: { file: string; items: Record<string, [number, number]> };
  /** voice previews packed with the Claude artifact's build (its page may not load other sites) */
  voicePacks?: { files: string[]; items: Record<string, [number, number, number]> };
}

const BASE = `${import.meta.env.BASE_URL}assets/dev/`;
const PICKS = 'bible-rpg.dev.sounds';

let library: Promise<LibraryData | null> | null = null;
/** dev mode, read once (it changes only with a reload: #dev / #nodev) */
let dev: boolean | null = null;
const packs = new Map<string, Promise<ArrayBuffer | null>>();
const listeners = new Set<(slot: string) => void>();

function getBytes(url: string): Promise<ArrayBuffer | null> {
  return fetch(url)
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .catch(() => null);
}

function pack(file: string): Promise<ArrayBuffer | null> {
  let p = packs.get(file);
  if (!p) {
    p = getBytes(BASE + file);
    packs.set(file, p);
    void p.then((b) => b ?? packs.delete(file));
  }
  return p;
}

export const devSounds = {
  library(): Promise<LibraryData | null> {
    if (!library) {
      library = fetch(`${BASE}library.json`)
        .then((r) => (r.ok ? (r.json() as Promise<LibraryData>) : null))
        .catch(() => null);
      void library.then((l) => {
        if (!l) library = null;
      });
    }
    return library;
  },

  /** The recording behind a sound (a copy: decoding consumes it). */
  async bytes(sound: string): Promise<ArrayBuffer | null> {
    if (sound.includes('/')) return getBytes(`${import.meta.env.BASE_URL}${sound}`);
    const lib = await this.library();
    const at = lib?.pack.items[sound];
    if (!lib || !at) return null;
    const all = await pack(lib.pack.file);
    return all ? all.slice(at[0], at[0] + at[1]) : null;
  },

  /** A voice's preview from the artifact's packs; null where there are none. */
  async voiceBytes(id: string): Promise<ArrayBuffer | null> {
    const lib = await this.library();
    const at = lib?.voicePacks?.items[id];
    if (!lib?.voicePacks || !at) return null;
    const all = await pack(lib.voicePacks.files[at[0]]);
    return all ? all.slice(at[1], at[1] + at[2]) : null;
  },

  /** The maintainer's choices: slot -> sound, or null for a slot emptied. */
  picks(): Record<string, string | null> {
    return storage.read<Record<string, string | null>>(PICKS) ?? {};
  },

  /** Put a sound in a slot (null empties it, undefined gives back its own). */
  choose(slot: string, sound: string | null | undefined): void {
    const p = this.picks();
    if (sound === undefined) delete p[slot];
    else p[slot] = sound;
    storage.write(PICKS, p);
    for (const f of listeners) f(slot);
  },

  /** What a slot plays: the maintainer's choice (in dev mode) or its own. */
  soundOf(slot: SoundSlot): string | null {
    dev ??= devMode();
    if (dev) {
      const p = this.picks();
      if (slot.id in p) return p[slot.id];
    }
    return slot.sound;
  },

  /** Whether the maintainer changed this slot. */
  changed(slot: string): boolean {
    const p = this.picks();
    return slot in p && p[slot] !== SLOT[slot]?.sound;
  },

  onChange(f: (slot: string) => void): void {
    listeners.add(f);
  },
};
