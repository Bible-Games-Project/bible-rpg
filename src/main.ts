import './styles/main.css';
import { applyDocumentLanguage } from './core/i18n';
import { settings } from './core/settings';
import { App } from './ui/App';
import { setOverlayHost } from './ui/overlays';
import { preloadPortraits } from './ui/PortraitAnimator';

function applyDocumentSettings(): void {
  const s = settings.get();
  document.documentElement.dataset.uiScale = s.uiScale;
  document.documentElement.dataset.reduceMotion = String(s.reduceMotion);
  applyDocumentLanguage();
}

applyDocumentSettings();
settings.on('change', applyDocumentSettings);

const host = document.getElementById('ui')!;
setOverlayHost(host);
preloadPortraits();
const app = new App(host);
app.start();
// ?debug exposes the app for automated browser tests
if (new URLSearchParams(location.search).has('debug')) (window as unknown as { bibleRpg: App }).bibleRpg = app;
