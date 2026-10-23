import { t } from '../../core/i18n';
import { KEY_LABELS } from '../../core/input';
import { NAMEABLE } from '../../data/animals';
import { BOUNDS, PLOT_PATCHES, POINTS, ZONES, type Pt } from '../../data/eden/map';
import type { InteractSpec, WorldApi } from '../WorldApi';
import type { Actor } from '../world/Actor';
import type { MissionDef, StageOptions } from './types';

/*
 * The ten missions of the Garden of Eden (Genesis 2–3).
 *
 * Scripture cards quote the King James Version word for word. Character
 * lines are plain-language paraphrases with their reference. Activities that
 * the Bible does not describe in detail (farming, gathering fruit, the
 * hiding challenge) are introduced as "Gameplay" and labelled as inspired by
 * the passage in the HUD.
 */

const E = (key: string, p?: Record<string, string | number>) => t(`eden.${key}`, p);
const step = (m: string, s: string, p?: Record<string, string | number>) => t(`eden.missions.${m}.steps.${s}`, p);
const itemName = (k: string) => t(`eden.items.${k}`);

/** fruit sprite -> item name */
const FRUIT_ITEM: Record<string, string> = { 'fruit-fig': 'fig', 'fruit-pomegranate': 'pomegranate', 'fruit-dates': 'dates', 'fruit-grapes': 'grapes' };
const ORCHARD = ['fig1', 'pom1', 'pom2', 'fig2', 'palm1', 'palm2', 'vine1', 'vine2'];
const FIG_TREES = ['fig3', 'fig4'];
const FRUIT_GOAL = 8;
const LEAVES_PER_TREE = 3;
const LEAF_GOAL = FIG_TREES.length * LEAVES_PER_TREE;

/** God's walk from the garden plot to the midst of the garden, over the ford. */
const GOD_TO_MIDST: Pt[] = [[1700, 1300], [1800, 1312], [1990, 1320], [2350, 1400], [2700, 1520], [POINTS.godCommand[0], POINTS.godCommand[1]]];
/** From the meadow to the great oak. */
const GOD_TO_OAK: Pt[] = [[3120, 880], [3460, 1060], [POINTS.godRest[0], POINTS.godRest[1]]];

const near = (a: Actor, b: Actor | Pt, r: number) => {
  const [x, y] = Array.isArray(b) ? b : [b.x, b.y];
  return Math.hypot(a.x - x, a.y - y) < r;
};

const other = (w: WorldApi): Actor => (w.activeId() === 'adam' ? w.eve : w.adam);

