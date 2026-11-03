import Phaser from 'phaser';

/**
 * The Cain and Abel chapter's colours (the maintainer: "a very monochrome
 * look, with a palette like #012340 #024059 #027368 #D6F272 #A97D5E").
 * Everything on screen is mapped by its brightness onto one of two ramps:
 * a cool one (navy, petrol, teal, lime) for most things and a warm one
 * (navy, brown, light) for warm colours such as skin, wood and earth, so
 * people and the ground stay apart from the leaves. The same map runs on
 * the camera (a WebGL post effect) and on the dialogue portraits (canvas).
 */

export const PALETTE = {
  navy: '#012340',
  petrol: '#024059',
  teal: '#027368',
  lime: '#D6F272',
  brown: '#A97D5E',
};

type V3 = [number, number, number];
const hex = (h: string): V3 => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as V3;
const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const NAVY = hex(PALETTE.navy);
const PETROL = hex(PALETTE.petrol);
const TEAL = hex(PALETTE.teal);
const LIME = hex(PALETTE.lime);
const BROWN = hex(PALETTE.brown);
const BLACK: V3 = [0, 0, 0];
const WHITE: V3 = [1, 1, 1];

const COOL: V3[] = [mix(NAVY, BLACK, 0.3), NAVY, PETROL, TEAL, mix(TEAL, LIME, 0.5), LIME];
const WARM: V3[] = [mix(NAVY, BLACK, 0.3), NAVY, mix(NAVY, BROWN, 0.5), BROWN, mix(BROWN, LIME, 0.55), mix(LIME, WHITE, 0.3)];

function ramp(stops: V3[], t: number): V3 {
  const n = stops.length - 1;
  const x = Math.max(0, Math.min(1, t)) * n;
  const i = Math.min(n - 1, Math.floor(x));
  return mix(stops[i], stops[i + 1], x - i);
}

/** One colour (0–1 channels) mapped to the palette. */
export function paletteColor(r: number, g: number, b: number): V3 {
  const l = Math.pow(0.299 * r + 0.587 * g + 0.114 * b, 1.15);
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  const warmth = Math.max(0, Math.min(1, (r - g) * 4 - 0.1)) * Math.min(1, sat * 3);
  return mix(ramp(COOL, l), ramp(WARM, l), warmth);
}

/** Map a canvas's pixels to the palette in place. */
export function paletteCanvas(c: HTMLCanvasElement): void {
  const ctx = c.getContext('2d')!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const [r, g, b] = paletteColor(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
    d[i] = r * 255;
    d[i + 1] = g * 255;
    d[i + 2] = b * 255;
  }
  ctx.putImageData(img, 0, 0);
}

const glsl = (v: V3) => `vec3(${v.map((x) => x.toFixed(4)).join(', ')})`;
const rampGlsl = (name: string, s: V3[]) => `
vec3 ${name}(float t) {
  t = clamp(t, 0.0, 1.0) * 5.0;
  if (t < 1.0) return mix(${glsl(s[0])}, ${glsl(s[1])}, t);
  if (t < 2.0) return mix(${glsl(s[1])}, ${glsl(s[2])}, t - 1.0);
  if (t < 3.0) return mix(${glsl(s[2])}, ${glsl(s[3])}, t - 2.0);
  if (t < 4.0) return mix(${glsl(s[3])}, ${glsl(s[4])}, t - 3.0);
  return mix(${glsl(s[4])}, ${glsl(s[5])}, t - 4.0);
}`;

const FRAG = `
#define SHADER_NAME CAIN_PALETTE_FS
precision mediump float;
uniform sampler2D uMainSampler;
varying vec2 outTexCoord;
${rampGlsl('coolRamp', COOL)}
${rampGlsl('warmRamp', WARM)}
void main() {
  vec4 col = texture2D(uMainSampler, outTexCoord);
  vec3 c = col.rgb;
  float l = pow(max(dot(c, vec3(0.299, 0.587, 0.114)), 0.0), 1.15);
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float warmth = clamp((c.r - c.g) * 4.0 - 0.1, 0.0, 1.0) * min(1.0, (mx - mn) * 3.0);
  gl_FragColor = vec4(mix(coolRamp(l), warmRamp(l), warmth), col.a);
}`;

export class PaletteFX extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game: Phaser.Game) {
    super({ game, name: 'CainPalette', fragShader: FRAG });
  }
}

/** Put the palette on a camera (WebGL only; the canvas renderer keeps the colours). */
export function usePalette(scene: Phaser.Scene, cam: Phaser.Cameras.Scene2D.Camera): void {
  const r = scene.renderer;
  if (!(r instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return;
  r.pipelines.addPostPipeline('CainPalette', PaletteFX);
  cam.setPostPipeline(PaletteFX);
}
