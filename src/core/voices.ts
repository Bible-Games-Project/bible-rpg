import { audio } from './audio';
import { settings } from './settings';

/**
 * Recorded voices for the dialogue (made by tools/audio/build_voices.py):
 * public/assets/voice/<lang>/<key>.mp3, with manifest.json listing the text
 * each file says. A line plays its file only while the manifest's text is
 * still the line's text: an edited line falls silent until it is voiced
 * again, and a language without voices simply has none.
 */
type Manifest = Record<string, { text: string }>;

const BASE = `${import.meta.env.BASE_URL}assets/voice/`;
const manifests = new Map<string, Promise<Manifest>>();
const loaded = new Map<string, Manifest>();
const buffers = new Map<string, Promise<AudioBuffer | null>>();

function manifest(lang: string): Promise<Manifest> {
  let m = manifests.get(lang);
  if (!m) {
    m = fetch(`${BASE}${lang}/manifest.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : {}))
      .catch(() => ({}))
      .then((data) => {
        loaded.set(lang, data);
        return data;
      });
    manifests.set(lang, m);
  }
  return m;
}

export const voices = {
  /** Fetch the current language's list early, so has() knows. */
  preload(): void {
    void manifest(settings.get().language);
  },

  /** Whether this line is voiced (false until the list has loaded). */
  has(key: string, text: string): boolean {
    return loaded.get(settings.get().language)?.[key]?.text === text;
  },

  /** The line's sound, decoded and kept; null when it has none. */
  async prepare(key: string, text: string): Promise<AudioBuffer | null> {
    const lang = settings.get().language;
    if ((await manifest(lang))[key]?.text !== text) return null;
    const url = `${BASE}${lang}/${key}.mp3`;
    let b = buffers.get(url);
    if (!b) {
      b = audio.decode(url);
      buffers.set(url, b);
      // a failed load may work later (e.g. sound unlocked by a first tap)
      void b.then((buf) => buf ?? buffers.delete(url));
    }
    return b;
  },
};
