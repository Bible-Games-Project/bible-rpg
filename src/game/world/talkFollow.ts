import { CHARACTERS } from '../../data/characters';
import type { Actor } from './Actor';

/** a talking NPC sets off after the player beyond this distance… */
const LEAVE = 110;
/** …and stops again this close */
const NEAR = 70;

/**
 * Whoever is talking to the player follows them as they walk off (the
 * maintainer, 2026-11-09: players can move during dialogues, and the one
 * speaking walks after them, never running, looking at them). The scene
 * calls `update` every frame with the actor of the line being said (null
 * when no one is talking, or the speaker is not in the scene).
 */
export class TalkFollow {
  /** the NPC this is walking now (the scene leaves it alone meanwhile) */
  walker: Actor | null = null;
  /** the speaker the player has walked away from: only then do they follow and look at the player (a staged place and look are kept until then) */
  private engaged: Actor | null = null;

  update(npc: Actor | null, player: Actor): void {
    if (this.walker && (this.walker !== npc || this.walker.scripted)) {
      if (!this.walker.scripted) this.walker.stop();
      this.walker = null;
    }
    if (this.engaged !== npc) this.engaged = null;
    if (!npc || npc === player || npc.scripted || !npc.visible) return;
    if (player.moving) this.engaged = npc;
    const dx = player.x - npc.x;
    const dy = player.y - npc.y;
    const d = Math.hypot(dx, dy);
    if (this.engaged === npc && d > (this.walker ? NEAR : LEAVE)) {
      // their walking pace, a little slower when nearly there
      const speed = (CHARACTERS[npc.id]?.speed ?? 140) * (d < LEAVE ? 0.75 : 1);
      npc.move((dx / d) * speed, (dy / d) * speed);
      this.walker = npc;
      return;
    }
    if (this.walker) {
      npc.stop();
      this.walker = null;
    }
    // standing, they keep looking at the player
    if (this.engaged === npc && d > 4) {
      const was = npc.facing;
      npc.faceVector(dx, dy);
      if (npc.facing !== was) npc.refresh(true);
    }
  }
}
