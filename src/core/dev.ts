import { storage } from './storage';

/**
 * The maintainer's own tools (a Voices screen on the main menu), hidden from
 * players: a browser shows them after the game has been opened once with
 * `#dev` at the end of its address, until it is opened with `#nodev`.
 */
const KEY = 'bible-rpg.dev';

export function devMode(): boolean {
  const hash = typeof location !== 'undefined' ? location.hash : '';
  if (hash === '#dev') storage.write(KEY, true);
  else if (hash === '#nodev') storage.remove(KEY);
  return storage.read<boolean>(KEY) === true;
}
