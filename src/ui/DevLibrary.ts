import { audio } from '../core/audio';
import { devSounds, type LibraryData, type SoundCategory } from '../core/devSounds';
import { t } from '../core/i18n';
import { storage } from '../core/storage';
import { SLOT, SOUND_SLOTS, SURFACES, type SlotGroup, type SoundSlot } from '../data/soundSlots';
import { clear, h } from './dom';

/**
 * The maintainer's voice and sound library, inside the game (it was a
 * separate page; the maintainer wanted to stay in the game). Only in dev mode
 * (src/core/dev.ts): the main menu shows no button for it otherwise.
 *
 * Voices: the characters on top, the voices to give them below. A choice is
 * only noted: the lines are voiced again by tools/audio/build_voices.py once
 * the maintainer sends the list. Sounds: the game's sound slots on top
 * (several for the serpent and the water, five footsteps per surface); a
 * slot shows only the options of its own kind, and a sound chosen for it
 * plays in the game at once (src/core/devSounds.ts).
 */

const VOICE_PICKS = 'bible-rpg.dev.voices';
const STARS = 'bible-rpg.dev.stars';
const VIEW = 'bible-rpg.dev.view';

type Mode = 'voices' | 'sounds';
const GROUPS: SlotGroup[] = ['serpent', 'cherubim', 'water', 'steps', 'other'];

interface Player {
  card: HTMLElement;
  stop(): void;
}