/** Register an interaction that resolves the first time it is used. */
function useOnce(w: WorldApi, spec: Omit<InteractSpec, 'onUse'> & { onUse?: () => void | Promise<void> }): Promise<void> {
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

function pickUp(w: WorldApi, propId: string, at: Pt, item: string, n = 1): Promise<void> {
  return useOnce(w, {
    id: propId,
    at,
    radius: 60,
    prompt: () => t('prompt.pickUp', { name: itemName(item) }),
    onUse: () => {
      w.hideProp(propId);
      w.sfx('pickup');
      w.give(item, n);
      w.toast(E('toasts.got', { item: itemName(item) }));
    },
  });
}

function narrate(w: WorldApi, text: string): Promise<void> {
  return w.lines([{ speaker: 'narrator', text }]);
}

function talkPrompt(): string {
  return t('prompt.talk', { name: t('characters.god') });
}

function godAt(w: WorldApi): Pt {
  return [w.god.x, w.god.y - 20];
}

/** One task on each of the three garden plot patches (mission 1). */
async function plotTask(
  w: WorldApi,
  stepKey: string,
  promptKey: string,
  state: 'tilled' | 'seeded' | 'watered',
  sfx: string,
  toastKey: string,
  each?: (i: number) => void | Promise<void>,
): Promise<void> {
  const done = new Set<number>();
  const total = PLOT_PATCHES.length;
  const update = () => w.objective(step('m01', stepKey, { n: done.size, total }), () => PLOT_PATCHES.filter((_, i) => !done.has(i)));
  update();
  await new Promise<void>((resolve) => {
    const offs = PLOT_PATCHES.map((p, i) =>
      w.interact({
        id: `plot-${stepKey}-${i}`,
        at: p,
        radius: 46,
        prompt: () => t(`prompt.${promptKey}`),
        enabled: () => !done.has(i),
        onUse: async () => {
          done.add(i);
          w.setPlot(i, state);
          w.sfx(sfx);
          w.toast(E(`toasts.${toastKey}`));
          await each?.(i);
          update();
          if (done.size === total) {
            offs.forEach((off) => off());
            resolve();
          }
        },
      }),
    );
  });
}

// ------------------------------------------------------------------ staging

/**
 * The world as it is at the start of mission `n`. Always safe to call:
 * it only sets state, and moves people when `place` is true.
 */
export function stageEden(w: WorldApi, n: number, o: StageOptions): void {
  // the garden plot
  PLOT_PATCHES.forEach((_, i) => w.setPlot(i, n === 1 ? 'marked' : 'grown'));
  for (const id of ['stick', 'gourd']) (n === 1 ? w.showProp(id) : w.hideProp(id));
  n <= 5 ? w.showProp('basket') : w.hideProp('basket');
  if (n >= 7) w.pickFruit('forbiddenTree', 0);
  // clothing: leaves; fig-leaf coverings (Genesis 3:7); coats of skins (3:21)
  w.setOutfit(n <= 7 ? 'leaves' : n <= 9 ? 'fig' : 'tunic');
  w.setTime(n <= 7 ? 'day' : n === 8 ? 'afternoon' : 'evening');
  w.thorns(n === 10);
  w.openExit(false);
  w.cherubim(false);
  w.sleeping(false);
  w.serpentPose('hidden');
  // the people
  const eveCreated = n >= 5;
  w.allowSwitch(eveCreated);
  w.follow(eveCreated);
  w.setActive(eveCreated ? o.active : 'adam');
  if (!eveCreated) w.hide(w.eve);
  w.hide(w.god);
  if (o.place) {
    const both = (a: Pt, e: Pt, facing: 'down' | 'up' | 'left' | 'right' = 'down') => {
      w.show(w.adam, a, facing);
      if (eveCreated) w.show(w.eve, e, facing);
    };
    switch (n) {
      case 1: both(POINTS.adamStart, POINTS.adamStart, 'right'); break;
      case 2: both([1500, 1215], [1500, 1215], 'right'); break;
      case 3: both(POINTS.adamCommand, POINTS.adamCommand, 'up'); break;
      case 4: both([POINTS.gather[0], POINTS.gather[1] + 10], POINTS.gather, 'left'); break;
      case 5: both(POINTS.restSpot, [POINTS.restSpot[0] + 60, POINTS.restSpot[1] + 30], 'down'); break;
      case 6: both([POINTS.shareSpot[0] - 30, POINTS.shareSpot[1]], [POINTS.shareSpot[0] + 30, POINTS.shareSpot[1]], 'down'); break;
      case 7: both(POINTS.adamSerpent, POINTS.eveSerpent, 'down'); break;
      case 8: both([POINTS.sewingStone[0] - 30, POINTS.sewingStone[1] + 50], [POINTS.sewingStone[0] + 30, POINTS.sewingStone[1] + 50], 'down'); break;
      default: both(POINTS.adamBefore, POINTS.eveBefore, 'up'); break;
    }
  }
  if (n === 4) {
    w.show(w.god, POINTS.godMeadow, 'right');
    w.godLight(true);
  }
  if (n >= 9) {
    w.show(w.god, POINTS.godGrove, 'down');
    w.godLight(true);
  }
  if (n === 9) {
    w.serpentPose('ground');
    w.serpent.setPosition(POINTS.serpentGround[0], POINTS.serpentGround[1]);
    w.serpent.face('left');
  }
  w.cameraSnap();
}

/** Things the player can look at in any mission. */
export function ambientEden(w: WorldApi, n: number): void {
  const look = (id: string, at: Pt, text: () => string, radius = 110, enabled?: () => boolean) =>
    w.interact({ id, at, radius, prompt: () => t('prompt.examine'), enabled, onUse: () => narrate(w, text()) });
  const life = w.treeAt('treeOfLife');
  const forbidden = w.treeAt('forbiddenTree');
  if (n !== 2) look('look-life', [life[0], life[1] - 10], () => E('examine.treeOfLife'));
  if (n !== 2 && n !== 5 && n !== 6) look('look-forbidden', [forbidden[0], forbidden[1] - 10], () => E(n >= 7 ? 'examine.forbiddenAfter' : 'examine.forbiddenTree'));
  if (n < 10) look('look-exit', [BOUNDS.right - 50, POINTS.exit[1]], () => E('examine.exitBlocked'), 130);
  if (n >= 2) look('look-plot', PLOT_PATCHES[1], () => E('examine.plantGrown'), 70);
}

// ----------------------------------------------------------------- missions

const m01: MissionDef = {
  id: 'eden.m01',
  key: 'm01',
  number: 1,
  kind: 'inspired',
  reference: 'Genesis 2:15',
  async run(w) {
    w.music('peaceful');
    await w.scripture('gen2_8');
    await w.say('m01_intro', { move: t('hud.moveKeys'), interact: KEY_LABELS.interact });
    await w.scripture('gen2_15');

    w.objective(step('m01', 'explore'), [ZONES.plot.x, ZONES.plot.y]);
    await w.waitZone('plot');

    w.objective(step('m01', 'stick'), POINTS.stick);
    await pickUp(w, 'stick', POINTS.stick, 'stick');
    await w.say('m01_stick');

    let first = true;
    await plotTask(w, 'till', 'till', 'tilled', 'dig', 'tilled', async (i) => {
      w.fx('leaves', PLOT_PATCHES[i]);
      if (first) {
        first = false;
        await w.say('m01_till');
      }
    });

    w.objective(step('m01', 'seeds'), POINTS.grain);
    await useOnce(w, {
      id: 'grain',
      at: POINTS.grain,
      radius: 80,
      prompt: () => t('prompt.gather'),
      onUse: () => {
        w.sfx('rustle');
        w.give('seeds', PLOT_PATCHES.length);
        w.toast(E('toasts.got', { item: itemName('seeds') }));
      },
    });
    await w.say('m01_seeds');
    await plotTask(w, 'plant', 'plant', 'seeded', 'plant', 'planted', () => w.take('seeds'));

    w.objective(step('m01', 'gourd'), POINTS.gourd);
    await pickUp(w, 'gourd', POINTS.gourd, 'gourd');
    await w.say('m01_gourd');

    w.objective(step('m01', 'fill'), POINTS.riverFill);
    await useOnce(w, {
      id: 'river-fill',
      at: POINTS.riverFill,
      radius: 90,
      prompt: () => t('prompt.fill'),
      onUse: () => {
        w.sfx('splash');
        w.fx('splash', POINTS.riverFill);
        w.take('gourd');
        w.give('water');
      },
    });
    await w.say('m01_fill');
    await w.scripture('gen2_10');

    await plotTask(w, 'water', 'water', 'watered', 'splash', 'watered', (i) => w.fx('splash', [PLOT_PATCHES[i][0], PLOT_PATCHES[i][1] + 6]));
    w.take('water');
    w.take('stick');

    // the seeds grow
    w.cutscene(true);
    const centre: Pt = [ZONES.plot.x, ZONES.plot.y - 20];
    await w.cameraTo(centre, 700);
    for (const s of ['sprout', 'young', 'grown'] as const) {
      w.sfx('grow');
      PLOT_PATCHES.forEach((_, i) => w.setPlot(i, s));
      w.fx('sparkle', PLOT_PATCHES[1]);
      await w.wait(750);
    }
    await w.say('m01_grow');
    w.cameraFollow();
    w.cutscene(false);
  },
};

const m02: MissionDef = {
  id: 'eden.m02',
  key: 'm02',
  number: 2,
  kind: 'scripture',
  reference: 'Genesis 2:16–17',
  async run(w) {
    w.cutscene(true);
    await w.say('m02_appear');
    w.show(w.god, POINTS.godAppear, 'left');
    w.godLight(true);
    w.fx('holy', POINTS.godAppear);
    w.sfx('holy');
    w.music('wonder');
    await w.cameraTo(w.god, 900);
    await w.wait(500);
    w.cameraFollow();
    w.cutscene(false);

    w.objective(step('m02', 'meet'), w.god);
    await useOnce(w, { id: 'god', at: () => godAt(w), radius: 90, prompt: talkPrompt });
    await w.say('m02_follow');

    w.objective(step('m02', 'follow'), w.god);
    await Promise.all([w.walk(w.god, GOD_TO_MIDST, 95), w.waitZone('midst')]);

    w.cutscene(true);
    await w.walk(w.player(), POINTS.adamCommand);
    w.face(w.god, w.player());
    w.face(w.player(), w.god);
    await w.say('m02_command');
    await w.scripture('gen2_16');
    w.cutscene(false);

    const seen = new Set<string>();
    const trees = [
      { id: 'treeOfLife', line: 'm02_life' },
      { id: 'forbiddenTree', line: 'm02_forbidden' },
    ];
    const update = () =>
      w.objective(step('m02', 'trees', { n: seen.size, total: trees.length }), () =>
        trees.filter((tr) => !seen.has(tr.id)).map((tr) => w.treeAt(tr.id)),
      );
    update();
    await new Promise<void>((resolve) => {
      for (const tr of trees) {
        const at = w.treeAt(tr.id);
        const off = w.interact({
          id: `tree-${tr.id}`,
          at: [at[0], at[1] - 10],
          radius: 120,
          prompt: () => t('prompt.examine'),
          onUse: async () => {
            await w.say(tr.line);
            seen.add(tr.id);
            off();
            update();
            if (seen.size === trees.length) resolve();
          },
        });
      }
    });

    w.cutscene(true);
    w.fx('holy', [w.god.x, w.god.y]);
    w.sfx('holy');
    await w.wait(600);
    w.hide(w.god);
    w.cutscene(false);
  },
};

const m03: MissionDef = {
  id: 'eden.m03',
  key: 'm03',
  number: 3,
  kind: 'scripture',
  reference: 'Genesis 2:18–20',
  async run(w) {
    w.show(w.god, POINTS.godMeadow, 'right');
    w.godLight(true);
    w.music('peaceful');
    w.objective(step('m03', 'go'), w.god);
    await w.until(() => near(w.player(), w.god, 230));

    w.cutscene(true);
    await w.walk(w.player(), [POINTS.gather[0] - 60, POINTS.gather[1] + 10]);
    w.face(w.god, w.player());
    w.face(w.player(), w.god);
    await w.say('m03_intro');
    await w.scripture('gen2_19');

    // the LORD God brings the animals to Adam (Genesis 2:19)
    const ids = NAMEABLE;
    const angles = [-150, -110, -70, -30, 10, 50, 90, 130];
    const [cx, cy] = POINTS.gather;
    w.cameraTo([cx, cy], 700);
    await Promise.all(
      ids.map(async (id, i) => {
        const a = w.animal(id);
        if (!a) return;
        w.animalStay(id, true);
        const ang = (angles[i % angles.length] * Math.PI) / 180;
        const to: Pt = [cx + Math.cos(ang) * 180, cy + Math.sin(ang) * 115];
        await w.wait(i * 250);
        const dist = Math.hypot(a.x - to[0], a.y - to[1]);
        await w.walk(a, to, Math.max(70, dist / 3.2));
        a.face(dist && to[0] > cx ? 'left' : 'right');
      }),
    );
    w.face(w.player(), 'right');
    w.cameraFollow();
    w.cutscene(false);

    const named = new Set<string>();
    const update = () =>
      w.objective(step('m03', 'name', { n: named.size, total: ids.length }), () =>
        ids.filter((id) => !named.has(id)).map((id) => w.animal(id)).filter((a): a is Actor => !!a),
      );
    update();
    await new Promise<void>((resolve) => {
      for (const id of ids) {
        const a = w.animal(id);
        if (!a) continue;
        const off = w.interact({
          id: `name-${id}`,
          at: () => [a.x, a.y - 16],
          radius: 80,
          prompt: () => t('prompt.name'),
          onUse: async () => {
            const result = await w.namingPuzzle([id]);
            if (!result.includes(id)) return;
            off();
            named.add(id);
            const name = E(`animals.${id}`);
            a.emote('heart');
            w.sfx('correct');
            if (named.size === 1) await w.say('m03_named', { name });
            else w.toast(E('toasts.named', { name }));
            update();
            if (named.size === ids.length) resolve();
          },
        });
      }
    });

    await w.wait(600);
    await w.say('m03_done');
    await w.scripture('gen2_20');
    for (const id of ids) w.animalStay(id, false);
  },
};

const m04: MissionDef = {
  id: 'eden.m04',
  key: 'm04',
  number: 4,
  kind: 'scripture',
  reference: 'Genesis 2:21–25',
  async run(w) {
    w.music('wonder');
    w.objective(step('m04', 'rest'), POINTS.restSpot);
    void w.walk(w.god, GOD_TO_OAK, 90);
    await useOnce(w, { id: 'rest', at: POINTS.restSpot, radius: 80, prompt: () => t('prompt.rest') });

    w.cutscene(true);
    await w.say('m04_rest');
    await w.walk(w.adam, POINTS.restSpot);
    w.face(w.adam, 'down');
    w.sleeping(true);
    await w.fade(0.85, 1400);
    await w.scripture('gen2_21');
    w.sfx('holy');
    await w.scripture('gen2_22');
    // the LORD God brings the woman to the man
    w.show(w.eve, POINTS.eveArrive, 'left');
    w.fx('sparkle', POINTS.eveArrive);
    if (!w.god.visible) {
      w.show(w.god, POINTS.godRest, 'right');
      w.godLight(true);
    }
    await w.fade(0, 1400);
    await w.wait(500);
    w.sleeping(false);
    w.face(w.adam, w.eve);
    w.face(w.eve, w.adam);
    w.adam.emote('heart');
    await w.wait(700);
    await w.say('m04_wake');
    await w.scripture('gen2_24');
    w.fx('holy', [w.god.x, w.god.y]);
    w.sfx('holy');
    await w.wait(600);
    w.hide(w.god);

    w.allowSwitch(true);
    w.follow(true);
    w.cutscene(false);
    await w.say('m04_switch', { switch: KEY_LABELS.switch });
    w.objective(step('m04', 'switch', { key: KEY_LABELS.switch }), w.eve);
    await w.until(() => w.activeId() === 'eve');
    await w.wait(400);
  },
};

const m05: MissionDef = {
  id: 'eden.m05',
  key: 'm05',
  number: 5,
  kind: 'inspired',
  reference: 'Genesis 2:9, 2:16',
  async run(w) {
    w.music('peaceful');
    await w.say('m05_intro');
    w.objective(step('m05', 'basket'), POINTS.basket);
    await pickUp(w, 'basket', POINTS.basket, 'basket');
    await w.say('m05_basket');

    const update = () =>
      w.objective(step('m05', 'gather', { n: w.count('fruit'), total: FRUIT_GOAL }), () => {
        const trees = new Set(w.fruitOf(ORCHARD).map((f) => f.tree));
        return [...trees].map((id) => w.treeAt(id));
      });
    update();
    const offs: (() => void)[] = [];
    await new Promise<void>((resolve) => {
      for (const id of ORCHARD) {
        const at = w.treeAt(id);
        offs.push(
          w.interact({
            id: `fruit-${id}`,
            at: [at[0], at[1] - 10],
            radius: 95,
            prompt: () => t('prompt.pick'),
            enabled: () => w.count('fruit') < FRUIT_GOAL && w.fruitOf([id]).length > 0,
            onUse: () => {
              const fruit = w.fruitOf([id]);
              if (!fruit.length) {
                w.toast(E('toasts.noMoreFruit'));
                return;
              }
              const f = fruit[0];
              w.pickFruit(f.tree, f.index);
              w.give('fruit');
              w.sfx('pickup');
              w.toast(E('toasts.fruit', { item: itemName(FRUIT_ITEM[f.type] ?? 'fruit'), n: w.count('fruit'), total: FRUIT_GOAL }));
              update();
              if (w.count('fruit') >= FRUIT_GOAL) resolve();
            },
          }),
        );
      }
      // Eve will not take from the tree in the midst of the garden
      const ft = w.treeAt('forbiddenTree');
      offs.push(w.interact({ id: 'forbidden-touch', at: [ft[0], ft[1] - 10], radius: 110, prompt: () => t('prompt.examine'), onUse: () => w.say('m05_forbidden_touch') }));
    });
    offs.forEach((off) => off());
    await w.say('m05_full');

    w.objective(step('m05', 'share'), POINTS.shareSpot);
    await w.waitZone('share');
    w.cutscene(true);
    const o = other(w);
    await w.walk(o, [w.player().x + (o.x < w.player().x ? -46 : 46), w.player().y]);
    w.face(o, w.player());
    w.face(w.player(), o);
    await w.say('m05_share');
    w.take('fruit', FRUIT_GOAL);
    w.take('basket');
    w.adam.emote('heart');
    await w.wait(600);
    w.cutscene(false);
  },
};

const m06: MissionDef = {
  id: 'eden.m06',
  key: 'm06',
  number: 6,
  kind: 'scripture',
  reference: 'Genesis 3:1–6',
  async run(w) {
    w.music('peaceful');
    await w.say('m06_intro');
    w.objective(step('m06', 'go'), POINTS.eveSerpent);
    await w.waitZone('forbidden');

    w.cutscene(true);
    w.music('tension');
    await Promise.all([w.walk(w.eve, POINTS.eveSerpent), w.walk(w.adam, POINTS.adamSerpent)]);
    w.serpentPose('tree');
    w.face(w.eve, 'up');
    w.face(w.adam, w.eve);
    await w.cameraTo([POINTS.serpentBranch[0], POINTS.serpentBranch[1] + 60], 900);
    w.eve.emote('question');
    await w.scripture('gen3_1');
    await w.say('m06_serpent');

    // Genesis 3:6 — told, not played
    const ft = w.treeAt('forbiddenTree');
    await w.walk(w.eve, [ft[0] - 20, ft[1] + 30], 80);
    w.face(w.eve, 'up');
    await w.wait(500);
    w.pickFruit('forbiddenTree', 0);
    w.eve.hold('fruit-forbidden');
    await w.wait(700);
    await w.scripture('gen3_6');
    await w.walk(w.eve, [POINTS.adamSerpent[0] - 40, POINTS.adamSerpent[1]], 80);
    w.face(w.eve, w.adam);
    w.face(w.adam, w.eve);
    w.eve.hold(null);
    w.adam.hold('fruit-forbidden');
    await w.wait(900);
    w.adam.hold(null);
    w.serpentPose('hidden');
    w.music('sorrow');
    await w.fade(1, 900);
    await w.wait(500);
    w.cameraFollow();
    await w.fade(0, 900);
    w.cutscene(false);
  },
};

const m07: MissionDef = {
  id: 'eden.m07',
  key: 'm07',
  number: 7,
  kind: 'scripture',
  reference: 'Genesis 3:7',
  async run(w) {
    w.music('sorrow');
    w.adam.emote('drop');
    w.eve.emote('drop');
    await w.say('m07_intro');

    const taken: Record<string, number> = {};
    const update = () =>
      w.objective(step('m07', 'leaves', { n: w.count('figLeaf'), total: LEAF_GOAL }), () =>
        FIG_TREES.filter((id) => (taken[id] ?? 0) < LEAVES_PER_TREE).map((id) => w.treeAt(id)),
      );
    update();
    const offs: (() => void)[] = [];
    await new Promise<void>((resolve) => {
      for (const id of FIG_TREES) {
        const at = w.treeAt(id);
        offs.push(
          w.interact({
            id: `leaf-${id}`,
            at: [at[0], at[1] - 10],
            radius: 100,
            prompt: () => t('prompt.gather'),
            enabled: () => (taken[id] ?? 0) < LEAVES_PER_TREE,
            onUse: async () => {
              taken[id] = (taken[id] ?? 0) + 1;
              w.fx('leaves', at);
              w.sfx('rustle');
              w.give('figLeaf');
              w.toast(E('toasts.leaf', { n: w.count('figLeaf'), total: LEAF_GOAL }));
              if (w.count('figLeaf') === 1) await w.say('m07_leaf');
              update();
              if (w.count('figLeaf') >= LEAF_GOAL) resolve();
            },
          }),
        );
      }
    });
    offs.forEach((off) => off());

    const stone: Pt = POINTS.sewingStone;
    w.objective(step('m07', 'sew'), stone);
    await useOnce(w, { id: 'sew', at: stone, radius: 80, prompt: () => t('prompt.use') });
    w.cutscene(true);
    const o = other(w);
    await w.walk(o, [stone[0] + (o.x < stone[0] ? -50 : 50), stone[1] + 34]);
    await w.fade(1, 700);
    w.take('figLeaf', LEAF_GOAL);
    w.setOutfit('fig');
    w.sfx('rustle');
    await w.wait(700);
    await w.fade(0, 700);
    await w.scripture('gen3_7');
    w.cutscene(false);
  },
};

const m08: MissionDef = {
  id: 'eden.m08',
  key: 'm08',
  number: 8,
  kind: 'scripture',
  reference: 'Genesis 3:8–13',
  async run(w) {
    w.setTime('evening');
    w.music('tension');
    await w.say('m08_intro');
    await w.scripture('gen3_8');
    w.objective(step('m08', 'grove'), [ZONES.grove.x, ZONES.grove.y - 200]);
    await w.until(() => near(w.player(), [ZONES.grove.x, ZONES.grove.y], ZONES.grove.r - 120));

    await w.say('m08_hide');
    w.objective(step('m08', 'hide'));
    w.show(w.god, [2200, 2330], 'right');
    w.godLight(true);
    w.sfx('holy');
    await w.stealth(20);

    // the LORD God calls, and they come out
    w.cutscene(true);
    await w.walk(w.god, POINTS.godGrove, 90);
    w.face(w.god, 'down');
    await w.say('m08_call');
    w.cutscene(false);
    w.objective(step('m08', 'answer'), w.god);
    await useOnce(w, { id: 'answer', at: () => godAt(w), radius: 110, prompt: talkPrompt });
    w.cutscene(true);
    await Promise.all([w.walk(w.adam, POINTS.adamBefore, 90), w.walk(w.eve, POINTS.eveBefore, 90)]);
    w.face(w.adam, w.god);
    w.face(w.eve, w.god);
    w.face(w.god, w.adam);
    await w.say('m08_answer');
    w.cutscene(false);
  },
};

const m09: MissionDef = {
  id: 'eden.m09',
  key: 'm09',
  number: 9,
  kind: 'scripture',
  reference: 'Genesis 3:14–21',
  async run(w) {
    w.music('solemn');
    w.cutscene(true);
    w.serpentPose('ground');
    w.serpent.setPosition(POINTS.serpentGround[0], POINTS.serpentGround[1]);
    w.serpent.face('left');
    w.face(w.god, w.serpent);
    await w.cameraTo([POINTS.godGrove[0] + 60, POINTS.godGrove[1] + 40], 700);
    await w.say('m09_serpent');
    await w.walk(w.serpent, [POINTS.serpentGround[0] + 260, POINTS.serpentGround[1] + 40], 60);
    w.serpentPose('hidden');
    w.face(w.god, w.eve);
    await w.say('m09_woman');
    w.face(w.god, w.adam);
    await w.say('m09_adam');
    w.music('sorrow');
    w.thorns(true);
    w.sfx('grow');
    await w.wait(1200);
    await w.scripture('gen3_20');
    await w.scripture('gen3_21');
    await w.fade(1, 800);
    w.setOutfit('tunic');
    await w.wait(500);
    w.fx('holy', [w.adam.x + 50, w.adam.y]);
    w.sfx('holy');
    await w.fade(0, 800);
    await w.wait(800);
    w.cameraFollow();
    w.cutscene(false);
  },
};

const m10: MissionDef = {
  id: 'eden.m10',
  key: 'm10',
  number: 10,
  kind: 'scripture',
  reference: 'Genesis 3:22–24',
  async run(w) {
    w.setTime('dusk');
    w.music('solemn');
    w.cutscene(true);
    w.face(w.god, 'down');
    await w.say('m10_intro');
    await w.scripture('gen3_23');
    w.fx('holy', [w.god.x, w.god.y]);
    w.sfx('holy');
    await w.wait(600);
    w.hide(w.god);
    w.cutscene(false);

    w.openExit(true);
    w.follow(true);
    await w.say('m10_leave');
    w.objective(step('m10', 'leave'), POINTS.exit);
    await w.until(() => w.player().x > BOUNDS.right + 40);

    w.cutscene(true);
    const p = w.player();
    const o = other(w);
    await Promise.all([w.walk(p, [POINTS.ending[0] - 40, POINTS.exit[1] - 12], 110), w.walk(o, [POINTS.ending[0] - 90, POINTS.exit[1] + 22], 110)]);
    w.face(p, 'left');
    w.face(o, 'left');
    w.cherubim(true);
    w.sfx('flame');
    w.fx('holy', POINTS.sword);
    await w.cameraTo([POINTS.sword[0] + 60, POINTS.sword[1] - 30], 1400);
    await w.scripture('gen3_24');
    await w.wait(800);
    await w.fade(1, 1500);
    await w.say('ending');
  },
};

export const EDEN_MISSIONS: MissionDef[] = [m01, m02, m03, m04, m05, m06, m07, m08, m09, m10];
