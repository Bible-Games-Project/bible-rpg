import { audio } from '../core/audio';
import { input, KEY_LABELS, type InputLayer } from '../core/input';
import { graphemes, t } from '../core/i18n';
import { settings, TEXT_SPEED_CPS } from '../core/settings';
import { CHARACTERS } from '../data/characters';
import { h } from './dom';
import { PortraitAnimator } from './PortraitAnimator';

export interface Line {
  speaker: string;            // character id, or 'narrator'
  text: string;
  ref?: string;               // Bible reference shown with the line
  scripture?: boolean;        // a verbatim quotation (gold card)
}

/**
 * Dialogue with an animated portrait above a text box. The text is
 * revealed progressively; the first press shows the whole line, the next
 * press continues. Movement is blocked while it is open.
 */
export class DialogueBox {
  private root: HTMLElement;
  private frame: HTMLElement;
  private nameEl: HTMLElement;
  private refEl: HTMLElement;
  private textEl: HTMLElement;
  private nextEl: HTMLElement;
  private hintEl: HTMLElement;
  private portrait = new PortraitAnimator();
  private queue: Line[] = [];
  private chars: string[] = [];
  private shown = 0;
  private revealing = false;
  private acc = 0;
  private raf = 0;
  private last = 0;
  private resolve: (() => void) | null = null;
  private layer: InputLayer;
  open = false;

  constructor(host: HTMLElement, private onPause: () => void) {
    this.frame = h('div', { class: 'portrait-frame panel' }, this.portrait.canvas);
    this.nameEl = h('span', {});
    this.refEl = h('span', { class: 'ref' });
    this.textEl = h('div', { class: 'text', 'aria-live': 'polite' });
    this.nextEl = h('div', { class: 'next', 'aria-hidden': 'true' });
    this.hintEl = h('div', { class: 'controls-hint' });
    const box = h('div', { class: 'box panel' }, h('div', { class: 'speaker' }, this.nameEl, this.refEl), this.textEl, this.nextEl, this.hintEl);
    this.root = h('div', { class: 'dialogue', hidden: true, role: 'dialog', 'aria-label': t('dialogue.next') }, this.frame, box);
    box.addEventListener('click', () => this.advance());
    host.append(this.root);
    this.layer = {
      modal: true,
      allowMovement: false,
      captureKeys: true,
      onAction: (a) => {
        if (a === 'interact') this.advance();
        else if (a === 'pause') this.onPause();
        return true;
      },
    };
  }

  show(lines: Line[]): Promise<void> {
    if (!lines.length) return Promise.resolve();
    return new Promise((resolve) => {
      this.queue = [...lines];
      this.resolve = resolve;
      if (!this.open) {
        this.open = true;
        this.root.hidden = false;
        input.push(this.layer);
        this.portrait.start();
      }
      this.nextLine();
    });
  }

  private nextLine(): void {
    const line = this.queue.shift();
    if (!line) {
      this.close();
      return;
    }
    const ch = CHARACTERS[line.speaker] ?? CHARACTERS.narrator;
    const narrator = !ch.portrait;
    this.root.classList.toggle('narration', narrator && !line.scripture);
    this.root.classList.toggle('scripture', !!line.scripture);
    this.frame.hidden = narrator || !!line.scripture;
    this.portrait.reduceMotion = settings.get().reduceMotion;
    if (!narrator) this.portrait.setPortrait(ch.portrait);
    this.frame.classList.toggle('divine', line.speaker === 'god');
    this.nameEl.textContent = line.scripture ? '' : t(ch.nameKey);
    this.refEl.textContent = line.ref ? (line.scripture ? `${line.ref} (KJV)` : line.ref) : '';
    const text = line.scripture ? `“${line.text}”` : line.text;
    this.chars = graphemes(text);
    this.shown = 0;
    this.acc = 0;
    this.textEl.textContent = '';
    this.nextEl.hidden = true;
    this.hintEl.textContent = t('dialogue.skipHint', { key: KEY_LABELS.interact });
    const cps = TEXT_SPEED_CPS[settings.get().textSpeed];
    if (!isFinite(cps)) {
      this.finishLine();
      return;
    }
    this.revealing = true;
    this.portrait.setTalking(!narrator);
    this.last = performance.now();
    const voice = ch.voice;
    const tick = (now: number) => {
      const dt = (now - this.last) / 1000;
      this.last = now;
      this.acc += dt * cps * (line.scripture ? 0.85 : 1);
      let added = false;
      while (this.acc >= 1 && this.shown < this.chars.length) {
        this.acc -= 1;
        this.shown++;
        added = true;
        const c = this.chars[this.shown - 1];
        if (this.shown % 3 === 0 && c.trim() && !narrator) audio.blip(voice);
        if (/[.,;:!?…—]/.test(c)) this.acc -= cps * 0.06;
      }
      if (added) this.textEl.textContent = this.chars.slice(0, this.shown).join('');
      if (this.shown >= this.chars.length) this.finishLine();
      else this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private finishLine(): void {
    cancelAnimationFrame(this.raf);
    this.revealing = false;
    this.shown = this.chars.length;
    this.textEl.textContent = this.chars.join('');
    this.portrait.setTalking(false);
    this.nextEl.hidden = false;
  }

  advance(): void {
    if (!this.open) return;
    if (this.revealing) {
      this.finishLine();
      return;
    }
    audio.play('uiMove', { volume: 0.6 });
    this.nextLine();
  }

  private close(): void {
    cancelAnimationFrame(this.raf);
    this.open = false;
    this.root.hidden = true;
    input.remove(this.layer);
    this.portrait.stop();
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }
}
