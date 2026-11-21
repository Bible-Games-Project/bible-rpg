// Schedules the finished shorts through Upload-Post, which publishes them by
// itself at their time, on every network of the game's profile (the account,
// profile, networks and calendar are in tools/shorts/channel.json; what has
// been scheduled, in published.json). The texts of each network follow
// docs/shorts.md (section 11).
//
//   node tools/shorts/publish.mjs preview <id>       the texts of each network (sends nothing, needs no key)
//   node tools/shorts/publish.mjs check              the key's account, its profiles, Facebook pages and Pinterest boards
//   node tools/shorts/publish.mjs schedule <id> [--at 2026-11-22T18:00] [--platforms youtube,tiktok]
//     (--at in the channel's local time; default: the next day of the calendar)
//   node tools/shorts/publish.mjs list               the posts waiting at Upload-Post
//
// The key is read from the environment variable named in channel.json and
// never written anywhere. Nothing is sent unless the key belongs to the
// game's account.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const { ProxyAgent, setGlobalDispatcher } = createRequire(path.join(ROOT, 'package.json'))('undici');
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
if (proxy) setGlobalDispatcher(new ProxyAgent(proxy));

const API = 'https://api.upload-post.com/api';
const ch = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/shorts/channel.json'), 'utf8'));
const shorts = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/shorts/shorts.json'), 'utf8'));
const LOG = path.join(ROOT, 'tools/shorts/published.json');
const len = (s) => [...s].length;

/** The texts of each network for a short (docs/shorts.md, section 11). */
function texts(short) {
  const q = short.question;
  const ref = short.reference;
  const emoji = short.title.slice(q.length).trim();
  const book = ref.split(/\s/)[0];
  const game = ch.game;
  // what people search for: the story's own name (Adam and Eve, Cain and Abel)
  const story = short.id.startsWith('cain') ? { tag: 'CainAndAbel', words: ['Cain and Abel', 'Cain and Abel story'] } : { tag: 'AdamAndEve', words: ['Adam and Eve', 'Garden of Eden'] };
  const wish = `🎮 ${game}: a Bible adventure game, coming soon. Add it to your wishlist!`;
  let ytTitle = `${q} ${emoji} | Bible Story #Shorts`;
  if (len(ytTitle) > 70) ytTitle = `${q} ${emoji} #Shorts`;
  if (len(ytTitle) > 70) throw new Error(`${short.id}: the YouTube title is over 70 characters`);
  const social = (tags, link) => `${short.title}\n📖 ${ref}\n${wish}${link ? ` ${link}` : ''}\n\n${tags}`;
  const pinTitle = `Bible Story: ${q}`;
  const pinDesc = `${short.narration}\n\n📖 ${ref} · Bible story, Bible facts, Sunday school, Christian game, ${[...(short.names ?? []), book].join(', ')}, ${game}.`;
  if (len(pinTitle) > 100 || len(pinDesc) > 500) throw new Error(`${short.id}: the Pinterest title or description is too long`);
  return {
    youtube: {
      title: ytTitle,
      description: `${q} The Bible story from ${ref}, from ${game}, a Bible adventure game.\n\n${short.narration}\n\n📖 ${ref}\n\n${wish}\n\n#Bible #BibleStories #${story.tag} #DidYouKnow #BibleGame #${book}`,
      tags: [...new Set([...ch.tags, ...story.words, ...(short.names ?? [])])],
      category: ch.categoryId,
    },
    instagram: social(`#BibleStories #BibleFacts #${story.tag} #ChristianGames #${book} #EdenToHeaven`, 'Link in bio.'),
    facebook: social(`#BibleStories #BibleFacts #${story.tag} #ChristianGames #${book} #EdenToHeaven`, ch.wishlist),
    tiktok: social(`#BibleTok #ChristianTikTok #BibleStories #${story.tag} #DidYouKnow #EdenToHeaven`, 'Link in bio.'),
    pinterest: { title: pinTitle, description: pinDesc, link: ch.wishlist },
  };
}

const [cmd, id] = process.argv.slice(2);
const opt = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const findShort = (id) => {
  const s = shorts.find((s) => s.id === id);
  if (!s) throw new Error('unknown short ' + id);
  return s;
};

if (cmd === 'preview') {
  const t = texts(findShort(id));
  for (const [pl, v] of Object.entries(t)) {
    console.log(`\n===== ${pl} =====`);
    if (typeof v === 'string') console.log(v);
    else for (const [k, x] of Object.entries(v)) console.log(`--- ${k}${typeof x === 'string' ? ` (${len(x)} chars)` : ''}\n${Array.isArray(x) ? x.join(', ') : x ?? '(missing)'}`);
  }
  process.exit(0);
}

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
async function check(platforms = ch.platforms) {
  const me = await call('/uploadposts/me');
  if (me.email !== ch.account) throw new Error(`the key belongs to ${me.email}, not ${ch.account}: not uploading`);
  const { profiles } = await call('/uploadposts/users');
  const prof = profiles.find((p) => p.username === ch.profile);
  if (!prof) throw new Error(`no profile ${ch.profile} (the account has: ${profiles.map((p) => p.username).join(', ')})`);
  for (const pl of platforms) if (!prof.social_accounts?.[pl]) throw new Error(`${pl} is not connected in ${ch.profile}`);
  return { me, profiles, prof };
}

