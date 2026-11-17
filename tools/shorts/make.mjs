// Puts a short together: the recorded frames (record.mjs), the narration
// (voice.mjs) starting at the scene's `voiceAt`, a background track ducked
// under the voice, and a soft pop at each chime, into a 1080x1920 H.264 MP4
// at public/shorts/<id>.mp4, with its first frame (the thumbnail) beside it
// as <id>.jpg.
//
// The track is one of the maintainer's (art/shorts/music/tracks.json), taken
// in turn by the short's place in shorts.json, or the one named by its
// `music`; `music: "game"` uses the game's own synthesized music instead.
//
//   node tools/shorts/make.mjs <id>
// ffmpeg: /tmp/tools (npm i @ffmpeg-installer/ffmpeg), or $FFMPEG.
import { readFileSync, mkdirSync, statSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const id = process.argv[2];
if (!id) throw new Error('usage: make.mjs <id>');
const root = new URL('../../', import.meta.url).pathname;
const scene = new Function(`return (\n${readFileSync(`${root}tools/shorts/scenes/${id}.js`, 'utf8')}\n)`)();
const shorts = JSON.parse(readFileSync(`${root}tools/shorts/shorts.json`, 'utf8'));
const short = shorts.find((s) => s.id === id);
const FF = process.env.FFMPEG ?? '/tmp/tools/node_modules/@ffmpeg-installer/linux-x64/ffmpeg';
const work = `/tmp/shorts/${id}`;
const len = scene.length;

// the background: a track, or the game's music
const tracks = JSON.parse(readFileSync(`${root}art/shorts/music/tracks.json`, 'utf8'));
const game = short.music === 'game';
const track = game ? null : tracks.find((t) => t.file === short.music) ?? tracks[shorts.indexOf(short) % tracks.length];
const fx = `${work}/fx.wav`;
execFileSync('node', [`${root}tools/shorts/music.mjs`, id, fx, ...(game ? [] : ['--fx'])], { stdio: 'inherit' });
const bed = game
  ? ['-i', fx]
  : ['-ss', String(track.start ?? 0), '-t', String(len), '-i', `${root}art/shorts/music/${track.file}`];

mkdirSync(`${root}public/shorts`, { recursive: true });
const out = `${root}public/shorts/${id}.mp4`;
const delay = Math.round((scene.voiceAt ?? 0) * 1000);
const fmt = 'aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo';
const audio = [
  `[1:a]adelay=${delay}|${delay},apad,${fmt},asplit=2[v1][v2]`,
  game
    ? `[2:a]${fmt},volume=0.4[m]`
    : `[2:a]${fmt},afade=t=in:d=0.4,afade=t=out:st=${len - 1.8}:d=1.8,volume=0.3[m]`,
  `[m][v1]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=450[duck]`,
  game
    ? `[duck][v2]amix=inputs=2:duration=first,volume=2,loudnorm=I=-14:TP=-1.5:LRA=11[a]`
    : `[3:a]${fmt},volume=0.5[fx];[duck][v2][fx]amix=inputs=3:duration=first,volume=3,loudnorm=I=-14:TP=-1.5:LRA=11[a]`,
].join(';');
execFileSync(FF, [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-framerate', '30', '-i', `${work}/frames/%05d.jpg`,
  '-i', `${root}art/shorts/${id}/voice.mp3`,
  ...bed,
  ...(game ? [] : ['-i', fx]),
  '-filter_complex', audio,
  '-map', '0:v', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
  '-t', String(len), '-movflags', '+faststart',
  out,
], { stdio: 'inherit' });
copyFileSync(`${work}/frames/00000.jpg`, `${root}public/shorts/${id}.jpg`);
console.log(`${out}: ${(statSync(out).size / 1e6).toFixed(1)} MB, music: ${game ? 'game' : track.file}`);
