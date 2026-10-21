import Phaser from 'phaser';
import { ANIMALS, type AnimalDef } from '../../data/animals';
import { MANIFEST } from '../manifest';
import { Actor } from './Actor';
import type { Terrain } from './Terrain';

interface Brain {
  def: AnimalDef;
  actor: Actor;
  target: { x: number; y: number } | null;
  until: number;
  flying: number;     // seconds left in the air (doves)
  frozen: boolean;    // held in place by a scene (e.g. while being named)
}

/** Animals wander slowly around their home; doves sometimes fly. */
export class Animals {
  readonly brains: Brain[] = [];

  constructor(scene: Phaser.Scene, private terrain: Terrain) {
    for (const def of ANIMALS) {
      const sheet = `animal-${def.species}`;
      const a = MANIFEST.sprites[sheet];
      if (!a) continue;
      const big = a.frameWidth > 80;
      const actor = new Actor(scene, {
        id: def.id,
        x: def.home[0],
        y: def.home[1],
        sheet,
        body: { w: Math.round(a.frameWidth * 0.5), h: big ? 12 : 8 },
        solid: def.solid,
        shadow: big ? 'shadow-medium' : 'shadow-small',
        facing: Math.random() < 0.5 ? 'left' : 'right',
      });
      if (actor.shadow && a.frameWidth > 120) actor.shadow.setScale(1.6, 1.2);
      this.brains.push({ def, actor, target: null, until: scene.time.now + Math.random() * 3000, flying: 0, frozen: false });
    }
  }

  get(id: string): Actor | undefined {
    return this.brains.find((b) => b.def.id === id)?.actor;
  }

  freeze(id: string, on: boolean): void {
    const b = this.brains.find((x) => x.def.id === id);
    if (b) {
      b.frozen = on;
      b.target = null;
      b.actor.stop();
    }
  }

  update(time: number, dt: number): void {
    for (const b of this.brains) {
      const a = b.actor;
      if (b.frozen || a.scripted) {
        a.refresh();
        continue;
      }
      if (b.def.flies) {
        if (b.flying > 0) {
          b.flying -= dt;
          a.lift = Math.min(40, a.lift + dt * 60);
        } else if (a.lift > 0) {
          a.lift = Math.max(0, a.lift - dt * 50);
        }
      }
      if (!b.target && time > b.until) {
        const ang = Math.random() * Math.PI * 2;
        const d = Math.random() * b.def.wander;
        const tx = b.def.home[0] + Math.cos(ang) * d;
        const ty = b.def.home[1] + Math.sin(ang) * d;
        if (!this.terrain.isWaterAt(tx, ty)) {
          b.target = { x: tx, y: ty };
          b.until = time + 7000;
          if (b.def.flies && Math.random() < 0.35) b.flying = 1.6;
        } else {
          b.until = time + 1000;
        }
      }
      if (b.target) {
        const dx = b.target.x - a.x;
        const dy = b.target.y - a.y;
        const dist = Math.hypot(dx, dy);
        const speed = b.def.speed * (b.flying > 0 ? 2.2 : 1);
        if (dist < 6 || time > b.until) {
          b.target = null;
          a.stop();
          b.until = time + 2500 + Math.random() * 5000;
        } else {
          a.move((dx / dist) * speed, (dy / dist) * speed * 0.8);
          // animals are drawn from the side: keep a horizontal facing
          if (a.facing === 'up' || a.facing === 'down') a.facing = dx < 0 ? 'left' : 'right';
        }
      }
      a.refresh();
    }
  }
}
