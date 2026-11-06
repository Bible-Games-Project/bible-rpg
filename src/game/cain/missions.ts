import { audio } from '../../core/audio';
import { t } from '../../core/i18n';
import { save } from '../../core/save';
import { CAIN_MISSION_IDS } from '../../data/cain/missionOrder';
import { LAMBS, POINTS } from '../../data/cain/map';
import type { Pt } from '../../data/eden/map';
import type { InteractSpec } from '../WorldApi';
import { ui } from '../bridge';
import type { Brother, CainScene } from './CainScene';
import GEN from '../../data/cain/generatedArt.json';

/*
 * The five missions of Cain and Abel (Genesis 4).
 *
 * Scripture cards quote the King James Version word for word; character
 * lines are short plain-language paraphrases with their reference. What
 * Genesis does not tell in detail (God asking for the offering, gathering
 * the produce, the jawbone, the chase) is gameplay and is marked
 * "inspired" in the HUD.
 */

export const CHAPTER = 'cain-abel';

const step = (m: string, s: string, p?: Record<string, string | number>) => t(`cain.missions.${m}.steps.${s}`, p);
const C = (key: string, p?: Record<string, string | number>) => t(`cain.${key}`, p);

// held at the foot of the stick (the crook curls to one side)
/** the fat resting in the hand, the fist under it */
const FAT_GRIP: [number, number] = [0.5, 0.95];
const STAFF: [string, 'staff', [number, number]] = ['cain-staff', 'staff', [(GEN.staff.ax + 0.5) / GEN.staff.w, (GEN.staff.ay - 0.5) / GEN.staff.h]];
const LAMBS_TO_OFFER = 3;

interface CainMission {
  id: string;
  key: string;
  number: number;
  kind: 'scripture' | 'inspired';
  reference: string;
  /** who is played */
  active: Brother;
  /** begins with a cutscene that shows the world itself: it is left dark,
   * with no moment of control before it (the maintainer) */
  opensInDark?: boolean;
  /** told over black before the world fades in, the first time */
  intro?(w: CainScene): Promise<void>;
  run(w: CainScene): Promise<void>;
}

function useOnce(w: CainScene, spec: Omit<InteractSpec, 'onUse'> & { onUse?: () => void | Promise<void> }): Promise<void> {
  return new Promise((resolve) => {
    const off = w.interact({
      ...spec,
      onUse: async () => {
        off();
        await spec.onUse?.();
        resolve();
      },
    });
  });
}

/**
 * The world as it is when a mission starts, so a saved game can resume at
 * any of them. `place` also puts everyone where the mission begins.
 */
function stage(w: CainScene, n: number, place: boolean): void {
  const active = MISSIONS[n - 1].active;
  w.world.produce.forEach((_, i) => w.setPicked(i, n >= 2));
  w.setAltars({ cain: n >= 2, abel: n >= 3, fire: n >= 4 ? 'embers' : 'none' });
  LAMBS.forEach((_, i) => w.setLamb(i, n < 3 || i >= LAMBS_TO_OFFER));
  w.penFlock(n >= 3);
  w.showJawbone(n <= 4);
  w.showGrave(n >= 5);
  w.flag('offered', n >= 4);
  w.npcs(true);
  w.follow(false);
  w.hide(w.god);
  w.abel.hold(n >= 2 && n <= 4 ? STAFF[0] : null, STAFF[1], STAFF[2]);
  w.cain.hold(null);
  w.setActive(active);
  if (!place) return;
  const at = (a: 'cain' | 'abel', p: Pt, f: 'left' | 'right' | 'up' | 'down') => w.show(w.brother(a), p, f);
  if (n === 1) {
    at('cain', POINTS.start, 'right');
    at('abel', POINTS.abelStart, 'right');
  } else if (n === 2) {
    at('abel', [1460, 1420], 'up');
    at('cain', [2150, 2010], 'up');
  } else if (n === 3) {
    at('cain', POINTS.cainAltar, 'up');
    at('abel', POINTS.abelAltar, 'up');
  } else if (n === 4) {
    at('cain', [2170, 2060], 'right');
    at('abel', [2320, 2060], 'left');
  } else {
    at('cain', [POINTS.grave[0] - 85, POINTS.grave[1] - 20], 'right');
    w.hide(w.abel);
  }
  w.cameraSnap();
}

