import { settings } from './settings';

/**
 * Sound is synthesised at runtime with the Web Audio API, except a few
 * recorded effects (SAMPLES): CC0 recordings (public domain, credited in
 * art/sfx/CREDITS.md) mixed by tools/audio/build_sfx.py. Until a recording
 * has loaded, or if it cannot, its synthesised version plays instead.
 *
 * Buses: master -> (music, sfx). Ambience (wind, birds, water) goes through
 * the sfx bus. Everything respects the volume settings and the game remains
 * fully playable with audio muted or unavailable.
 */

export type Sfx =
  | 'uiMove'
  | 'uiSelect'
  | 'uiBack'
  | 'step'
  | 'pickup'
  | 'dig'
  | 'plant'
  | 'splash'
  | 'correct'
  | 'wrong'
  | 'missionStart'
  | 'missionComplete'
  | 'holy'
  | 'rustle'
  | 'grow'
  | 'flame'
  | 'detected'
  | 'bite'
  | 'leaves'
  | 'land'
  | 'hiss'
  | 'seed'
  | 'fill'
  | 'pour'
  | 'leafPick'
  | 'drop';

export type Mood = 'none' | 'peaceful' | 'wonder' | 'solemn' | 'tension' | 'sorrow';
export type Ambience = 'none' | 'garden' | 'evening' | 'outside';

/** Recorded effects (public/assets/sfx) and their level next to the
 * synthesised ones (the maintainer wanted real sounds for these). */
const SAMPLES: Partial<Record<Sfx, { files: string[]; gain: number }>> = {
  bite: { files: ['assets/sfx/bite.mp3'], gain: 0.55 },
  leaves: { files: ['assets/sfx/sew-leaves.mp3'], gain: 0.5 },
  land: { files: ['assets/sfx/land.mp3'], gain: 0.85 },
  // footsteps on grass, a different one each step
  step: { files: [1, 2, 3, 4, 5, 6].map((i) => `assets/sfx/step-${i}.mp3`), gain: 0.2 },
  seed: { files: ['assets/sfx/seed.mp3'], gain: 0.5 },
  fill: { files: ['assets/sfx/fill.mp3'], gain: 0.5 },
  pour: { files: ['assets/sfx/pour.mp3'], gain: 0.5 },
  leafPick: { files: ['assets/sfx/leaf-pick.mp3'], gain: 0.45 },
  hiss: { files: ['assets/sfx/hiss.mp3'], gain: 0.6 },
  drop: { files: ['assets/sfx/drop.mp3'], gain: 0.45 },
};

const PENTA_MAJOR = [0, 2, 4, 7, 9];
const PENTA_MINOR = [0, 3, 5, 7, 10];

