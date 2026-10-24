import { MANIFEST } from './manifest';

/**
 * Device pixels per CSS pixel the game draws at: the canvas has the
 * screen's real resolution (capped at 2 to keep it light), so sprites keep
 * their detail on high-density screens instead of being enlarged.
 */
export function pixelRatio(): number {
  return Math.min(2, Math.max(1, window.devicePixelRatio || 1));
}

/** Art pixels per world pixel of the sprites (see tools/art ART). */
export const ART_RESOLUTION = 1 / (MANIFEST.characters.adam?.leaves?.down?.scale ?? 1);
