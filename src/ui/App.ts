import Phaser from 'phaser';
import { audio } from '../core/audio';
import { input, type InputLayer } from '../core/input';
import { t } from '../core/i18n';
import { NAMEABLE, ANIMALS } from '../data/animals';
import { BootScene } from '../game/BootScene';
import { setUiBridge } from '../game/bridge';
import { EdenScene, type EdenStartData } from '../game/EdenScene';
import { DialogueBox } from './DialogueBox';
import { h } from './dom';
import { HUD } from './HUD';
import { openNamingPuzzle } from './NamingPuzzle';
import { confirmDialog, openOverlay, wireButtonSounds, type OverlayHandle } from './overlays';
import { funScreen, mainMenuScreen, moreGamesScreen, storyMapScreen } from './screens';
import { openSettings } from './SettingsPanel';
import { TouchControls } from './TouchControls';

/**
 * The application shell: DOM screens (menu, story path, Fun, More Games),
 * the Phaser game underneath them, and the in-game interface (HUD, dialogue,
 * pause menu, chapter cards).
 */
export class App {
  readonly game: Phaser.Game;
  private hud: HUD;
  private dialogue: DialogueBox;
  private touch: TouchControls;
  private screen: HTMLElement | null = null;
  private assetsReady: Promise<void>;
  private pause: OverlayHandle | null = null;
  private playing = false;