const MISSIONS: CainMission[] = [
  // 1 — the offering asked for; Cain gathers the fruit of the ground
  {
    id: 'cain.m01',
    key: 'm01',
    number: 1,
    kind: 'inspired',
    reference: 'Genesis 4:2–3',
    active: 'cain',
    async intro(w) {
      w.music('wonder');
      await w.scripture('keeper');
    },
    async run(w) {
      w.cutscene(true);
      await w.wait(400);
      await w.appear(w.god, POINTS.godStart, 'left', { beam: true });
      w.cain.face(w.god);
      w.abel.face(w.god);
      await w.say('command');
      await w.vanish(w.god);
      w.music('peaceful');
      // Abel goes up to his flock
      void w.walk(w.abel, [[640, 2240], [1100, 1900], POINTS.abelLeave]).then(() => w.hide(w.abel));
      w.cutscene(false);
      const total = w.world.produce.length;
      const left = () => w.world.produce.filter((p) => !p.picked);
      const update = () => w.objective(step('m01', 'gather', { n: total - left().length, total }), () => left().map((p) => p.at), { markAll: true });
      update();
      await new Promise<void>((resolve) => {
        w.world.produce.forEach((p, i) =>
          w.interact({
            id: `produce${i}`,
            at: p.at,
            radius: 72,
            prompt: () => t(p.kind === 'fruit' ? 'prompt.pick' : 'prompt.gather'),
            enabled: () => !p.picked,
            onUse: () => {
              w.sfx(p.kind === 'fruit' ? 'leafPick' : p.kind === 'grain' ? 'rustle' : 'pickup');
              w.setPicked(i, true);
              w.give('produce');
              update();
              if (!left().length) resolve();
            },
          }),
        );
      });
      w.clearInteractions();
      w.toast(C('toasts.basket'));
      w.cain.hold('basket-full', 'carry');
      w.objective(step('m01', 'altar'), POINTS.cainAltar);
      await useOnce(w, {
        id: 'altar',
        at: [POINTS.altarCain[0], POINTS.altarCain[1] - 20],
        radius: 80,
        prompt: () => C('prompts.offer'),
        onUse: async () => {
          w.cain.hold(null);
          w.take('produce', total);
          w.sfx('drop');
          w.setAltars({ cain: true, abel: false });
          await w.wait(700);
        },
      });
    },
  },

  // 2 — Abel offers the firstlings of his flock and the fat of them
  {
    id: 'cain.m02',
    key: 'm02',
    number: 2,
    kind: 'inspired',
    reference: 'Genesis 4:4',
    active: 'abel',
    async run(w) {
      w.cameraSnap();
      // told while Abel can already walk (the maintainer)
      await w.scripture('firstlings');
      // the flock is out in the meadow: Abel and his dog bring it into the
      // fold (the maintainer), and there he offers the firstlings
      w.objective(step('m02', 'flock'), () => [w.flockCentre()]);
      await w.until(() => Math.hypot(w.abel.x - w.flockCentre()[0], w.abel.y - w.flockCentre()[1]) < 300);
      await w.say('herd');
      // Abel whistles, and from then the player is the dog (the maintainer)
      audio.play('whistle');
      w.driveDog(true);
      w.toast(C('hints.herd'));
      const count = () => {
        const c = w.pennedCount();
        w.objective(step('m02', 'fold', c), POINTS.foldGate);
      };
      count();
      await w.herdIntoFold(count);
      w.driveDog(false);
      w.objective('');
      await w.wait(500);
      await w.say('penned');
      let offered = 0;
      let fat = 0;
      const lambs = () => w.lambs.slice(0, LAMBS.length).filter((l) => l.actor.visible && !l.frozen).map((l) => l.actor);
      const fats: { at: Pt; img: Phaser.GameObjects.Image; taken: boolean }[] = [];
      const update = () => {
        if (offered < LAMBS_TO_OFFER) w.objective(step('m02', 'lambs', { n: offered, total: LAMBS_TO_OFFER }), () => lambs(), { markAll: true });
        else w.objective(step('m02', 'fat', { n: fat, total: LAMBS_TO_OFFER }), () => fats.filter((f) => !f.taken).map((f) => f.at), { markAll: true });
      };
      update();
      await new Promise<void>((resolve) => {
        w.lambs.forEach((l, i) =>
          w.interact({
            id: `lamb${i}`,
            at: () => [l.actor.x, l.actor.y - 16],
            radius: 66,
            prompt: () => C('prompts.lamb'),
            enabled: () => offered < LAMBS_TO_OFFER && l.actor.visible && !l.frozen,
            onUse: async () => {
              offered++;
              const at = await w.offerLamb(i);
              const f = { at, img: w.dropFat(at), taken: false };
              fats.push(f);
              w.interact({
                id: `fat${i}`,
                at: [at[0], at[1] - 10],
                radius: 60,
                prompt: () => t('prompt.pickUp', { name: C('items.fat') }),
                enabled: () => !f.taken,
                onUse: () => {
                  f.taken = true;
                  f.img.destroy();
                  w.sfx('pickup');
                  fat++;
                  w.give('fat');
                  // carried in his hand to the altar (the maintainer); the staff is set aside
                  w.abel.hold('cain-fat', 'hand', FAT_GRIP);
                  update();
                  if (fat >= LAMBS_TO_OFFER) resolve();
                },
              });
              update();
            },
          }),
        );
      });
      w.clearInteractions();
      w.objective(step('m02', 'altar'), POINTS.abelAltar);
      await useOnce(w, {
        id: 'altar',
        at: [POINTS.altarAbel[0], POINTS.altarAbel[1] - 20],
        radius: 80,
        prompt: () => C('prompts.offer'),
        onUse: async () => {
          w.take('fat', LAMBS_TO_OFFER);
          w.abel.hold(...STAFF);
          w.sfx('drop');
          w.setAltars({ cain: true, abel: true });
          await w.wait(700);
        },
      });
      // straight on to the LORD's answer (mission 3): no walking about in between
      w.cutscene(true);
    },
  },

  // 3 — the LORD has respect to Abel's offering; Cain is very wroth
  {
    id: 'cain.m03',
    key: 'm03',
    number: 3,
    kind: 'scripture',
    reference: 'Genesis 4:4–7',
    active: 'cain',
    opensInDark: true,
    async run(w) {
      w.show(w.cain, POINTS.cainAltar, 'up');
      w.show(w.abel, POINTS.abelAltar, 'up');
      w.abel.hold(...STAFF);
      w.cameraSnap();
      await w.cameraTo([POINTS.godAltars[0], POINTS.godAltars[1] + 80], 1);
      await w.fade(0, 900);
      w.music('solemn');
      await w.appear(w.god, POINTS.godAltars, 'down', { beam: true });
      await w.wait(500);
      w.sfx('flame');
      w.kindleAltar();
      await w.wait(1400);
      await w.scripture('respect');
      w.cain.emote('anger', 2600);
      w.sfx('wrong');
      await w.wait(900);
      w.cain.face('down');
      await w.scripture('wroth');
      await w.say('rebuke');
      await w.vanish(w.god);
      w.flag('offered', true);
      w.cameraFollow();
      w.cutscene(false);
    },
  },

  // 4 — in the field
  {
    id: 'cain.m04',
    key: 'm04',
    number: 4,
    kind: 'scripture',
    reference: 'Genesis 4:8',
    active: 'cain',
    async run(w) {
      w.cutscene(true);
      w.music('tension');
      w.cain.face(w.abel);
      w.abel.face(w.cain);
      await w.say('field');
      w.cutscene(false);
      w.follow(true);
      w.objective(step('m04', 'field'), POINTS.fieldGate);
      await w.waitZone('fieldGate');
      w.objective(step('m04', 'jawbone'), POINTS.jawbone);
      await useOnce(w, {
        id: 'jawbone',
        at: [POINTS.jawbone[0], POINTS.jawbone[1] - 8],
        radius: 64,
        prompt: () => t('prompt.pickUp', { name: C('items.jawbone') }),
        onUse: () => {
          w.showJawbone(false);
          w.sfx('pickup');
          w.give('jawbone');
          w.cain.hold('cain-jawbone', 'hand', [0.2, 0.5]);
        },
      });
      w.follow(false);
      w.npcs(false);
      w.cutscene(true);
      w.abel.face(w.cain);
      await w.say('fear');
      w.cutscene(false);
      w.objective(step('m04', 'chase'), () => [w.abel]);
      await w.chase();
      w.objective('', null);
      w.music('none');
      await w.wait(400);
      await w.fade(1, 1200);
      w.buryAbel();
      w.show(w.cain, [POINTS.grave[0] - 85, POINTS.grave[1] - 20], 'right');
      w.cameraSnap();
      w.cain.hold(null);
      w.take('jawbone');
      await w.scripture('slew');
      w.music('sorrow');
      await w.fade(0, 1400);
      await w.wait(600);
      w.cutscene(false);
    },
  },

  // 5 — "Where is Abel thy brother?"
  {
    id: 'cain.m05',
    key: 'm05',
    number: 5,
    kind: 'scripture',
    reference: 'Genesis 4:9–16',
    active: 'cain',
    async run(w) {
      w.cutscene(true);
      w.music('solemn');
      await w.appear(w.god, POINTS.godField, 'left');
      w.cain.face(w.god);
      await w.say('where');
      await w.scripture('mark');
      w.fx('sparkle', [w.cain.x, w.cain.y - 40]);
      w.sfx('holy');
      await w.wait(700);
      await w.vanish(w.god);
      w.music('sorrow');
      w.cutscene(false);
      w.npcs(false);
      w.objective(step('m05', 'east'), POINTS.nod);
      await w.waitZone('nod');
      w.cutscene(true);
      await w.fade(1, 1400);
      await w.scripture('nod');
    },
  },
];

