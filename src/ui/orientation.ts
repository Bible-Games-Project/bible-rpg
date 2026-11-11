/**
 * The game is always played in landscape (the maintainer): on a phone or
 * tablet held upright the whole app is turned a quarter turn, so it reads
 * sideways and the player turns the device. Everything that measures the
 * screen asks here for the size the app really has.
 */

/** Held upright on a touch screen: the app is drawn turned. */
export function rotated(): boolean {
  const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return touch && window.innerHeight > window.innerWidth;
}

/** The app's width and height in CSS px (swapped while turned). */
export function viewSize(): { w: number; h: number } {
  return rotated() ? { w: window.innerHeight, h: window.innerWidth } : { w: window.innerWidth, h: window.innerHeight };
}

/** A pointer movement on the screen as a movement in the app. */
export function toApp(dx: number, dy: number): [number, number] {
  // turned a quarter clockwise: the app's right is the screen's down
  return rotated() ? [dy, -dx] : [dx, dy];
}

/** Sets the class and sizes the stylesheet uses for the turned app. */
export function applyOrientation(): void {
  const root = document.documentElement;
  const { w, h } = viewSize();
  root.classList.toggle('rotated', rotated());
  root.style.setProperty('--app-w', `${w}px`);
  root.style.setProperty('--app-h', `${h}px`);
  root.style.setProperty('--vw', `${w / 100}px`);
}

/** In full screen, ask the device to hold landscape (Android allows it; iOS ignores it). */
export function lockLandscape(): void {
  const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  void o?.lock?.('landscape')?.catch(() => undefined);
}

/**
 * Calls `fn` whenever the app's size may have changed: a resize, a turn of
 * the device, and also a change of pointer (touch ↔ mouse, which decides
 * `rotated`) or of pixel ratio, which come without a resize (the
 * maintainer, going from the phone view to the computer, got the game drawn
 * upright at the left until a reload).
 */
export function onViewChange(fn: () => void): void {
  window.addEventListener('resize', fn);
  window.addEventListener('orientationchange', () => window.setTimeout(fn, 150));
  window.matchMedia?.('(pointer: coarse)').addEventListener?.('change', fn);
  const watchRatio = () => {
    const mq = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    mq?.addEventListener?.('change', () => {
      fn();
      watchRatio();
    }, { once: true });
  };
  watchRatio();
}
