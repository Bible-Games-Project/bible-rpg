import { audio } from '../core/audio';
import { graphemes, t, currentLanguage } from '../core/i18n';
import { assetUrl, MANIFEST } from '../game/manifest';
import { h } from './dom';
import { openOverlay, type OverlayHandle } from './overlays';

/**
 * The naming puzzle: arrange the scrambled letters of the animal's name.
 * The answer comes from the localisation files, split into graphemes, so it
 * works with accents, combining marks and any word length.
 */

function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase(currentLanguage().code);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function animalCanvas(species: string): HTMLCanvasElement {
  const a = MANIFEST.sprites[`animal-${species}`];
  const c = document.createElement('canvas');
  if (!a) return c;
  const scale = Math.max(1, Math.min(4, Math.floor(130 / a.frameHeight)));
  c.width = a.frameWidth * scale;
  c.height = a.frameHeight * scale;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const im = new Image();
  im.onload = () => ctx.drawImage(im, 0, 0, a.frameWidth, a.frameHeight, 0, 0, c.width, c.height);
  im.src = assetUrl(a.file);
  return c;
}

export interface PuzzleItem {
  id: string;        // localisation id (eden.animals.<id>)
  species: string;
}

/**
 * Opens the puzzle for one or several animals in a row.
 * Resolves with the ids that were named (empty if the player closed it).
 */
