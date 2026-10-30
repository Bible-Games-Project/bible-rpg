import './styles/main.css';
import { applyDocumentLanguage } from './core/i18n';
import { settings } from './core/settings';
import { App } from './ui/App';
import { setOverlayHost } from './ui/overlays';
import { preloadPortraits } from './ui/PortraitAnimator';
import { voices } from './core/voices';

/**
 * The interface grows and shrinks with the screen (the maintainer saw it huge
 * or cut off on a phone): sizes are designed for about 1180 x 700 CSS px and
 * scaled by the tighter side, never below what stays readable on a phone nor
 * above what fills a large monitor; "large text" multiplies on top.
 */
function applyUiScale(): void {
  const fit = Math.min(1.4, Math.max(0.75, Math.min(window.innerWidth / 1180, window.innerHeight / 700)));
  const large = settings.get().uiScale === 'large' ? 1.25 : 1;
  document.documentElement.style.setProperty('--ui-scale', (fit * large).toFixed(3));
}

function applyDocumentSettings(): void {
  const s = settings.get();
  document.documentElement.dataset.uiScale = s.uiScale;
  applyUiScale();
  document.documentElement.dataset.reduceMotion = String(s.reduceMotion);
  applyDocumentLanguage();
}

applyDocumentSettings();
settings.on('change', applyDocumentSettings);
window.addEventListener('resize', applyUiScale);

const host = document.getElementById('ui')!;
setOverlayHost(host);
preloadPortraits();
// the list of recorded voice lines, so the first dialogue knows them
voices.preload();
settings.on('change', () => voices.preload());
const app = new App(host);
app.start();
// ?debug exposes the app for automated browser tests
if (new URLSearchParams(location.search).has('debug')) (window as unknown as { bibleRpg: App }).bibleRpg = app;
