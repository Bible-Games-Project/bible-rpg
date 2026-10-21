import { MANIFEST, assetUrl, type PortraitAsset } from '../game/manifest';

/**
 * Animated dialogue portrait for any character.
 *
 * The portrait is a base image plus optional overlay patches:
 *   mouth[0] = half open, mouth[1] = open
 *   eyes[0]  = half closed, eyes[1] = closed
 * Mouth and eyes are independent layers, so talking and blinking never
 * interfere. The mouth only moves while text is being revealed
 * (setTalking(true)); blinking happens at varied intervals with occasional
 * double blinks.
 */
export interface PortraitConfig {
  /** [min, max] milliseconds between blinks */
  blinkInterval: [number, number];
  /** milliseconds between the two blinks of a double blink */
  doubleBlinkInterval: number;
  /** duration of one blink (half -> closed -> half -> open) */
  blinkDuration: number;
  /** probability that a blink is a double blink */
  doubleBlinkChance: number;
  /** milliseconds per mouth frame while talking */
  mouthFrame: number;
}

export const DEFAULT_PORTRAIT_CONFIG: PortraitConfig = {
  blinkInterval: [1800, 5200],
  doubleBlinkInterval: 220,
  blinkDuration: 150,
  doubleBlinkChance: 0.22,
  mouthFrame: 95,
};

/** Per-portrait overrides. The serpent has no eyelids (it never blinks). */
export const PORTRAIT_CONFIG: Record<string, Partial<PortraitConfig>> = {
  god: { blinkInterval: [2600, 6200], mouthFrame: 120 },
  serpent: { blinkInterval: [1e9, 1e9], mouthFrame: 140 },
};

const images = new Map<string, HTMLImageElement>();

function img(file: string): HTMLImageElement {
  let el = images.get(file);
  if (!el) {
    el = new Image();
    el.src = assetUrl(file);
    images.set(file, el);
  }
  return el;
}

/** Start loading every portrait so the first dialogue shows instantly. */
export function preloadPortraits(): void {
  for (const p of Object.values(MANIFEST.portraits)) {
    img(p.file);
    for (const o of [...p.mouth, ...p.eyes]) img(o.file);
  }
}

export class PortraitAnimator {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private asset: PortraitAsset | null = null;
  private cfg: PortraitConfig = DEFAULT_PORTRAIT_CONFIG;
  private talking = false;
  private mouthStep = 0;
  private mouthTimer = 0;
  private eyeState = 0; // 0 open, 1 half, 2 closed
  private nextBlink = 0;
  private blinkQueue: { at: number; state: number }[] = [];
  private raf = 0;
  private last = 0;
  private time = 0;
  reduceMotion = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
  }

  setPortrait(id: string | null): void {
    this.asset = id ? MANIFEST.portraits[id] ?? null : null;
    this.cfg = { ...DEFAULT_PORTRAIT_CONFIG, ...(id ? PORTRAIT_CONFIG[id] : {}) };
    if (this.asset) {
      this.canvas.width = this.asset.width;
      this.canvas.height = this.asset.height;
    }
    this.eyeState = 0;
    this.blinkQueue = [];
    this.scheduleBlink(true);
    this.draw();
  }

  /** Mouth animates only while text is being revealed. */
  setTalking(on: boolean): void {
    if (on === this.talking) return;
    this.talking = on;
    if (!on) this.mouthStep = 0;
    this.draw();
  }

  start(): void {
    if (this.raf) return;
    this.last = performance.now();
    const tick = (now: number) => {
      this.update(now - this.last);
      this.last = now;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private rand(a: number, b: number): number {
    return a + Math.random() * (b - a);
  }

  private scheduleBlink(initial = false): void {
    const [a, b] = this.cfg.blinkInterval;
    this.nextBlink = this.time + (initial ? this.rand(600, b * 0.6) : this.rand(a, b));
  }

  private queueBlink(at: number): void {
    const d = this.cfg.blinkDuration;
    this.blinkQueue.push({ at, state: 1 }, { at: at + d * 0.25, state: 2 }, { at: at + d * 0.7, state: 1 }, { at: at + d, state: 0 });
  }

  update(dt: number): void {
    this.time += dt;
    let dirty = false;
    if (this.time >= this.nextBlink && this.asset?.eyes.length) {
      this.queueBlink(this.time);
      if (Math.random() < this.cfg.doubleBlinkChance) this.queueBlink(this.time + this.cfg.blinkDuration + this.cfg.doubleBlinkInterval);
      this.scheduleBlink();
    }
    while (this.blinkQueue.length && this.blinkQueue[0].at <= this.time) {
      this.eyeState = this.blinkQueue.shift()!.state;
      dirty = true;
    }
    if (this.talking && this.asset?.mouth.length) {
      this.mouthTimer += dt;
      const frame = this.reduceMotion ? this.cfg.mouthFrame * 1.6 : this.cfg.mouthFrame;
      if (this.mouthTimer >= frame) {
        this.mouthTimer = 0;
        // closed -> half -> open -> half, with small natural variation
        const seq = [0, 1, 2, 1];
        this.mouthStep = (this.mouthStep + 1) % seq.length;
        if (Math.random() < 0.18) this.mouthStep = 0;
        dirty = true;
      }
    }
    if (dirty) this.draw();
  }

  private draw(): void {
    const a = this.asset;
    const c = this.ctx;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!a) return;
    const base = img(a.file);
    if (!base.complete) {
      base.onload = () => this.draw();
      return;
    }
    c.drawImage(base, 0, 0);
    const mouthSeq = [0, 1, 2, 1];
    const m = this.talking ? mouthSeq[this.mouthStep] : 0;
    if (m > 0 && a.mouth[m - 1]) this.patch(a.mouth[m - 1]);
    if (this.eyeState > 0 && a.eyes[this.eyeState - 1]) this.patch(a.eyes[this.eyeState - 1]);
  }

  private patch(p: { file: string; x: number; y: number }): void {
    const im = img(p.file);
    if (im.complete) this.ctx.drawImage(im, p.x, p.y);
    else im.onload = () => this.draw();
  }
}