export function openNamingPuzzle(items: PuzzleItem[]): Promise<string[]> {
  return new Promise((resolve) => {
    const named: string[] = [];
    let index = 0;
    let handle: OverlayHandle | null = null;
    const box = h('div', { class: 'panel puzzle' });
    let onKey: (e: KeyboardEvent) => void = () => undefined;
    const keyHandler = (e: KeyboardEvent) => onKey(e);
    const finish = () => {
      handle?.close();
      window.removeEventListener('keydown', keyHandler, true);
      resolve(named);
    };

    const render = () => {
      const item = items[index];
      const word = t(`eden.animals.${item.id}`);
      const target = graphemes(word);
      const letterIdx = target.map((g, i) => (g.trim() ? i : -1)).filter((i) => i >= 0);
      let pool = shuffle(letterIdx.map((i) => ({ g: target[i], used: false })));
      if (pool.map((p) => p.g).join('') === letterIdx.map((i) => target[i]).join('') && pool.length > 1) pool = [...pool.slice(1), pool[0]];
      const filled: (number | null)[] = letterIdx.map(() => null);
      const slots = h('div', { class: 'slots', 'aria-label': t('puzzle.title') });
      const letters = h('div', { class: 'letters' });
      const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
      let solved = false;

      const draw = () => {
        slots.replaceChildren();
        let k = 0;
        target.forEach((g) => {
          if (!g.trim()) {
            slots.append(h('div', { class: 'slot', style: 'border:none;width:18px' }));
            return;
          }
          const p = filled[k];
          const ki = k;
          const s = h('button', { class: `slot btn ${p !== null ? 'filled' : ''} ${solved ? 'correct' : ''}`, style: 'padding:0;min-height:0', 'aria-label': p !== null ? pool[p].g : '_' }, p !== null ? pool[p].g : '');
          s.addEventListener('click', () => {
            if (solved || filled[ki] === null) return;
            pool[filled[ki]!].used = false;
            filled[ki] = null;
            audio.play('uiBack', { volume: 0.5 });
            draw();
          });
          slots.append(s);
          k++;
        });
        letters.replaceChildren(
          ...pool.map((p, pi) => {
            const b = h('button', { class: `btn letter ${p.used ? 'used' : ''}`, disabled: p.used || solved, 'aria-label': p.g }, p.g);
            b.addEventListener('click', () => place(pi));
            return b;
          }),
        );
      };

      const check = () => {
        if (filled.some((f) => f === null)) return;
        const attempt = filled.map((f) => pool[f!].g).join('');
        const answer = letterIdx.map((i) => target[i]).join('');
        if (norm(attempt) === norm(answer)) {
          solved = true;
          named.push(item.id);
          audio.play('correct');
          feedback.className = 'feedback good';
          feedback.textContent = t('puzzle.correct', { word });
          draw();
          actions.replaceChildren(
            h('button', { class: 'btn primary', autofocus: true, onclick: next }, t('puzzle.continue')),
          );
          (actions.querySelector('button') as HTMLButtonElement).focus();
        } else {
          audio.play('wrong');
          feedback.className = 'feedback bad';
          feedback.textContent = t('puzzle.wrong');
          for (const s of slots.querySelectorAll('.slot')) s.classList.add('wrong');
          window.setTimeout(() => {
            if (solved) return;
            filled.forEach((f, i) => {
              if (f !== null) pool[f].used = false;
              filled[i] = null;
            });
            draw();
          }, 650);
        }
      };

      const place = (pi: number) => {
        if (solved || pool[pi].used) return;
        const slot = filled.indexOf(null);
        if (slot < 0) return;
        filled[slot] = pi;
        pool[pi].used = true;
        audio.play('uiMove');
        draw();
        check();
      };

      const hint = () => {
        if (solved) return;
        // put the next correct letter in the first wrong or empty slot
        for (let k = 0; k < letterIdx.length; k++) {
          const want = target[letterIdx[k]];
          const cur = filled[k];
          if (cur !== null && norm(pool[cur].g) === norm(want)) continue;
          if (cur !== null) {
            pool[cur].used = false;
            filled[k] = null;
          }
          const pi = pool.findIndex((p) => !p.used && norm(p.g) === norm(want));
          if (pi >= 0) {
            filled[k] = pi;
            pool[pi].used = true;
          }
          break;
        }
        draw();
        check();
      };

      const clear = () => {
        if (solved) return;
        filled.forEach((f, i) => {
          if (f !== null) pool[f].used = false;
          filled[i] = null;
        });
        draw();
      };

      const next = () => {
        index++;
        if (index >= items.length) finish();
        else render();
      };

      onKey = (e: KeyboardEvent) => {
        if (e.key === 'Backspace') {
          const last = [...filled].reverse().findIndex((f) => f !== null);
          if (last >= 0 && !solved) {
            const i = filled.length - 1 - last;
            pool[filled[i]!].used = false;
            filled[i] = null;
            draw();
          }
          e.preventDefault();
          return;
        }
        if (e.key.length !== 1 && !/^\p{L}$/u.test(e.key)) return;
        if (solved) return;
        const pi = pool.findIndex((p) => !p.used && norm(p.g) === norm(e.key));
        if (pi >= 0) {
          place(pi);
          e.preventDefault();
        }
      };

      const actions = h(
        'div',
        { class: 'dialog-actions', style: 'justify-content:center;margin-top:0' },
        h('button', { class: 'btn small', onclick: clear }, t('puzzle.clear')),
        h('button', { class: 'btn small', onclick: hint }, t('puzzle.hint')),
        h('button', { class: 'btn small', 'data-sound': 'back', onclick: finish }, t('puzzle.close')),
      );
      box.replaceChildren(
        h('div', { class: 'progress' }, items.length > 1 ? t('puzzle.progress', { n: index + 1, total: items.length }) : t('puzzle.title')),
        h('div', { class: 'animal-view' }, animalCanvas(item.species)),
        h('p', { style: 'margin:0;font-size:var(--fs-m)' }, t('puzzle.instructions')),
        slots,
        letters,
        feedback,
        h('div', { class: 'muted', style: 'font-size:var(--fs-xs)' }, t('puzzle.typeHint')),
        actions,
      );
      draw();
      (letters.querySelector('button') as HTMLButtonElement | null)?.focus();
    };

    window.addEventListener('keydown', keyHandler, true);
    handle = openOverlay(box, finish);
    render();
  });
}
