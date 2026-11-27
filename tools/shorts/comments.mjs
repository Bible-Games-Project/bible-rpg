#!/usr/bin/env node
// The comments on the game's reels, answered by hand (the console's Videos
// page asks an agent to answer them: it writes the replies itself).
//
//   node tools/shorts/comments.mjs list [--raw]   the new comments, as JSON on stdout
//   node tools/shorts/comments.mjs reply FILE      post the replies in FILE, a JSON list of
//        { platform, comment_id, post_id, message }  (an answer), or
//        { platform, comment_id, skip: true }        (decided not to answer)
//
// "New": not in tools/shorts/comments-state.json (every comment answered or
// skipped, by platform and id: commit it, so no one gets two answers), not
// ours, not empty, not already answered by us, and at most 7 days old.
// Upload-Post's history of the profile in channel.json gives the posts
// (Pinterest has no comments). The key: the variable named in channel.json,
// from the environment only.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
if (proxy) {
  const { ProxyAgent, setGlobalDispatcher } = require('undici');
  setGlobalDispatcher(new ProxyAgent(proxy));
}

const API = 'https://api.upload-post.com/api';
const ch = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/shorts/channel.json'), 'utf8'));
const STATE = path.join(ROOT, 'tools/shorts/comments-state.json');
const PLATFORMS = ['youtube', 'instagram', 'facebook', 'tiktok'];
const MAX_AGE = 7 * 864e5;
const MAX_REPLIES = 40;
const MAX_CHARS = 200;

