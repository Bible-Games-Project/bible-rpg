import { settings } from './settings';

/**
 * Localisation. Every user-facing string lives in src/i18n/<language>/*.json.
 * ui.json holds the interface strings at the root (e.g. "menu.play"); every
 * other file is a namespace named after the file (eden.json ->
 * "eden.missions.m01.title"). Gameplay code only ever uses keys.
 *
 * To add a language: create src/i18n/<code>/ with the same files and add it
 * to LANGUAGES. Missing keys fall back to English.
 */

export interface LanguageInfo {
  code: string;
  nativeName: string;
  dir: 'ltr' | 'rtl';
}

export const LANGUAGES: LanguageInfo[] = [{ code: 'en', nativeName: 'English', dir: 'ltr' }];

const FALLBACK = 'en';

type Node = string | string[] | Tree | Node[] | { [k: string]: unknown };
type Tree = { [k: string]: Node };

const modules = import.meta.glob('../i18n/*/*.json', { eager: true, import: 'default' }) as Record<string, Tree>;

const bundles: Record<string, Tree> = {};
for (const [path, data] of Object.entries(modules)) {
  const m = path.match(/i18n\/([^/]+)\/([^/]+)\.json$/);
  if (!m) continue;
  const [, lang, ns] = m;
  bundles[lang] ??= {};
  // ui.json holds the interface strings at the root ("menu.play");
  // every other file is a namespace ("eden.missions.m01.title")
  if (ns === 'ui') Object.assign(bundles[lang], data);
  else bundles[lang][ns] = data;
}

function lookup(lang: string, key: string): Node | undefined {
  let node: Node | undefined = bundles[lang];
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string' || Array.isArray(node)) return undefined;
    node = (node as Tree)[part];
  }
  return node;
}

export function currentLanguage(): LanguageInfo {
  const code = settings.get().language;
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

function interpolate(s: string, params?: Record<string, string | number>): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}

/** Translate a key. Returns the key itself if it is missing everywhere. */
export function t(key: string, params?: Record<string, string | number>): string {
  const lang = currentLanguage().code;
  let v = lookup(lang, key);
  if (typeof v !== 'string') v = lookup(FALLBACK, key);
  if (typeof v !== 'string') {
    if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  return interpolate(v, params);
}

/** Translate a key that holds a list of strings (e.g. dialogue lines). */
export function tList(key: string, params?: Record<string, string | number>): string[] {
  const lang = currentLanguage().code;
  let v = lookup(lang, key);
  if (!Array.isArray(v)) v = lookup(FALLBACK, key);
  if (!Array.isArray(v)) return typeof v === 'string' ? [interpolate(v, params)] : [];
  return (v as unknown[]).filter((s): s is string => typeof s === 'string').map((s) => interpolate(s, params));
}

/** Raw structured entry (e.g. a list of dialogue objects), with fallback. */
export function tRaw<T = unknown>(key: string): T | undefined {
  const v = lookup(currentLanguage().code, key) ?? lookup(FALLBACK, key);
  return v as T | undefined;
}

export { interpolate };

export function hasKey(key: string): boolean {
  return lookup(currentLanguage().code, key) !== undefined || lookup(FALLBACK, key) !== undefined;
}

export function applyDocumentLanguage(): void {
  const lang = currentLanguage();
  document.documentElement.lang = lang.code;
  document.documentElement.dir = lang.dir;
}

/** Split a word into user-perceived characters (handles accents/combining marks). */
export function graphemes(word: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) {
    return Array.from(new Seg(currentLanguage().code, { granularity: 'grapheme' }).segment(word.normalize('NFC')), (s) => s.segment);
  }
  return Array.from(word.normalize('NFC'));
}
