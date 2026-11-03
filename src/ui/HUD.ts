import { KEY_LABELS } from '../core/input';
import { t } from '../core/i18n';
import { assetUrl, MANIFEST } from '../game/manifest';
import { h } from './dom';
import { wireButtonSounds } from './overlays';

/** The pixel-art arrow strip (public/assets/ui/arrows.png, drawn by
 * tools/art/ui_markers.py): cells of 17 px, one per heading, clockwise from
 * pointing right. */
export const ARROW_CELL = 17;
export const ARROW_HEADINGS = 16;
/** CSS px per arrow pixel, before rounding to whole device pixels. */
export const ARROW_CSS_PER_PIXEL = 1.75;

/** Screen pixels per arrow pixel: a whole number of device pixels keeps it sharp. */
export function arrowPixel(dpr: number): number {
  return Math.max(2, Math.round(ARROW_CSS_PER_PIXEL * dpr));
}

export interface MissionInfo {
  number: number;
  title: string;
  objective: string;
  kind: 'scripture' | 'inspired';
  reference: string;
}

export interface InventoryChip {
  icon: string;          // sprite key in the manifest
  label: string;
  count?: number;
}

/** How long the mission panel stays open by itself: a new mission, a new
 * step of one, a mission completed. */
const NEW_MISSION_MS = 6000;
const NEW_STEP_MS = 4000;
const COMPLETE_MS = 4000;

