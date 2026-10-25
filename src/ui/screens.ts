import { t } from '../core/i18n';
import { save } from '../core/save';
import { CHAPTERS, MAP_ART, MAP_HEIGHT, chaptersOf, newTestamentOpen, previousChapter, type ChapterDef, type Testament } from '../data/chapters';
import { MORE_GAMES } from '../data/moreGames';
import { EDEN_MISSION_IDS } from '../data/eden/missionOrder';
import { h, arrowNav } from './dom';
import { wireButtonSounds, confirmDialog } from './overlays';

const BASE = import.meta.env.BASE_URL;

export interface MenuActions {
  play(): void;
  fun(): void;
  moreGames(): void;
  settings(): void;
}

export function mainMenuScreen(a: MenuActions): HTMLElement {
  const play = h('button', { class: 'btn primary', onclick: a.play }, t('menu.play'));
  const el = h(
    'div',
    { class: 'screen main-menu' },
    h('img', { class: 'menu-bg-fill', src: `${BASE}assets/ui/menu-background.webp`, alt: '', 'aria-hidden': 'true', draggable: 'false' }),
    h('img', { class: 'menu-bg', src: `${BASE}assets/ui/menu-background.webp`, alt: t('app.title'), draggable: 'false' }),
    h('div', { class: 'menu-shade' }),
    h(
      'nav',
      { class: 'main-menu-buttons', 'aria-label': t('app.title') },
      play,
      h('button', { class: 'btn', onclick: a.fun }, t('menu.fun')),
      h('button', { class: 'btn', onclick: a.moreGames }, t('menu.moreGames')),
      h('button', { class: 'btn', onclick: a.settings }, t('menu.settings')),
    ),
    h('div', { class: 'menu-footer' }, t('app.studio')),
  );
  wireButtonSounds(el);
  arrowNav(el.querySelector('nav')!);
  requestAnimationFrame(() => play.focus({ preventScroll: true }));
  return el;
}

function pageHeader(title: string, onBack: () => void, extra?: HTMLElement): HTMLElement {
  return h(
    'div',
    { class: 'page-header' },
    h('button', { class: 'btn small', 'data-sound': 'back', onclick: onBack, 'aria-label': t('menu.back') }, `‹ ${t('menu.back')}`),
    h('h1', {}, title),
    h('div', { class: 'spacer' }),
    extra ?? null,
  );
}

export interface MapActions {
  back(): void;
  start(chapterId: string, mode: 'continue' | 'new'): void;
}

function chapterStatus(c: ChapterDef): 'completed' | 'progress' | 'available' | 'locked' | 'soon' {
  const prog = save.chapter(c.id);
  if (prog?.completed) return 'completed';
  if (!c.playable) return save.isUnlocked(c.id) ? 'soon' : 'locked';
  if (!save.isUnlocked(c.id)) return 'locked';
  if (prog && prog.currentMission) return 'progress';
  return 'available';
}

