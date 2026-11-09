// Voice the dialogue with ElevenLabs text to speech (the maintainer's choice):
// each spoken line becomes public/assets/voice/<lang>/<key>.mp3, listed with
// its text in manifest.json there. The game plays a line's file only while the
// manifest text still matches the line, so an edited line falls silent until
// it is voiced again (src/core/voices.ts).
//
// Only lines whose text or voice changed are sent again (each costs credits).
// The API key comes from the environment (ELEVENLABS_API_KEY); it is never
// written into this repo. Needs ffmpeg (FFMPEG=/path/to/ffmpeg if it is not on
// the PATH; `npm i @ffmpeg-installer/linux-x64` in /tmp gives one).
//
//   node tools/audio/build_voices.mjs            # voice what changed
//   node tools/audio/build_voices.mjs --dry-run  # list it, with its cost
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// behind a proxy (the build server), fetch goes through it
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
if (proxy) {
  const { ProxyAgent, setGlobalDispatcher } = await import('undici');
  setGlobalDispatcher(new ProxyAgent(proxy));
}

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const API = 'https://api.elevenlabs.io/v1/text-to-speech';
const MODEL = 'eleven_v4';
const SEED = 7;
// less steady than the default 0.5 (a more natural, less read-out delivery)
// at the voice's own speed: the maintainer's settings for every voice
const SETTINGS = { stability: 0.3, similarity_boost: 0.75, speed: 1.0 };
// Voice Library voices chosen by the maintainer from the account's paid plan:
// what is generated while subscribed keeps its commercial licence after the
// subscription ends (generate final lines only while subscribed).
const VOICES = {
  god: ['W. Storytime Oxley', 'iUqOXhMfiOIbBejNtfLR', SETTINGS],
  adam: ['Josh', 'nzFihrBIvB34imQBuxub', SETTINGS],
  eve: ['Zara', 'jqcCZkN6Knx8BJ5TBdYR', SETTINGS],
  serpent: ['Matthew Schmitz', 'xYWUvKNK6zWCgsdAK7Wi', SETTINGS],
  cain: ['David Boles', 'y1adqrqs4jNaANXsIZnD', SETTINGS],
  abel: ['Adam', 'QIhD5ivPGEoYZQDocuHI', SETTINGS],
};
// reads the gold scripture cards, the creation verse and the short narrations
const NARRATOR = ['Spuds Oxley', 'NOpBlnGInO9m6vDvFkFC', SETTINGS];
// words a voice would spell out or stress wrongly, written as spoken
const SPOKEN = { LORD: 'Lord' };

const args = process.argv.slice(2);
const lang = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : 'en';
const dry = args.includes('--dry-run');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'i18n', lang, f), 'utf8'));

/** Every line to voice: key -> [speaker, text]. Lines with a value in them
 * ("Adam called it {name}") stay unvoiced. */
function lines() {
  const out = {};
  const said = (key, speaker, text) => {
    if (!text.includes('{') && !text.startsWith('Gameplay')) out[key] = [speaker, text];
  };
  // the garden (Adam and Eve)
  const eden = read('eden.json');
  out.creation = ['narrator', eden.creation.verse];
  for (const [id, v] of Object.entries(eden.scripture)) out[`scripture.${id}`] = ['narrator', v.text];
  for (const [id, list] of Object.entries(eden.dialogue)) list.forEach((l, i) => said(`${id}.${i}`, l.s, l.t));
  // Cain and Abel (keys as CainScene gives them)
  const cain = read('cain.json');
  for (const [id, v] of Object.entries(cain.scripture)) out[`cain.scripture.${id}`] = ['narrator', v.text];
  for (const [id, list] of Object.entries(cain.dialogue)) list.forEach((l, i) => said(`cain.${id}.${i}`, l.s, l.t));
  for (const [who, phases] of Object.entries(cain.npc)) for (const [phase, list] of Object.entries(phases)) list.forEach((t, i) => said(`cain.npc.${who}.${phase}.${i}`, who, t));
  said('cain.chase.escaped', 'narrator', cain.chase.escaped);
  return out;
}

const voiceFor = (speaker) => (speaker === 'narrator' ? NARRATOR : VOICES[speaker]);

async function speak(voice, text) {
  for (const [word, spoken] of Object.entries(SPOKEN)) text = text.replaceAll(word, spoken);
  const key = process.env.ELEVENLABS_API_KEY;
  const res = await fetch(`${API}/${voice[1]}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg', ...(key ? { 'xi-api-key': key } : {}) },
    body: JSON.stringify({ text, model_id: MODEL, seed: SEED, voice_settings: voice[2] }),
  });
  if (!res.ok) throw new Error(`ElevenLabs refused (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Silence trimmed at both ends, loudness evened out between voices, mono MP3 at 64 kb/s. */
function finish(raw, out) {
  const tmp = path.join(os.tmpdir(), `voice-${process.pid}.mp3`);
  fs.writeFileSync(tmp, raw);
  const trim = 'silenceremove=start_periods=1:start_threshold=-50dB';
  const chain = `${trim},areverse,${trim},areverse,loudnorm=I=-18:TP=-1.5:LRA=11,afade=t=in:d=0.01`;
  execFileSync(process.env.FFMPEG || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-af', chain, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '64k', out]);
  fs.rmSync(tmp);
}

const folder = path.join(ROOT, 'public', 'assets', 'voice', lang);
const file = path.join(folder, 'manifest.json');
const manifest = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const save = () => {
  const sorted = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]));
  fs.writeFileSync(file, JSON.stringify(sorted, null, 2) + '\n');
};
const wanted = lines();
const todo = [];
let cost = 0;
for (const [key, [speaker, text]] of Object.entries(wanted)) {
  const voice = voiceFor(speaker);
  if (!voice) continue;
  const entry = { text, voice: voice[0], model: MODEL, settings: voice[2] };
  if (JSON.stringify(manifest[key]) !== JSON.stringify(entry) || !fs.existsSync(path.join(folder, `${key}.mp3`))) {
    todo.push([key, voice, entry]);
    cost += text.length;
  }
}
console.log(`${todo.length} lines to voice, about ${cost} credits`);
if (dry) {
  for (const [key, voice, entry] of todo) console.log(`  ${key.padEnd(34)} ${voice[0].padEnd(20)} ${entry.text.slice(0, 60)}`);
  process.exit(0);
}
fs.mkdirSync(folder, { recursive: true });
for (const [key, voice, entry] of todo) {
  finish(await speak(voice, entry.text), path.join(folder, `${key}.mp3`));
  manifest[key] = entry;
  // saved after every line, so an interrupted run loses nothing paid for
  save();
  console.log('voiced', key, voice[0]);
}
// lines that no longer exist (or whose speaker has no voice any more)
for (const key of Object.keys(manifest)) {
  if (wanted[key] && voiceFor(wanted[key][0])) continue;
  delete manifest[key];
  fs.rmSync(path.join(folder, `${key}.mp3`), { force: true });
  console.log('removed', key);
}
save();
