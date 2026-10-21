import { audio } from '../../core/audio';
import { t } from '../../core/i18n';
import { save } from '../../core/save';
import type { PlayableId } from '../../data/characters';
import { EDEN_MISSION_IDS } from '../../data/eden/missionOrder';
import { ui } from '../bridge';
import type { EdenScene } from '../EdenScene';
import type { WorldApi } from '../WorldApi';
import { ambientEden, EDEN_MISSIONS, stageEden } from './eden';
import type { MissionDef } from './types';

const CHAPTER = 'eden';
const UNLOCKS = ['cain-abel'];

/** Thrown into a mission script when the scene is left mid-mission. */
class MissionStopped extends Error {}

/**
 * Runs the chapter's missions in order. Progress is committed to the save
 * after each mission; a reload resumes at the start of the mission that was
 * in progress.
 */
export class MissionRunner {
  private stopped = false;
  private readonly api: WorldApi;

  constructor(private scene: EdenScene, private mode: 'continue' | 'new') {
    // Mission scripts talk to the world through a guard: once the scene is
    // left, any further call ends the script instead of touching a dead scene.
    this.api = new Proxy(scene, {
      get: (target, prop, receiver) => {
        const v = Reflect.get(target, prop, receiver);
        if (typeof v !== 'function') return v;
        return (...args: unknown[]) => {
          if (this.stopped) throw new MissionStopped();
          return (v as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    }) as unknown as WorldApi;
  }

  stop(): void {
    this.stopped = true;
  }

  async start(): Promise<void> {
    if (EDEN_MISSIONS.map((m) => m.id).join() !== EDEN_MISSION_IDS.join()) console.warn('[missions] order mismatch');
    let progress = save.chapter(CHAPTER);
    const fresh = this.mode === 'new' || !progress || progress.completed || !progress.currentMission;
    if (fresh || !progress) progress = save.startChapter(CHAPTER, EDEN_MISSIONS[0].id, 'adam');
    const first = Math.max(0, EDEN_MISSIONS.findIndex((m) => m.id === progress!.currentMission));
    this.scene.setState(progress.flags, progress.inventory);
    const hud = ui().hud;
    hud.show(true);
    void hud.fade(1, 0);
    try {
      for (let i = first; i < EDEN_MISSIONS.length; i++) {
        if (this.stopped) return;
        const active = (i === first ? progress.activeCharacter : this.scene.activeId()) as PlayableId;
        await this.runMission(EDEN_MISSIONS[i], i === first, active, fresh && i === 0);
      }
    } catch (e) {
      if (e instanceof MissionStopped) return;
      throw e;
    }
  }

  private async runMission(m: MissionDef, fromSave: boolean, active: PlayableId, chapterStart: boolean): Promise<void> {
    const w = this.api;
    const hud = ui().hud;
    w.clearInteractions();
    w.objective('', null);
    stageEden(w, m.number, { place: fromSave, active: active === 'eve' ? 'eve' : 'adam' });
    ambientEden(w, m.number);
    const title = t(`eden.missions.${m.key}.title`);
    hud.setMission({ number: m.number, title, objective: t(`eden.missions.${m.key}.desc`), kind: m.kind, reference: m.reference });
    if (chapterStart) await ui().chapterIntro();
    if (fromSave) await w.fade(0, 900);
    audio.play('missionStart');
    w.toast(`${t('hud.mission', { n: String(m.number).padStart(2, '0') })} — ${title}`, true);
    await w.wait(900);

    await m.run(w);
    if (this.stopped) return;

    // mission complete: commit progress
    w.clearInteractions();
    w.objective('', null);
    const index = EDEN_MISSIONS.indexOf(m);
    const next = EDEN_MISSIONS[index + 1]?.id ?? null;
    save.commitMission(CHAPTER, m.id, next, this.scene.getState());
    if (!next) {
      save.completeChapter(CHAPTER, UNLOCKS);
      audio.play('missionComplete');
      await w.chapterComplete();
      return;
    }
    audio.play('missionComplete');
    w.toast(t('hud.missionComplete'), true);
    await w.wait(1400);
    w.toast(t('hud.saved'));
    await w.wait(900);
  }
}
