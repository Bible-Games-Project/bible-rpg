import { storage } from './storage';

/**
 * The maintainer's own tools on the main menu (the Voices button, opening the
 * voice and sound library in src/ui/DevLibrary.ts, and the "Game Dev Debug"
 * switch), hidden from players. They show in development: `bun run dev`, the
 * Cloudflare preview (*.pages.dev) and any browser that opened the game once
 * with `#dev` at the end of its address. `#nodev` hides them in that browser
 * (even on the preview) and `#dev` brings them back. The published app (the
 * Capacitor shell, on localhost) never shows them. Sounds chosen in the
 * library play in the game only while dev mode is on.
 */
const KEY = 'bible-rpg.dev';
const DEBUG_KEY = 'bible-rpg.dev.debug';

function previewHost(): boolean {
  return typeof location !== 'undefined' && location.hostname.endsWith('.pages.dev');
}

export function devMode(): boolean {
  const hash = typeof location !== 'undefined' ? location.hash : '';
  if (hash === '#dev') storage.write(KEY, true);
  else if (hash === '#nodev') storage.write(KEY, false);
  const saved = storage.read<boolean>(KEY);
  if (saved !== null) return saved === true;
  return import.meta.env.DEV || previewHost();
}

/** "Game Dev Debug": every playable chapter opens on the story map, unlocked
 * or not. Only while dev mode is on; the save itself is left untouched. */
export function debugUnlockAll(): boolean {
  return devMode() && storage.read<boolean>(DEBUG_KEY) === true;
}

export function setDebugUnlockAll(on: boolean): void {
  if (on) storage.write(DEBUG_KEY, true);
  else storage.remove(DEBUG_KEY);
}
