import { Emitter } from './events';
import { storage } from './storage';

export type TextSpeed = 'slow' | 'normal' | 'fast' | 'instant';
export type UiScale = 'normal' | 'large';
export type TouchMode = 'auto' | 'on' | 'off';

export interface Settings {
  masterVolume: number; // 0..1
  musicVolume: number;
  sfxVolume: number;
  voiceVolume: number;
  language: string;
  textSpeed: TextSpeed;
  textSounds: boolean;
  reduceMotion: boolean;
  uiScale: UiScale;
  touchControls: TouchMode;
}

const KEY = 'bible-rpg.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.8,
  voiceVolume: 1,
  language: 'en',
  textSpeed: 'normal',
  textSounds: true,
  reduceMotion: false,
  uiScale: 'normal',
  touchControls: 'auto',
};

/** Characters revealed per second for each text speed. */
export const TEXT_SPEED_CPS: Record<TextSpeed, number> = {
  slow: 28,
  normal: 48,
  fast: 90,
  instant: Infinity,
};

class SettingsStore extends Emitter<{ change: Settings }> {
  private value: Settings;

  constructor() {
    super();
    const saved = storage.read<Partial<Settings>>(KEY) ?? {};
    this.value = { ...DEFAULT_SETTINGS, ...saved };
    if (!saved.reduceMotion && typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.value.reduceMotion = saved.reduceMotion ?? true;
    }
  }

  get(): Readonly<Settings> {
    return this.value;
  }

  update(patch: Partial<Settings>): void {
    this.value = { ...this.value, ...patch };
    storage.write(KEY, this.value);
    this.emit('change', this.value);
  }
}

export const settings = new SettingsStore();
