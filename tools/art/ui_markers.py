"""Small pixel-art markers for the menus and the world, drawn here and
scaled up with pixelated rendering:

- round story-map nodes in the palette of the story map painting
  (art/reference/v2/story-map.webp): a dark brown outline, a sand rim like
  the path and a bevelled centre, one disc per state;
- the objective arrow, in the warm gold of the game's frames with a dark
  brown outline and lit from the upper left like the art, drawn pixel by
  pixel at 16 headings (a rotated pixel image looks ragged). The world
  marker uses the one pointing down, the HUD's edge arrow the others. The
  maintainer found the smooth violet arrows foreign to the game.

    python3 tools/art/ui_markers.py     # writes public/assets/ui/map-node-*.png, arrows.png
"""

from __future__ import annotations

import os

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'ui')

# Story-map medallions: painted, not pixel art (the maintainer found the
# pixel discs too "pixelart" for the painting). Drawn at 4x and reduced.
MEDAL = 112
MEDAL_SS = 4
OUTLINE = (40, 24, 14)
# (rim light, rim dark, centre light, centre dark)
STATES = {
    'open': ((255, 232, 160), (150, 92, 36), (255, 196, 96), (196, 96, 30)),
    'done': ((255, 232, 160), (150, 92, 36), (120, 220, 226), (18, 104, 136)),
    'locked': ((214, 204, 184), (110, 100, 88), (176, 166, 150), (88, 80, 70)),
}


def _star(cx: float, cy: float, r: float) -> list[tuple[float, float]]:
    pts = []
    for i in range(10):
        a = -np.pi / 2 + i * np.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((cx + np.cos(a) * rr, cy + np.sin(a) * rr))
    return pts


