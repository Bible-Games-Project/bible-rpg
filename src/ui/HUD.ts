import { KEY_LABELS } from '../core/input';
import { t } from '../core/i18n';
import { assetUrl, MANIFEST } from '../game/manifest';
import { h } from './dom';
import { wireButtonSounds } from './overlays';

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

/** Heads-up display (DOM): mission, objective, prompts, toasts, arrow. */
export class HUD {
  readonly root: HTMLElement;
  private mission: HTMLElement;
  private mNum: HTMLElement;
  private mTitle: HTMLElement;
  private mObj: HTMLElement;
  private mSource: HTMLElement;
  private prompt: HTMLElement;
  private toasts: HTMLElement;
  private inventory: HTMLElement;
  private charChip: HTMLElement;
  private arrow: HTMLElement;
  private timer: HTMLElement;
  private timerText: HTMLElement;
  private timerBar: HTMLElement;
  private fader: HTMLElement;
  private switchBtn: HTMLButtonElement;

  constructor(host: HTMLElement, actions: { pause(): void; switchCharacter(): void }) {
    this.mNum = h('div', { class: 'mission-number' });
    this.mTitle = h('div', { class: 'mission-title' });
    this.mObj = h('div', { class: 'objective' });
    this.mSource = h('div', { class: 'source' });
    this.mission = h('div', { class: 'mission-panel panel', 'aria-live': 'polite' }, this.mNum, this.mTitle, this.mObj, this.mSource);
    this.prompt = h('div', { class: 'prompt panel', hidden: true });
    this.toasts = h('div', { class: 'toast-stack' });
    this.inventory = h('div', { class: 'inventory-bar' });
    this.switchBtn = h('button', { class: 'btn small', onclick: actions.switchCharacter }, t('hud.switch')) as HTMLButtonElement;
    this.charChip = h('div', { class: 'character-chip panel', hidden: true });
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 34 34');
    // violet, the complement of the meadow's yellow-green, like the marker in the world
    svg.innerHTML =
      '<defs><linearGradient id="arrow-fill" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#d0a6fa"/><stop offset="1" stop-color="#7f42c4"/></linearGradient></defs>' +
      '<path d="M31 17 L11.5 5.2 Q8.6 3.6 9.6 6.8 L13.2 17 L9.6 27.2 Q8.6 30.4 11.5 28.8 Z" fill="url(#arrow-fill)" stroke="#f4e6ff" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M26 16 L13 8.6 L15.4 16 Z" fill="#ead7ff" opacity="0.7"/>';
    this.arrow = h('div', { class: 'objective-arrow', hidden: true });
    this.arrow.append(svg);
    this.timerText = h('div', {});
    this.timerBar = h('div', {});
    this.timer = h('div', { class: 'timer panel', hidden: true }, this.timerText, h('div', { class: 'bar' }, this.timerBar));
    this.fader = h('div', { class: 'fader' });
    const buttons = h('div', { class: 'hud-buttons' }, h('button', { class: 'btn small', onclick: actions.pause, 'aria-label': t('hud.pause') }, `☰ ${t('hud.pause')}`));
    this.root = h('div', { class: 'hud', hidden: true }, this.mission, buttons, this.inventory, this.charChip, this.prompt, this.toasts, this.timer, this.arrow, this.fader);
    wireButtonSounds(this.root);
    host.append(this.root);
  }

  show(v: boolean): void {
    this.root.hidden = !v;
  }

  setMission(info: MissionInfo | null): void {
    this.mission.hidden = !info;
    if (!info) return;
    this.mNum.textContent = t('hud.mission', { n: String(info.number).padStart(2, '0') });
    this.mTitle.textContent = info.title;
    this.mObj.textContent = info.objective;
    this.mSource.replaceChildren(h('span', { class: 'kind' }, info.kind === 'scripture' ? t('hud.story', { ref: info.reference }) : t('hud.inspired', { ref: info.reference })));
  }

  setObjective(text: string): void {
    if (this.mObj.textContent === text) return;
    this.mObj.textContent = text;
    this.mObj.animate?.([{ opacity: 0.3 }, { opacity: 1 }], { duration: 400 });
  }

  setPrompt(text: string | null, key: string = KEY_LABELS.interact): void {
    if (!text) {
      this.prompt.hidden = true;
      return;
    }
    this.prompt.hidden = false;
    this.prompt.replaceChildren(h('kbd', {}, key), h('span', {}, text));
  }

  toast(text: string, big = false, ms = 2600): void {
    const el = h('div', { class: `toast panel ${big ? 'big' : ''}` }, text);
    this.toasts.append(el);
    window.setTimeout(() => {
      el.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
      window.setTimeout(() => el.remove(), 290);
    }, ms);
  }

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
    if (x === null) {
      this.arrow.hidden = true;
      return;
    }
    this.arrow.hidden = false;
    this.arrow.style.left = `${x}px`;
    this.arrow.style.top = `${y}px`;
    this.arrow.style.transform = `rotate(${angle}rad)`;
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
