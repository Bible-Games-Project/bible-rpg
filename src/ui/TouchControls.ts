import { input } from '../core/input';
import { settings } from '../core/settings';
import { t } from '../core/i18n';
import { h } from './dom';

/**
 * On-screen stick and buttons for touch screens. Shown automatically on
 * touch devices (or always/never, from Settings).
 */
export class TouchControls {
  readonly root: HTMLElement;
  private knob: HTMLElement;
  private stick: HTMLElement;
  private pointer: number | null = null;
  private active = false;

  constructor(host: HTMLElement) {
    this.knob = h('div', { class: 'knob' });
    this.stick = h('div', { class: 'touch-stick', 'aria-hidden': 'true' }, this.knob);
    const btn = (label: string, aria: string, action: 'interact' | 'switch' | 'pause', extra = '') => {
      const b = h('button', { class: `btn ${extra}`, type: 'button', 'aria-label': aria }, label);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        input.dispatch(action);
      });
      return b;
    };
    const buttons = h(
      'div',
      { class: 'touch-buttons' },
      btn('☰', t('hud.pause'), 'pause', 'small-round'),
      btn('⇄', t('hud.switch'), 'switch', 'small-round'),
      btn('E', t('prompt.use'), 'interact'),
    );
    this.root = h('div', { class: 'touch-controls', hidden: true }, this.stick, buttons);
    host.append(this.root);
    this.stick.addEventListener('pointerdown', (e) => {
      this.pointer = e.pointerId;
      this.stick.setPointerCapture(e.pointerId);
      this.track(e);
    });
    this.stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.pointer) this.track(e);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.pointer) return;
      this.pointer = null;
      this.knob.style.transform = '';
      input.setVirtualMove(0, 0);
    };
    this.stick.addEventListener('pointerup', end);
    this.stick.addEventListener('pointercancel', end);
    settings.on('change', () => this.refresh());
    window.addEventListener('touchstart', () => this.refresh(), { passive: true });
  }

  private track(e: PointerEvent): void {
    const r = this.stick.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const max = r.width / 2 - 10;
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / max;
    const ny = dy / max;
    const dead = 0.18;
    input.setVirtualMove(Math.abs(nx) < dead ? 0 : nx, Math.abs(ny) < dead ? 0 : ny);
  }

  /** Visible only while a chapter is being played. */
  setActive(on: boolean): void {
    this.active = on;
    this.refresh();
  }

  private refresh(): void {
    const mode = settings.get().touchControls;
    const touch = input.lastDevice === 'touch' || window.matchMedia?.('(pointer: coarse)').matches;
    const show = this.active && (mode === 'on' || (mode === 'auto' && touch));
    this.root.hidden = !show;
    if (!show) input.setVirtualMove(0, 0);
  }
}
