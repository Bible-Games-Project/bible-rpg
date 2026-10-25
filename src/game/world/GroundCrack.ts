import Phaser from 'phaser';

const KEY = 'fx-ground-crack';

/**
 * A crack in the ground where a cherub landed: jagged fissures running out
 * from the point of impact, flattened like the ground seen from above, dark
 * inside with a light lip on the side facing the sun (upper left). Drawn
 * once at runtime; returns the texture key.
 */
export function crackTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(KEY)) return KEY;
  const w = 240;
  const h = 96;
  const canvas = scene.textures.createCanvas(KEY, w, h)!;
  const ctx = canvas.getContext();
  const rnd = new Phaser.Math.RandomDataGenerator(['crack']);
  const cx = w / 2;
  const cy = h / 2;
  // the dent of the impact
  const dent = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
  dent.addColorStop(0, 'rgba(58, 38, 20, 0.45)');
  dent.addColorStop(1, 'rgba(40, 26, 14, 0)');
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, 0.45);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = dent;
  ctx.fillRect(0, 0, w, h * 2);
  ctx.restore();
  const lines: { pts: [number, number][]; width: number }[] = [];
  const branch = (x: number, y: number, ang: number, len: number, width: number, depth: number) => {
    const pts: [number, number][] = [[x, y]];
    let a = ang;
    // short zigzag steps: a crack breaks, it does not curve like a twig
    for (let d = 0; d < len; d += 4) {
      a += rnd.realInRange(-0.75, 0.75) * (d % 8 ? 1 : -1);
      x += Math.cos(a) * 4;
      y += Math.sin(a) * 4 * 0.42;
      pts.push([x, y]);
      if (depth < 2 && rnd.frac() < 0.1) branch(x, y, a + rnd.pick([-0.8, 0.8]), (len - d) * 0.5, width * 0.6, depth + 1);
    }
    lines.push({ pts, width });
  };
  const arms = 7;
  for (let i = 0; i < arms; i++) {
    const ang = (i / arms) * Math.PI * 2 + rnd.realInRange(-0.3, 0.3);
    branch(cx, cy, ang, rnd.realInRange(36, 70), rnd.realInRange(1.6, 2.4), 0);
  }
  const stroke = (dx: number, dy: number, colour: string, extra: number) => {
    for (const l of lines) {
      ctx.beginPath();
      l.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy)));
      ctx.lineWidth = l.width + extra;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = colour;
      ctx.stroke();
    }
  };
  stroke(-1, -1, 'rgba(236, 214, 160, 0.5)', 0.4);
  stroke(0, 0, 'rgba(58, 38, 20, 0.85)', 0);
  canvas.refresh();
  return KEY;
}
