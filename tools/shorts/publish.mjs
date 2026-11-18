// Schedules the finished shorts on the channel through Upload-Post, which
// publishes them by itself at their time (the game's account and slots are
// in tools/shorts/channel.json; what has been scheduled, in published.json).
//
//   node tools/shorts/publish.mjs check              the key's account and profiles
//   node tools/shorts/publish.mjs schedule <id> [--at 2026-11-20T18:00]   (local time; default: next free slot)
//   node tools/shorts/publish.mjs list               the posts waiting at Upload-Post
//
// The key is read from the environment variable named in channel.json and
// never written anywhere. Nothing is sent unless the key belongs to the
// game's account: each game has its own Upload-Post account and key.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const { ProxyAgent, setGlobalDispatcher } = createRequire(path.join(ROOT, 'package.json'))('undici');
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
if (proxy) setGlobalDispatcher(new ProxyAgent(proxy));

const API = 'https://api.upload-post.com/api';
const ch = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/shorts/channel.json'), 'utf8'));
const LOG = path.join(ROOT, 'tools/shorts/published.json');
const key = process.env[ch.key];
if (!key) throw new Error(`no ${ch.key} in the environment`);
const headers = { Authorization: `Apikey ${key}` };
const clean = (t) => t.split(key).join('<key>');
const call = async (p, init = {}) => {
  const r = await fetch(API + p, { ...init, headers });
  const text = clean(await r.text());
  let j;
  try { j = JSON.parse(text); } catch { j = { raw: text.slice(0, 500) }; }
  if (!r.ok) throw new Error(`${p}: ${r.status} ${JSON.stringify(j).slice(0, 600)}`);
  return j;
};

/** The key's account must be the game's, with its profile on every platform. */
async function check() {
  const me = await call('/uploadposts/me');
  if (me.email !== ch.account) throw new Error(`the key belongs to ${me.email}, not ${ch.account}: not uploading`);
  const { profiles } = await call('/uploadposts/users');
  const prof = profiles.find((p) => p.username === ch.profile);
  if (!prof) throw new Error(`no profile ${ch.profile}`);
  for (const pl of ch.platforms) if (!prof.social_accounts?.[pl]) throw new Error(`${pl} is not connected in ${ch.profile}`);
  return { me, prof };
}

/** UTC ISO time of a wall-clock time in the channel's time zone. */
function zoned(y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: ch.timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const off = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - guess;
  return new Date(guess - off);
}
const log = () => (fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8')) : []);

/** The first slot (weekday and time in the channel's zone) at least an hour from now and after the last scheduled post. */
function nextSlot() {
  const taken = log().map((e) => +new Date(e.at));
  let from = Math.max(Date.now() + 3600e3, ...taken.map((t) => t + 60e3));
  for (let k = 0; k < 60; k++) {
    const day = new Date(from + k * 86400e3);
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: ch.timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(day).map((x) => [x.type, x.value]));
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
    for (const s of ch.slots.filter((s) => s.day === wd)) {
      const [h, mi] = s.time.split(':').map(Number);
      const at = zoned(+p.year, +p.month, +p.day, h, mi);
      if (+at >= from) return at;
    }
  }
  throw new Error('no slot found');
}

const [cmd, id] = process.argv.slice(2);
const opt = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);

if (cmd === 'check') {
  const { me, prof } = await check();
  console.log(`${me.email}, profile ${prof.username}: ${Object.entries(prof.social_accounts).filter(([, v]) => v).map(([k, v]) => `${k} ${v.display_name ?? ''} ${v.handle ?? ''}`).join(', ')}`);
  console.log('next slot', nextSlot().toISOString());
} else if (cmd === 'list') {
  console.log(JSON.stringify(await call('/uploadposts/schedule'), null, 1).slice(0, 4000));
} else if (cmd === 'schedule') {
  const short = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/shorts/shorts.json'), 'utf8')).find((s) => s.id === id);
  if (!short) throw new Error('unknown short ' + id);
  if (log().some((e) => e.id === id)) throw new Error(`${id} is already scheduled (published.json)`);
  const video = path.join(ROOT, `public/shorts/${id}.mp4`);
  await check();
  let at = nextSlot();
  if (opt('--at')) {
    const [d, t] = opt('--at').split('T');
    const [y, mo, dd] = d.split('-').map(Number);
    const [h, mi] = t.split(':').map(Number);
    at = zoned(y, mo, dd, h, mi);
  }
  const title = `${short.title} #Shorts`;
  const description = `${short.narration}\n\n📖 ${short.reference}\n\n🎮 ${ch.game}: a Bible adventure game, coming soon. Add it to your wishlist!\n\n#Bible #BibleStories #DidYouKnow #Christian`;
  const form = new FormData();
  form.set('user', ch.profile);
  for (const pl of ch.platforms) form.append('platform[]', pl);
  form.set('video', new Blob([fs.readFileSync(video)], { type: 'video/mp4' }), `${id}.mp4`);
  form.set('title', title);
  form.set('description', description);
  for (const t of ch.tags) form.append('tags[]', t);
  form.set('categoryId', ch.categoryId);
  form.set('privacyStatus', 'public');
  form.set('selfDeclaredMadeForKids', 'false');
  form.set('scheduled_date', at.toISOString());
  form.set('timezone', ch.timezone);
  console.log(`${id}: scheduling for ${at.toISOString()} (${ch.timezone} ${at.toLocaleString('es-ES', { timeZone: ch.timezone })})…`);
  const r = await call('/upload', { method: 'POST', body: form });
  console.log(JSON.stringify(r).slice(0, 1500));
  const l = log();
  l.push({ id, at: at.toISOString(), title, platforms: ch.platforms, job: r.job_id ?? r.request_id ?? null, scheduledAt: new Date().toISOString() });
  fs.writeFileSync(LOG, JSON.stringify(l, null, 1) + '\n');
} else {
  console.log('usage: check | schedule <id> [--at YYYY-MM-DDTHH:MM] | list');
}
