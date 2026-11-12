import { ui } from '../bridge';
import type { Actor } from './Actor';

/** Someone the player can talk with: an actor, or a figure like Adam sitting by the house. */
export interface Talker {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
}

/**
 * A conversation the player can walk in (the maintainer, 2026-11-10): the
 * lines go on by themselves and cannot be skipped, wherever the player
 * walks (no pause when they walk off: the maintainer, 2026-11-12).
 * Whoever is speaking, and the one they talk with, turn to look at a
 * player who walks about. In
 * cutscenes the player is held instead (the scenes' `mayWalk`).
 */
export class Conversation {
  /** the one the player is talking with (the scene's `lines` sets it) */
  partner: Talker | null = null;
  private moved = false;

  /** Every frame; `cast` gives the actor of a speaker's id. */
  update(player: Actor, cast: (id: string) => Actor | null): void {
    const d = ui().dialogue;
    const partner = d.open && this.partner?.visible ? this.partner : null;
    if (!d.open) {
      this.moved = false;
      return;
    }
    if (player.moving) this.moved = true;
    // the one speaking, and the one they talk with, look at a player who
    // walks about (a staged look is kept until then): God speaking to Adam
    // turns to follow him (the maintainer)
    if (!this.moved) return;
    const speaker = d.speaker ? cast(d.speaker) : null;
    const listener = partner ? cast(partner.id) : null;
    for (const npc of [speaker, listener === speaker ? null : listener]) {
      if (!npc || npc === player || npc.scripted || npc.moving || !npc.visible) continue;
      const dx = player.x - npc.x;
      const dy = player.y - npc.y;
      if (Math.hypot(dx, dy) < 4) continue;
      const was = npc.facing;
      npc.faceVector(dx, dy);
      if (npc.facing !== was) npc.refresh(true);
    }
  }

  /** The one the player talks with in these lines: the first speaker in the scene other than the player. */
  static partnerOf(speakers: string[], player: Actor, cast: (id: string) => Talker | null): Talker | null {
    for (const id of speakers) {
      const a = cast(id);
      if (a && a !== player && a.visible) return a;
    }
    return null;
  }
}
