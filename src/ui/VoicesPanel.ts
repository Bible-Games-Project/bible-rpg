import { audio, SFX } from '../core/audio';
import { t, tRaw } from '../core/i18n';
import { settings } from '../core/settings';
import { voices } from '../core/voices';
import { CHARACTERS } from '../data/characters';
import { h } from './dom';
import { openOverlay } from './overlays';

/**
 * The maintainer's voices screen (main menu, only with src/core/dev.ts on):
 * every recorded line by character, with the voice that says it, and every
 * sound effect, each with a button to hear it.
 */
export function openVoices(): void {
  let playing: { stop(): void } | null = null;
  const stop = () => {
    playing?.stop();
    playing = null;
  };
  const lines = h('div', { class: 'dev-list' }, h('p', {}, '…'));
  const sounds = h(
    'div',
    { class: 'dev-sounds' },
    ...SFX.map((name) => {
      const b = h('button', { class: 'btn small', type: 'button' }, `▶ ${name}`, h('span', { class: 'dev-kind' }, t(audio.recorded(name) ? 'dev.recorded' : 'dev.synth')));
      b.addEventListener('click', () => audio.play(name));
      return b;
    }),
  );
  const box = h(
    'div',
    { class: 'panel dialog dev-voices-panel', style: 'width:min(860px,100%)' },
    h('h2', { class: 'panel-title' }, t('dev.title')),
    h('h3', {}, t('dev.lines')),
    lines,
    h('h3', {}, t('dev.sounds')),
    sounds,
    h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', 'data-sound': 'back', onclick: () => close() }, t('settings.done'))),
  );
  const handle = openOverlay(box, () => close());
  function close() {
    stop();
    handle.close();
  }

  void voices.list().then((list) => {
    const keys = Object.keys(list);
    if (!keys.length) {
      lines.replaceChildren(h('p', {}, t('dev.none')));
      return;
    }
    // who says each line: the dialogue's speaker, else the narrator
    const speaker = (key: string) => {
      const [id, i] = key.split('.');
      const said = tRaw<{ s: string }[]>(`eden.dialogue.${id}`);
      return Array.isArray(said) ? (said[Number(i)]?.s ?? 'narrator') : 'narrator';
    };
    const groups = new Map<string, string[]>();
    for (const key of keys) {
      const who = speaker(key);
      groups.set(who, [...(groups.get(who) ?? []), key]);
    }
    lines.replaceChildren(
      ...[...groups].map(([who, ks]) =>
        h(
          'section',
          { class: 'dev-group' },
          h('h4', {}, `${t(CHARACTERS[who]?.nameKey ?? 'characters.narrator') || t('dev.narrator')} · ${list[ks[0]].voice ?? ''}`),
          ...ks.map((key) => {
            const b = h('button', { class: 'btn small', type: 'button', 'aria-label': key }, '▶');
            b.addEventListener('click', async () => {
              stop();
              const buf = await audio.decode(`${import.meta.env.BASE_URL}assets/voice/${settings.get().language}/${key}.mp3`);
              if (buf) playing = audio.speak(buf);
            });
            return h('div', { class: 'dev-line' }, b, h('span', {}, list[key].text));
          }),
        ),
      ),
    );
  });
}
