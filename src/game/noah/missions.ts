import { audio } from '../../core/audio';
import { t } from '../../core/i18n';
import { save } from '../../core/save';
import { CHARACTERS } from '../../data/characters';
import { NOAH_MISSION_IDS } from '../../data/noah/missionOrder';
import { ARK, ARK_DOOR, FOOD, LOGS_NEEDED, PAIRS, POINTS, SINS, VINES } from '../../data/noah/map';
import type { Pt } from '../../data/eden/map';
import type { InteractSpec } from '../WorldApi';
import type { Actor } from '../world/Actor';
import { ui } from '../bridge';
import { ARK_STAGES } from './art';
import { FAMILY_IDS, type FamilyId, type NoahScene } from './NoahScene';

/*
 * The eleven missions of Noah (Genesis 6–9).
 *
 * Scripture cards quote the King James Version word for word; character
 * lines are short plain-language paraphrases with their reference. What
 * Genesis does not tell in detail (the spirit seeing the wicked, felling the
 * wood, gathering in seven days, the birds flown by the player) is gameplay.
 */

export const CHAPTER = 'noah';

const step = (m: string, s: string, p?: Record<string, string | number>) => t(`noah.missions.${m}.steps.${s}`, p);
const N = (key: string, p?: Record<string, string | number>) => t(`noah.${key}`, p);
const nameOf = (id: string) => t(CHARACTERS[id]?.nameKey ?? id);

/** the seven days (the maintainer: within seven days); a day of play, in ms */
const DAY_MS = 80000;
const FOOD_NEEDED = FOOD.length;
/** the first dove is called back once half her strength is spent */
const CALL_AT = 0.5;
/** where the family stand by the altar after the flood */
const AFTER: Record<FamilyId, Pt> = {
  'noah-wife': [1790, 1560],
  shem: [1960, 1560],
  ham: [2010, 1600],
  japheth: [2060, 1560],
  'shem-wife': [1740, 1610],
  'ham-wife': [1690, 1570],
  'japheth-wife': [2110, 1610],
};
/** the garment Shem and Japheth carry (Genesis 9:23) */
const GARMENT: [string, 'arms', [number, number]] = ['noah-garment', 'arms', [0.5, 0.6]];

interface NoahMission {
  id: string;
  key: string;
  number: number;
  kind: 'scripture' | 'inspired';
  reference: string;
  /** set again behind black when it begins (another place, another player) */
  relocate?: boolean;
  /** begins with a cinematic that shows the world itself */
  opensInDark?: boolean;
  intro?(w: NoahScene): Promise<void>;
  run(w: NoahScene): Promise<void>;
}

