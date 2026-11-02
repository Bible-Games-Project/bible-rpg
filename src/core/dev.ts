import { storage } from './storage';

/**
 * The maintainer's own tools (a Voices button on the main menu), hidden from
 * players: a browser shows them after the game has been opened once with
 * `#dev` at the end of its address, until it is opened with `#nodev`.
 */
const KEY = 'bible-rpg.dev';

/** The voice and sound library where the maintainer picks a voice for each
 * character and a sound for each effect (a private Claude artifact: it holds
 * tens of megabytes of samples that must not ship with the game). */
export const VOICE_LIBRARY = 'https://claude.ai/artifact/WVS4TqxoFaeaBFMqNF8bxZ';

export function devMode(): boolean {
  const hash = typeof location !== 'undefined' ? location.hash : '';
  if (hash === '#dev') storage.write(KEY, true);
  else if (hash === '#nodev') storage.remove(KEY);
  return storage.read<boolean>(KEY) === true;
}