export function devLibraryScreen(back: () => void): HTMLElement {
  const view = storage.read<{ mode?: Mode; who?: string; slot?: string; tab?: string }>(VIEW) ?? {};
  let mode: Mode = view.mode === 'sounds' ? 'sounds' : 'voices';
  let who = view.who ?? 'god';
  let slot = view.slot && SLOT[view.slot] ? view.slot : 'serpentAppear';
  let tab = view.tab ?? 'men';
  let voicePicks = storage.read<Record<string, string>>(VOICE_PICKS) ?? {};
  let stars = storage.read<string[]>(STARS) ?? [];
  let lib: LibraryData | null = null;
  let player: Player | null = null;
  const buffers = new Map<string, Promise<AudioBuffer | null>>();

  const remember = () => storage.write(VIEW, { mode, who, slot, tab });

  const modeBtn = (m: Mode) =>
    h('button', { class: 'btn small lib-mode', role: 'tab', 'aria-selected': String(mode === m), onclick: () => setMode(m) }, t(m === 'voices' ? 'dev.modeVoices' : 'dev.modeSounds'));
  const modes = h('div', { class: 'lib-modes', role: 'tablist' }, modeBtn('voices'), modeBtn('sounds'));
  const back_ = h('button', { class: 'btn small', 'data-sound': 'back', onclick: () => (stop(), back()) }, `‹ ${t('menu.back')}`);
  const lede = h('p', { class: 'lib-lede muted' });
  const cast = h('div', { class: 'lib-cast' });
  const tools = h('div', { class: 'lib-tools' });
  const note = h('p', { class: 'lib-note muted' });
  const grid = h('div', { class: 'lib-grid' });
  const picksText = h('pre', { class: 'lib-picks' });
  const copied = h('span', { class: 'lib-copied muted', 'aria-live': 'polite' });
  const filter = h('input', { class: 'lib-filter', type: 'search', 'aria-label': t('dev.searchVoices'), placeholder: t('dev.searchVoices') });
  filter.addEventListener('input', () => renderGrid());
  // typing in the search box is not the game's controls
  filter.addEventListener('keydown', (e) => e.stopPropagation());
  const body = h(
    'div',
    { class: 'lib-body' },
    lede,
    cast,
    tools,
    note,
    grid,
    h(
      'section',
      { class: 'panel lib-summary' },
      h('h2', {}, t('dev.yours')),
      h('p', { class: 'muted' }, t('dev.yoursHelp')),
      picksText,
      h('div', { class: 'lib-row' }, h('button', { class: 'btn small primary', onclick: () => copy() }, t('dev.copy')), copied),
    ),
  );
  // no interface blips here: they would play over the samples
  const el = h('div', { class: 'page dev-library' }, h('div', { class: 'page-header' }, back_, h('h1', {}, t('dev.title')), h('div', { class: 'spacer' }), modes), body);

  // ------------------------------------------------------------ playing

  function stop(): void {
    player?.stop();
    player = null;
  }

  function decoded(key: string, get: () => Promise<ArrayBuffer | null>): Promise<AudioBuffer | null> {
    let b = buffers.get(key);
    if (!b) {
      b = get().then((bytes) => (bytes ? audio.decodeBytes(bytes) : null));
      buffers.set(key, b);
      void b.then((x) => x ?? buffers.delete(key));
    }
    return b;
  }

  /** Play a decoded recording on a card, its bar filling as it plays. */
  function playOn(card: HTMLElement, buf: AudioBuffer): void {
    const bar = card.querySelector<HTMLElement>('.lib-bar')!;
    const p = audio.preview(buf);
    if (!p) return;
    let raf = 0;
    const tick = () => {
      bar.style.width = `${p.elapsed() * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    tick();
    const me: Player = {
      card,
      stop: () => {
        cancelAnimationFrame(raf);
        p.stop();
        card.classList.remove('playing');
        bar.style.width = '0';
      },
    };
    player = me;
    card.classList.add('playing');
    void p.ended.then(() => {
      if (player === me) stop();
    });
  }

  /** A voice from another site (the Cloudflare and local builds) */
  function playUrl(card: HTMLElement, url: string): void {
    const bar = card.querySelector<HTMLElement>('.lib-bar')!;
    const a = new Audio(url);
    const me: Player = {
      card,
      stop: () => {
        a.pause();
        card.classList.remove('playing');
        bar.style.width = '0';
      },
    };
    player = me;
    card.classList.add('playing');
    a.addEventListener('timeupdate', () => a.duration && (bar.style.width = `${(a.currentTime / a.duration) * 100}%`));
    a.addEventListener('ended', () => player === me && stop());
    const fail = () => {
      if (player === me) stop();
      card.querySelector('.lib-desc')!.textContent = t('dev.cantPlay');
    };
    a.addEventListener('error', fail);
    a.play().catch(fail);
  }

  function playButton(name: string, desc: string, start: (card: HTMLElement) => void): HTMLElement {
    const card = h('div', { class: 'lib-card' });
    const b = h(
      'button',
      { class: 'lib-play', 'aria-label': t('dev.play', { name }) },
      h('span', { class: 'lib-icon', 'aria-hidden': 'true' }),
      h('span', { class: 'lib-name' }, name),
      h('span', { class: 'lib-desc' }, desc),
      h('span', { class: 'lib-bar' }),
    );
    b.addEventListener('click', () => {
      const again = player?.card === card;
      stop();
      if (!again) start(card);
    });
    card.append(b);
    return card;
  }

  // ------------------------------------------------------------ voices

  const voiceName = (id: string): string => {
    for (const g of lib?.voiceGroups ?? []) for (const v of g.voices) if (v[0] === id) return v[1].split(/ [-–] /)[0];
    return id;
  };

  function renderVoiceCast(): void {
    for (const c of lib!.cast) {
      const pick = voicePicks[c.id];
      cast.append(
        h(
          'button',
          { class: 'lib-cast-btn', 'aria-pressed': String(who === c.id), onclick: () => ((who = c.id), remember(), render()) },
          c.portrait ? h('img', { src: `${import.meta.env.BASE_URL}${c.portrait}`, alt: '' }) : h('span', { class: 'lib-seal', 'aria-hidden': 'true' }, '✦'),
          h('span', { class: 'lib-cast-text' }, h('span', { class: 'lib-cast-name' }, c.name), h('span', { class: 'lib-cast-pick' }, pick ? `✓ ${voiceName(pick)}` : t('dev.now', { who: voiceName(c.voice) }))),
        ),
      );
    }
  }

  function renderVoiceTools(): void {
    const tabs = h('div', { class: 'lib-tabs', role: 'tablist' });
    const add = (key: string, label: string) =>
      tabs.append(h('button', { class: 'lib-tab', role: 'tab', 'aria-selected': String(tab === key), onclick: () => ((tab = key), remember(), render()) }, label));
    for (const g of lib!.voiceGroups) add(g.key, `${g.title} (${g.voices.length})`);
    add('stars', t('dev.saved', { n: stars.length }));
    tools.append(tabs, filter);
  }

  function renderVoiceGrid(): void {
    const g = lib!.voiceGroups.find((x) => x.key === tab);
    note.textContent = g ? g.note : t('dev.savedNote');
    const all = new Map(lib!.voiceGroups.flatMap((x) => x.voices.map((v) => [v[0], v] as const)));
    let list = g ? g.voices : stars.map((id) => all.get(id)).filter((v): v is [string, string, string, string] => !!v);
    const q = filter.value.trim().toLowerCase();
    if (q) list = list.filter((v) => `${v[1]} ${v[2]}`.toLowerCase().includes(q));
    const whoName = lib!.cast.find((c) => c.id === who)?.name ?? who;
    const count = h('p', { class: 'lib-count muted' }, t('dev.countVoices', { n: list.length }));
    grid.append(count);
    for (const [id, name, desc, url] of list) {
      const [first, ...rest] = name.split(/ [-–] /);
      const card = playButton(first, (rest.length ? `${rest.join(' - ')} · ` : '') + desc, (c) => {
        void decoded(`v:${id}`, () => devSounds.voiceBytes(id)).then((buf) => (buf ? playOn(c, buf) : playUrl(c, url)));
      });
      const tags = h('div', { class: 'lib-tags' });
      for (const c of lib!.cast) {
        if (voicePicks[c.id] === id) tags.append(h('span', { class: 'lib-tag' }, `✓ ${c.name}`));
        else if (!voicePicks[c.id] && c.voice === id) tags.append(h('span', { class: 'lib-tag now' }, t('dev.now', { who: c.name })));
      }
      const mine = voicePicks[who] === id;
      const starred = stars.includes(id);
      card.append(
        tags,
        h(
          'div',
          { class: 'lib-row' },
          h(
            'button',
            {
              class: `btn small lib-choose${mine ? ' primary' : ''}`,
              'aria-pressed': String(mine),
              onclick: () => {
                if (mine) delete voicePicks[who];
                else voicePicks[who] = id;
                storage.write(VOICE_PICKS, voicePicks);
                render();
              },
            },
            t(mine ? 'dev.chosen' : 'dev.choose', { who: whoName }),
          ),
          h(
            'button',
            {
              class: 'btn small lib-star',
              'aria-pressed': String(starred),
              'aria-label': t(starred ? 'dev.unstar' : 'dev.star'),
              title: t(starred ? 'dev.unstar' : 'dev.star'),
              onclick: () => {
                stars = starred ? stars.filter((x) => x !== id) : stars.concat(id);
                storage.write(STARS, stars);
                render();
              },
            },
            '★',
          ),
        ),
        h('span', { class: 'lib-id muted' }, id),
      );
      grid.append(card);
    }
  }

  // ------------------------------------------------------------ sounds

  const slotName = (s: SoundSlot): string =>
    s.surface ? `${t(`dev.surfaces.${s.surface}`)} ${s.id.split('-').pop()}` : t(`dev.slots.${s.id}`);

  const soundName = (sound: string | null): string => {
    if (!sound) return t('dev.empty');
    for (const c of Object.values(lib!.categories)) for (const o of c.options) if (o[0] === sound) return o[1];
    return sound;
  };

  function slotButton(s: SoundSlot, compact = false): HTMLElement {
    const now = devSounds.soundOf(s);
    const label = now ? soundName(now) : s.id === 'river' ? t('dev.synth') : t('dev.empty');
    return h(
      'button',
      {
        class: `lib-slot${compact ? ' compact' : ''}${now ? '' : ' empty'}${devSounds.changed(s.id) ? ' changed' : ''}`,
        'aria-pressed': String(slot === s.id),
        title: `${slotName(s)}: ${label}`,
        onclick: () => {
          slot = s.id;
          remember();
          render();
          // on a phone its options are far below: show them
          if (tools.getBoundingClientRect().top > window.innerHeight * 0.6) tools.scrollIntoView({ block: 'start', behavior: 'smooth' });
        },
      },
      h('span', { class: 'lib-cast-name' }, compact ? s.id.split('-').pop()! : slotName(s)),
      // a footstep slot is too narrow for a name: filled or empty (the name is its tooltip)
      h('span', { class: 'lib-cast-pick' }, compact ? (now ? '●' : '○') : label),
    );
  }

  function renderSlots(): void {
    for (const g of GROUPS) {
      const row = h('div', { class: 'lib-group' }, h('h3', {}, t(`dev.groups.${g}`)));
      if (g === 'steps') {
        for (const surface of SURFACES) {
          row.append(
            h(
              'div',
              { class: 'lib-steps' },
              h('span', { class: 'lib-surface' }, t(`dev.surfaces.${surface}`)),
              SOUND_SLOTS.filter((s) => s.surface === surface).map((s) => slotButton(s, true)),
            ),
          );
        }
      } else {
        row.append(h('div', { class: 'lib-slots' }, SOUND_SLOTS.filter((s) => s.group === g).map((s) => slotButton(s))));
      }
      cast.append(row);
    }
  }

  function renderSoundGrid(): void {
    const s = SLOT[slot];
    const cat: SoundCategory | undefined = lib!.categories[s.category];
    note.textContent = s.surface ? `${cat?.note ?? ''} ${t('dev.stepsHelp', { surface: t(`dev.surfaces.${s.surface}`).toLowerCase() })}` : (cat?.note ?? '');
    const now = devSounds.soundOf(s);
    const name = slotName(s);
    const actions = h('div', { class: 'lib-row' });
    if (s.surface && now) actions.append(h('button', { class: 'btn small', onclick: () => (devSounds.choose(slot, null), render()) }, t('dev.emptySlot')));
    if (devSounds.changed(slot)) actions.append(h('button', { class: 'btn small', onclick: () => (devSounds.choose(slot, undefined), render()) }, t('dev.restore')));
    tools.append(h('h2', { class: 'lib-slot-title' }, `${t(`dev.groups.${s.group}`)} · ${name}`), actions);
    const options = cat?.options ?? [];
    grid.append(h('p', { class: 'lib-count muted' }, t('dev.countSounds', { n: options.length })));
    for (const [sound, oname, desc] of options) {
      const card = playButton(oname, desc, (c) => void decoded(`s:${sound}`, () => devSounds.bytes(sound)).then((buf) => buf && playOn(c, buf)));
      const tags = h('div', { class: 'lib-tags' });
      for (const other of SOUND_SLOTS) {
        if (devSounds.soundOf(other) !== sound) continue;
        tags.append(h('span', { class: `lib-tag${devSounds.changed(other.id) ? '' : ' now'}` }, `✓ ${other.surface ? slotName(other) : t(`dev.slots.${other.id}`)}`));
      }
      const mine = now === sound;
      card.append(
        tags,
        h(
          'div',
          { class: 'lib-row' },
          h(
            'button',
            {
              class: `btn small lib-choose${mine ? ' primary' : ''}`,
              'aria-pressed': String(mine),
              onclick: () => {
                if (!mine) devSounds.choose(slot, sound);
                // a footstep slot moves on to the next one, to fill all five quickly
                if (!mine && s.surface) {
                  const next = SOUND_SLOTS.find((x) => x.surface === s.surface && !devSounds.soundOf(x));
                  if (next) slot = next.id;
                }
                remember();
                render();
              },
            },
            t(mine ? 'dev.chosen' : 'dev.choose', { who: name }),
          ),
        ),
      );
      grid.append(card);
    }
  }

  // ------------------------------------------------------------ summary

  function summary(): string {
    const lines: string[] = [];
    if (!lib) return '';
    const voices = lib.cast.filter((c) => voicePicks[c.id]).map((c) => `${c.name}: ${voiceName(voicePicks[c.id])} (${voicePicks[c.id]})`);
    if (voices.length) lines.push(`Voices: ${voices.join(', ')}`);
    if (stars.length) lines.push(`Saved voices: ${stars.map((id) => `${voiceName(id)} (${id})`).join(', ')}`);
    const sounds = SOUND_SLOTS.filter((s) => devSounds.changed(s.id)).map((s) => {
      const sound = devSounds.soundOf(s);
      return `${t(`dev.groups.${s.group}`)} ${slotName(s)}: ${sound ? `${soundName(sound)} (${sound})` : t('dev.empty')}`;
    });
    if (sounds.length) lines.push(`Sounds: ${sounds.join(', ')}`);
    return lines.join('\n');
  }

  function copy(): void {
    const text = summary();
    if (!text) {
      copied.textContent = t('dev.nothing');
      return;
    }
    const fallback = () => {
      const r = document.createRange();
      r.selectNodeContents(picksText);
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
      copied.textContent = t('dev.selected');
    };
    try {
      navigator.clipboard.writeText(text).then(() => (copied.textContent = t('dev.copied')), fallback);
    } catch {
      fallback();
    }
  }

  // ------------------------------------------------------------ layout

  function renderGrid(): void {
    stop();
    clear(grid);
    if (!lib) return;
    if (mode === 'voices') renderVoiceGrid();
    else renderSoundGrid();
  }

  function render(): void {
    for (const b of modes.querySelectorAll('button')) b.setAttribute('aria-selected', String(b.textContent === t(mode === 'voices' ? 'dev.modeVoices' : 'dev.modeSounds')));
    lede.textContent = t(mode === 'voices' ? 'dev.voicesHelp' : 'dev.soundsHelp');
    clear(cast);
    clear(tools);
    cast.classList.toggle('sounds', mode === 'sounds');
    if (!lib) {
      grid.textContent = t('dev.loading');
      return;
    }
    if (mode === 'voices') {
      renderVoiceCast();
      renderVoiceTools();
    } else {
      renderSlots();
    }
    renderGrid();
    picksText.textContent = summary() || t('dev.nothing');
  }

  function setMode(m: Mode): void {
    mode = m;
    filter.value = '';
    remember();
    render();
  }

  render();
  void devSounds.library().then((l) => {
    lib = l;
    if (!l) grid.textContent = t('dev.unavailable');
    else render();
  });
  return el;
}