function useOnce(w: NoahScene, spec: Omit<InteractSpec, 'onUse'> & { onUse?: () => void | Promise<void> }): Promise<void> {
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
function stage(w: NoahScene, n: number, place: boolean): void {
  const before = n <= 3;
  const afloat = n >= 5 && n <= 7;
  w.phase = n <= 2 ? 'before' : n === 3 ? 'days' : n >= 8 ? 'after' : 'none';
  w.gathering = false;
  w.world.setArk(n <= 2 ? -1 : ARK_STAGES - 1);
  w.world.gopher.forEach((_, i) => w.world.setGopher(i, n <= 2 ? 'standing' : 'taken'));
  w.world.axe.setVisible(true);
  w.world.food.forEach((f) => f.setVisible(n === 3));
  w.showCity(n <= 4);
  w.setWater(afloat ? 1 : 0);
  w.setAfloat(afloat);
  w.showIsland(n === 7);
  w.setRain(false);
  w.setWind(1);
  w.setBow(n >= 10);
  w.setAltarFire(n >= 9);
  w.world.showAltar(n >= 9);
  w.world.showTent(n >= 11);
  w.world.vines.forEach((_, i) => w.world.setVine(i, n >= 11 ? 'grown' : 'none'));
  w.setBackward(false);
  w.setBuddy(null);
  w.spirit(false);
  w.hide(w.god);
  w.endFlight();
  w.hide(w.raven);
  w.hide(w.dove);
  w.noah.hold(null);
  for (const id of ['ham', 'shem', 'japheth'] as const) w.family[id].hold(null);
  for (const m of w.mockers) (n === 2 || n === 3 ? w.show(m, [m.x, m.y], 'up') : w.hide(m));
  // the family and the animals: waiting before the flood, in the ark during it, out after it
  // after the flood the animals are out in the land again (from mission 9)
  w.resetFollowers(n >= 4 && n <= 8);
  if (n >= 9) for (const id of FAMILY_IDS) w.show(w.family[id], AFTER[id], 'up');
  if (!before && n < 9) w.hide(w.noah);
  w.setPlayer(n === 1 ? w.god : n === 11 ? w.family.ham : w.noah);
  if (n === 1) w.spirit(true);
  if (!place) return;
  if (n <= 3) w.show(w.noah, n === 1 ? POINTS.house.map((v, i) => v + (i ? 70 : 60)) as Pt : POINTS.noahStart, n === 1 ? 'left' : 'right');
  else if (n >= 9) w.show(w.noah, [ARK_DOOR[0] - 30, ARK_DOOR[1] + 70], 'down');
  if (n === 11) {
    w.show(w.noah, POINTS.tentDoor, 'down');
    w.hide(w.noah);
    w.show(w.family.ham, [POINTS.brothers[0] + 60, POINTS.brothers[1] - 120], 'up');
    w.show(w.family.shem, POINTS.brothers, 'left');
    w.show(w.family.japheth, [POINTS.brothers[0] + 40, POINTS.brothers[1] + 10], 'left');
  }
  if (n >= 4 && n <= 7) w.cameraAt([ARK.x, ARK.y - 120]);
  else w.cameraSnap();
}

// ------------------------------------------------------------ the wicked

/** What the spirit of God sees in the city (Genesis 6:5, 11–12), each in a few moves. */
async function sin(w: NoahScene, id: string): Promise<void> {
  const [a, b] = w.sinners[id];
  w.cutscene(true);
  if (id === 'robbery') {
    await w.walk(a, [b.x - 26, b.y], 150);
    a.face(b);
    audio.play('swing');
    await a.attack('swing');
    audio.play('hit');
    b.emote('exclaim');
    a.hold('noah-sack', 'arms');
    await w.say('sin-robbery');
    void w.walk(a, [a.x - 260, a.y + 60], 220).then(() => w.hide(a));
    b.emote('drop');
  } else if (id === 'violence') {
    await w.walk(a, [b.x - 34, b.y], 110);
    a.face(b);
    await w.say('sin-violence');
    for (let k = 0; k < 2; k++) {
      audio.play('swing');
      await a.attack('swing');
      audio.play('hit');
      w.cameras.main.shake(140, 0.005);
    }
    w.tweens.add({ targets: b.sprite, angle: 90, duration: 380 });
    await w.wait(600);
  } else if (id === 'harass') {
    b.emote('exclaim');
    await w.walk(b, [b.x + 90, b.y - 10], 120);
    await w.walk(a, [b.x - 30, b.y], 140);
    a.face(b);
    b.face(a);
    await w.say('sin-harass');
    void w.walk(b, [b.x + 160, b.y + 40], 180).then(() => w.hide(b));
  } else {
    a.face(b);
    b.face(a);
    await w.say('sin-lies');
    b.emote('question');
  }
  w.cutscene(false);
}

// ----------------------------------------------------------------- missions

const MISSIONS: NoahMission[] = [
  // 1 — the spirit of God sees the earth corrupt, and finds Noah
  {
    id: 'noah.m01',
    key: 'm01',
    number: 1,
    kind: 'scripture',
    reference: 'Genesis 6:1–12',
    async intro(w) {
      w.music('solemn');
      w.cutscene(true, true);
      // one line only (the maintainer: the rest is told while the spirit flies)
      await w.say('generations');
      w.cameraSnap();
    },
    async run(w) {
      void w.fade(0, 1400);
      w.cutscene(false);
      w.toast(N('toasts.spirit'), true);
      const seen = new Set<string>();
      const left = () => SINS.filter((s) => !seen.has(s.id));
      const aim = () => w.objective(step('m01', 'see', { n: seen.size, total: SINS.length }), () => left().map((s) => s.at), { markAll: true });
      aim();
      // the Scripture is told while the spirit flies, a verse after each sin seen
      const told = ['wicked', 'giants', 'corrupt'];
      void w.scripture('wicked');
      while (seen.size < SINS.length) {
        let found: string | null = null;
        await w.until(() => {
          if (ui().dialogue.narrating) return false;
          found = left().find((s) => w.near(s.at, 200))?.id ?? null;
          return !!found;
        });
        seen.add(found!);
        await sin(w, found!);
        aim();
        if (seen.size < SINS.length && told[seen.size]) void w.scripture(told[seen.size]);
      }
      w.music('sorrow');
      await w.scripture('grieved');
      await w.say('repent');
      w.music('wonder');
      w.objective(step('m01', 'noah'), w.noah);
      void w.scripture('sons');
      await w.until(() => w.near([w.noah.x, w.noah.y], 160) && !ui().dialogue.narrating);
      w.cutscene(true);
      w.god.stop();
      w.noah.face(w.god);
      w.fx('sparkle', [w.noah.x, w.noah.y - 30]);
      await w.scripture('grace');
      await w.scripture('just');
    },
  },

  // 2 — make thee an ark of gopher wood
  {
    id: 'noah.m02',
    key: 'm02',
    number: 2,
    kind: 'scripture',
    reference: 'Genesis 6:13–22',
    relocate: true,
    async run(w) {
      w.cutscene(true);
      await w.appear(w.god, POINTS.godHome, 'left', { beam: true });
      w.noah.face(w.god);
      await w.say('make-ark');
      await w.vanish(w.god);
      w.music('peaceful');
      w.cutscene(false);
      const [ax, ay] = POINTS.woodpile;
      w.objective(step('m02', 'axe'), [ax + 34, ay + 10]);
      await useOnce(w, {
        id: 'axe',
        at: [ax + 34, ay - 6],
        radius: 70,
        prompt: () => t('prompt.pickUp', { name: N('items.axe') }),
        onUse: async () => {
          await w.noah.stoop();
          w.world.axe.setVisible(false);
          w.holdAxe(true);
          audio.play('pickup');
          w.toast(N('toasts.axe'));
        },
      });
      // three trees felled, then their three logs taken up together and carried at once (the maintainer: no going back and forth)
      let felled = 0;
      let logs = 0;
      const g = w.world.gopher;
      const offs: (() => void)[] = [];
      const aim = () => {
        if (felled < LOGS_NEEDED)
          w.objective(step('m02', 'chop', { n: felled, total: LOGS_NEEDED }), () => g.filter((x) => !x.tree.felled).map((x) => [x.tree.x, x.tree.y - 20] as Pt), { markAll: true });
        else if (logs < LOGS_NEEDED)
          w.objective(step('m02', 'gather', { n: logs, total: LOGS_NEEDED }), () => g.filter((x) => x.tree.felled && !x.taken).map((x) => [x.log.x, x.log.y] as Pt), { markAll: true });
        else w.objective(step('m02', 'carry'), POINTS.lumber);
      };
      aim();
      g.forEach((x, i) => {
        offs.push(
          w.interact({
            id: `chop:${i}`,
            at: [x.tree.x, x.tree.y - 16],
            radius: 72,
            attack: true,
            prompt: () => N('prompts.chop'),
            enabled: () => !x.tree.felled && felled < LOGS_NEEDED,
            onUse: async () => {
              if (!(await w.chop(i))) return;
              felled++;
              // the axe goes to the belt: both arms for the logs
              if (felled >= LOGS_NEEDED) w.holdAxe(false);
              aim();
            },
          }),
          w.interact({
            id: `log:${i}`,
            at: () => [x.log.x, x.log.y - 10],
            radius: 66,
            prompt: () => t('prompt.pickUp', { name: N('items.log') }),
            enabled: () => felled >= LOGS_NEEDED && x.tree.felled && !x.taken,
            onUse: async () => {
              await w.noah.stoop();
              x.taken = true;
              x.log.setVisible(false);
              logs++;
              // carried in both hands, like Cain's basket: the bundle grows with each log
              w.noah.hold(`noah-log-bundle-${logs}`, 'carry', [0.5, 0.82]);
              w.give('log');
              audio.play('pickup');
              aim();
            },
          }),
        );
      });
      await useOnce(w, {
        id: 'build',
        at: [POINTS.lumber[0], POINTS.lumber[1] - 20],
        radius: 110,
        prompt: () => N('prompts.build'),
        enabled: () => logs >= LOGS_NEEDED,
        onUse: async () => {
          w.cutscene(true);
          w.noah.hold(null);
          w.take('log', LOGS_NEEDED);
          audio.play('drop');
          // the years of the building, in the dark: the narrator over the sound of the work, then the ark stands finished
          await w.fade(1, 700);
          let working = true;
          void (async () => {
            const beats: [Parameters<typeof audio.play>[0], number][] = [['hit', 0.55], ['hit', 0.45], ['cut', 0.4], ['hit', 0.5], ['swing', 0.3], ['hit', 0.55]];
            for (let k = 0; working; k++) {
              const [name, volume] = beats[k % beats.length];
              audio.play(name, { volume, pitch: 0.9 + Math.random() * 0.2 });
              await w.wait(260 + Math.random() * 260 + (k % 6 === 5 ? 500 : 0));
            }
          })();
          await w.wait(900);
          w.world.setArk(ARK_STAGES - 1);
          await w.scripture('built');
          working = false;
          await w.wait(300);
          await w.fade(0, 900);
          w.fx('holy', [ARK.x - 60, ARK.y]);
          audio.play('holy');
          await w.say('mock');
        },
      });
      for (const off of offs) off();
      w.take('axe');
      w.world.axe.setVisible(true);
      w.cutscene(true);
      await w.scripture('did');
    },
  },

  // 3 — come thou and all thy house into the ark: seven days
  {
    id: 'noah.m03',
    key: 'm03',
    number: 3,
    kind: 'scripture',
    reference: 'Genesis 7:1–16',
    async run(w) {
      w.cutscene(true);
      await w.appear(w.god, POINTS.godArk, 'down', { beam: true });
      w.noah.face(w.god);
      await w.say('come-in');
      await w.vanish(w.god);
      w.music('tension');
      w.cutscene(false);
      while (!(await sevenDays(w))) {
        w.cutscene(true, true);
        w.music('sorrow');
        await w.say('too-late');
        await w.fade(1, 700);
        stage(w, 3, true);
        await w.fade(0, 700);
        w.music('tension');
        w.cutscene(false);
      }
      w.cutscene(true, true);
      w.music('solemn');
      await w.walk(w.noah, [ARK_DOOR, [ARK_DOOR[0] + 70, ARK_DOOR[1] - 80]], 120);
      w.hide(w.noah);
      await w.scripture('enter');
      await w.wait(400);
      audio.play('land');
      w.cameras.main.shake(260, 0.006);
      await w.scripture('shut');
      await w.fade(1, 1000);
    },
  },

  // 4 — the flood
  {
    id: 'noah.m04',
    key: 'm04',
    number: 4,
    kind: 'scripture',
    reference: 'Genesis 7:11–8:4',
    relocate: true,
    opensInDark: true,
    async run(w) {
      w.cutscene(true, true);
      w.cameraAt([POINTS.well[0], POINTS.well[1] - 120]);
      w.music('tension');
      w.setRain(true);
      await w.fade(0, 1200);
      await w.scripture('fountains');
      void w.setWater(0.5, 7000);
      for (const [a, b] of Object.values(w.sinners)) {
        a.emote('exclaim', 2200);
        b.emote('exclaim', 2200);
        void w.walk(b, [b.x + 40 - Math.random() * 80, b.y - 60], 160);
      }
      await w.say('drowning');
      await w.wait(1500);
      for (const [a, b] of Object.values(w.sinners)) {
        void w.vanish(a, 2400);
        void w.vanish(b, 2400);
      }
      await w.setWater(1, 6000);
      w.music('sorrow');
      await w.scripture('died');
      await w.cameraTo([ARK.x, ARK.y - 120], 3500);
      w.setAfloat(true);
      await w.scripture('lifted');
      await w.scripture('remained');
      w.setRain(false);
      await w.scripture('prevailed');
      w.music('wonder');
      w.setWind(3.5);
      await w.scripture('remembered');
      await w.scripture('rested');
      w.setWind(1);
    },
  },

  // 5 — the raven
  {
    id: 'noah.m05',
    key: 'm05',
    number: 5,
    kind: 'scripture',
    reference: 'Genesis 8:6–7',
    async run(w) {
      w.cutscene(true, true);
      await w.scripture('window');
      w.cutscene(false);
      w.music('tension');
      const watch = w.time.addEvent({ delay: 250, loop: true, callback: () => flightObjective(w, 'm05', 'land') });
      await w.fly('raven');
      watch.remove();
      w.objective('', null);
      w.cutscene(true, true);
      await w.say('raven-lost');
      await w.fade(1, 900);
    },
  },

  // 6 — the dove, the first time
  {
    id: 'noah.m06',
    key: 'm06',
    number: 6,
    kind: 'scripture',
    reference: 'Genesis 8:8–9',
    relocate: true,
    async run(w) {
      w.cutscene(true);
      await w.scripture('dove');
      w.cutscene(false);
      w.music('peaceful');
      for (;;) {
        let calling = false;
        const watch = w.time.addEvent({
          delay: 250,
          loop: true,
          callback: () => {
            const f = w.flightState();
            if (!f) return;
            if (!f.called && f.left <= f.total * CALL_AT && !calling) {
              calling = true;
              w.callBack();
              void w.say('call-back');
            }
            flightObjective(w, 'm06', f.called ? 'back' : 'land');
          },
        });
        const ok = await w.fly('dove');
        watch.remove();
        if (ok) break;
        w.toast(N('toasts.tryAgain'));
        await w.fade(1, 600);
        await w.fade(0, 600);
        w.cutscene(false);
      }
      w.cutscene(true);
      w.hide(w.dove);
      await w.scripture('no-rest');
    },
  },

  // 7 — the olive leaf; the dove returns not again; the earth dries
  {
    id: 'noah.m07',
    key: 'm07',
    number: 7,
    kind: 'scripture',
    reference: 'Genesis 8:10–14',
    relocate: true,
    async run(w) {
      w.cutscene(true);
      await w.scripture('again');
      w.cutscene(false);
      w.music('peaceful');
      const [ix, iy] = POINTS.island;
      for (;;) {
        const off = w.interact({
          id: 'olive',
          at: [ix + 20, iy - 30],
          radius: 120,
          prompt: () => N('prompts.olive'),
          enabled: () => !!w.flightState() && !w.flightState()!.carrying,
          onUse: () => w.pluckOlive(),
        });
        const watch = w.time.addEvent({ delay: 250, loop: true, callback: () => flightObjective(w, 'm07', w.flightState()?.carrying ? 'back' : 'olive') });
        const ok = await w.fly('olive');
        watch.remove();
        off();
        if (ok) break;
        w.toast(N('toasts.tryAgain'));
        await w.fade(1, 600);
        await w.fade(0, 600);
        w.cutscene(false);
      }
      w.cutscene(true, true);
      w.objective('', null);
      await w.scripture('olive');
      // seven other days, and the dove goes, and returns not again (Genesis 8:12)
      w.dove.hold(null);
      w.show(w.dove, [ARK.x - 40, ARK.y - 210], 'left');
      w.dove.lift = 46;
      await w.wait(600);
      void w.walk(w.dove, [ARK.x - 900, ARK.y - 700], 200).then(() => w.hide(w.dove));
      await w.scripture('not-again');
      w.showIsland(false);
      w.world.setCity(false);
      w.setAfloat(false);
      await w.setWater(0, 6000);
      w.music('wonder');
      await w.scripture('dry');
    },
  },

  // 8 — go forth of the ark; the altar
  {
    id: 'noah.m08',
    key: 'm08',
    number: 8,
    kind: 'scripture',
    reference: 'Genesis 8:15–22',
    relocate: true,
    async run(w) {
      w.cutscene(true);
      for (const id of FAMILY_IDS) w.hide(w.family[id]);
      w.show(w.noah, [ARK_DOOR[0] + 70, ARK_DOOR[1] - 80], 'down');
      // inside the hull: no body, or the ark's would push him out
      w.noah.body.enable = false;
      await w.appear(w.god, [ARK_DOOR[0] - 160, ARK_DOOR[1] + 140], 'up', { beam: true });
      await w.say('go-forth');
      // out they come, the family and every beast after their kinds (Genesis 8:18–19)
      await w.walk(w.noah, [ARK_DOOR, [ARK_DOOR[0] - 30, ARK_DOOR[1] + 70]], 120);
      w.noah.face('down');
      const out: Promise<void>[] = [];
      FAMILY_IDS.forEach((id, k) => {
        const a = w.family[id];
        out.push(
          (async () => {
            await w.wait(k * 350);
            w.show(a, [ARK_DOOR[0] + 70, ARK_DOOR[1] - 80], 'down');
            await w.walk(a, [ARK_DOOR, AFTER[id]], 130);
            a.face('up');
          })(),
        );
      });
      const beasts = w.followers.filter((f) => f.kind === 'animal');
      beasts.forEach((f, k) => {
        out.push(
          (async () => {
            await w.wait(1200 + k * 220);
            const a = f.actor;
            w.show(a, [ARK_DOOR[0] + 70, ARK_DOOR[1] - 80], 'left');
            a.lift = f.flies ? 26 : 0;
            const p = PAIRS[f.pair!];
            await w.walk(a, [ARK_DOOR, [ARK_DOOR[0] - 200 - Math.random() * 300, ARK_DOOR[1] + 250 + Math.random() * 300], p.at], 170);
          })(),
        );
      });
      await w.vanish(w.god);
      await Promise.all(out.slice(0, FAMILY_IDS.length));
      w.music('peaceful');
      w.cutscene(false);
      w.objective(step('m08', 'altar'), POINTS.altar);
      await useOnce(w, {
        id: 'altar',
        at: [POINTS.altar[0], POINTS.altar[1] - 10],
        radius: 90,
        prompt: () => N('prompts.altar'),
        onUse: async () => {
          for (let k = 0; k < 2; k++) {
            await w.noah.stoop(300);
            audio.play('land');
          }
          await w.fade(1, 400);
          w.world.showAltar(true);
          await w.fade(0, 500);
        },
      });
      w.objective(step('m08', 'offer'), POINTS.altar);
      await useOnce(w, {
        id: 'offer',
        at: [POINTS.altar[0], POINTS.altar[1] - 20],
        radius: 90,
        prompt: () => N('prompts.offer'),
        onUse: async () => {
          await w.noah.stoop(400);
          w.setAltarFire(true);
          audio.play('flame');
        },
      });
      w.cutscene(true);
      w.music('wonder');
      await w.scripture('altar');
      w.fx('holy', [POINTS.altar[0], POINTS.altar[1] - 20]);
      audio.play('holy');
      await w.scripture('savour');
      await w.scripture('seedtime');
    },
  },

  // 9 — the covenant and the bow in the cloud
  {
    id: 'noah.m09',
    key: 'm09',
    number: 9,
    kind: 'scripture',
    reference: 'Genesis 9:1–17',
    async run(w) {
      w.cutscene(true);
      await w.appear(w.god, POINTS.godAltar, 'right', { beam: true });
      w.noah.face(w.god);
      await w.say('blessed');
      await w.say('covenant');
      w.setBow(true, 3500);
      audio.play('holy');
      await w.wait(1200);
      await w.scripture('bow');
      await w.say('remember');
      await w.vanish(w.god);
      w.cutscene(false);
      // Noah tells his sons (inspired): each has his word
      const told = new Set<string>();
      const sons = ['shem', 'ham', 'japheth'] as const;
      w.objective(step('m09', 'sons', { n: 0, total: 3 }), () => sons.filter((s) => !told.has(s)).map((s) => w.family[s]), { markAll: true });
      await Promise.all(
        sons.map((s) =>
          useOnce(w, {
            id: `tell:${s}`,
            at: () => [w.family[s].x, w.family[s].y - 30],
            radius: 80,
            prompt: () => t('prompt.talk', { name: nameOf(s) }),
            onUse: async () => {
              w.family[s].face(w.noah);
              await w.say(`tell-${s}`);
              told.add(s);
              w.objective(step('m09', 'sons', { n: told.size, total: 3 }), () => sons.filter((x) => !told.has(x)).map((x) => w.family[x]), { markAll: true });
            },
          }),
        ),
      );
      w.cutscene(true);
      await w.scripture('scattered');
    },
  },

  // 10 — the vineyard
  {
    id: 'noah.m10',
    key: 'm10',
    number: 10,
    kind: 'scripture',
    reference: 'Genesis 9:20–21',
    async run(w) {
      w.cutscene(true);
      await w.scripture('husbandman');
      w.cutscene(false);
      w.music('peaceful');
      let planted = 0;
      const aim = () => w.objective(step('m10', 'plant', { n: planted, total: VINES.length }), () => w.world.vines.filter((v) => v.state === 'none').map((v) => v.at), { markAll: true });
      aim();
      await Promise.all(
        VINES.map((at, i) =>
          useOnce(w, {
            id: `vine:${i}`,
            at: [at[0], at[1] - 10],
            radius: 56,
            prompt: () => N('prompts.plant'),
            onUse: async () => {
              await w.noah.work('dig', { strikes: 2 });
              w.world.setVine(i, 'bare');
              audio.play('plant');
              planted++;
              aim();
            },
          }),
        ),
      );
      w.cutscene(true);
      await w.fade(1, 800);
      w.world.vines.forEach((_, i) => w.world.setVine(i, 'grown'));
      w.world.showTent(true);
      w.toast(N('toasts.seasons'), true);
      await w.wait(1400);
      await w.fade(0, 900);
      w.cutscene(false);
      let picked = 0;
      const grapes = [0, 2, 4];
      w.objective(step('m10', 'grapes', { n: 0, total: grapes.length }), () => grapes.filter((i) => w.world.vines[i].state === 'grown').map((i) => w.world.vines[i].at), { markAll: true });
      await Promise.all(
        grapes.map((i) =>
          useOnce(w, {
            id: `grapes:${i}`,
            at: [VINES[i][0], VINES[i][1] - 20],
            radius: 56,
            prompt: () => N('prompts.grapes'),
            onUse: async () => {
              await w.noah.stoop();
              w.world.setVine(i, 'bare');
              audio.play('leafPick');
              w.give('grapes');
              picked++;
              w.objective(step('m10', 'grapes', { n: picked, total: grapes.length }), () => grapes.filter((x) => w.world.vines[x].state === 'grown').map((x) => w.world.vines[x].at), { markAll: true });
            },
          }),
        ),
      );
      w.world.vines.forEach((_, i) => w.world.setVine(i, 'grown'));
      w.take('grapes', grapes.length);
      w.give('wine');
      w.toast(N('toasts.wine'));
      w.objective(step('m10', 'tent'), POINTS.tentDoor);
      await w.waitZone('tent');
      w.cutscene(true, true);
      w.take('wine');
      await w.walk(w.noah, [POINTS.tentDoor, [POINTS.tent[0], POINTS.tent[1] - 10]], 70);
      w.hide(w.noah);
      await w.scripture('drunk');
      await w.fade(1, 900);
    },
  },

  // 11 — Ham, and the garment; the curse of Canaan
  {
    id: 'noah.m11',
    key: 'm11',
    number: 11,
    kind: 'scripture',
    reference: 'Genesis 9:22–29',
    relocate: true,
    async run(w) {
      const { ham, shem, japheth } = w.family;
      w.music('tension');
      w.objective(step('m11', 'tent'), POINTS.tentDoor);
      await useOnce(w, {
        id: 'look',
        at: [POINTS.tentDoor[0], POINTS.tentDoor[1] - 20],
        radius: 80,
        prompt: () => N('prompts.look'),
        onUse: async () => {
          ham.face('up');
          await w.fade(0.85, 300);
          await w.wait(500);
          await w.fade(0, 300);
          ham.emote('exclaim');
          await w.say('ham-saw');
        },
      });
      w.objective(step('m11', 'tell'), shem);
      await useOnce(w, {
        id: 'tell',
        at: () => [shem.x, shem.y - 30],
        radius: 90,
        prompt: () => t('prompt.talk', { name: nameOf('shem') }),
        onUse: async () => {
          shem.face(ham);
          japheth.face(ham);
          await w.say('ham-tells');
        },
      });
      // Shem and Japheth: the garment on their shoulders, going backward (Genesis 9:23)
      w.cutscene(true);
      await w.fade(1, 500);
      w.show(shem, [POINTS.brothers[0] - 60, POINTS.brothers[1] + 60], 'down');
      w.show(japheth, [POINTS.brothers[0] - 16, POINTS.brothers[1] + 64], 'down');
      w.show(ham, [POINTS.brothers[0] + 120, POINTS.brothers[1] + 30], 'left');
      shem.hold(...GARMENT);
      japheth.hold(...GARMENT);
      w.setPlayer(shem);
      w.setBuddy(japheth);
      w.setBackward(true);
      w.cameraSnap();
      await w.fade(0, 500);
      w.cutscene(false);
      w.toast(N('toasts.backward'), true);
      w.objective(step('m11', 'cover'), POINTS.tentDoor);
      await useOnce(w, {
        id: 'cover',
        at: [POINTS.tentDoor[0], POINTS.tentDoor[1] - 10],
        radius: 100,
        prompt: () => N('prompts.cover'),
        onUse: async () => {
          w.cutscene(true, true);
          await w.fade(1, 600);
          shem.hold(null);
          japheth.hold(null);
          w.setBackward(false);
          w.setBuddy(null);
          w.show(shem, [POINTS.tentDoor[0] + 70, POINTS.tentDoor[1] + 50], 'up');
          w.show(japheth, [POINTS.tentDoor[0] + 120, POINTS.tentDoor[1] + 56], 'up');
          w.show(ham, [POINTS.tentDoor[0] + 170, POINTS.tentDoor[1] + 70], 'up');
          await w.wait(700);
          await w.fade(0, 900);
        },
      });
      await w.scripture('covered');
      w.music('solemn');
      w.show(w.noah, POINTS.tentDoor, 'down');
      w.noah.face(ham);
      await w.say('awoke');
      await w.scripture('years');
    },
  },
];

/** The flight's objective, with the bird's strength left (the maintainer: a flight counter). */
function flightObjective(w: NoahScene, m: string, s: 'land' | 'back' | 'olive'): void {
  const f = w.flightState();
  if (!f) return;
  const target: Pt | null = s === 'back' ? [ARK.x - 40, ARK.y - 210] : s === 'olive' ? [POINTS.island[0] + 20, POINTS.island[1] - 30] : null;
  w.objective(`${step(m, s)} · ${N('hud.strength', { s: Math.ceil(f.left) })}`, target);
}

/**
 * The seven days (Genesis 7:1–10): Noah calls his house, takes of all food
 * and brings the beasts two by two, before the rain. Resolves true when all
 * are in, false when the seven days are out first.
 */
async function sevenDays(w: NoahScene): Promise<boolean> {
  w.gathering = true;
  let food = 0;
  let family = 0;
  let carrying: number | null = null;
  // the days count only while the game runs (not while paused)
  let elapsed = 0;
  const clock = w.time.addEvent({ delay: 100, loop: true, callback: () => (elapsed += 100) });
  const offs: (() => void)[] = [];
  const pairsIn = () => PAIRS.filter((_, i) => w.pairIn(i)).length;
  const done = () => family >= FAMILY_IDS.length && food >= FOOD_NEEDED && pairsIn() >= PAIRS.length;
  const day = () => Math.min(7, 1 + Math.floor(elapsed / DAY_MS));
  const aim = () => {
    const text = step('m03', 'days', { day: day(), family, familyTotal: FAMILY_IDS.length, food, foodTotal: FOOD_NEEDED, pairs: pairsIn(), pairsTotal: PAIRS.length });
    w.objective(text, () => {
      if (carrying !== null || w.following() > 0) return [[ARK_DOOR[0], ARK_DOOR[1] - 10] as Pt];
      return [
        ...FAMILY_IDS.filter((id) => !w.isIn(w.family[id])).map((id) => w.family[id] as Actor),
        ...PAIRS.map((_, i) => i).filter((i) => !w.pairIn(i)).map((i) => w.pairActors(i)[0]),
        ...w.world.food.filter((f) => f.visible).map((f) => [f.x, f.y] as Pt),
      ];
    }, { markAll: false });
  };
  aim();
  let lastDay = 1;
  const tick = w.time.addEvent({
    delay: 500,
    loop: true,
    callback: () => {
      aim();
      if (day() !== lastDay) {
        lastDay = day();
        w.toast(N('toasts.day', { day: lastDay }), true);
      }
    },
  });
  // the family: called, they follow Noah
  for (const id of FAMILY_IDS) {
    const a = w.family[id];
    offs.push(
      w.interact({
        id: `call:${id}`,
        at: () => [a.x, a.y - 30],
        radius: 80,
        prompt: () => N('prompts.call', { name: nameOf(id) }),
        enabled: () => w.followers.some((f) => f.actor === a && f.state === 'wait'),
        onUse: async () => {
          a.face(w.noah);
          await w.say(`call-${id}`);
          w.lead(a);
          a.emote('heart', 900);
        },
      }),
    );
  }
  // the beasts, two by two
  PAIRS.forEach((p, i) => {
    const [a] = w.pairActors(i);
    offs.push(
      w.interact({
        id: `pair:${i}`,
        at: () => [a.x + 26, a.y - 14],
        radius: 90,
        prompt: () => N(p.clean ? 'prompts.pair' : 'prompts.unclean', { name: N(`animals.${p.species}`) }),
        enabled: () => w.followers.some((f) => f.pair === i && f.state === 'wait'),
        onUse: async () => {
          w.lead(a);
          audio.play('correct');
          if (!p.clean) await w.say('lion');
        },
      }),
    );
  });
  // food (Genesis 6:21)
  w.world.food.forEach((img, i) => {
    offs.push(
      w.interact({
        id: `food:${i}`,
        at: [img.x, img.y - 14],
        radius: 64,
        prompt: () => t('prompt.pickUp', { name: N(`items.${FOOD[i].kind}`) }),
        enabled: () => img.visible && carrying === null,
        onUse: async () => {
          await w.noah.stoop();
          img.setVisible(false);
          carrying = i;
          w.noah.hold(`noah-${FOOD[i].kind}`, 'arms', [0.5, 0.75]);
          audio.play('pickup');
        },
      }),
    );
  });
  // at the ark: the food stored, those following go in
  const boarding = w.time.addEvent({
    delay: 150,
    loop: true,
    callback: () => {
      if (!w.near(ARK_DOOR, 150, w.noah)) return;
      if (carrying !== null) {
        carrying = null;
        food++;
        w.noah.hold(null);
        audio.play('drop');
        w.toast(N('toasts.food', { n: food, total: FOOD_NEEDED }));
      }
      if (w.following() > 0)
        void w.boardFollowers((f) => {
          if (f.kind === 'family') family++;
          aim();
        });
    },
  });
  const result = await new Promise<boolean>((resolve) => {
    const check = w.time.addEvent({
      delay: 250,
      loop: true,
      callback: () => {
        // never in the middle of someone speaking
        if (ui().dialogue.open) return;
        if (done()) {
          check.remove();
          resolve(true);
        } else if (elapsed > DAY_MS * 7) {
          check.remove();
          resolve(false);
        }
      },
    });
  });
  tick.remove();
  clock.remove();
  boarding.remove();
  for (const off of offs) off();
  w.gathering = false;
  w.noah.hold(null);
  return result;
}

export class NoahRunner {
  private stopped = false;
  private readonly w: NoahScene;

  constructor(
    private scene: NoahScene,
    private mode: 'continue' | 'new' | 'restart',
  ) {
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
    if (MISSIONS.map((m) => m.id).join() !== NOAH_MISSION_IDS.join()) console.warn('[missions] order mismatch');
    let progress = save.chapter(CHAPTER);
    const fresh = this.mode === 'new' || !progress || progress.completed || !progress.currentMission;
    if (fresh || !progress) progress = save.startChapter(CHAPTER, MISSIONS[0].id, 'noah');
    const first = Math.max(0, MISSIONS.findIndex((m) => m.id === progress!.currentMission));
    this.scene.setState(progress.flags, progress.inventory);
    const hud = ui().hud;
    hud.show(true);
    void hud.fade(1, 0);
    try {
      for (let i = first; i < MISSIONS.length; i++) {
        if (this.stopped) return;
        const opening = i === 0 && (fresh || this.mode === 'restart');
        await this.runMission(MISSIONS[i], i === first && !opening, opening);
      }
    } catch (e) {
      if (e instanceof MissionStopped) return;
      throw e;
    }
  }

  private async runMission(m: NoahMission, fromSave: boolean, chapterStart: boolean): Promise<void> {
    const w = this.w;
    const hud = ui().hud;
    w.clearInteractions();
    w.objective('', null);
    const relocate = !fromSave && !chapterStart && !!m.relocate;
    if (relocate) await w.fade(1, 600);
    stage(w, m.number, fromSave || relocate || chapterStart);
    hud.setMission({ number: m.number, title: t(`noah.missions.${m.key}.title`), objective: t(`noah.missions.${m.key}.desc`), kind: m.kind, reference: m.reference });
    if (chapterStart) {
      if (this.mode !== 'restart') await ui().chapterIntro();
      w.cutscene(true);
      await m.intro?.(w);
    }
    if (m.opensInDark) w.cutscene(true);
    else if (!chapterStart && (fromSave || relocate)) await w.fade(0, 900);
    // after a mission that ended in black (into the ark, the raven lost, Noah in his tent)
    else if (!chapterStart) void w.fade(0, 900);
    audio.play('missionStart');
    if (!m.opensInDark) await w.wait(900);
    if (!m.opensInDark && !chapterStart) w.cutscene(false);

    await m.run(w);
    if (this.stopped) return;
    w.cutscene(true);

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

class MissionStopped extends Error {}
