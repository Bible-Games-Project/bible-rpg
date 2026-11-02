import { storage } from './storage';

/**
 * The maintainer's own tools (the Voices button on the main menu, opening the
 * voice and sound library: src/ui/DevLibrary.ts), hidden from players: a
 * browser shows them after the game has been opened once with `#dev` at the
 * end of its address, until it is opened with `#nodev`. Sounds chosen there
 * play in the game only while dev mode is on.
 */
const KEY = 'bible-rpg.dev';

export function devMode(): boolean {
  const hash = typeof location !== 'undefined' ? location.hash : '';
  if (hash === '#dev') storage.write(KEY, true);
  else if (hash === '#nodev') storage.remove(KEY);
  return storage.read<boolean>(KEY) === true;
}
