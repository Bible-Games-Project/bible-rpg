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
  adam: { nameKey: 'characters.adam', portrait: 'adam', sprite: 'adam', outfit: 'leaves', voice: 150, speed: 170 },
  eve: { nameKey: 'characters.eve', portrait: 'eve', sprite: 'eve', outfit: 'leaves', voice: 240, speed: 170 },
  god: { nameKey: 'characters.god', portrait: 'god', sprite: 'god', outfit: 'robe', voice: 110, speed: 110 },
  serpent: { nameKey: 'characters.serpent', portrait: 'serpent', voice: 320, speed: 90 },
  // Genesis 4: Adam's sons, drawn from his sprite in the tunic God made
  cain: { nameKey: 'characters.cain', portrait: 'cain', sprite: 'cain', outfit: 'tunic', voice: 135, speed: 140 },
  abel: { nameKey: 'characters.abel', portrait: 'abel', sprite: 'abel', outfit: 'tunic', voice: 175, speed: 170 },
  // Genesis 6–9: Noah, his house and the wicked of his day, drawn from Adam and Eve
  noah: { nameKey: 'characters.noah', portrait: 'noah-noah', voice: 125, speed: 140 },
  'noah-wife': { nameKey: 'characters.noah-wife', portrait: 'noah-noah-wife', voice: 220, speed: 150 },
  shem: { nameKey: 'characters.shem', portrait: 'noah-shem', voice: 150, speed: 165 },
  ham: { nameKey: 'characters.ham', portrait: 'noah-ham', voice: 160, speed: 165 },
  japheth: { nameKey: 'characters.japheth', portrait: 'noah-japheth', voice: 170, speed: 165 },
  'shem-wife': { nameKey: 'characters.shem-wife', portrait: 'noah-shem-wife', voice: 235, speed: 160 },
  'ham-wife': { nameKey: 'characters.ham-wife', portrait: 'noah-ham-wife', voice: 245, speed: 160 },
  'japheth-wife': { nameKey: 'characters.japheth-wife', portrait: 'noah-japheth-wife', voice: 255, speed: 160 },
  wicked: { nameKey: 'characters.wicked', portrait: 'noah-wicked', voice: 140, speed: 170 },
  'wicked-b': { nameKey: 'characters.wicked-b', portrait: 'noah-wicked-b', voice: 130, speed: 170 },
  'wicked-c': { nameKey: 'characters.wicked-c', portrait: 'noah-wicked-c', voice: 165, speed: 170 },
  'wicked-woman': { nameKey: 'characters.wicked-woman', portrait: 'noah-wicked-woman', voice: 250, speed: 170 },
  giant: { nameKey: 'characters.giant', portrait: 'noah-giant', voice: 90, speed: 130 },
  thief: { nameKey: 'characters.thief', portrait: 'noah-thief', voice: 175, speed: 180 },
  baker: { nameKey: 'characters.baker', portrait: 'noah-baker', voice: 125, speed: 155 },
  debtor: { nameKey: 'characters.debtor', portrait: 'noah-debtor', voice: 145, speed: 150 },
  farmer: { nameKey: 'characters.farmer', portrait: 'noah-farmer', voice: 120, speed: 155 },
  mocker: { nameKey: 'characters.mocker', portrait: 'noah-mocker', voice: 185, speed: 175 },
  narrator: { nameKey: 'characters.narrator', portrait: null, voice: 180, speed: 0 },
};

/** Characters the player can control. */
export type PlayableId = 'adam' | 'eve';
