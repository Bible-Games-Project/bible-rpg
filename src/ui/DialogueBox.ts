import { audio } from '../core/audio';
import { input, KEY_LABELS, type InputLayer } from '../core/input';
import { graphemes, t } from '../core/i18n';
import { settings, TEXT_SPEED_CPS } from '../core/settings';
import { voices } from '../core/voices';
import { CHARACTERS } from '../data/characters';
import { h } from './dom';
import { PortraitAnimator } from './PortraitAnimator';

export interface Line {
  speaker: string;            // character id, or 'narrator'
  text: string;
  ref?: string;               // Bible reference shown with the line
  scripture?: boolean;        // a verbatim quotation (gold card)
  portrait?: string;          // portrait to show instead of the speaker's usual one
  voice?: string;             // key of its recorded voice (src/core/voices.ts)
}

/**
 * Dialogue with an animated portrait above a text box. The text is
 * revealed progressively; the first press shows the whole line, the next
 * press continues. Movement is blocked while it is open. A line with a
 * recorded voice is spoken (instead of the reveal's blips) and cut off when
 * the player moves on.
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
  private speaking: { ended: Promise<void>; stop(): void } | null = null;
  private lineNo = 0;
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
      // the recorded voices load while the first line starts
      for (const l of lines) if (l.voice) void voices.prepare(l.voice, l.text);
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
    this.stopVoice();
    const no = ++this.lineNo;
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
    if (!narrator) this.portrait.setPortrait(line.portrait ?? ch.portrait);
    this.frame.classList.toggle('divine', line.speaker === 'god');
    this.nameEl.textContent = line.scripture ? '' : t(ch.nameKey);
    // the reference only: players need not see which translation it is
    this.refEl.textContent = line.ref ?? '';
    const text = line.scripture ? `“${line.text}”` : line.text;
    this.chars = graphemes(text);
    this.shown = 0;
    this.acc = 0;
    this.textEl.textContent = '';
    this.nextEl.hidden = true;
    const touch = document.documentElement.classList.contains('touch-ui');
    this.hintEl.textContent = touch ? t('dialogue.tapHint') : t('dialogue.skipHint', { key: KEY_LABELS.interact });
    const voiced = !!line.voice && voices.has(line.voice, line.text);
    if (voiced) this.speak(line, no, !narrator && !line.scripture);
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
        if (this.shown % 3 === 0 && c.trim() && !narrator && !voiced) audio.blip(voice);
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
    if (!this.speaking) this.portrait.setTalking(false);
    this.nextEl.hidden = false;
  }

  /** Plays the line's recorded voice; the portrait talks until it ends. */
  private speak(line: Line, no: number, talks: boolean): void {
    const asked = performance.now();
    void voices.prepare(line.voice!, line.text).then((buf) => {
      // the player moved on, or it loaded too late to match the text
      if (!buf || no !== this.lineNo || !this.open || performance.now() - asked > 2500) return;
      const v = audio.speak(buf);
      if (!v) return;
      this.speaking = v;
      if (talks) this.portrait.setTalking(true);
      void v.ended.then(() => {
        if (this.speaking !== v) return;
        this.speaking = null;
        if (!this.revealing) this.portrait.setTalking(false);
      });
    });
  }

  private stopVoice(): void {
    this.speaking?.stop();
    this.speaking = null;
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

  /** Close at once (e.g. when leaving the game); resolves the pending show(). */
  dismiss(): void {
    if (!this.open) return;
    this.queue = [];
    this.close();
  }

  private close(): void {
    cancelAnimationFrame(this.raf);
    this.stopVoice();
    this.lineNo++;
    this.open = false;
    this.root.hidden = true;
    input.remove(this.layer);
    this.portrait.stop();
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }
}
