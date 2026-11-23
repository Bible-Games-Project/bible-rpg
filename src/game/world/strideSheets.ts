import Phaser from 'phaser';
import { MANIFEST, charKey, shadowKey, type Direction, type SheetAsset } from '../manifest';
import { castShadows } from './castShadow';
import { frameOf, frontRaise, frontRun, frontThrust, handsOf, padded, sidePoses, sideStoop, stoopFrame, sideRun, sideStride, type FrontArms, type Px, type SidePose, type XY, type ArmBand } from './stride';

/**
 * Everyone walks, runs and bends down as Cain does (the maintainer,
 * 2026-11-11; Cain's were a test on him first): the sheets of Adam and Eve,
 * in every outfit, are rebuilt at boot from their standing frames (see
 * stride.ts): a side walk with more arm swing, a trot with bent knees and
 * elbows, a run from the front and back, two bending frames to pick things
 * up (Actor.stoop) and the poses of a blow. Cain and Abel are Adam's tunic
 * sheets recoloured (cain/art.ts), so they get it from here too.
 */
export function strideCharacters(scene: Phaser.Scene): void {
  for (const id of ['adam', 'eve']) {
    const outfits = MANIFEST.characters[id];
    if (!outfits) continue;
    for (const [outfit, dirs] of Object.entries(outfits)) {
      for (const dir of Object.keys(dirs) as Direction[]) {
        const a = dirs[dir];
        const key = charKey(id, outfit, dir);
        if (!a || !scene.textures.exists(key)) continue;
        const img = scene.textures.get(key).getSourceImage() as HTMLImageElement;
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        c.getContext('2d')!.drawImage(img, 0, 0);
        const made = strideSheet(c, a, dir, SIDE_ARMS[`${id}-${outfit}`]);
        if (!made) continue;
        const [canvas, asset, all] = made;
        scene.textures.remove(key);
        scene.textures.addSpriteSheet(key, canvas as unknown as HTMLImageElement, { frameWidth: asset.frameWidth, frameHeight: asset.frameHeight });
        // every frame casts its own shadow (the maintainer: the run's shadow
        // stood still under a running Adam)
        const [strip, shadow] = castShadows(all, asset.anchorX, asset.anchorY);
        if (scene.textures.exists(shadowKey(key))) scene.textures.remove(shadowKey(key));
        scene.textures.addSpriteSheet(shadowKey(key), strip as unknown as HTMLImageElement, { frameWidth: shadow.frameWidth, frameHeight: shadow.frameHeight });
        asset.shadow = shadow;
        dirs[dir] = asset;
      }
    }
  }
}

/**
 * The near arm in each side sheet (sheet pixels: x0, x1, y0, y1, from the
 * shoulder to the bottom of the fist), as from_generated.py's SIDE_ARMS
 * (the fig ones it finds by the hand): with Adam's arm swing these give the
 * sheets' own walks (pixel for pixel for the tunic, a few pixels off for
 * the others). Measure again if a sheet is redrawn. `true` last: a bare arm
 * over a leaf skirt, whose green stays with the body.
 */
