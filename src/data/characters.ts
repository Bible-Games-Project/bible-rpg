/**
 * Characters that can speak or appear in the world. `voice` is the pitch
 * of the soft text blip while their lines are revealed.
 */
export interface CharacterDef {
  nameKey: string;
  portrait: string | null;
  /** Sprite set in the asset manifest (characters.<sprite>.<outfit>.<dir>). */
  sprite?: string;
  outfit?: string;
  voice: number;
  speed: number;
}

export const CHARACTERS: Record<string, CharacterDef> = {
  adam: { nameKey: 'characters.adam', portrait: 'adam', sprite: 'adam', outfit: 'leaves', voice: 150, speed: 210 },
  eve: { nameKey: 'characters.eve', portrait: 'eve', sprite: 'eve', outfit: 'leaves', voice: 240, speed: 210 },
  god: { nameKey: 'characters.god', portrait: 'god', sprite: 'god', outfit: 'robe', voice: 110, speed: 110 },
  serpent: { nameKey: 'characters.serpent', portrait: 'serpent', voice: 320, speed: 90 },
  narrator: { nameKey: 'characters.narrator', portrait: null, voice: 180, speed: 0 },
};

/** Characters the player can control. */
export type PlayableId = 'adam' | 'eve';