def disc(state: str) -> np.ndarray:
    from PIL import ImageDraw, ImageFilter
    k = MEDAL_SS
    n = MEDAL * k
    pad = 8 * k
    size = n + pad
    rim_l, rim_d, c_l, c_d = STATES[state]
    yy, xx = np.mgrid[0:size, 0:size] + 0.5
    cx = cy = n / 2
    r = np.hypot(xx - cx, yy - cy)
    # light from the upper left: +1 facing it, -1 away
    side = ((cx - xx) + (cy - yy)) / (np.sqrt(2) * np.maximum(r, 1))
    R = n / 2 - 3 * k
    out = np.zeros((size, size, 4), float)
    # soft shadow under the medallion
    shadow = Image.fromarray(((np.hypot(xx - cx, (yy - cy - 5 * k) * 1.04) <= R) * 255).astype(np.uint8))
    shadow = np.asarray(shadow.filter(ImageFilter.GaussianBlur(5 * k))).astype(float) / 255
    out[..., :3] = OUTLINE
    out[..., 3] = shadow * 0.55
    lerp = lambda a, b, t: np.array(a, float) * (1 - t[..., None]) + np.array(b, float) * t[..., None]
    t_rim = np.clip(0.5 - side * 0.5, 0, 1)
    rim = lerp(rim_l, rim_d, t_rim)
    inner = R * 0.76
    t_c = np.clip((r / inner) * 0.6 + (0.5 - side * 0.5) * 0.6, 0, 1)
    centre = lerp(c_l, c_d, t_c)
    layers = [
        (r <= R + 1.5 * k, np.broadcast_to(np.array(OUTLINE, float), rim.shape)),
        (r <= R - 0.5 * k, rim),
        (r <= inner + 1.2 * k, np.broadcast_to(np.array(OUTLINE, float) * 0.9 + 20, rim.shape)),
        (r <= inner, centre),
    ]
    for mask, col in layers:
        out[mask, :3] = col[mask]
        out[mask, 3] = 1
    # the rim's inner edge catches light on the lower right (a bevel)
    bevel = (r > inner + 1.2 * k) & (r < inner + 3 * k) & (side < 0)
    out[bevel, :3] = out[bevel, :3] * 0.6 + np.array(rim_l) * 0.4
    # gloss on the upper left of the centre
    gloss = np.clip(1 - np.hypot((xx - cx + inner * 0.32) / (inner * 0.55), (yy - cy + inner * 0.42) / (inner * 0.32)), 0, 1)
    out[..., :3] = out[..., :3] * (1 - gloss[..., None] * 0.35) + 255 * gloss[..., None] * 0.35
    img = Image.fromarray(np.clip(out * [1, 1, 1, 255], 0, 255).astype(np.uint8), 'RGBA')
    # the symbol, cream with a soft dark shadow
    icon = Image.new('RGBA', (size, size))
    d = ImageDraw.Draw(icon)
    ink = (255, 247, 222, 255)
    s = inner
    if state == 'open':
        d.polygon(_star(cx, cy, s * 0.62), fill=ink)
    elif state == 'done':
        d.line([(cx - s * 0.42, cy + s * 0.02), (cx - s * 0.1, cy + s * 0.34), (cx + s * 0.46, cy - s * 0.36)], fill=ink, width=int(s * 0.2), joint='curve')
    else:
        w, h = s * 0.78, s * 0.56
        d.rounded_rectangle((cx - w / 2, cy - h * 0.05, cx + w / 2, cy + h * 0.95), radius=s * 0.1, fill=ink)
        # a closed shackle: an arch whose legs reach down into the body
        sw = int(s * 0.13)
        d.arc((cx - w * 0.33, cy - h * 0.8, cx + w * 0.33, cy + h * 0.1), 180, 360, fill=ink, width=sw)
        for x in (cx - w * 0.33 + sw / 2, cx + w * 0.33 - sw / 2):
            d.line((x, cy - h * 0.35, x, cy + h * 0.1), fill=ink, width=sw)
        d.ellipse((cx - s * 0.07, cy + h * 0.28, cx + s * 0.07, cy + h * 0.42), fill=(88, 80, 70, 255))
    icon_shadow = Image.new('RGBA', (size, size), (*OUTLINE, 0))
    icon_shadow.putalpha(icon.getchannel('A').filter(ImageFilter.GaussianBlur(2 * k)).point(lambda v: int(v * 0.6)))
    img.alpha_composite(icon_shadow, (k, 2 * k))
    img.alpha_composite(icon)
    return np.asarray(img.resize((size // k, size // k), Image.LANCZOS))


ARROW_SIZE = 19
ARROW_HEADINGS = 16
# outline, then the gold from light to dark
ARROW_OUTLINE = (62, 36, 18)
ARROW_RAMP = [(255, 246, 204), (255, 220, 128), (240, 176, 66), (196, 122, 38), (150, 86, 30)]


def arrow(heading: float) -> np.ndarray:
    """An arrow (head and shaft), pointing along `heading` (radians,
    0 = right, clockwise on screen)."""
    n = ARROW_SIZE
    c = (n - 1) / 2
    # the shape pointing right, around the centre
    poly = np.array([(8.6, 0.0), (1.2, -6.6), (1.2, -2.5), (-7.8, -2.5), (-7.8, 2.5), (1.2, 2.5), (1.2, 6.6)])
    rot = np.array([[np.cos(heading), -np.sin(heading)], [np.sin(heading), np.cos(heading)]])
    pts = poly @ rot.T + c

    def inside(x: float, y: float) -> bool:
        hit = False
        for i in range(len(pts)):
            (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % len(pts)]
            if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
                hit = not hit
        return hit

    k = 6
    cover = np.zeros((n, n))
    for y in range(n):
        for x in range(n):
            cover[y, x] = np.mean([inside(x + (i + 0.5) / k, y + (j + 0.5) / k) for i in range(k) for j in range(k)])
    body = cover >= 0.45
    img = np.zeros((n + 2, n + 2, 4), np.uint8)
    pad = np.pad(body, 1)
    # light from the upper left: lighter toward it across the shape
    ys, xs = np.nonzero(pad)
    cy, cx = ys.mean(), xs.mean()
    proj = ((cx - xs) + (cy - ys)) / np.sqrt(2)
    lo, hi = proj.min(), proj.max()
    for y, x, v in zip(ys, xs, proj):
        t = (v - lo) / max(1e-6, hi - lo)
        img[y, x] = (*ARROW_RAMP[1 + min(3, int((1 - t) * 4))], 255)
    # a bright rim on the edges facing the light, the outline all around
    for y, x in zip(ys, xs):
        if not pad[y - 1, x] or not pad[y, x - 1]:
            img[y, x] = (*ARROW_RAMP[0], 255)
    ring = np.zeros_like(pad)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            ring |= np.roll(np.roll(pad, dy, 0), dx, 1)
    img[ring & ~pad] = (*ARROW_OUTLINE, 255)
    return img


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for state in STATES:
        Image.fromarray(disc(state)).save(os.path.join(OUT, f'map-node-{state}.png'), optimize=True)
        print('wrote', f'map-node-{state}.png')
    frames = [arrow(2 * np.pi * i / ARROW_HEADINGS) for i in range(ARROW_HEADINGS)]
    Image.fromarray(np.concatenate(frames, axis=1)).save(os.path.join(OUT, 'arrows.png'), optimize=True)
    print('wrote arrows.png', frames[0].shape[1], 'px cells x', len(frames))


if __name__ == '__main__':
    main()
