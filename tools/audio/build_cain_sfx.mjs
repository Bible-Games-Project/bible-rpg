// Sound options for the Cain and Abel slots, made with ElevenLabs sound effects
// (text to sound; on the maintainer's paid plan the results are royalty-free
// for commercial use). Each slot gets its own library category, cain-<slot>,
// with ten options the maintainer listens to and chooses from in the voice
// and sound library (src/ui/DevLibrary.ts).
//
// Files: public/assets/sfx/cain/<slot>-<n>.mp3. Existing files are kept (each
// generation costs credits); delete one to make it again. The categories are
// written into art/sfx/library.json and public/assets/dev/library.json.
// The API key comes from ELEVENLABS_API_KEY; it is never written into this
// repo. Needs ffmpeg (FFMPEG=/path/to/ffmpeg, see build_voices.mjs).
//
//   node tools/audio/build_cain_sfx.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
if (proxy) {
  const { ProxyAgent, setGlobalDispatcher } = await import('undici');
  setGlobalDispatcher(new ProxyAgent(proxy));
}

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const API = 'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128';

// slot -> [title, seconds, prompts (one per option)]
const SLOTS = {
  cut: ['Knife into the lamb', 1.2, [
    'A short flint knife cutting into raw meat, one wet slice, close up, no voice',
    'Stone blade stabbing into flesh, a single soft wet thud, close up',
    'Quick knife slash through hide and meat, short and muffled',
    'A blade sinking into a carcass, wet squelch, single hit, dry room',
    'Butcher knife slicing raw lamb on a wooden board, one stroke',
    'Short sharp knife cut into soft flesh with a faint tear of skin',
    'Bronze knife thrust into meat, dull wet impact, short tail',
    'Gentle, quiet knife cut into wool and skin, outdoor, close microphone',
    'Heavy wet stab into meat followed by a short pull out',
    'Single slice through fat and meat, crisp and juicy, no music',
  ]],
  hit: ['Blow with the jawbone', 1.0, [
    'A heavy bone club hitting a body, dull thump, single hit, close up',
    'Blunt bone striking a person, muffled heavy punch impact',
    'Wooden club hitting flesh, deep thud with a short crack',
    'A heavy blunt strike to the body, low punch, no voice',
    'Animal jawbone smacking against a shoulder, hollow bony knock and thud',
    'Single fight punch impact, heavy and dry, cinematic but short',
    'Blunt weapon hit, low muffled body blow, outdoor',
    'Quick hard strike of bone against bone and flesh, crack and thump',
    'Dull heavy impact on cloth and body, short, no reverb',
    'Brutal club hit, deep thud with a small crunch, single shot',
  ]],
  swing: ['Swing through the air', 0.7, [
    'Fast whoosh of a club swung through the air, short',
    'Quick air swish of a heavy bone weapon, single swing',
    'Short sharp whoosh of a stick swung hard',
    'Low heavy swoosh of a blunt weapon through air',
    'Light fast swish, arm swinging a small object, close',
    'A knife swiped through the air, thin quick whoosh',
    'Single woosh of a swung staff, airy and short',
    'Deep swing whoosh, fighting move, no impact',
    'Brief windy swoosh of a punch missing, close up',
    'Two-part whoosh of a weapon raised and brought down fast',
  ]],
  whistle: ['Shepherd whistle', 1.8, [
    'A shepherd whistling with his fingers to call sheep, one long loud whistle, outdoors in a valley',
    'Two short sharp finger whistles of a herder calling his flock',
    'A rising then falling shepherd whistle across open fields',
    'Man whistling loudly through his teeth, calling a dog, outdoor',
    'Short two-tone whistle of a shepherd, bright, with a little echo from the hills',
    'Loud piercing finger whistle, single blast, open air',
    'Herder whistle, three quick chirps then a long note',
    'Soft melodic shepherd whistle calling animals at dusk',
    'Sharp sheepdog command whistle, short up-sweep',
    'A man whistles for his flock, long falling note, meadow ambience faint',
  ]],
  bark: ['Dog bark', 1.0, [
    'A medium sheepdog barking once, outdoors',
    'Two quick barks of a herding dog, alert and friendly',
    'A single deep bark of a big dog in an open field',
    'Short high bark of a young shepherd dog',
    'Dog barking twice, eager, outdoors with slight echo',
    'One sharp woof of a working dog herding sheep',
    'A shepherd dog gives three short barks',
    'Single gruff bark of an old farm dog',
    'Playful bark of a dog, short, close microphone',
    'A dog barks once loudly then a small huff',
  ]],
  flame: ['Altar fire', 2.5, [
    'An altar fire catching and flaring up, a whoosh of flames then crackling',
    'Wood fire igniting with a soft whoosh, flames rising, crackle',
    'Sudden burst of fire from the sky landing on an altar, roaring whoosh',
    'Campfire flaring up, crackling dry wood and rising flames',
    'A torch lighting a pile of wood, short whoosh and pops',
    'Flames bursting into life, deep roar then gentle crackling',
    'Holy fire descending, bright whooshing flare, then burning',
    'Dry branches catching fire, quick crackle and swell of flames',
    'Big fire whoosh, like a fireball, ending in crackling embers',
    'Burning offering on a stone altar, fire rising, sizzling fat and crackle',
  ]],
};

async function generate(text, seconds) {
  const key = process.env.ELEVENLABS_API_KEY;
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg', ...(key ? { 'xi-api-key': key } : {}) },
    body: JSON.stringify({ text, duration_seconds: seconds, prompt_influence: 0.5 }),
  });
  if (!res.ok) throw new Error(`ElevenLabs refused (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Silence trimmed at both ends, loudness evened out, mono MP3 at 96 kb/s. */
function finish(raw, out) {
  const tmp = path.join(os.tmpdir(), `sfx-${process.pid}.mp3`);
  fs.writeFileSync(tmp, raw);
  const trim = 'silenceremove=start_periods=1:start_threshold=-55dB';
  const chain = `${trim},areverse,${trim},areverse,loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=0.005`;
  execFileSync(process.env.FFMPEG || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-af', chain, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', out]);
  fs.rmSync(tmp);
}

const folder = path.join(ROOT, 'public', 'assets', 'sfx', 'cain');
fs.mkdirSync(folder, { recursive: true });
const categories = {};
for (const [slot, [title, seconds, prompts]] of Object.entries(SLOTS)) {
  const options = [];
  for (const [i, prompt] of prompts.entries()) {
    const name = `${slot}-${i + 1}.mp3`;
    const file = path.join(folder, name);
    if (!fs.existsSync(file)) {
      finish(await generate(prompt, seconds), file);
      console.log('made', name);
    }
    options.push([`assets/sfx/cain/${name}`, `${title} ${i + 1}`, `${prompt} · ElevenLabs sound effect, royalty-free`]);
  }
  categories[`cain-${slot}`] = { title: `Cain and Abel · ${title}`, note: 'Made with ElevenLabs sound effects for this game: royalty-free, no attribution needed.', options };
}

// the two copies of the library: the source (indented) and the one the game loads (one line)
for (const [file, write] of [
  [path.join(ROOT, 'art', 'sfx', 'library.json'), (o) => JSON.stringify(o, null, 1)],
  [path.join(ROOT, 'public', 'assets', 'dev', 'library.json'), (o) => JSON.stringify(o)],
]) {
  const lib = JSON.parse(fs.readFileSync(file, 'utf8'));
  Object.assign(lib.categories, categories);
  fs.writeFileSync(file, write(lib));
}
console.log('library updated');
