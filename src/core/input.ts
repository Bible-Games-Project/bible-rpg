/**
 * Action-based input shared by keyboard and touch controls.
 *
 * Gameplay code never reads keys directly: it asks for actions. Whoever is on
 * top of the handler stack (the world, a dialogue, a puzzle, a menu) receives
 * the pressed actions, so movement can never leak into dialogue or menus.
 */

export type Action = 'up' | 'down' | 'left' | 'right' | 'interact' | 'cancel' | 'pause' | 'switch';

const KEYMAP: Record<string, Action> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  KeyE: 'interact',
  Enter: 'interact',
  NumpadEnter: 'interact',
  Space: 'interact',
  Escape: 'pause',
  KeyP: 'pause',
  Backspace: 'cancel',
  Tab: 'switch',
  KeyQ: 'switch',
};

/** Keys shown to the player in prompts. */
export const KEY_LABELS: Record<Action, string> = {
  up: 'W',
  down: 'S',
  left: 'A',
  right: 'D',
  interact: 'E',
  cancel: 'Backspace',
  pause: 'Esc',
  switch: 'Tab',
};

export interface InputLayer {
  /** Return true when the action was consumed. */
  onAction(action: Action): boolean;
  /** When true, layers below never receive anything (modal). */
  modal?: boolean;
  /** When false the world must not move the player while this layer is on top. */
  allowMovement?: boolean;
  /** Receive keys even while a DOM button has focus (e.g. dialogue advance). */
  captureKeys?: boolean;
}

class InputManager {
  private down = new Set<Action>();
  private layers: InputLayer[] = [];
  private virtual = { x: 0, y: 0 };
  lastDevice: 'keyboard' | 'touch' = 'keyboard';

  constructor() {
    window.addEventListener('keydown', (e) => this.handleKey(e, true));
    window.addEventListener('keyup', (e) => this.handleKey(e, false));
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('touchstart', () => (this.lastDevice = 'touch'), { passive: true });
  }

  private isTyping(e: KeyboardEvent): boolean {
    const el = e.target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  private handleKey(e: KeyboardEvent, pressed: boolean): void {
    const action = KEYMAP[e.code];
    if (!action) return;
    this.lastDevice = 'keyboard';
    const focusedButton = (e.target as HTMLElement | null)?.closest?.('button, [role="button"], input, select, a');
    // Let focused UI controls (buttons, sliders) handle Enter/Space/arrows natively.
    if (this.isTyping(e) || (focusedButton && action !== 'pause' && !this.topWantsKeys())) {
      if (!pressed) this.down.delete(action);
      return;
    }
    if (['up', 'down', 'left', 'right', 'switch', 'interact'].includes(action)) e.preventDefault();
    if (pressed) {
      if (e.repeat && !['up', 'down', 'left', 'right'].includes(action)) return;
      const wasDown = this.down.has(action);
      this.down.add(action);
      if (!wasDown) this.dispatch(action);
    } else {
      this.down.delete(action);
    }
  }

  private topWantsKeys(): boolean {
    return this.layers[this.layers.length - 1]?.captureKeys === true;
  }

  dispatch(action: Action): void {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i];
      if (layer.onAction(action)) return;
      if (layer.modal) return;
    }
  }

  push(layer: InputLayer): () => void {
    this.layers.push(layer);
    return () => this.remove(layer);
  }

  remove(layer: InputLayer): void {
    const i = this.layers.indexOf(layer);
    if (i >= 0) this.layers.splice(i, 1);
  }

  /** Movement is only allowed when every layer above the world allows it. */
  movementAllowed(world: InputLayer): boolean {
    const i = this.layers.indexOf(world);
    if (i < 0) return false;
    for (let k = i + 1; k < this.layers.length; k++) if (this.layers[k].allowMovement !== true) return false;
    return true;
  }

  isDown(a: Action): boolean {
    return this.down.has(a);
  }

  /** Normalised movement vector from keys or the virtual stick. */
  moveVector(): { x: number; y: number } {
    let x = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    let y = (this.isDown('down') ? 1 : 0) - (this.isDown('up') ? 1 : 0);
    if (x === 0 && y === 0) {
      x = this.virtual.x;
      y = this.virtual.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  setVirtualMove(x: number, y: number): void {
    this.virtual.x = x;
    this.virtual.y = y;
    if (x || y) this.lastDevice = 'touch';
  }

  releaseAll(): void {
    this.down.clear();
    this.virtual.x = 0;
    this.virtual.y = 0;
  }
}

export const input = new InputManager();
