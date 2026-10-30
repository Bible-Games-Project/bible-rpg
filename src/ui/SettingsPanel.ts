import { LANGUAGES, t } from '../core/i18n';
import { settings, type Settings } from '../core/settings';
import { audio } from '../core/audio';
import { h } from './dom';
import { openOverlay } from './overlays';

function slider(id: string, key: 'masterVolume' | 'musicVolume' | 'sfxVolume' | 'voiceVolume'): HTMLInputElement {
  const el = h('input', {
    id,
    type: 'range',
    min: 0,
    max: 100,
    step: 5,
    value: Math.round(settings.get()[key] * 100),
  }) as HTMLInputElement;
  el.addEventListener('input', () => settings.update({ [key]: Number(el.value) / 100 } as Partial<Settings>));
  el.addEventListener('change', () => audio.play('uiMove'));
  return el;
}

function choice<K extends keyof Settings>(key: K, options: [Settings[K], string][], labelId: string): HTMLElement {
  const wrap = h('div', { class: 'toggle', role: 'group', 'aria-labelledby': labelId });
  const render = () => {
    for (const b of Array.from(wrap.children) as HTMLButtonElement[]) {
      b.setAttribute('aria-pressed', String(b.dataset.value === String(settings.get()[key])));
    }
  };
  for (const [value, label] of options) {
    const b = h('button', { class: 'btn', type: 'button', 'data-value': String(value) }, label);
    b.addEventListener('click', () => {
      settings.update({ [key]: value } as Partial<Settings>);
      render();
    });
    wrap.append(b);
  }
  render();
  return wrap;
}

/** Opens the settings overlay. Changes apply and persist immediately. */
export function openSettings(onClose?: () => void): void {
  const lang = h('select', { id: 'set-lang' }) as HTMLSelectElement;
  for (const l of LANGUAGES) {
    const o = h('option', { value: l.code }, l.nativeName) as HTMLOptionElement;
    if (l.code === settings.get().language) o.selected = true;
    lang.append(o);
  }
  lang.addEventListener('change', () => settings.update({ language: lang.value }));

  const fs = h('button', { class: 'btn small', type: 'button' }, t('settings.fullscreen'));
  fs.addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  });

  const box = h(
    'div',
    { class: 'panel dialog', style: 'width:min(620px,100%)' },
    h('h2', { class: 'panel-title' }, t('settings.title')),
    h(
      'div',
      { class: 'settings-grid' },
      h('label', { for: 'set-master' }, t('settings.master')),
      slider('set-master', 'masterVolume'),
      h('label', { for: 'set-music' }, t('settings.music')),
      slider('set-music', 'musicVolume'),
      h('label', { for: 'set-sfx' }, t('settings.sfx')),
      slider('set-sfx', 'sfxVolume'),
      h('label', { for: 'set-voices' }, t('settings.voices')),
      slider('set-voices', 'voiceVolume'),
      h('div', { class: 'hint' }, t('settings.voicesHint')),
      h('label', { for: 'set-lang' }, t('settings.language')),
      lang,
      h('div', { class: 'hint' }, t('settings.languageHint')),
      h('label', { id: 'lbl-speed' }, t('settings.textSpeed')),
      choice('textSpeed', [
        ['slow', t('settings.speedSlow')],
        ['normal', t('settings.speedNormal')],
        ['fast', t('settings.speedFast')],
        ['instant', t('settings.speedInstant')],
      ], 'lbl-speed'),
      h('label', { id: 'lbl-sounds' }, t('settings.textSounds')),
      choice('textSounds', [[true, t('settings.on')], [false, t('settings.off')]], 'lbl-sounds'),
      h('label', { id: 'lbl-motion' }, t('settings.reduceMotion')),
      choice('reduceMotion', [[true, t('settings.on')], [false, t('settings.off')]], 'lbl-motion'),
      h('div', { class: 'hint' }, t('settings.reduceMotionHint')),
      h('label', { id: 'lbl-ui' }, t('settings.uiScale')),
      choice('uiScale', [['normal', t('settings.uiNormal')], ['large', t('settings.uiLarge')]], 'lbl-ui'),
      h('label', { id: 'lbl-touch' }, t('settings.touch')),
      choice('touchControls', [['auto', t('settings.touchAuto')], ['on', t('settings.on')], ['off', t('settings.off')]], 'lbl-touch'),
      h('span', {}, ''),
      fs,
    ),
    h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', 'data-sound': 'back', onclick: () => close() }, t('settings.done'))),
  );
  const handle = openOverlay(box, () => close());
  function close() {
    handle.close();
    onClose?.();
  }
}