export function storyMapScreen(a: MapActions, initial: Testament = 'ot'): HTMLElement {
  let testament: Testament = initial;
  let selected: string = initial === 'ot' ? 'eden' : chaptersOf('nt')[0].id;
  const mapInner = h('div', { class: 'story-map-inner' });
  const map = h('div', { class: 'story-map', tabindex: '-1' }, mapInner);
  // A painted map fills the frame's height (or width, on very wide screens)
  // and scrolls sideways; its nodes are placed in percent, so they stay on
  // the painted road at any size. A drawn route shrinks to fit short
  // screens (e.g. a phone held sideways).
  const fit = () => {
    const art = MAP_ART[testament];
    if (art) {
      const k = Math.max(map.clientHeight / art.height, map.clientWidth / art.width);
      mapInner.style.removeProperty('zoom');
      mapInner.style.width = `${Math.floor(art.width * k)}px`;
      mapInner.style.height = `${Math.floor(art.height * k)}px`;
      // nodes never cover too much of a short map (a phone held sideways)
      mapInner.style.setProperty('--node-max', `${Math.max(28, Math.round(art.height * k * 0.1))}px`);
      return;
    }
    const avail = map.clientHeight - 4;
    if (avail > 0) mapInner.style.setProperty('zoom', String(Math.max(0.45, Math.min(1, avail / MAP_HEIGHT))));
  };
  new ResizeObserver(fit).observe(map);
  const detail = h('div', { class: 'panel story-detail', 'aria-live': 'polite' });
  const otTab = h('button', { class: 'btn small', role: 'tab' }, t('map.oldTestament'));
  const ntTab = h('button', { class: 'btn small', role: 'tab' }, t('map.newTestament'));
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, otTab, ntTab);
  otTab.addEventListener('click', () => switchTo('ot'));
  ntTab.addEventListener('click', () => switchTo('nt'));

  function switchTo(tt: Testament) {
    testament = tt;
    selected = chaptersOf(tt)[0].id;
    render();
  }

  function render() {
    otTab.setAttribute('aria-selected', String(testament === 'ot'));
    ntTab.setAttribute('aria-selected', String(testament === 'nt'));
    mapInner.replaceChildren();
    const list = chaptersOf(testament);
    const art = MAP_ART[testament];
    map.classList.toggle('painted', !!art);
    if (art) renderPainted(list, art);
    else renderRoute(list);
    renderDetail();
  }

  function renderPainted(list: ChapterDef[], art: { file: string; width: number; height: number }) {
    mapInner.style.background = '';
    mapInner.append(h('img', { class: 'map-art', src: `${BASE}${art.file}`, alt: '', draggable: 'false' }));
    list.forEach((c, i) => {
      const st = chapterStatus(c);
      const look = st === 'completed' ? 'done' : st === 'locked' || st === 'soon' ? 'locked' : 'open';
      // keep the name inside the map at either end
      const edge = c.pos.x < art.width * 0.12 ? 'at-start' : c.pos.x > art.width * 0.88 ? 'at-end' : '';
      const node = h(
        'button',
        {
          class: `story-node painted ${look} ${edge}`,
          style: `left:${(c.pos.x / art.width) * 100}%;top:${(c.pos.y / art.height) * 100}%`,
          'aria-pressed': String(selected === c.id),
          'aria-label': `${i + 1}. ${t(`stories.${c.id}.title`)} — ${statusLabel(c, st)}`,
        },
        h('img', { class: 'marker', src: `${BASE}assets/ui/map-node-${look}.png`, alt: '', draggable: 'false' }),
        h('span', { class: 'label' }, t(`stories.${c.id}.title`)),
      );
      node.addEventListener('click', () => select(c.id, node));
      mapInner.append(node);
    });
    fit();
    // bring the chosen story into view
    const at = list.find((c) => c.id === selected);
    if (at) requestAnimationFrame(() => (map.scrollLeft = (at.pos.x / art.width) * mapInner.clientWidth - map.clientWidth / 2));
  }

  function select(id: string, node: Element) {
    selected = id;
    renderDetail();
    for (const n of mapInner.querySelectorAll('.story-node')) n.setAttribute('aria-pressed', String(n === node));
  }

  function renderRoute(list: ChapterDef[]) {
    const width = Math.max(...list.map((c) => c.pos.x)) + 160;
    mapInner.style.width = `${width}px`;
    mapInner.style.height = `${MAP_HEIGHT}px`;
    // terrain bands so the route reads as a journey across the land
    mapInner.style.background = 'linear-gradient(90deg, #44583a 0px, #5a6640 400px, #3d5a63 800px, #50663f 1200px, #5e5b42 1600px)';
    fit();
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'route');
    svg.setAttribute('viewBox', `0 0 ${width} ${MAP_HEIGHT}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.width = `${width}px`;
    let d = '';
    list.forEach((c, i) => {
      if (i === 0) d += `M ${c.pos.x} ${c.pos.y}`;
      else {
        const p = list[i - 1].pos;
        const mx = (p.x + c.pos.x) / 2;
        d += ` C ${mx} ${p.y}, ${mx} ${c.pos.y}, ${c.pos.x} ${c.pos.y}`;
      }
    });
    for (const [stroke, w, dash] of [['#0c0e13', 9, ''], ['#d9ae59', 4, '10 9']] as [string, number, string][]) {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', stroke);
      path.setAttribute('stroke-width', String(w));
      path.setAttribute('stroke-linecap', 'square');
      if (dash) path.setAttribute('stroke-dasharray', dash);
      svg.append(path);
    }
    mapInner.append(svg);
    list.forEach((c, i) => {
      const st = chapterStatus(c);
      const node = h(
        'button',
        {
          class: `story-node ${st === 'locked' || st === 'soon' ? 'locked' : ''} ${st === 'completed' ? 'completed' : ''}`,
          style: `left:${c.pos.x}px;top:${c.pos.y}px`,
          'aria-pressed': String(selected === c.id),
          'aria-label': `${i + 1}. ${t(`stories.${c.id}.title`)} — ${statusLabel(c, st)}`,
        },
        h('span', { class: 'medallion' }, st === 'locked' || st === 'soon' ? '🔒︎' : String(i + 1)),
        h('span', { class: 'label' }, t(`stories.${c.id}.title`)),
      );
      node.addEventListener('click', () => select(c.id, node));
      mapInner.append(node);
    });
  }

  function statusLabel(c: ChapterDef, st: ReturnType<typeof chapterStatus>): string {
    if (st === 'completed') return t('map.completed');
    if (st === 'progress') {
      const prog = save.chapter(c.id)!;
      return t('map.inProgress', { n: prog.completedMissions.length + 1, total: EDEN_MISSION_IDS.length });
    }
    if (st === 'soon') return t('map.comingSoon');
    if (st === 'locked') return t('map.locked');
    return '';
  }

  function renderDetail() {
    const c = CHAPTERS.find((x) => x.id === selected)!;
    const st = chapterStatus(c);
    const actions = h('div', { class: 'actions' });
    let note = '';
    if (testament === 'nt' && !newTestamentOpen((id) => !!save.chapter(id)?.completed)) {
      note = t('map.ntLocked');
    } else if (st === 'locked') {
      const prev = previousChapter(c.id);
      note = prev ? t('map.lockedHint', { prev: t(`stories.${prev.id}.title`) }) : t('map.comingSoonHint');
    } else if (st === 'soon') {
      note = t('map.comingSoonHint');
    }
    if (c.playable && save.isUnlocked(c.id)) {
      if (st === 'progress') {
        actions.append(
          h('button', { class: 'btn primary', onclick: () => a.start(c.id, 'continue') }, t('map.continue')),
          h('button', { class: 'btn', onclick: () => newGame(c) }, t('map.newGame')),
        );
      } else if (st === 'completed') {
        actions.append(h('button', { class: 'btn primary', onclick: () => newGame(c) }, t('map.replay')));
      } else {
        actions.append(h('button', { class: 'btn primary', onclick: () => a.start(c.id, 'new') }, t('map.start')));
      }
    }
    detail.replaceChildren(
      h(
        'div',
        { class: 'info' },
        h('h2', {}, t(`stories.${c.id}.title`)),
        h('p', {}, `${c.reference} · ${statusLabel(c, st) || t('map.available')}`),
        h('p', {}, t(`stories.${c.id}.summary`)),
        note ? h('p', { style: 'margin-top:6px;color:var(--sunset)' }, note) : null,
      ),
      actions,
    );
    actions.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }

  async function newGame(c: ChapterDef) {
    if (save.hasProgress(c.id) || save.chapter(c.id)?.completed) {
      const ok = await confirmDialog({
        title: t('map.confirmNewTitle'),
        body: t('map.confirmNew', { chapter: t(`stories.${c.id}.title`) }),
        confirm: t('map.confirmNewYes'),
        danger: true,
      });
      if (!ok) return;
    }
    a.start(c.id, 'new');
  }

  const el = h('div', { class: 'page' }, pageHeader(t('map.title'), a.back, tabs), map, detail);
  wireButtonSounds(el);
  render();
  return el;
}

export interface FunActions {
  back(): void;
  playNaming(): void;
}

export function funScreen(a: FunActions): HTMLElement {
  const namingUnlocked = !!save.chapter('eden')?.completedMissions.includes('eden.m03') || !!save.chapter('eden')?.completed;
  const card = (title: string, desc: string, action: HTMLElement) =>
    h('div', { class: 'panel card' }, h('h2', {}, title), h('p', {}, desc), action);
  const el = h(
    'div',
    { class: 'page' },
    pageHeader(t('fun.title'), a.back),
    h('p', { class: 'muted', style: 'margin:0 0 12px;font-size:var(--fs-m)' }, t('fun.intro')),
    h(
      'div',
      { class: 'cards' },
      card(
        t('fun.namingTitle'),
        namingUnlocked ? t('fun.namingDesc') : `${t('fun.namingDesc')} ${t('fun.namingLocked')}`,
        h('button', { class: 'btn primary', disabled: !namingUnlocked, onclick: a.playNaming }, t('fun.play')),
      ),
      card(t('fun.triviaTitle'), t('fun.triviaDesc'), h('span', { class: 'badge' }, t('fun.comingSoon'))),
      card(t('fun.versesTitle'), t('fun.versesDesc'), h('span', { class: 'badge' }, t('fun.comingSoon'))),
    ),
  );
  wireButtonSounds(el);
  requestAnimationFrame(() => el.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }));
  return el;
}

export function moreGamesScreen(back: () => void): HTMLElement {
  const content = MORE_GAMES.length
    ? h(
        'div',
        { class: 'cards' },
        MORE_GAMES.map((g) =>
          h(
            'div',
            { class: 'panel card' },
            h('h2', {}, t(g.titleKey)),
            h('p', {}, t(g.descriptionKey)),
            g.url
              ? h('a', { class: 'btn primary', href: g.url, target: '_blank', rel: 'noopener' }, t('more.open'))
              : h('span', { class: 'badge' }, t('fun.comingSoon')),
          ),
        ),
      )
    : h('div', { class: 'empty-state panel' }, h('p', {}, t('more.empty')));
  const el = h('div', { class: 'page' }, pageHeader(t('more.title'), back), h('p', { class: 'muted', style: 'margin:0 0 12px;font-size:var(--fs-m)' }, t('more.intro')), content);
  wireButtonSounds(el);
  requestAnimationFrame(() => el.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }));
  return el;
}