const SIDE_ARMS: Record<string, ArmBand> = {
  'adam-tunic': [22, 32, 41, 92],
  'adam-leaves': [25, 33, 41, 92, true],
  'adam-fig': [19, 28, 40, 92],
  'eve-tunic': [26, 33, 45, 94],
  'eve-leaves': [30, 38, 42, 91, true],
  'eve-fig': [26, 34, 39, 90],
};
const WALK_CYCLE = [18, 9, 0, -9, -18, -9, 0, 9];
/** the sheets' own walks swing the arms 0.45 of the legs' angle; Cain's walk, now everyone's, more */
const ARM_SWING = 0.85;
/** the run (the maintainer, on Cain: bent knees and elbows, upright, a real trot) */
const RUN = {
  frames: 8,
  thigh: 30,
  knee: [12, 88] as [number, number],
  armSwing: 0.85,
  elbow: 78,
  // off the ground with the legs apart, lowest as they pass
  lift: [3, 1, 0, 1, 3, 1, 0, 1],
};
/** from the front and back: the leg off the ground comes up this much more */
const FRONT_KNEE_LIFT = 7;
/** from the front and back the body bobs less than from the side (the maintainer: running up and down it staggered) */
const FRONT_LIFT = [2, 1, 0, 1, 2, 1, 0, 1];
/** from the front and back the body leans over the foot on the ground, a shoulder comes up with the pumped arm and the head bobs (the maintainer: the torso was too still) */
// only a pixel each (the maintainer on Cain running up and down: it staggered; 3 px of lean swayed the head side to side)
const FRONT_BODY = { neck: 0.25, waist: 0.6, lean: 1, shoulder: 1 };
/** from the front and back the forearms pump (the maintainer: the arms did not bend running up or down) */
const FRONT_ARMS: Record<'down' | 'up', FrontArms> = {
  down: { elbow: 0.42, hand: 0.64, inner: 14, pump: 0.5, back: 0.85, inward: 3, body: FRONT_BODY },
  up: { elbow: 0.42, hand: 0.64, inner: 14, pump: 0.4, back: 0.9, inward: 1, body: FRONT_BODY },
};
/** bending down (stoopFrame): the hip (share of the frame height), the lean from the side (degrees), how far the hips go back (px) and how far the knees give */
const STOOP = { hip: 0.5, frontSquash: 0.7 };
/** from the side (sideStoop): the lean from the hips, the knees, the hips going back, the waist (share of the frame height), how far ahead the arm reaches down (degrees from straight down) and the elbow */
const SIDE_STOOP = { lean: 40, squash: 0.78, back: 6, reach: 22, elbow: 6, waist: 0.45 };
/** from the front, nothing nearer the middle than this is a hand (px): the tunic is about this wide */
const HAND_INNER = 8;
/** room on each side of the side frames for the run's longer strides */
const STRIDE_PAD = 24;
/** the poses of a blow, in the order the sheet keeps them */
const ATTACK_POSES = ['raise', 'strike', 'draw', 'thrust'] as const;
/** from the side: the near arm (degrees from hanging, forward positive), the elbow, the lean and the step of each pose; from the front: how long the raised forearm looks, how far out it leans (px), and how short the forearm coming at us is */
const ATTACK = {
  side: {
    raise: { arm: -135, elbow: 20, lean: -4 },
    strike: { arm: 55, elbow: 10, lean: 7, step: 14 },
    draw: { arm: -35, elbow: 75, lean: -3 },
    // the thrust goes forward and down, at a lamb (the maintainer: level it stabbed the sky)
    thrust: { arm: 42, elbow: 4, lean: 11, step: 14 },
  } satisfies Record<(typeof ATTACK_POSES)[number], SidePose>,
  front: { raise: 0.9, out: 5, strike: 0.6, thrust: 0.35 },
};

const WORK_POSES = ['pour', 'lift', 'dig'] as const;
/**
 * Garden work (Actor.work; the maintainer: watering, working the garden):
 * from the side, the arm held out to tip the gourd (pour), the digging stick
 * lifted before the chest (lift) and driven down ahead of the feet (dig);
 * from the front and back the forearm coming toward us (shorter) or down.
 */
const WORK = {
  side: {
    pour: { arm: 62, elbow: 28, lean: 3 },
    lift: { arm: 18, elbow: 85, lean: -2 },
    dig: { arm: 34, elbow: 6, lean: 12, step: 10 },
  } satisfies Record<(typeof WORK_POSES)[number], SidePose>,
  front: { pour: 0.55, lift: 0.4 },
};

/** One direction of a sheet: from the side the walk with more arm swing and
 * a run with bent knees and elbows; from the front and back a run with the
 * knees coming higher, bobbing; bending down; the poses of a blow. */