/** Thrown into a mission script when the scene is left mid-mission. */
class MissionStopped extends Error {}

/**
 * Runs the chapter's missions in order and commits progress after each
 * one; a reload resumes at the start of the mission that was in progress.
 */
export class CainRunner {
  private stopped = false;
  private readonly w: CainScene;

  constructor(private scene: CainScene, private mode: 'continue' | 'new' | 'restart') {
    this.w = new Proxy(scene, {
      get: (target, prop, receiver) => {
        const v = Reflect.get(target, prop, receiver);
        if (typeof v !== 'function') return v;
        return (...args: unknown[]) => {
          if (this.stopped) throw new MissionStopped();
          return (v as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
  }

  stop(): void {
    this.stopped = true;
  }

  async start(): Promise<void> {
    if (MISSIONS.map((m) => m.id).join() !== CAIN_MISSION_IDS.join()) console.warn('[missions] order mismatch');
    let progress = save.chapter(CHAPTER);
    const fresh = this.mode === 'new' || !progress || progress.completed || !progress.currentMission;
    if (fresh || !progress) progress = save.startChapter(CHAPTER, MISSIONS[0].id, 'cain');
    const first = Math.max(0, MISSIONS.findIndex((m) => m.id === progress!.currentMission));
    this.scene.setState(progress.flags, progress.inventory);
    const hud = ui().hud;
    hud.show(true);
    void hud.fade(1, 0);
    try {
      for (let i = first; i < MISSIONS.length; i++) {
        if (this.stopped) return;
        // a restarted first mission plays as at the chapter's start (without its title card)
        const opening = i === 0 && (fresh || this.mode === 'restart');
        await this.runMission(MISSIONS[i], i === first && !opening, opening);
      }
    } catch (e) {
      if (e instanceof MissionStopped) return;
      throw e;
    }
  }

  private async runMission(m: CainMission, fromSave: boolean, chapterStart: boolean): Promise<void> {
    const w = this.w;
    const hud = ui().hud;
    w.clearInteractions();
    w.objective('', null);
    // the turn passes to the other brother: the world is set again behind black
    const relocate = !fromSave && m.number > 1 && m.active !== MISSIONS[m.number - 2].active;
    if (relocate) await w.fade(1, 600);
    stage(w, m.number, fromSave || relocate);
    hud.setMission({ number: m.number, title: t(`cain.missions.${m.key}.title`), objective: t(`cain.missions.${m.key}.desc`), kind: m.kind, reference: m.reference });
    if (chapterStart) {
      if (this.mode !== 'restart') await ui().chapterIntro();
      // told over black: held, read at the player's pace
      w.cutscene(true);
      await m.intro?.(w);
    }
    // a new story starts behind black (start() darkens the screen): show the world after its intro
    if (m.opensInDark) w.cutscene(true);
    else if (fromSave || relocate || chapterStart) await w.fade(0, 900);
    audio.play('missionStart');
    if (!m.opensInDark) await w.wait(900);

    await m.run(w);
    if (this.stopped) return;

    w.clearInteractions();
    w.objective('', null);
    const index = MISSIONS.indexOf(m);
    const next = MISSIONS[index + 1]?.id ?? null;
    save.commitMission(CHAPTER, m.id, next, w.getState());
    audio.play('missionComplete');
    if (!next) {
      save.completeChapter(CHAPTER, []);
      await w.chapterComplete();
      return;
    }
    hud.completeMission();
    await w.wait(2300);
  }
}