  constructor(private host: HTMLElement) {
    this.hud = new HUD(host, {
      pause: () => this.openPause(),
      switchCharacter: () => this.eden()?.switchCharacter(),
    });
    this.dialogue = new DialogueBox(host, () => this.openPause());
    this.touch = new TouchControls(host);
    setUiBridge({
      hud: this.hud,
      dialogue: this.dialogue,
      openPause: () => this.openPause(),
      chapterIntro: () => this.chapterIntro(),
      chapterComplete: () => this.chapterComplete(),
      exitToMenu: () => this.leaveGame('map'),
    });

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      backgroundColor: '#151820',
      pixelArt: true,
      roundPixels: true,
      scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
      physics: { default: 'arcade', arcade: { debug: false } },
      input: { keyboard: false },
      audio: { noAudio: true },
      scene: [BootScene, EdenScene],
    });
    this.assetsReady = new Promise((resolve) => this.game.events.once('assets-ready', () => resolve()));
  }

  start(): void {
    this.showMenu();
  }

  private eden(): EdenScene | null {
    const m = this.game.scene;
    if (!m.isActive('eden') && !m.isPaused('eden')) return null;
    return m.getScene('eden') as EdenScene;
  }

  // ---------------------------------------------------------------- screens

  private setScreen(el: HTMLElement | null): void {
    this.screen?.remove();
    this.screen = el;
    if (el) this.host.prepend(el);
  }

  private showMenu(): void {
    audio.setMood('none');
    this.setScreen(
      mainMenuScreen({
        play: () => this.showMap(),
        fun: () => this.showFun(),
        moreGames: () => this.setScreen(moreGamesScreen(() => this.showMenu())),
        settings: () => openSettings(),
      }),
    );
  }

  private showMap(): void {
    this.setScreen(storyMapScreen({ back: () => this.showMenu(), start: (id, mode) => void this.startChapter(id, mode) }));
  }

  private showFun(): void {
    this.setScreen(
      funScreen({
        back: () => this.showMenu(),
        playNaming: () => {
          const ids = [...NAMEABLE].sort(() => Math.random() - 0.5);
          void openNamingPuzzle(ids.map((id) => ({ id, species: ANIMALS.find((a) => a.id === id)!.species })));
        },
      }),
    );
  }

  // ------------------------------------------------------------------ game

  private async startChapter(id: string, mode: 'continue' | 'new'): Promise<void> {
    if (id !== 'eden') return;
    const loading = h('div', { class: 'loading', role: 'status' }, t('app.loading'));
    this.setScreen(loading);
    await this.assetsReady;
    this.setScreen(null);
    this.playing = true;
    this.touch.setActive(true);
    this.hud.show(true);
    const data: EdenStartData = { mode };
    this.game.scene.start('eden', data);
  }

  /** Leave the chapter (progress is saved at the end of every mission). */
  private leaveGame(to: 'map' | 'menu'): void {
    this.stopScene();
    this.playing = false;
    this.touch.setActive(false);
    this.resetHud();
    this.hud.show(false);
    if (to === 'map') this.showMap();
    else this.showMenu();
  }

  private stopScene(): void {
    const s = this.eden();
    s?.halt();
    this.dialogue.dismiss();
    if (s) this.game.scene.stop('eden');
    input.releaseAll();
  }

  private resetHud(): void {
    this.hud.setMission(null);
    this.hud.setPrompt(null);
    this.hud.setTimer(null);
    this.hud.setArrow(null);
    this.hud.setInventory([]);
    this.hud.setCharacter(null, null);
  }

  private restartMission(): void {
    this.stopScene();
    this.resetHud();
    this.game.scene.start('eden', { mode: 'continue' } satisfies EdenStartData);
  }

  // ------------------------------------------------------------------ pause

  private openPause(): void {
    if (!this.playing || this.pause) return;
    this.game.scene.pause('eden');
    input.releaseAll();
    const close = () => {
      this.pause?.close();
      this.pause = null;
      if (this.playing) this.game.scene.resume('eden');
    };
    const panel = h(
      'div',
      { class: 'panel dialog pause-menu' },
      h('h2', { class: 'panel-title' }, t('pause.title')),
      h(
        'div',
        { class: 'pause-actions' },
        h('button', { class: 'btn primary', onclick: close }, t('pause.resume')),
        h('button', { class: 'btn', onclick: () => openSettings() }, t('pause.settings')),
        h(
          'button',
          {
            class: 'btn',
            onclick: async () => {
              const ok = await confirmDialog({ title: t('pause.restartMission'), body: t('pause.restartConfirm'), confirm: t('pause.restartMission') });
              if (!ok) return;
              this.pause?.close();
              this.pause = null;
              this.restartMission();
            },
          },
          t('pause.restartMission'),
        ),
        h(
          'button',
          {
            class: 'btn',
            'data-sound': 'back',
            onclick: () => {
              this.pause?.close();
              this.pause = null;
              this.leaveGame('map');
            },
          },
          t('pause.quit'),
        ),
      ),
      h('p', { class: 'muted hint' }, t('pause.saveNote')),
    );
    this.pause = openOverlay(panel, close);
  }

  // ---------------------------------------------------------- chapter cards

  private card(content: HTMLElement[], actions: HTMLElement[]): { el: HTMLElement; close(): void } {
    const el = h('div', { class: 'chapter-card', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'inner panel' }, ...content, h('div', { class: 'actions' }, ...actions)));
    wireButtonSounds(el);
    this.host.append(el);
    const layer: InputLayer = { modal: true, allowMovement: false, onAction: () => true };
    input.push(layer);
    requestAnimationFrame(() => el.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }));
    return {
      el,
      close: () => {
        input.remove(layer);
        el.remove();
      },
    };
  }

  private chapterIntro(): Promise<void> {
    return new Promise((resolve) => {
      const begin = h('button', { class: 'btn primary', onclick: () => {
        c.close();
        resolve();
      } }, t('map.start'));
      const c = this.card(
        [h('h1', {}, t('eden.chapter.title')), h('h2', {}, t('eden.chapter.reference')), h('p', {}, t('eden.chapter.intro'))],
        [begin],
      );
    });
  }

  private chapterComplete(): void {
    this.hud.setMission(null);
    this.touch.setActive(false);
    const done = (to: 'map' | 'menu') => {
      c.close();
      this.leaveGame(to);
    };
    const c = this.card(
      [h('h1', {}, t('complete.title')), h('h2', {}, t('complete.chapter')), h('p', {}, t('complete.body')), h('p', { class: 'next' }, t('complete.next'))],
      [
        h('button', { class: 'btn primary', onclick: () => done('map') }, t('complete.toMap')),
        h('button', { class: 'btn', onclick: () => done('menu') }, t('complete.toMenu')),
      ],
    );
  }
}
