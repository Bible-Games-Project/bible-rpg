/**
 * The game's recorded sounds as "slots" (the maintainer's word): each slot is
 * one moment of the game that plays a recording, with the recording it plays
 * by default. The maintainer's voice and sound library (src/ui/DevLibrary.ts)
 * lists, for the slot chosen, the options of its category and can put another
 * one in it (src/core/devSounds.ts).
 *
 * A sound is a path under public/ ("assets/sfx/hiss.mp3") or the id of an
 * option in the library's pack ("hiss-3", public/assets/dev/library.json).
 */

export type Surface = 'grass' | 'dirt' | 'water';
export const SURFACES: Surface[] = ['grass', 'dirt', 'water'];

/** Footstep slots per surface: walking picks one of the filled ones at random. */
export const STEP_SLOTS = 5;

export type SlotGroup = 'serpent' | 'cherubim' | 'water' | 'steps' | 'other' | 'cain';

export interface SoundSlot {
  id: string;
  group: SlotGroup;
  /** the library category whose options fit this slot */
  category: string;
  /** what plays until the maintainer chooses another (null: nothing, or the synthesized sound) */
  sound: string | null;
  /** level next to the synthesized sounds */
  gain: number;
  surface?: Surface;
}

const sfx = (f: string) => `assets/sfx/${f}.mp3`;

function steps(surface: Surface, defaults: (string | null)[]): SoundSlot[] {
  const cat = `step-${surface}`;
  return Array.from({ length: STEP_SLOTS }, (_, i) => ({ id: `${cat}-${i + 1}`, group: 'steps' as const, category: cat, sound: defaults[i] ?? null, gain: 0.2, surface }));
}

export const SOUND_SLOTS: SoundSlot[] = [
  // the serpent makes two sounds only (the maintainer): a hiss just before it
  // speaks to the woman (Genesis 3:1), and its crawl, coming and going
  { id: 'hiss', group: 'serpent', category: 'serpent', sound: sfx('serpent-hiss'), gain: 0.6 },
  { id: 'slither', group: 'serpent', category: 'serpent', sound: sfx('serpent-crawl'), gain: 0.5 },
  // thunder that rolls away (cut at 4 s it stopped dead)
  { id: 'land', group: 'cherubim', category: 'land', sound: sfx('cherubim-land'), gain: 0.85 },
  // the river's murmur near the water, looped (synthesized without one)
  { id: 'river', group: 'water', category: 'river', sound: sfx('river'), gain: 1 },
  { id: 'fill', group: 'water', category: 'water', sound: sfx('fill'), gain: 0.5 },
  { id: 'pour', group: 'water', category: 'water', sound: sfx('pour'), gain: 0.5 },
  ...steps('grass', [1, 2, 3, 4, 5].map((i) => sfx(`step-${i}`))),
  ...steps('dirt', [1, 2].map((i) => sfx(`step-dirt-${i}`))),
  ...steps('water', [1, 2, 3].map((i) => sfx(`step-water-${i}`))),
  { id: 'bite', group: 'other', category: 'other', sound: sfx('bite'), gain: 0.55 },
  { id: 'seed', group: 'other', category: 'other', sound: sfx('seed'), gain: 0.5 },
  { id: 'leafPick', group: 'other', category: 'other', sound: sfx('leaf-pick'), gain: 0.45 },
  { id: 'leaves', group: 'other', category: 'other', sound: sfx('sew-leaves'), gain: 0.5 },
  { id: 'drop', group: 'other', category: 'other', sound: sfx('drop'), gain: 0.45 },
  // Cain and Abel: synthesised (free) until the maintainer chooses recordings
  ...(['cut', 'hit', 'swing', 'whistle', 'bark', 'flame'] as const).map((id) => ({ id, group: 'cain' as const, category: `cain-${id}`, sound: null, gain: 0.5 })),
  // recordings only (ElevenLabs, tools/audio/build_cain_sfx.mjs): Abel's cry when struck, and the burial heard over black
  ...(['hurt', 'dig', 'drag', 'stones'] as const).map((id) => ({ id, group: 'cain' as const, category: `cain-${id}`, sound: `assets/sfx/cain/${id}-1.mp3`, gain: id === 'hurt' ? 0.55 : 0.5 })),
];

export const SLOT = Object.fromEntries(SOUND_SLOTS.map((s) => [s.id, s])) as Record<string, SoundSlot>;