const key = process.env[ch.key];
if (!key) throw new Error(`${ch.key} is not set`);
const H = { Authorization: `Apikey ${key}` };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Upload-Post answers 429 when asked too fast: wait and try again
async function up(pathAndQuery, init = {}, tries = 4) {
  const r = await fetch(`${API}/${pathAndQuery}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
  if (r.status === 429 && tries > 1) {
    await sleep(Number(r.headers.get('retry-after')) * 1000 || 15000);
    return up(pathAndQuery, init, tries - 1);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) throw new Error(`${pathAndQuery.split('?')[0]}: ${r.status} ${j.error ?? j.message ?? ''}`.trim());
  return j;
}

// each network names a comment's fields its own way (YouTube: id, text_original,
// author, published_at, reply_count; TikTok: comment_id, text, username,
// create_time in seconds, owner, replies as a count)
const pick = (...v) => v.find((x) => (typeof x === 'string' && x.trim()) || typeof x === 'number');
const idOf = (c) => String(pick(c.id, c.comment_id, c.commentId, c.cid) ?? '');
const textOf = (c) => pick(c.text_original, c.text, c.message, c.content, c.textOriginal, c.textDisplay, c.snippet?.textOriginal) ?? '';
const authorOf = (c) => pick(c.author, c.author_name, c.username, c.authorDisplayName, c.from?.name, c.user?.username, c.user?.name, c.owner?.username, c.user?.unique_id) ?? '';
const authorIdOf = (c) => String(pick(c.author_id, c.author_channel_id, c.authorChannelId, c.from?.id, c.user?.id, c.owner?.id, c.user_id) ?? '');
const timeOf = (c) => {
  const v = pick(c.published_at, c.timestamp, c.created_time, c.created_at, c.publishedAt, c.create_time, c.date, c.time);
  if (v === undefined) return NaN;
  if (typeof v === 'number' || /^\d+$/.test(v)) return Number(v) * (Number(v) < 1e12 ? 1000 : 1);
  return Date.parse(v);
};
const repliesOf = (c) => [c.replies?.data, c.replies?.comments, Array.isArray(c.replies) ? c.replies : null, c.children?.data, c.reply_comments].find(Array.isArray) ?? [];
const OUR_NAMES = ['biblegamesproject', 'bible games project', 'bible_games_project', 'biblegamesproject.com'];
const ours = (c) =>
  Boolean(c.owner === true || c.is_owner || c.from_owner || c.author_is_owner || c.is_author || c.isAuthor || c.is_from_owner) ||
  authorIdOf(c) === ch.facebookPage ||
  OUR_NAMES.includes(String(authorOf(c)).toLowerCase().replace(/^@/, ''));

async function posts() {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const j = await up(`uploadposts/history?profile_username=${encodeURIComponent(ch.profile)}&limit=50&page=${page}`);
    for (const h of j.history ?? []) {
      if (h.profile_username !== ch.profile || h.success !== true || !h.platform_post_id || !PLATFORMS.includes(h.platform)) continue;
      out.push(h);
    }
    if (!j.history?.length || page * (j.limit ?? 50) >= (j.total ?? 0)) break;
  }
  return out;
}

async function commentsOf(post) {
  const out = [];
  let cursor = null;
  for (let i = 0; i < 10; i++) {
    // YouTube finds its videos by id only (by URL: 404), the others by URL
    const q = new URLSearchParams({ platform: post.platform, user: ch.profile });
    if (post.post_url && post.platform !== 'youtube') q.set('post_url', post.post_url);
    else q.set('post_id', post.platform_post_id);
    if (cursor) q.set('cursor', cursor);
    const j = await up(`uploadposts/comments?${q}`);
    out.push(...(j.comments ?? j.data ?? []));
    cursor = j.pagination?.has_next ? j.pagination.next_cursor : null;
    if (!cursor) break;
  }
  return out;
}

const loadState = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { handled: [] });
const saveState = (s) => fs.writeFileSync(STATE, JSON.stringify(s, null, 1) + '\n');
const tagOf = (platform, id) => `${platform}:${id}`;

async function list(raw) {
  const state = loadState();
  const done = new Set(state.handled.map((h) => tagOf(h.platform, h.comment_id)));
  const now = Date.now();
  const out = [];
  const errors = [];
  for (const post of await posts()) {
    let cs;
    try {
      cs = await commentsOf(post);
    } catch (e) {
      errors.push(`${post.platform} ${post.platform_post_id}: ${e.message}`);
      continue;
    }
    for (const c of cs) {
      const id = idOf(c);
      const text = String(textOf(c)).trim();
      const when = timeOf(c);
      if (!id || done.has(tagOf(post.platform, id)) || !text || ours(c)) continue;
      if (repliesOf(c).some(ours)) continue;
      if (!Number.isNaN(when) && now - when > MAX_AGE) continue;
      out.push({
        platform: post.platform,
        comment_id: id,
        post_id: post.platform_post_id,
        post_title: String(post.post_title ?? '').split(/\r?\n/)[0],
        author: authorOf(c),
        date: Number.isNaN(when) ? null : new Date(when).toISOString(),
        text,
        ...(raw ? { raw: c } : {}),
      });
    }
  }
  console.log(JSON.stringify({ comments: out, errors }, null, 1));
}

async function reply(file) {
  const items = JSON.parse(fs.readFileSync(file, 'utf8'));
  const state = loadState();
  const done = new Set(state.handled.map((h) => tagOf(h.platform, h.comment_id)));
  let sent = 0;
  let skipped = 0;
  for (const it of items) {
    const tag = tagOf(it.platform, it.comment_id);
    if (done.has(tag)) continue;
    if (it.skip) {
      state.handled.push({ platform: it.platform, comment_id: String(it.comment_id), skipped: true, at: new Date().toISOString() });
      done.add(tag);
      skipped++;
      continue;
    }
    if (sent >= MAX_REPLIES) {
      console.log(`limit of ${MAX_REPLIES} replies reached: ${tag} left for next time`);
      continue;
    }
    const message = String(it.message ?? '').trim();
    if (!message || [...message].length > MAX_CHARS) {
      console.log(`! ${tag}: the reply is empty or longer than ${MAX_CHARS} characters, not sent`);
      continue;
    }
    const body = { platform: it.platform, user: ch.profile, comment_id: String(it.comment_id), message };
    if (it.platform === 'tiktok' || it.post_id) body.post_id = String(it.post_id);
    try {
      await up('uploadposts/comments/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      state.handled.push({ platform: it.platform, comment_id: String(it.comment_id), replied: true, at: new Date().toISOString() });
      done.add(tag);
      sent++;
      console.log(`replied ${tag}`);
      await sleep(3000);
    } catch (e) {
      console.log(`! ${tag}: ${e.message}`);
    }
    saveState(state);
  }
  saveState(state);
  console.log(`replied: ${sent}, skipped: ${skipped}`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'list') await list(process.argv.includes('--raw'));
else if (cmd === 'reply' && arg) await reply(arg);
else {
  console.error('usage: comments.mjs list [--raw] | reply FILE');
  process.exit(1);
}