/** UTC time of a wall-clock time in the channel's time zone. */
function zoned(y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: ch.timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const off = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - guess;
  return new Date(guess - off);
}
const ymd = (t) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: ch.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(t).map((x) => [x.type, +x.value]));
const log = () => (fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8')) : []);
const mine = () => log().filter((e) => e.account === ch.account);

/** The calendar: every `everyDays` days at `time` after this account's last post, at least an hour from now. */
function nextSlot() {
  const [h, mi] = ch.time.split(':').map(Number);
  const last = Math.max(0, ...mine().map((e) => +new Date(e.at)));
  const start = last ? last + ch.everyDays * 86400e3 - 6 * 3600e3 : Date.now();
  for (let k = 0; k < 400; k++) {
    const d = ymd(new Date(start + k * 86400e3));
    const at = zoned(d.year, d.month, d.day, h, mi);
    if (+at >= Date.now() + 3600e3 && (!last || +at >= last + (ch.everyDays - 0.5) * 86400e3)) return at;
  }
  throw new Error('no slot found');
}

if (cmd === 'check') {
  const me = await call('/uploadposts/me');
  console.log(`account ${me.email}, plan ${me.plan}${me.email !== ch.account ? ` (NOT the game's account, ${ch.account})` : ''}`);
  const { profiles } = await call('/uploadposts/users');
  for (const p of profiles) {
    console.log(`profile "${p.username}": ${Object.entries(p.social_accounts ?? {}).filter(([, v]) => v).map(([k, v]) => `${k} ${v.display_name ?? ''} ${v.handle ?? ''}`.trim()).join(', ')}`);
    for (const [what, p2] of [['facebook pages', `/uploadposts/facebook/pages?profile=${encodeURIComponent(p.username)}`], ['pinterest boards', `/uploadposts/pinterest/boards?profile=${encodeURIComponent(p.username)}`]])
      console.log(`  ${what}:`, await call(p2).then((j) => JSON.stringify(j).slice(0, 800)).catch((e) => e.message.slice(0, 200)));
  }
  if (ch.profile) console.log('next slot', nextSlot().toISOString());
} else if (cmd === 'list') {
  console.log(JSON.stringify(await call('/uploadposts/schedule'), null, 1).slice(0, 4000));
} else if (cmd === 'schedule') {
  const short = findShort(id);
  const platforms = opt('--platforms')?.split(',') ?? ch.platforms;
  const dup = platforms.filter((pl) => mine().some((e) => e.id === id && e.platforms.includes(pl)));
  if (dup.length) throw new Error(`${id} is already scheduled on ${dup.join(', ')} (published.json)`);
  if (platforms.includes('facebook') && !ch.facebookPage) throw new Error('no facebookPage in channel.json (see: check)');
  if (platforms.includes('pinterest') && !(ch.pinterestBoard && ch.wishlist)) throw new Error('no pinterestBoard or wishlist link in channel.json');
  const t = texts(short);
  await check(platforms);
  let at = nextSlot();
  if (opt('--at')) {
    const [d, tm] = opt('--at').split('T');
    const [y, mo, dd] = d.split('-').map(Number);
    const [h, mi] = tm.split(':').map(Number);
    at = zoned(y, mo, dd, h, mi);
  }
  const form = new FormData();
  form.set('user', ch.profile);
  for (const pl of platforms) form.append('platform[]', pl);
  form.set('video', new Blob([fs.readFileSync(path.join(ROOT, `public/shorts/${id}.mp4`))], { type: 'video/mp4' }), `${id}.mp4`);
  // the default title and description are YouTube's; every other network has its own
  form.set('title', t.youtube.title);
  form.set('description', t.youtube.description);
  form.set('youtube_title', t.youtube.title);
  form.set('youtube_description', t.youtube.description);
  for (const x of t.youtube.tags) form.append('tags[]', x);
  form.set('categoryId', t.youtube.category);
  form.set('privacyStatus', 'public');
  form.set('selfDeclaredMadeForKids', 'false');
  // Instagram and TikTok keep a title and a caption apart: both get their own text
  form.set('instagram_title', t.instagram);
  form.set('instagram_description', t.instagram);
  form.set('media_type', 'REELS');
  form.set('share_to_feed', 'true');
  form.set('thumb_offset', '0');
  form.set('facebook_title', t.facebook);
  form.set('facebook_description', t.facebook);
  if (ch.facebookPage) form.set('facebook_page_id', ch.facebookPage);
  form.set('facebook_media_type', 'REELS');
  form.set('tiktok_title', t.tiktok);
  form.set('tiktok_description', t.tiktok);
  form.set('privacy_level', 'PUBLIC_TO_EVERYONE');
  form.set('pinterest_title', t.pinterest.title);
  form.set('pinterest_description', t.pinterest.description);
  if (ch.wishlist) form.set('pinterest_link', ch.wishlist);
  if (ch.pinterestBoard) form.set('pinterest_board_id', ch.pinterestBoard);
  form.set('scheduled_date', at.toISOString());
  form.set('timezone', ch.timezone);
  console.log(`${id}: scheduling for ${at.toISOString()} (${ch.timezone} ${at.toLocaleString('es-ES', { timeZone: ch.timezone })}) on ${platforms.join(', ')}…`);
  const r = await call('/upload', { method: 'POST', body: form });
  console.log(JSON.stringify(r).slice(0, 1500));
  const l = log();
  l.push({ id, account: ch.account, profile: ch.profile, at: at.toISOString(), title: t.youtube.title, platforms, job: r.job_id ?? r.request_id ?? null, scheduledAt: new Date().toISOString() });
  fs.writeFileSync(LOG, JSON.stringify(l, null, 1) + '\n');
} else {
  console.log('usage: preview <id> | check | schedule <id> [--at YYYY-MM-DDTHH:MM] [--platforms a,b] | list');
}
