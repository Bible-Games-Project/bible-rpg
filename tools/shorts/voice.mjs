// Narration for a short: ElevenLabs text-to-speech with timestamps, so the
// captions follow the words. Uses ELEVENLABS_API_KEY_2 (the second paid
// account, Nov 2026) or else ELEVENLABS_API_KEY, from the environment.
//   node tools/shorts/voice.mjs <short-id>   -> art/shorts/<id>/voice.mp3 + words.json
import fs from 'node:fs';
import path from 'node:path';

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
if (proxy) {
  const { ProxyAgent, setGlobalDispatcher } = await import('undici');
  setGlobalDispatcher(new ProxyAgent(proxy));
}
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
// the game's narrator (tools/audio/build_voices.mjs): the channel sounds like the game
const VOICE = 'NOpBlnGInO9m6vDvFkFC';
const MODEL = process.env.SHORTS_MODEL || 'eleven_v4';
const SETTINGS = { stability: 0.3, similarity_boost: 0.75, speed: 1.0 };
const SPOKEN = { LORD: 'Lord' };

const id = process.argv[2];
const shorts = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/shorts/shorts.json'), 'utf8'));
const short = shorts.find((s) => s.id === id);
if (!short) throw new Error(`no short ${id}`);
const text = Object.entries(SPOKEN).reduce((s, [a, b]) => s.replaceAll(a, b), short.narration);
const key = process.env.ELEVENLABS_API_KEY_2 || process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error('ELEVENLABS_API_KEY is not set');
const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps?output_format=mp3_44100_128`, {
  method: 'POST',
  headers: { 'xi-api-key': key, 'content-type': 'application/json' },
  body: JSON.stringify({ text, model_id: MODEL, seed: 7, voice_settings: SETTINGS }),
});
if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
const data = await res.json();
const out = path.join(ROOT, 'art/shorts', id);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'voice.mp3'), Buffer.from(data.audio_base64, 'base64'));
// characters -> words with their start and end (seconds)
const a = data.normalized_alignment ?? data.alignment;
const words = [];
let cur = null;
a.characters.forEach((ch, i) => {
  if (/\s/.test(ch)) {
    cur = null;
    return;
  }
  if (!cur) words.push((cur = { w: '', s: a.character_start_times_seconds[i], e: 0 }));
  cur.w += ch;
  cur.e = a.character_end_times_seconds[i];
});
fs.writeFileSync(path.join(out, 'words.json'), JSON.stringify(words, null, 0));
console.log(`${words.length} words, ${words.at(-1).e.toFixed(2)} s, ${text.length} characters`);
