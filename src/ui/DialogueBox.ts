import { audio } from '../core/audio';
import { input, type InputLayer } from '../core/input';
import { graphemes, t } from '../core/i18n';
import { settings, TEXT_SPEED_CPS } from '../core/settings';
import { voices } from '../core/voices';
import { CHARACTERS } from '../data/characters';
import { h } from './dom';
import { PortraitAnimator } from './PortraitAnimator';

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** a line without a voice stays this long per character, plus READ_PAUSE */
const READ_MS = 55;
const READ_PAUSE = 1200;
/** the pause after a line, before the next */
const LINE_GAP = 450;

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
 * revealed progressively and goes on by itself: once its recorded voice has
 * been said (instead of the reveal's blips), or after the time to read it.
 * It cannot be skipped (the maintainer, 2026-11-10). The player can walk
 * meanwhile (the scene stops their running and holds them in cutscenes);
 * walking away never pauses it (the maintainer, 2026-11-12). A narrated line
 * can also be told without holding the player (`narrate`).
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
  private passive: Promise<void> = Promise.resolve();
  private fading: Animation | null = null;
  private passiveLine = false;
  private voiceStart = 0;
  private voiceLength = 0;
  /** a modal dialogue is showing */
  open = false;
  /** a line is being narrated while the player moves (nothing can be used) */
  narrating = false;
  /** who is saying the line on screen (a character id, 'narrator'), or null */
  speaker: string | null = null;

  constructor(host: HTMLElement, private onPause: () => void) {
    this.frame = h('div', { class: 'portrait-frame panel' }, this.portrait.canvas);
    this.nameEl = h('span', {});
    this.refEl = h('span', { class: 'ref' });
    this.textEl = h('div', { class: 'text', 'aria-live': 'polite' });
    this.nextEl = h('div', { class: 'next', 'aria-hidden': 'true' });
    this.hintEl = h('div', { class: 'controls-hint' });
    const box = h('div', { class: 'box panel' }, h('div', { class: 'speaker' }, this.nameEl, this.refEl), this.textEl, this.nextEl, this.hintEl);
    this.root = h('div', { class: 'dialogue', hidden: true, role: 'dialog', 'aria-label': t('dialogue.next') }, this.frame, box);
    host.append(this.root);
    this.layer = {
      modal: true,
      allowMovement: true,
      captureKeys: true,
      onAction: (a) => {
        // nothing skips a line (the maintainer)
        if (a === 'pause') this.onPause();
        return true;
      },
    };
  }

  show(lines: Line[]): Promise<void> {
    if (!lines.length) return Promise.resolve();
    // after the narration being told, never over it
    return this.passive.then(() => new Promise<void>((resolve) => {
      this.queue = [...lines];
      this.resolve = resolve;
      // the recorded voices load while the first line starts
      for (const l of lines) if (l.voice) void voices.prepare(l.voice, l.text);
      if (!this.open) {
        this.open = true;
        this.reveal();
        input.push(this.layer);
        this.portrait.start();
      }
      this.nextLine();
    }));
  }

  /**
   * A narrated line that does not hold the player (the maintainer: players
   * should feel free): shown and spoken while they keep moving, closed once
   * it has been said. Nothing can be used meanwhile (`narrating`), so a
   * second narration cannot start over it; one asked for waits its turn.
   */
  narrate(line: Line): Promise<void> {
    const run = this.passive.then(async () => {
      const no = ++this.lineNo;
      this.narrating = true;
      this.passiveLine = true;
      this.reveal();
      const started = performance.now();
      const said = await this.present(line, no);
      if (no !== this.lineNo) return;
      // with no voice, the time to read it
      if (!said) await sleep(Math.max(0, this.chars.length * 55 + 1200 - (performance.now() - started)));
      if (this.revealing) this.finishLine();
      await sleep(900);
      if (no !== this.lineNo) return;
      this.endNarration();
    });
    this.passive = run.catch(() => undefined);
    return run;
  }

  /** How much of the line being narrated has been said, 0 to 1 (a scene can
   * act along with it); 1 when nothing is being narrated. */
  narrated(): number {
    if (!this.narrating) return 1;
    if (this.voiceLength) return Math.min(1, (performance.now() - this.voiceStart) / this.voiceLength);
    return this.chars.length ? (this.shown / this.chars.length) * 0.95 : 0;
  }

  /** The box fades in over 0.3 s (the maintainer); one still fading out
   * comes straight back. */
  private reveal(): void {
    if (this.fading) {
      this.fading.cancel();
      this.fading = null;
      return;
    }
    if (!this.root.hidden) return;
    this.root.hidden = false;
    this.root.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
  }

  /** ...and out over 0.3 s; the game goes on meanwhile. */
  private conceal(): void {
    if (this.root.hidden || this.fading) return;
    const fade = this.root.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
    if (!fade) {
      this.root.hidden = true;
      return;
    }
    this.fading = fade;
    fade.onfinish = () => {
      if (this.fading !== fade) return;
      this.fading = null;
      this.root.hidden = true;
      fade.cancel();
    };
  }

  private endNarration(): void {
    cancelAnimationFrame(this.raf);
    this.stopVoice();
    this.narrating = false;
    this.passiveLine = false;
    this.voiceLength = 0;
    if (!this.open) {
      this.speaker = null;
      this.conceal();
    }
  }

  private nextLine(): void {
    this.stopVoice();
    const no = ++this.lineNo;
    const line = this.queue.shift();
    if (!line) {
      this.close();
      return;
    }
    this.passiveLine = false;
    void this.tell(line, no);
  }

  /** A line of a dialogue, then the next by itself. */
  private async tell(line: Line, no: number): Promise<void> {
    const started = performance.now();
    const said = await this.present(line, no);
    if (no !== this.lineNo) return;
    if (!said) await sleep(Math.max(0, this.chars.length * READ_MS + READ_PAUSE - (performance.now() - started)));
    if (no !== this.lineNo) return;
    if (this.revealing) this.finishLine();
    await sleep(LINE_GAP);
    if (no === this.lineNo) this.nextLine();
  }

  /** Shows a line, revealing its text; resolves once its voice has been
   * said (true), or at once when it has none (false). */
  private present(line: Line, no: number): Promise<boolean> {
    const ch = CHARACTERS[line.speaker] ?? CHARACTERS.narrator;
    const narrator = !ch.portrait;
    this.speaker = line.speaker;
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
    this.root.classList.toggle('passive', this.passiveLine);
    this.voiceLength = 0;
    const voiced = !!line.voice && voices.has(line.voice, line.text);
    const said = voiced ? this.speak(line, no, !narrator && !line.scripture) : Promise.resolve(false);
    const cps = TEXT_SPEED_CPS[settings.get().textSpeed];
    if (!isFinite(cps)) {
      this.finishLine();
      return said;
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
    return said;
  }

  private finishLine(): void {
    cancelAnimationFrame(this.raf);
    this.revealing = false;
    this.shown = this.chars.length;
    this.textEl.textContent = this.chars.join('');
    if (!this.speaking) this.portrait.setTalking(false);
    this.nextEl.hidden = true;
  }

  /** Plays the line's recorded voice; the portrait talks until it ends.
   * Resolves when it has been said (true) or will not be (false). */
  private async speak(line: Line, no: number, talks: boolean): Promise<boolean> {
    const asked = performance.now();
    const buf = await voices.prepare(line.voice!, line.text);
    // the player moved on, or it loaded too late to match the text
    if (!buf || no !== this.lineNo || !(this.open || this.narrating) || performance.now() - asked > 2500) return false;
    const v = audio.speak(buf);
    if (!v) return false;
    this.speaking = v;
    this.voiceStart = performance.now();
    this.voiceLength = buf.duration * 1000;
    if (talks) this.portrait.setTalking(true);
    await v.ended;
    if (this.speaking !== v) return false;
    this.speaking = null;
    if (!this.revealing) this.portrait.setTalking(false);
    return true;
  }

  private stopVoice(): void {
    this.speaking?.stop();
    this.speaking = null;
  }

  /** Close at once (e.g. when leaving the game); resolves the pending show(). */
  dismiss(): void {
    if (this.narrating) {
      this.lineNo++;
      this.endNarration();
    }
    if (!this.open) return;
    this.queue = [];
    this.close();
  }

  private close(): void {
    cancelAnimationFrame(this.raf);
    this.stopVoice();
    this.lineNo++;
    this.open = false;
    this.speaker = null;
    this.conceal();
    input.remove(this.layer);
    this.portrait.stop();
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }
}
