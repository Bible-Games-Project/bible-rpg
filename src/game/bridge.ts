import type { DialogueBox } from '../ui/DialogueBox';
import type { HUD } from '../ui/HUD';

/** Connection between the Phaser world and the DOM interface. */
export interface UiBridge {
  hud: HUD;
  dialogue: DialogueBox;
  openPause(): void;
  /** Title card shown when a chapter starts; resolves when dismissed. */
  chapterIntro(): Promise<void>;
  chapterComplete(): void;
  exitToMenu(): void;
}

let bridge: UiBridge | null = null;

export function setUiBridge(b: UiBridge): void {
  bridge = b;
}

export function ui(): UiBridge {
  if (!bridge) throw new Error('UI bridge not set');
  return bridge;
}
