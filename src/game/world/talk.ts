import Phaser from 'phaser';
import { settings } from '../../core/settings';
import { ui } from '../bridge';
import { DEPTH_OVERLAY } from './Actor';
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
  /** where a narration in a cutscene is happening (whom it is about), for the arrow */
  spot: Talker | null = null;
  private moved = false;
  /** the small speech bubble over whoever is speaking (the maintainer: in every conversation) */
  private bubble: Phaser.GameObjects.Container | null = null;
  private dots: Phaser.GameObjects.Arc[] = [];

  /** Every frame; `cast` gives the actor of a speaker's id, `talkers` anyone
   * who can speak (an actor, or a figure like Adam sitting by the house). */
  update(player: Actor, cast: (id: string) => Actor | null, talkers: (id: string) => Talker | null = cast): void {
    const d = ui().dialogue;
    const partner = d.open && this.partner?.visible ? this.partner : null;
    const talker = d.open && d.speaker ? talkers(d.speaker) : null;
    this.showBubble(player.sprite.scene, talker?.visible ? talker : null);
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

  /** A small white bubble with three dots over the one speaking; none when no one is. */
  private showBubble(scene: Phaser.Scene, who: Talker | null): void {
    let b = this.bubble;
    if (!who) {
      b?.setVisible(false);
      return;
    }
    // a scene is used again for the next game: its old objects are gone
    if (!b || b.scene !== scene || !b.active) {
      const g = scene.add.graphics();
      g.fillStyle(0x2a2016, 0.35).fillRoundedRect(-12, -9, 26, 18, 7);
      g.fillStyle(0xfffdf6, 1).fillRoundedRect(-13, -10, 26, 17, 7);
      g.fillTriangle(-5, 6, 2, 6, -6, 12);
      g.lineStyle(1.5, 0x5a4630, 0.9).strokeRoundedRect(-13, -10, 26, 17, 7);
      this.dots = [-6, 0, 6].map((x) => scene.add.circle(x, -1.5, 2, 0x5a4630));
      b = this.bubble = scene.add.container(0, 0, [g, ...this.dots]).setDepth(DEPTH_OVERLAY - 5);
    }
    const [x, y] = Conversation.mark(who);
    const now = scene.time.now;
    const still = settings.get().reduceMotion;
    b.setVisible(true).setPosition(x + 10, y - 14 + (still ? 0 : Math.sin(now / 300) * 1.2));
    // the dots rise in turn, as someone talking
    this.dots.forEach((dot, i) => dot.setAlpha(still ? 0.8 : 0.35 + 0.65 * Math.max(0, Math.sin(now / 160 - i * 0.9))));
  }

  /**
   * Where the conversation showing is (the maintainer: walking off, an arrow
   * should point to it): whoever is speaking, unless it is the player, else
   * the one the player talks with. Null when no dialogue shows, or the
   * narrator alone speaks.
   */
  place(player: Actor, cast: (id: string) => Talker | null): Talker | null {
    const d = ui().dialogue;
    const spot = this.spot?.visible && this.spot !== player ? this.spot : null;
    if (!d.open) return d.narrating ? spot : null;
    const speaker = d.speaker ? cast(d.speaker) : null;
    if (speaker && speaker !== player && speaker.visible) return speaker;
    return this.partner?.visible && this.partner !== player ? this.partner : spot;
  }

  /** The point over a talker's head to point an arrow at. */
  static mark(t: Talker): [number, number] {
    const top = (t as Partial<Actor>).topY;
    return [t.x, typeof top === 'function' ? top.call(t) - 4 : t.y - 60];
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
