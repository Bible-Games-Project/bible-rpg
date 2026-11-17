// Music bed for a short, written offline as a WAV: the game's own 'peaceful'
// mood (src/core/audio.ts setMood: a drone on the root and fifth, plucks on
// a major pentatonic), seeded so every render is the same, plus a soft bell
// at each `chimes` time of the scene (the animal names popping up, ...).
// Synthesized here, so free of any copyright.
//
//   node tools/shorts/music.mjs <id> <out.wav>
import { readFileSync, writeFileSync } from 'node:fs';

const [id, out] = process.argv.slice(2);
if (!id || !out) throw new Error('usage: music.mjs <id> <out.wav>');
const scene = new Function(`return (\n${readFileSync(new URL(`./scenes/${id}.js`, import.meta.url), 'utf8')}\n)`)();
const mood = scene.music ?? 'peaceful';
const SR = 44100;
const len = scene.length;
const N = Math.ceil(len * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);

let seed = scene.seed ?? 11;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

const PENTA_MAJOR = [0, 2, 4, 7, 9];
const PENTA_MINOR = [0, 3, 5, 7, 10];
const cfg = {
  peaceful: { root: 220, scale: PENTA_MAJOR, beat: 0.42, density: 0.75 },
  wonder: { root: 261.6, scale: PENTA_MAJOR, beat: 0.5, density: 0.65 },
  solemn: { root: 196, scale: PENTA_MINOR, beat: 0.62, density: 0.5 },
  sorrow: { root: 164.8, scale: PENTA_MINOR, beat: 0.7, density: 0.45 },
}[mood];

/** Attack, then an exponential fall to silence over `dur` (like audio.ts env). */
function env(t, a, dur) {
  if (t < 0 || t > dur + 0.1) return 0;
  if (t < a) return t / a;
  return Math.exp(-5 * (t - a) / dur);
}
const tri = (p) => 1 - 4 * Math.abs(((p + 0.25) % 1) - 0.5);

function add(start, dur, pan, fn) {
  const i0 = Math.max(0, Math.floor(start * SR));
  const i1 = Math.min(N, Math.ceil((start + dur + 0.15) * SR));
  const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  for (let i = i0; i < i1; i++) {
    const v = fn(i / SR - start);
    L[i] += v * gl;
    R[i] += v * gr;
  }
}

function pad(f, t, dur, peak) {
  add(t, dur, 0, (x) => {
    const e = x < 1.2 ? x / 1.2 : Math.max(0, 1 - (x - 1.2) / (dur - 1.2 + 0.6));
    return peak * e * Math.sin(2 * Math.PI * f * x);
  });
}

function pluck(f, t, dur, peak, pan) {
  // triangle + octave sine, a one-pole lowpass falling from 6f to 1.5f
  let y = 0;
  add(t, dur, pan, (x) => {
    const cut = f * 6 * Math.pow(1.5 / 6, Math.min(1, x / dur));
    const a = 1 - Math.exp(-2 * Math.PI * cut / SR);
    const s = tri(f * x) + Math.sin(2 * Math.PI * 2 * f * x);
    y += a * (s - y);
    return peak * env(x, 0.008, dur) * y;
  });
}

function bell(f, t, peak, pan) {
  const parts = [[1, 1, 1.6], [2.0, 0.45, 0.9], [3.01, 0.25, 0.6], [4.2, 0.12, 0.35]];
  add(t, 2.2, pan, (x) => {
    let v = 0;
    for (const [m, g, d] of parts) v += g * Math.exp(-x / d) * Math.sin(2 * Math.PI * f * m * x);
    return peak * Math.min(1, x / 0.004) * v;
  });
}

// the music: one tick per beat, as in the game
for (let step = 0, t = 0.15; t < len; step++, t += cfg.beat) {
  if (step % 8 === 0) for (const s of [0, 7]) pad(cfg.root / 2 * Math.pow(2, s / 12), t, cfg.beat * 8 + 1, 0.05);
  if (rnd() < cfg.density) {
    const deg = cfg.scale[Math.floor(rnd() * cfg.scale.length)];
    const oct = rnd() < 0.3 ? 2 : 1;
    pluck(cfg.root * oct * Math.pow(2, deg / 12), t, cfg.beat * 3.2, 0.06, rnd() * 0.8 - 0.4);
  }
}

// a bell for each chime, climbing the scale
(scene.chimes ?? []).forEach((t, i) => {
  const deg = cfg.scale[i % cfg.scale.length] + 12 * Math.floor(i / cfg.scale.length);
  bell(cfg.root * 4 * Math.pow(2, deg / 12), t, 0.09, i % 2 ? 0.3 : -0.3);
});

// a little room: two feedback delays per side
function room(buf, d1, d2) {
  const out = Float32Array.from(buf);
  const a = Math.floor(d1 * SR), b = Math.floor(d2 * SR);
  for (let i = 0; i < N; i++) {
    if (i >= a) out[i] += 0.32 * out[i - a];
    if (i >= b) out[i] += 0.22 * out[i - b];
  }
  return out;
}
const RL = room(L, 0.137, 0.211), RR = room(R, 0.153, 0.197);

// fade out over the last 1.5 s, then write 16-bit stereo
const data = Buffer.alloc(N * 4);
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(RL[i]), Math.abs(RR[i]));
const norm = peak > 0.9 ? 0.9 / peak : 1;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fade = Math.min(1, t / 0.3, (len - t) / 1.5);
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, RL[i] * norm * fade)) * 32767), i * 4);
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, RR[i] * norm * fade)) * 32767), i * 4 + 2);
}
const h = Buffer.alloc(44);
h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
h.write('data', 36); h.writeUInt32LE(data.length, 40);
writeFileSync(out, Buffer.concat([h, data]));
console.log(`${out}: ${len.toFixed(1)} s, ${mood}, ${(scene.chimes ?? []).length} chimes`);
