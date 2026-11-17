// Records a short's frames from the game, one fixed step at a time (so the
// result is smooth however slow the machine), at 1080×1920.
//   node tools/shorts/record.mjs <short-id> [--from s] [--to s] [--every n]
// Needs the headless browser of tools/headless/setup.sh (in /tmp/tools) and
// the built game served on :4173 (bun run build; tools/shorts/serve.mjs).
// Frames go to /tmp/shorts/<id>/frames/.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const TOOLS = process.env.HEADLESS_TOOLS || '/tmp/tools';
const req = createRequire(path.join(TOOLS, 'package.json'));
const puppeteer = req('puppeteer-core');
const chromium = (await import(req.resolve('@sparticuz/chromium'))).default;

const args = process.argv.slice(2);
const id = args[0];
const opt = (k, d) => (args.includes(k) ? Number(args[args.indexOf(k) + 1]) : d);
const FPS = 30;
const short = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/shorts/shorts.json'), 'utf8')).find((s) => s.id === id);
const sceneSrc = fs.readFileSync(path.join(ROOT, `tools/shorts/scenes/${id}.js`), 'utf8');
const words = JSON.parse(fs.readFileSync(path.join(ROOT, `art/shorts/${id}/words.json`), 'utf8'));
const out = `/tmp/shorts/${id}/frames`;
fs.mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: chromium.args.filter((a) => !a.includes('single-process') && !a.includes('no-zygote')).concat(['--autoplay-policy=no-user-gesture-required']),
  headless: true,
  env: { ...process.env, FONTCONFIG_PATH: '/tmp/fonts' },
  defaultViewport: { width: 540, height: 960, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GAME = 'http://localhost:4173/?debug';

// open the mission straight from a save, past the headphones and controls notes
const mission = new Function(`return (\n${sceneSrc}\n)`)().mission;
await page.goto(GAME, { waitUntil: 'networkidle0' });
await page.evaluate((m) => {
  const now = Date.now();
  localStorage.setItem('bible-rpg.save.v1', JSON.stringify({ version: 1, chapters: { eden: { currentMission: m, completedMissions: [], flags: {}, inventory: {}, activeCharacter: 'adam', completed: false, startedAt: now, updatedAt: now } }, unlocked: ['eden'], updatedAt: now }));
}, mission);
await page.goto(GAME, { waitUntil: 'networkidle0' });
await sleep(800);
await page.evaluate(() => setTimeout(() => window.bibleRpg.startChapter('eden', 'continue'), 30));
for (let k = 0; k < 3; k++) {
  await sleep(1500);
  await page.keyboard.press('Enter');
}
await sleep(6000);

// the pixel font, given straight to the page (this browser does not load web fonts from CSS)
const fonts = ['400', '600'].map((w) => [w, fs.readFileSync(path.join(ROOT, `src/assets/fonts/pixelify-sans-latin-${w}-normal.woff2`)).toString('base64')]);
await page.evaluate(async (fonts) => {
  for (const [w, b64] of fonts) {
    const buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
    const f = new FontFace('Pixelify Sans', buf, { weight: w });
    await f.load();
    document.fonts.add(f);
  }
}, fonts);
const overlay = fs.readFileSync(path.join(ROOT, 'tools/shorts/overlay.js'), 'utf8');
await page.evaluate(overlay);
const length = await page.evaluate(
  (sceneSrc, short, words) => {
    const S = bibleRpg.game.scene.getScene('eden');
    window.S = S;
    S.halt();
    S.cutscene(true);
    S.objective('', null);
    // only the short's own overlay over the game
    const st = document.createElement('style');
    st.textContent = 'body > *:not(#short-root):not(canvas):not(#game):not(.game){visibility:hidden} .hud,.touch-controls,.dialogue,.toasts,.hud-banners,.fader{display:none!important}';
    document.head.append(st);
    const scene = new Function(`return (\n${sceneSrc}\n)`)();
    window.SC = scene;
    window.X = {};
    SHORT.init({ ...short, ...scene, endBg: '/assets/ui/menu-background.webp', endTitle: '', endSub: 'A Bible adventure game', endCall: 'Play the story · link in bio' }, words);
    scene.setup(S, X);
    window.BASE = S.cameras.main.zoom;
    bibleRpg.game.loop.sleep();
    window.CLOCK = performance.now();
    window.DONE = 0;
    return scene.length;
  },
  sceneSrc,
  short,
  words,
);
// the game layer must be visible: show its ancestors again
await page.evaluate(() => {
  let e = bibleRpg.game.canvas;
  while (e && e !== document.body) {
    e.style.visibility = 'visible';
    e = e.parentElement;
  }
});
const from = opt('--from', 0);
const to = Math.min(opt('--to', length), length);
const every = opt('--every', 1);
const total = Math.round(to * FPS);
const t0 = Date.now();
for (let f = 0; f <= total; f++) {
  const t = f / FPS;
  await page.evaluate((t) => {
    // the cues due by now, then one step of the game, then the camera and overlay
    for (const c of SC.cues) if (c[0] <= t && !c.done) { c.done = true; c[1](S, X); }
    SHORT_CAMERA(S, SC.camera, t, BASE);
    window.CLOCK += 1000 / 30;
    bibleRpg.game.step(window.CLOCK, 1000 / 30);
    SHORT.frame(t, S);
  }, t);
  if (t < from || f % every) continue;
  await page.screenshot({ path: `${out}/${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
  if (f % 30 === 0) console.log(`${t.toFixed(1)} s (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
await browser.close();