function strideSheet(src: HTMLCanvasElement, a: SheetAsset, dir: Direction, arm: ArmBand | undefined): [HTMLCanvasElement, SheetAsset, Px[]] | null {
  const walk = a.walk ?? [];
  if (walk.length !== 8 || (dir === 'right' && !arm)) return null;
  const fw = a.frameWidth;
  const fh = a.frameHeight;
  const sheet = src.getContext('2d')!.getImageData(0, 0, src.width, src.height);
  const side = dir === 'right';
  const pad = side ? STRIDE_PAD : 0;
  const frames: Px[] = [];
  for (let i = 0; i < a.frames; i++) frames.push(padded(frameOf(sheet, i, fw), pad));
  let hands = a.hands ? a.hands.map(([x, y]) => [x + pad, y] as [number, number]) : undefined;
  let run: Px[];
  if (side) {
    const band: ArmBand = [arm![0] + pad, arm![1] + pad, arm![2], arm![3], arm![4]];
    const stand = frames[0];
    const w = sideStride(stand, band, { cycle: WALK_CYCLE, armSwing: ARM_SWING });
    const r = sideRun(stand, band, RUN);
    walk.forEach((f, i) => (frames[f] = w.frames[i]));
    run = r.frames;
    if (hands) {
      const hs = hands;
      walk.forEach((f, i) => (hs[f] = w.hands[i]));
      hands = [...hs, ...r.hands];
    }
  } else {
    // the knees: a little under the hem
    run = walk.map((f, i) => frontRun(frames[f], a.anchorX, Math.round(fh * 0.79), FRONT_KNEE_LIFT, FRONT_LIFT[i], FRONT_ARMS[dir === 'up' ? 'up' : 'down']));
  }
  // bending down to pick something up: halfway, then lowest (from the side leaning forward)
  const hip: XY = [a.anchorX + pad, Math.round(fh * STOOP.hip)];
  let stoop: Px[];
  let stoopHands: XY[] = [];
  if (side) {
    const band: ArmBand = [arm![0] + pad, arm![1] + pad, arm![2], arm![3], arm![4]];
    const bent = [0.5, 1].map((k) => sideStoop(frames[0], band, SIDE_STOOP, k));
    stoop = bent.map((b) => b.frame);
    stoopHands = bent.map((b) => b.hand);
  } else stoop = [0.5, 1].map((k) => stoopFrame(frames[0], hip, 0, 1 - (1 - STOOP.frontSquash) * k, 0));
  // a blow (Actor.attack; the maintainer: the arm must come up): raised and brought down, drawn back and thrust
  const poses = ATTACK_POSES.map(() => [] as Px[]);
  let poseHands: XY[] = [];
  const raisedHands: XY[] = [];
  if (side) {
    const band: ArmBand = [arm![0] + pad, arm![1] + pad, arm![2], arm![3], arm![4]];
    const r = sidePoses(frames[0], band, ATTACK_POSES.map((k) => ATTACK.side[k]));
    r.frames.forEach((f, i) => poses[i].push(f));
    poseHands = r.hands;
  } else {
    const arms = FRONT_ARMS[dir === 'up' ? 'up' : 'down'];
    for (const k of [-1, 1]) {
      const up = frontRaise(frames[0], a.anchorX, k, arms, ATTACK.front.raise, ATTACK.front.out);
      raisedHands.push(up.hand);
      poses[0].push(up.frame);
      poses[1].push(frontThrust(frames[0], a.anchorX, k, arms, ATTACK.front.strike, 2));
      poses[2].push(frames[0]);
      poses[3].push(frontThrust(frames[0], a.anchorX, k, arms, ATTACK.front.thrust, 3));
    }
  }
  const work = WORK_POSES.map(() => [] as Px[]);
  let workHands: XY[] = [];
  if (side) {
    const band: ArmBand = [arm![0] + pad, arm![1] + pad, arm![2], arm![3], arm![4]];
    const r = sidePoses(frames[0], band, WORK_POSES.map((k) => WORK.side[k]));
    r.frames.forEach((f, i) => work[i].push(f));
    workHands = r.hands;
  } else {
    const arms = FRONT_ARMS[dir === 'up' ? 'up' : 'down'];
    for (const k of [-1, 1]) {
      work[0].push(frontThrust(frames[0], a.anchorX, k, arms, WORK.front.pour, 2));
      work[1].push(frontThrust(frames[0], a.anchorX, k, arms, WORK.front.lift, 3));
      work[2].push(frames[0]);
    }
  }
  const all = [...frames, ...run, ...stoop, ...poses.flat(), ...work.flat()];
  // from the front and back, where each hand is in each frame (the maintainer: the fat
  // carried up or down did not move with the hand)
  let sideHands: [XY, XY][] | undefined;
  if (!side) {
    const mid = a.anchorX;
    const still = handsOf(frames[0], mid, HAND_INNER, fh * 0.4, fh * 0.6, [[mid - 12, fh * 0.6], [mid + 12, fh * 0.6]]);
    sideHands = all.map((f) => handsOf(f, mid, HAND_INNER, fh * 0.4, fh * 0.6, still));
    // the raised fists, which handsOf does not look for
    const at = frames.length + run.length + stoop.length;
    raisedHands.forEach((h, k) => (sideHands![at + k][k] = h));
  }
  // the fists bending down and in the poses of a blow (the maintainer: what is picked up must stay in the hand)
  if (hands && side) {
    const at = frames.length + run.length;
    stoopHands.forEach((h, i) => (hands![at + i] = h));
    poseHands.forEach((h, i) => (hands![at + stoop.length + i] = h));
    workHands.forEach((h, i) => (hands![at + stoop.length + poseHands.length + i] = h));
  }
  const W = fw + pad * 2;
  const c = document.createElement('canvas');
  c.width = W * all.length;
  c.height = fh;
  const ctx = c.getContext('2d')!;
  all.forEach((f, i) => ctx.putImageData(new ImageData(new Uint8ClampedArray(f.d), f.w, f.h), i * W, 0));
  const first = frames.length;
  const firstPose = first + run.length + stoop.length;
  let n = firstPose;
  const [raise, strike, draw, thrust] = poses.map((list) => list.map(() => n++));
  const [pour, lift, dig] = work.map((list) => list.map(() => n++));
  return [c, { ...a, frameWidth: W, anchorX: a.anchorX + pad, frames: all.length, hands, sideHands, run: run.map((_, i) => first + i), runFps: 16, stoop: stoop.map((_, i) => first + run.length + i), attack: { raise, strike, draw, thrust }, work: { pour, lift, dig } }, all];
}