class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfx!: GainNode;
  private voices!: GainNode;
  private speaking = 0;
  private noise!: AudioBuffer;
  private mood: Mood = 'none';
  private musicTimer: number | null = null;
  private ambience: Ambience = 'none';
  private ambNodes: AudioNode[] = [];
  private ambGain: GainNode | null = null;
  private waterGain: GainNode | null = null;
  private birdTimer: number | null = null;
  private unlocked = false;
  private samples = new Map<Sfx, AudioBuffer[]>();

  constructor() {
    const unlock = () => {
      this.ensure();
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
      this.unlocked = true;
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    settings.on('change', () => this.applyVolumes());
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
    } catch {
      return null;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.music = ctx.createGain();
    this.sfx = ctx.createGain();
    this.voices = ctx.createGain();
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.voices.connect(this.master);
    this.master.connect(ctx.destination);
    this.loadSamples(ctx);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    // apply anything requested before the first gesture
    const m = this.mood;
    this.mood = 'none';
    this.setMood(m);
    const a = this.ambience;
    this.ambience = 'none';
    this.setAmbience(a);
    return ctx;
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const s = settings.get();
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.masterVolume, t, 0.05);
    // the music dips while someone speaks
    this.music.gain.setTargetAtTime(s.musicVolume * 0.55 * (this.speaking ? 0.55 : 1), t, 0.12);
    this.sfx.gain.setTargetAtTime(s.sfxVolume, t, 0.05);
    this.voices.gain.setTargetAtTime(s.voiceVolume, t, 0.05);
  }

  // ------------------------------------------------------------------ sfx

  private env(g: GainNode, t: number, a: number, peak: number, d: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private tone(freq: number, t: number, dur: number, peak: number, type: OscillatorType = 'sine', dest?: AudioNode, glideTo?: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    this.env(g, t, Math.min(0.02, dur / 4), peak, dur);
    o.connect(g).connect(dest ?? this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseBurst(t: number, dur: number, peak: number, filter: BiquadFilterType, freq: number, q = 0.8, dest?: AudioNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, Math.min(0.01, dur / 5), peak, dur);
    src.connect(f).connect(g).connect(dest ?? this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  /**
   * Crackle: many tiny clicks at random moments, thinning out over `dur`
   * (`density` clicks per second at the start), band-passed around `freq`.
   * A crunch, crinkling leaves or falling grit are made of such clicks,
   * which a smooth burst of noise only hints at.
   */
  private crackle(t: number, dur: number, peak: number, density: number, freq: number, q = 0.7, fade = 3): void {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(dur * rate));
    const buf = ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    let at = 0;
    while (at < dur) {
      const k = Math.exp(-fade * (at / dur));
      at += -Math.log(1 - Math.random()) / (density * Math.max(0.05, k));
      const i0 = Math.floor(at * rate);
      const n = 6 + Math.floor(Math.random() * 40);
      const amp = (0.4 + Math.random() * 0.6) * k;
      for (let i = 0; i < n && i0 + i < len; i++) d[i0 + i] += (Math.random() * 2 - 1) * amp * (1 - i / n);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = peak;
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t);
  }

  /** A drawn-out hiss: filtered noise that swells, holds and dies away. */
  private hissOnce(t: number, dur: number, peak: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.3;
    f.frequency.setValueAtTime(4200, t);
    f.frequency.linearRampToValueAtTime(6400, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(peak * 0.75, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private loadSamples(ctx: AudioContext): void {
    for (const [name, s] of Object.entries(SAMPLES) as [Sfx, { files: string[] }][]) {
      Promise.all(
        s.files.map((file) =>
          fetch(`${import.meta.env.BASE_URL}${file}`)
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
            .then((data) => ctx.decodeAudioData(data)),
        ),
      )
        .then((bufs) => this.samples.set(name, bufs))
        .catch(() => {
          /* the synthesised sound stays */
        });
    }
  }

  play(name: Sfx, opts: { pitch?: number; volume?: number } = {}): void {
    const ctx = this.unlocked ? this.ensure() : null;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.005;
    const v = opts.volume ?? 1;
    const p = opts.pitch ?? 1;
    const recorded = this.samples.get(name);
    if (recorded) {
      const src = ctx.createBufferSource();
      src.buffer = recorded[Math.floor(Math.random() * recorded.length)];
      src.playbackRate.value = p;
      const g = ctx.createGain();
      g.gain.value = (SAMPLES[name]?.gain ?? 1) * v;
      src.connect(g).connect(this.sfx);
      src.start(t);
      return;
    }
    switch (name) {
      case 'uiMove':
        this.tone(880 * p, t, 0.05, 0.05 * v, 'triangle');
        break;
      case 'uiSelect':
        this.tone(660, t, 0.09, 0.07 * v, 'triangle');
        this.tone(990, t + 0.07, 0.14, 0.06 * v, 'triangle');
        break;
      case 'uiBack':
        this.tone(660, t, 0.08, 0.06 * v, 'triangle');
        this.tone(495, t + 0.06, 0.12, 0.05 * v, 'triangle');
        break;
      case 'step':
        this.noiseBurst(t, 0.07, 0.05 * v, 'bandpass', 900 * p, 1.2);
        break;
      case 'pickup':
        [0, 4, 7].forEach((s, i) => this.tone(523 * Math.pow(2, s / 12), t + i * 0.06, 0.25, 0.07 * v, 'triangle'));
        break;
      case 'dig':
        this.noiseBurst(t, 0.16, 0.16 * v, 'lowpass', 500, 0.7);
        this.tone(110, t, 0.12, 0.08 * v, 'sine', undefined, 70);
        break;
      case 'plant':
        this.noiseBurst(t, 0.1, 0.08 * v, 'lowpass', 900);
        this.tone(392, t + 0.05, 0.2, 0.05 * v, 'triangle');
        break;
      case 'splash':
        this.noiseBurst(t, 0.35, 0.12 * v, 'bandpass', 1800, 0.6);
        this.noiseBurst(t + 0.08, 0.3, 0.06 * v, 'highpass', 3000, 0.5);
        break;
      case 'correct':
        [0, 4, 7, 12].forEach((s, i) => this.tone(587 * Math.pow(2, s / 12), t + i * 0.08, 0.5, 0.06 * v, 'sine'));
        break;
      case 'wrong':
        this.tone(220, t, 0.25, 0.07 * v, 'triangle');
        this.tone(196, t + 0.12, 0.3, 0.06 * v, 'triangle');
        break;
      case 'missionStart':
        [0, 7, 12].forEach((s, i) => this.tone(392 * Math.pow(2, s / 12), t + i * 0.12, 0.6, 0.05 * v, 'triangle'));
        break;
      case 'missionComplete':
        [0, 4, 7, 12, 16].forEach((s, i) => this.tone(440 * Math.pow(2, s / 12), t + i * 0.1, 0.9, 0.05 * v, 'sine'));
        break;
      case 'holy':
        [0, 7, 12, 19].forEach((s, i) => this.tone(261.6 * Math.pow(2, s / 12), t + i * 0.18, 2.4, 0.035 * v, 'sine'));
        break;
      case 'rustle':
      case 'leafPick':
      case 'seed':
        this.noiseBurst(t, 0.3, 0.05 * v, 'highpass', 2500, 0.4);
        break;
      case 'drop':
        this.noiseBurst(t, 0.12, 0.12 * v, 'lowpass', 600, 0.7);
        break;
      case 'fill':
      case 'pour':
        this.noiseBurst(t, 0.6, 0.1 * v, 'bandpass', 1400, 0.6);
        break;
      case 'grow':
        [0, 2, 4, 7, 9, 12].forEach((s, i) => this.tone(523 * Math.pow(2, s / 12), t + i * 0.09, 0.6, 0.04 * v, 'sine'));
        break;
      case 'flame':
        this.noiseBurst(t, 1.2, 0.08 * v, 'bandpass', 700, 0.5);
        break;
      case 'detected':
        this.tone(330, t, 0.4, 0.05 * v, 'sine', undefined, 247);
        break;
      case 'bite':
        // biting into an apple: the skin snaps, the flesh crunches (a dense
        // burst of tiny cracks), then a few muffled chews
        this.tone(190, t, 0.05, 0.12 * v, 'triangle', undefined, 120);
        this.crackle(t, 0.14, 0.6 * v, 900, 3400, 0.6, 4);
        this.crackle(t + 0.005, 0.1, 0.35 * v, 600, 6500, 0.9, 5);
        [0.32, 0.55, 0.78].forEach((d, i) => this.crackle(t + d, 0.11, (0.3 - i * 0.07) * v, 500, 1700, 0.8, 3));
        break;
      case 'leaves':
        // fig leaves sewn together: handfuls of crinkling leaves, and the
        // pull of the cord through them now and then
        [0, 0.34, 0.95, 1.3].forEach((d) => this.crackle(t + d, 0.28, 0.35 * v, 260, 4200, 0.6, 1.5));
        [0.62, 1.62].forEach((d) => {
          const ctx = this.ctx!;
          const src = ctx.createBufferSource();
          src.buffer = this.noise;
          const f = ctx.createBiquadFilter();
          f.type = 'bandpass';
          f.Q.value = 2.2;
          f.frequency.setValueAtTime(700, t + d);
          f.frequency.exponentialRampToValueAtTime(2200, t + d + 0.24);
          const g = ctx.createGain();
          this.env(g, t + d, 0.06, 0.09 * v, 0.2);
          src.connect(f).connect(g).connect(this.sfx);
          src.start(t + d, Math.random());
          src.stop(t + d + 0.35);
        });
        break;
      case 'land':
        // a cherub landing: a deep, heavy thud that shakes the ground, earth
        // and grit thrown up and falling back, a low rumble dying away
        this.tone(95, t, 0.55, 0.5 * v, 'sine', undefined, 32);
        this.tone(55, t, 0.9, 0.35 * v, 'sine', undefined, 28);
        this.noiseBurst(t, 0.35, 0.45 * v, 'lowpass', 420, 0.8);
        this.noiseBurst(t, 1.6, 0.28 * v, 'lowpass', 120, 1);
        this.crackle(t + 0.04, 0.9, 0.35 * v, 220, 2400, 0.5, 2.5);
        this.crackle(t + 0.25, 1.1, 0.18 * v, 90, 5200, 0.7, 2);
        break;
      case 'hiss':
        // the serpent: a long hiss, then a shorter one
        this.hissOnce(t, 1.1, 0.2 * v);
        this.hissOnce(t + 1.35, 0.7, 0.13 * v);
        break;
    }
  }

  /** Decodes a recorded file (a spoken line); null without sound or file. */
  async decode(url: string): Promise<AudioBuffer | null> {
    const ctx = this.ensure();
    if (!ctx) return null;
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      return await ctx.decodeAudioData(await r.arrayBuffer());
    } catch {
      return null;
    }
  }

  /** Plays a spoken line on the voice channel (src/core/voices.ts). */
  speak(buffer: AudioBuffer): { ended: Promise<void>; stop(): void } | null {
    const ctx = this.unlocked ? this.ensure() : null;
    if (!ctx || ctx.state !== 'running') return null;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    src.connect(g).connect(this.voices);
    let over = false;
    const ended = new Promise<void>((resolve) => {
      src.onended = () => {
        if (!over) {
          over = true;
          this.speaking--;
          this.applyVolumes();
        }
        resolve();
      };
    });
    this.speaking++;
    this.applyVolumes();
    src.start();
    return {
      ended,
      stop: () => {
        // a short fade, not a click
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(0, t, 0.02);
        src.stop(t + 0.1);
      },
    };
  }

  /** Soft per-character "voice" blip for dialogue reveal. */
  blip(pitch: number): void {
    if (!settings.get().textSounds) return;
    const ctx = this.unlocked ? this.ensure() : null;
    if (!ctx || ctx.state !== 'running') return;
    this.tone(pitch * (0.97 + Math.random() * 0.06), ctx.currentTime + 0.002, 0.045, 0.018, 'triangle');
  }

  // ---------------------------------------------------------------- music

  setMood(mood: Mood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    if (this.musicTimer !== null) {
      window.clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
    if (!this.ctx || mood === 'none') return;
    let step = 0;
    const tick = () => {
      if (!this.ctx || this.mood !== mood) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.05;
      const cfg = {
        peaceful: { root: 220, scale: PENTA_MAJOR, beat: 0.42, density: 0.75 },
        wonder: { root: 261.6, scale: PENTA_MAJOR, beat: 0.5, density: 0.65 },
        solemn: { root: 196, scale: PENTA_MINOR, beat: 0.62, density: 0.5 },
        tension: { root: 174.6, scale: PENTA_MINOR, beat: 0.75, density: 0.35 },
        sorrow: { root: 164.8, scale: PENTA_MINOR, beat: 0.7, density: 0.45 },
      }[mood];
      if (step % 8 === 0) {
        // soft drone / pad on the root and fifth
        for (const s of [0, 7]) this.tone(cfg.root / 2 * Math.pow(2, s / 12), t, cfg.beat * 8, 0.03, 'sine', this.music);
      }
      if (Math.random() < cfg.density) {
        const deg = cfg.scale[Math.floor(Math.random() * cfg.scale.length)];
        const oct = Math.random() < 0.3 ? 2 : 1;
        const f = cfg.root * oct * Math.pow(2, deg / 12);
        this.pluck(f, t, cfg.beat * 3.2);
      }
      step++;
      this.musicTimer = window.setTimeout(tick, cfg.beat * 1000);
    };
    tick();
  }

  private pluck(freq: number, t: number, dur: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq * 6, t);
    f.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
    this.env(g, t, 0.008, 0.05, dur);
    for (const [mult, type] of [[1, 'triangle'], [2, 'sine']] as [number, OscillatorType][]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq * mult;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
    f.connect(g).connect(this.music);
  }

  // ------------------------------------------------------------- ambience

  setAmbience(a: Ambience): void {
    if (a === this.ambience) return;
    this.ambience = a;
    for (const n of this.ambNodes) {
      try {
        (n as AudioScheduledSourceNode).stop?.();
      } catch {
        /* already stopped */
      }
      n.disconnect();
    }
    this.ambNodes = [];
    if (this.birdTimer !== null) window.clearTimeout(this.birdTimer);
    this.birdTimer = null;
    if (!this.ctx || a === 'none') return;
    const ctx = this.ctx;
    this.ambGain = ctx.createGain();
    this.ambGain.gain.value = 0.0001;
    this.ambGain.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
    this.ambGain.connect(this.sfx);
    this.ambNodes.push(this.ambGain);
    // wind / leaves
    const wind = this.loopNoise('lowpass', a === 'outside' ? 500 : 900, a === 'outside' ? 0.05 : 0.025, 0.07);
    this.ambNodes.push(...wind);
    // water, level set by the world depending on distance to the river
    const water = this.loopNoise('bandpass', 1400, 0, 0.3);
    this.waterGain = water[water.length - 1] as GainNode;
    this.ambNodes.push(...water);
    if (a === 'garden') this.scheduleBirds();
    if (a === 'evening') this.scheduleCrickets();
  }

  private loopNoise(type: BiquadFilterType, freq: number, level: number, lfoRate: number): AudioNode[] {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = level;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = lfoRate;
    lfoGain.gain.value = freq * 0.35;
    lfo.connect(lfoGain).connect(f.frequency);
    src.connect(f).connect(g).connect(this.ambGain!);
    src.start();
    lfo.start();
    return [src, lfo, lfoGain, f, g];
  }

  /** 0..1, how close the listener is to running water. */
  setWaterLevel(level: number): void {
    if (!this.ctx || !this.waterGain) return;
    this.waterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.05, this.ctx.currentTime, 0.4);
  }

  private scheduleBirds(): void {
    const call = () => {
      if (!this.ctx || this.ambience !== 'garden' || !this.ambGain) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.05;
      const base = 1800 + Math.random() * 1600;
      const notes = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < notes; i++) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        const s = t + i * (0.09 + Math.random() * 0.05);
        o.frequency.setValueAtTime(base * (1 + Math.random() * 0.2), s);
        o.frequency.exponentialRampToValueAtTime(base * (0.75 + Math.random() * 0.6), s + 0.07);
        this.env(g, s, 0.01, 0.012, 0.07);
        o.connect(g).connect(this.ambGain);
        o.start(s);
        o.stop(s + 0.12);
      }
      this.birdTimer = window.setTimeout(call, 1800 + Math.random() * 5200);
    };
    this.birdTimer = window.setTimeout(call, 1200);
  }

  private scheduleCrickets(): void {
    const chirp = () => {
      if (!this.ctx || this.ambience !== 'evening' || !this.ambGain) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.05;
      for (let i = 0; i < 3; i++) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 4200 + Math.random() * 300;
        this.env(g, t + i * 0.06, 0.005, 0.006, 0.035);
        o.connect(g).connect(this.ambGain);
        o.start(t + i * 0.06);
        o.stop(t + i * 0.06 + 0.06);
      }
      this.birdTimer = window.setTimeout(chirp, 600 + Math.random() * 1400);
    };
    this.birdTimer = window.setTimeout(chirp, 600);
  }
}

export const audio = new AudioManager();
