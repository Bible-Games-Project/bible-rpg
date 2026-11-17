// Puts a short together: the recorded frames (record.mjs), the narration
// (voice.mjs) starting at the scene's `voiceAt`, and the music bed
// (music.mjs) ducked under the voice, into a 1080x1920 H.264 MP4 at
// public/shorts/<id>.mp4.
//
//   node tools/shorts/make.mjs <id>
// ffmpeg: /tmp/tools (npm i @ffmpeg-installer/ffmpeg), or $FFMPEG.
import { readFileSync, mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const id = process.argv[2];
if (!id) throw new Error('usage: make.mjs <id>');
const root = new URL('../../', import.meta.url).pathname;
const scene = new Function(`return (\n${readFileSync(`${root}tools/shorts/scenes/${id}.js`, 'utf8')}\n)`)();
const FF = process.env.FFMPEG ?? '/tmp/tools/node_modules/@ffmpeg-installer/linux-x64/ffmpeg';
const work = `/tmp/shorts/${id}`;
const music = `${work}/music.wav`;
execFileSync('node', [`${root}tools/shorts/music.mjs`, id, music], { stdio: 'inherit' });

mkdirSync(`${root}public/shorts`, { recursive: true });
const out = `${root}public/shorts/${id}.mp4`;
const delay = Math.round((scene.voiceAt ?? 0) * 1000);
const audio = [
  `[1:a]adelay=${delay}|${delay},apad,asplit=2[v1][v2]`,
  `[2:a]volume=0.9[m]`,
  `[m][v1]sidechaincompress=threshold=0.03:ratio=5:attack=40:release=500[duck]`,
  `[duck][v2]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]`,
].join(';');
execFileSync(FF, [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-framerate', '30', '-i', `${work}/frames/%05d.jpg`,
  '-i', `${root}art/shorts/${id}/voice.mp3`,
  '-i', music,
  '-filter_complex', audio,
  '-map', '0:v', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
  '-t', String(scene.length), '-movflags', '+faststart',
  out,
], { stdio: 'inherit' });
console.log(`${out}: ${(statSync(out).size / 1e6).toFixed(1)} MB`);
