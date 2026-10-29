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
import { pixelRatio } from '../game/display';

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
      // drawn at the screen's real resolution and shown at CSS size (see display.ts)
      scale: { mode: Phaser.Scale.NONE, width: Math.round(window.innerWidth * pixelRatio()), height: Math.round(window.innerHeight * pixelRatio()), zoom: 1 / pixelRatio() },
      physics: { default: 'arcade', arcade: { debug: false } },
      input: { keyboard: false },
      audio: { noAudio: true },
      scene: [BootScene, EdenScene],
    });
    this.assetsReady = new Promise((resolve) => this.game.events.once('assets-ready', () => resolve()));
    const fit = () => {
      const r = pixelRatio();
      this.game.scale.setZoom(1 / r);
      this.game.scale.resize(Math.round(window.innerWidth * r), Math.round(window.innerHeight * r));
    };
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', () => window.setTimeout(fit, 150));
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
    await this.preGame();
    this.playing = true;
    this.touch.setActive(true);
    this.hud.show(true);
    const data: EdenStartData = { mode };
    this.game.scene.start('eden', data);
  }

  /**
   * Before playing: a black screen suggesting headphones, then the controls
   * (keys, or the touch controls on a touch screen). Any key or tap moves on
   * (the maintainer asked for both before the game starts).
   */
  private preGame(): Promise<void> {
    return new Promise((resolve) => {
      const touch = input.lastDevice === 'touch' || window.matchMedia('(pointer: coarse)').matches;
      const el = h('div', { class: 'pregame', role: 'dialog', 'aria-modal': 'true' });
      this.host.append(el);
      const layer: InputLayer = { modal: true, allowMovement: false, captureKeys: true, onAction: () => true };
      input.push(layer);
      const key = (k: string, wide = false) => h('kbd', { class: wide ? 'wide' : '' }, k);
      const row = (keys: HTMLElement, label: string) => h('div', { class: 'ctl' }, keys, h('span', {}, label));
      const headphones = h('div', { class: 'pregame-step' }, headphonesIcon(), h('p', {}, t('pregame.headphones')));
      const controls = h(
        'div',
        { class: 'pregame-step pregame-controls' },
        h('h2', {}, t('pregame.controls')),
        touch
          ? h('div', { class: 'ctl-grid' }, row(h('div', { class: 'touch-stick' }), t('pregame.touchMove')), row(h('div', { class: 'touch-btn' }, 'E'), t('pregame.touchAct')))
          : h(
              'div',
              { class: 'ctl-grid' },
              row(h('div', { class: 'wasd' }, key('W'), key('A'), key('S'), key('D')), t('pregame.move')),
              row(key('Shift', true), t('pregame.run')),
              row(key('E'), t('pregame.interact')),
              row(key('Tab', true), t('pregame.switch')),
              row(key('Esc', true), t('pregame.menu')),
            ),
        h('p', { class: 'pregame-start' }, t(touch ? 'pregame.startTouch' : 'pregame.start')),
      );
      let step = 0;
      let ready = false;
      el.append(headphones);
      const next = () => {
        if (!ready) return;
        window.clearTimeout(auto);
        step++;
        if (step === 1) {
          el.replaceChildren(controls);
          ready = false;
          window.setTimeout(() => (ready = true), 500);
          return;
        }
        window.removeEventListener('keydown', onKey, true);
        input.remove(layer);
        el.classList.add('out');
        window.setTimeout(() => el.remove(), 450);
        resolve();
      };
      const onKey = (e: KeyboardEvent) => {
        e.preventDefault();
        next();
      };
      window.addEventListener('keydown', onKey, true);
      el.addEventListener('pointerdown', next);
      window.setTimeout(() => (ready = true), 400);
      // the headphones note moves on by itself
      const auto = window.setTimeout(() => {
        ready = true;
        if (step === 0) next();
      }, 2600);
    });
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

function headphonesIcon(): HTMLElement {
  const wrap = h('div', { class: 'pregame-icon', 'aria-hidden': 'true' });
  wrap.innerHTML =
    '<svg viewBox="0 0 64 64" width="72" height="72"><path d="M10 38v-6a22 22 0 0 1 44 0v6" fill="none" stroke="#d9ae59" stroke-width="5" stroke-linecap="round"/>' +
    '<rect x="6" y="36" width="12" height="20" rx="4" fill="#d9ae59"/><rect x="46" y="36" width="12" height="20" rx="4" fill="#d9ae59"/></svg>';
  return wrap;
}
