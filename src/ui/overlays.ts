import { audio } from '../core/audio';
import { input, type InputLayer } from '../core/input';
import { t } from '../core/i18n';
import { h, focusFirst, arrowNav } from './dom';

let host: HTMLElement;

export function setOverlayHost(el: HTMLElement): void {
  host = el;
}

export function uiHost(): HTMLElement {
  return host;
}

/** Hover/press sounds for every button inside a root element. */
export function wireButtonSounds(root: HTMLElement): void {
  root.addEventListener('pointerenter', (e) => {
    const b = (e.target as HTMLElement).closest?.('button');
    if (b && !b.disabled) audio.play('uiMove');
  }, true);
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest?.('button');
    if (b && !b.disabled) audio.play(b.dataset.sound === 'back' ? 'uiBack' : 'uiSelect');
  }, true);
}

export interface OverlayHandle {
  el: HTMLElement;
  close(): void;
}

/**
 * A modal overlay: blocks game input, closes with Escape (calls onEscape),
 * and gives focus back to the previous element when closed.
 */
export function openOverlay(content: HTMLElement, onEscape?: () => void): OverlayHandle {
  const prevFocus = document.activeElement as HTMLElement | null;
  const el = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true' }, content);
  host.append(el);
  wireButtonSounds(el);
  arrowNav(el);
  const layer: InputLayer = {
    modal: true,
    allowMovement: false,
    onAction: (a) => {
      if (a === 'pause') {
        onEscape?.();
        return true;
      }
      return true;
    },
  };
  input.push(layer);
  requestAnimationFrame(() => focusFirst(content));
  return {
    el,
    close() {
      input.remove(layer);
      el.remove();
      prevFocus?.focus?.({ preventScroll: true });
    },
  };
}

export function confirmDialog(opts: { title: string; body: string; confirm: string; cancel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    let handle: OverlayHandle;
    const done = (v: boolean) => {
      handle.close();
      resolve(v);
    };
    const box = h(
      'div',
      { class: 'panel dialog' },
      h('h2', { class: 'panel-title' }, opts.title),
      h('p', {}, opts.body),
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { class: 'btn', 'data-sound': 'back', autofocus: true, onclick: () => done(false) }, opts.cancel ?? t('map.cancel')),
        h('button', { class: `btn ${opts.danger ? 'danger' : 'primary'}`, onclick: () => done(true) }, opts.confirm),
      ),
    );
    handle = openOverlay(box, () => done(false));
  });
}
