// Helpers for shot.mjs scripts on the Cain and Abel chapter (cat it before
// your own script): goMission('cain.m03') opens that mission, S is the scene.
const goMission = async (m) => {
  await page.goto('http://localhost:4173/?debug', { waitUntil: 'networkidle0' });
  await sleep(1500);
  await page.evaluate(() => window.bibleRpg.startChapter('cain-abel', 'new'));
  await sleep(4000);
  await page.evaluate((m) => { const k = 'bible-rpg.save.v1'; const d = JSON.parse(localStorage.getItem(k)); d.chapters['cain-abel'].currentMission = m; localStorage.setItem(k, JSON.stringify(d)); }, m);
  await page.goto('http://localhost:4173/?debug', { waitUntil: 'networkidle0' });
  await sleep(1500);
  await page.evaluate(() => window.bibleRpg.startChapter('cain-abel', 'continue'));
  await sleep(5000);
  await page.evaluate(() => { window.S = bibleRpg.game.scene.getScene('cain'); });
};
const hideUi = () => page.evaluate(() => document.querySelectorAll('.fader,.chapter-card,.dialogue,.scripture,.hud-banners').forEach(e => e.style.display = 'none'));
const scr = (p) => page.evaluate((p) => { const c = S.cameras.main; const r = bibleRpg.game.canvas.getBoundingClientRect(); return [(p[0] - c.worldView.x) * c.zoom * r.width / bibleRpg.game.scale.width + r.left, (p[1] - c.worldView.y) * c.zoom * r.height / bibleRpg.game.scale.height + r.top]; }, p);