function still(): boolean {
  return document.documentElement.dataset.reduceMotion === 'true' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Heads-up display (DOM): mission, objective, prompts, toasts, arrow. */
export class HUD {
  readonly root: HTMLElement;
  private mission: HTMLElement;
  private mObj: HTMLElement;
  private mText: HTMLElement;
  private mRef: HTMLElement;
  private mSaved: HTMLElement;
  private prompt: HTMLElement;
  private toasts: HTMLElement;
  private inventory: HTMLElement;
  private charChip: HTMLElement;
  private arrow: HTMLElement;
  private timer: HTMLElement;
  private timerText: HTMLElement;
  private timerBar: HTMLElement;
  private fader: HTMLElement;
  private banners: HTMLElement;
  private switchBtn: HTMLButtonElement;
  private missionsBtn: HTMLButtonElement;
  /** the mission panel opens on the Missions button, or for a moment when
   * there is something new to read (the maintainer did not want it open all
   * the time) */
  private panelOpen = false;
  private pinned = false;
  private hasMission = false;
  /** the mission's title, shown when it has no step to show */
  private missionTitle = '';
  /** the current step ("Go to the Lord God"), without the reference */
  private objective = '';
  /** the next step shown is the mission's first: it shines */
  private freshMission = false;
  private closeTimer = 0;
  private panelAnim: Animation | null = null;

  constructor(host: HTMLElement, actions: { pause(): void; switchCharacter(): void }) {
    // one line: what to do and the Bible reference ("Go to the Lord God
    // (Genesis 2:15)"); the maintainer found the mission number, title and
    // "Story event" label too much text on screen
    this.mText = h('span', { class: 'objective-text' });
    this.mRef = h('span', { class: 'ref' });
    this.mSaved = h('span', { class: 'saved' });
    this.mObj = h('div', { class: 'objective' }, h('span', {}, this.mText, this.mRef, this.mSaved));
    this.mission = h('div', { class: 'mission-panel panel closed', id: 'hud-mission', 'aria-live': 'polite' }, this.mObj);
    this.missionsBtn = h(
      'button',
      { class: 'btn small hud-missions', 'aria-expanded': 'false', 'aria-controls': 'hud-mission', hidden: true, onclick: () => this.toggleMission() },
      `◆ ${t('hud.missions')}`,
    ) as HTMLButtonElement;
    this.prompt = h('div', { class: 'prompt panel', hidden: true });
    this.toasts = h('div', { class: 'toast-stack' });
    this.inventory = h('div', { class: 'inventory-bar' });
    this.switchBtn = h('button', { class: 'btn small', onclick: actions.switchCharacter }, t('hud.switch')) as HTMLButtonElement;
    this.charChip = h('div', { class: 'character-chip panel', hidden: true });
    // the pixel-art arrow of the world marker (tools/art/ui_markers.py), one
    // drawing per heading: a rotated pixel image looks ragged
    this.arrow = h('div', { class: 'objective-arrow' });
    this.arrow.style.backgroundImage = `url(${assetUrl('assets/ui/arrows.png')})`;
    this.timerText = h('div', {});
    this.timerBar = h('div', {});
    this.timer = h('div', { class: 'timer panel', hidden: true }, this.timerText, h('div', { class: 'bar' }, this.timerBar));
    this.fader = h('div', { class: 'fader' });
    this.banners = h('div', { class: 'hud-banners', 'aria-live': 'assertive' });
    const buttons = h('div', { class: 'hud-buttons' }, h('button', { class: 'btn small', onclick: actions.pause, 'aria-label': t('hud.pause') }, `☰ ${t('hud.pause')}`));
    // the Missions button, with the mission and the notices to its right (the maintainer)
    const left = h('div', { class: 'hud-left' }, this.missionsBtn, h('div', { class: 'hud-notes' }, this.mission, this.toasts));
    this.root = h('div', { class: 'hud', hidden: true }, left, buttons, this.inventory, this.charChip, this.prompt, this.timer, this.arrow, this.banners, this.fader);
    wireButtonSounds(this.root);
    host.append(this.root);
  }

  show(v: boolean): void {
    this.root.hidden = !v;
  }

  /**
   * A new mission. The panel opens with its first step, which then shines
   * (the maintainer found a separate "new mission" box, and the mission's
   * number, title and description, too much text); a completed mission
   * still on show closes softly first.
   */
  setMission(info: MissionInfo | null): void {
    this.hasMission = !!info;
    this.missionsBtn.hidden = !info;
    if (!info) {
      this.mission.classList.remove('complete');
      this.closeMission(true);
      return;
    }
    if (this.mission.classList.contains('complete')) this.closeMission();
    this.mission.classList.remove('complete');
    this.missionTitle = info.title;
    this.objective = '';
    this.freshMission = true;
    this.mText.textContent = info.title;
    this.mRef.textContent = info.reference ? ` (${info.reference})` : '';
    this.mSaved.textContent = '';
  }

  /** Open the mission panel; with a time, it closes again by itself (unless
   * the player opened it with the button). */
  private openMission(ms = 0): void {
    if (!this.hasMission) return;
    window.clearTimeout(this.closeTimer);
    if (ms && !this.pinned) this.closeTimer = window.setTimeout(() => this.closeMission(), ms);
    this.missionsBtn.setAttribute('aria-expanded', 'true');
    if (this.panelOpen) return;
    this.panelOpen = true;
    this.panelAnim?.cancel();
    this.mission.classList.remove('closed');
    if (!still() && this.mission.animate) {
      this.panelAnim = this.mission.animate(
        [
          { opacity: 0, transform: 'translateX(-10px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 320, easing: 'ease-out' },
      );
    }
  }

  /** Close it softly (the maintainer: not all at once). */
  private closeMission(now = false): void {
    window.clearTimeout(this.closeTimer);
    this.missionsBtn.setAttribute('aria-expanded', 'false');
    if (!this.panelOpen) return;
    this.panelOpen = false;
    this.pinned = false;
    this.panelAnim?.cancel();
    if (now || still() || !this.mission.animate) {
      this.mission.classList.add('closed');
      return;
    }
    const a = this.mission.animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'translateX(-10px)' },
      ],
      { duration: 450, easing: 'ease-in', fill: 'forwards' },
    );
    this.panelAnim = a;
    a.onfinish = () => {
      if (this.panelAnim !== a) return;
      this.mission.classList.add('closed');
      a.cancel();
    };
  }

  /** The Missions button: open it until pressed again, or close it. */
  private toggleMission(): void {
    if (this.panelOpen) {
      this.closeMission();
      return;
    }
    this.pinned = true;
    this.openMission();
  }

  /** The panel's own "mission complete": a green tick and a glow, with the
   * note that progress is saved, until the next mission takes its place. */
  completeMission(): void {
    if (!this.hasMission) return;
    this.mText.textContent = t('hud.missionComplete');
    this.mRef.textContent = '';
    this.mSaved.textContent = ` · ${t('hud.saved')}`;
    this.mission.classList.remove('fresh');
    this.mission.classList.add('complete');
    this.openMission(COMPLETE_MS);
  }

  private shine(): void {
    this.mission.classList.remove('fresh');
    void this.mission.offsetWidth;
    this.mission.classList.add('fresh');
  }

  setObjective(text: string): void {
    // the completed mission stays on show until the next one replaces it
    if (this.mission.classList.contains('complete') && !text) return;
    const was = this.objective;
    if (was === text) return;
    this.objective = text;
    // with no step yet (or between steps) the line names the mission
    this.mText.textContent = text || this.missionTitle;
    this.mObj.animate?.([{ opacity: 0.3 }, { opacity: 1 }], { duration: 400 });
    // a new step opens the panel for a moment; a count going up ("3/6") does not
    const digitless = (s: string) => s.replace(/\d+/g, '#');
    if (text && digitless(text) !== digitless(was)) {
      this.openMission(this.freshMission ? NEW_MISSION_MS : NEW_STEP_MS);
      if (this.freshMission) this.shine();
      this.freshMission = false;
    }
  }

  setPrompt(text: string | null, key: string = KEY_LABELS.interact): void {
    if (!text) {
      this.prompt.hidden = true;
      return;
    }
    this.prompt.hidden = false;
    this.prompt.replaceChildren(h('kbd', {}, key), h('span', {}, text));
  }

  /** A notice under the mission. The same notice is never shown twice at
   * once (the maintainer could stack "Switch to Adam" by pressing again): it
   * stays up a little longer instead. */
  toast(text: string, big = false, ms = 2600): void {
    const same = this.shown.get(text);
    if (same) {
      window.clearTimeout(same.timer);
      same.timer = window.setTimeout(same.end, ms);
      return;
    }
    const el = h('div', { class: `toast panel ${big ? 'big' : ''}` }, text);
    this.toasts.append(el);
    const entry = {
      timer: 0,
      end: () => {
        this.shown.delete(text);
        el.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
        window.setTimeout(() => el.remove(), 290);
      },
    };
    entry.timer = window.setTimeout(entry.end, ms);
    this.shown.set(text, entry);
  }

  private shown = new Map<string, { timer: number; end: () => void }>();

  setInventory(items: InventoryChip[]): void {
    this.inventory.replaceChildren(
      ...items.map((it) => {
        const a = MANIFEST.sprites[it.icon];
        const k = 2 * (a?.scale ?? 1);
        const icon = a ? h('img', { class: 'pixel', src: assetUrl(a.file), alt: '', width: Math.round(a.frameWidth * k), height: Math.round(a.frameHeight * k) }) : null;
        return h('div', { class: 'inv-chip panel' }, icon, h('span', {}, it.label), it.count !== undefined ? h('span', { class: 'count' }, `×${it.count}`) : null);
      }),
    );
  }

  setCharacter(name: string | null, other: string | null): void {
    this.charChip.hidden = !name;
    if (!name) return;
    const parts: (HTMLElement | string)[] = [h('span', {}, t('hud.playingAs', { name }))];
    if (other) {
      this.switchBtn.textContent = t('hud.switchTo', { name: other });
      parts.push(h('kbd', {}, KEY_LABELS.switch), this.switchBtn);
    }
    this.charChip.replaceChildren(...parts);
  }

  /** Arrow at the screen edge pointing to an off-screen objective. */
  setArrow(x: number | null, y = 0, angle = 0): void {
    // it fades in and out (the maintainer did not want it to pop)
    this.arrow.classList.toggle('shown', x !== null);
    if (x === null) return;
    const dpr = window.devicePixelRatio || 1;
    const px = arrowPixel(dpr) / dpr;
    const heading = (((Math.round(angle / ((2 * Math.PI) / ARROW_HEADINGS)) % ARROW_HEADINGS) + ARROW_HEADINGS) % ARROW_HEADINGS);
    const st = this.arrow.style;
    st.left = `${x}px`;
    st.top = `${y}px`;
    st.width = st.height = `${ARROW_CELL * px}px`;
    st.marginLeft = st.marginTop = `${(-ARROW_CELL * px) / 2}px`;
    st.backgroundSize = `${ARROW_CELL * ARROW_HEADINGS * px}px ${ARROW_CELL * px}px`;
    st.backgroundPosition = `${-heading * ARROW_CELL * px}px 0`;
  }

  /** A big word in the middle of the screen for a moment ("Run and hide!"). */
  banner(text: string, ms = 1700): void {
    this.banners.replaceChildren();
    const b = h('div', { class: 'hud-banner' }, text);
    b.style.animationDuration = `${ms}ms`;
    b.addEventListener('animationend', () => b.remove());
    this.banners.append(b);
  }

  setTimer(remaining: number | null, total = 1, label = ''): void {
    if (remaining === null) {
      this.timer.hidden = true;
      return;
    }
    this.timer.hidden = false;
    this.timerText.textContent = `${label} · ${Math.ceil(remaining)}s`;
    this.timerBar.style.width = `${Math.max(0, Math.min(1, remaining / total)) * 100}%`;
  }

  fade(to: number, ms = 600, color = '#000'): Promise<void> {
    this.fader.style.background = color;
    this.fader.style.transitionDuration = `${ms}ms`;
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        this.fader.style.opacity = String(to);
        window.setTimeout(resolve, ms + 20);
      });
    });
  }
}
