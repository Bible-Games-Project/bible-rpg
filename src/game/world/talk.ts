import { t } from '../../core/i18n';
import { CHARACTERS } from '../../data/characters';
import { ui } from '../bridge';
import type { Actor } from './Actor';

/** walking during a conversation: at half pace, never running (the maintainer) */
export const TALK_PACE = 0.5;
/** this far from the one they talk with, the conversation waits… */
const AWAY = 240;
/** …until they come this close again */
const BACK = 150;

/** Someone the player can talk with: an actor, or a figure like Adam sitting by the house. */
export interface Talker {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
}

/**
 * A conversation the player can walk in (the maintainer, 2026-11-10): the
 * lines go on by themselves and cannot be skipped; walking off too far
 * pauses it before the next line, the box says to come back and the
 * objective arrow points at the one they were talking with (`away`).
 * Whoever is speaking turns to look at a player who walks about. In
 * cutscenes the player is held instead (the scenes' `mayWalk`).
 */
export class Conversation {
  /** the one the player is talking with (the scene's `lines` sets it) */
  partner: Talker | null = null;
  /** the player walked away from them: the arrow points back */
  away: Talker | null = null;
  private moved = false;

  /** Every frame; `cast` gives the actor of a speaker's id. */
  update(player: Actor, cast: (id: string) => Actor | null): void {
    const d = ui().dialogue;
    const partner = d.open && this.partner?.visible ? this.partner : null;
    let away = false;
    if (partner) {
      const dist = Math.hypot(player.x - partner.x, player.y - partner.y);
      away = this.away ? dist > BACK : dist > AWAY;
    }
    if (away !== !!this.away) {
      this.away = away ? partner : null;
      d.setAway(away && partner ? t(CHARACTERS[partner.id]?.nameKey ?? partner.id) : null);
    }
    if (!d.open) {
      this.moved = false;
      return;
    }
    if (player.moving) this.moved = true;
    // the one speaking looks at a player who walks about (a staged look is kept until then)
    const npc = d.speaker ? cast(d.speaker) : null;
    if (!this.moved || !npc || npc === player || npc.scripted || npc.moving || !npc.visible) return;
    const dx = player.x - npc.x;
    const dy = player.y - npc.y;
    if (Math.hypot(dx, dy) < 4) return;
    const was = npc.facing;
    npc.faceVector(dx, dy);
    if (npc.facing !== was) npc.refresh(true);
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
