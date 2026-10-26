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

SIZE = 20
OUTLINE = (58, 34, 20)
# (rim light, rim shade, centre light, centre, centre shade)
STATES = {
    'open': ((255, 222, 150), (214, 160, 88), (255, 198, 112), (226, 140, 58), (166, 86, 38)),
    'done': ((255, 222, 150), (214, 160, 88), (128, 222, 228), (36, 158, 190), (20, 96, 132)),
    'locked': ((206, 190, 160), (150, 134, 110), (168, 150, 126), (128, 110, 90), (90, 76, 62)),
}
GLYPH_LIGHT = (255, 244, 214)
# glyphs on a 7x7 grid, centred on the disc ('#' light, '.' empty)
GLYPHS = {
    'done': ['.......', '......#', '.....##', '#...##.', '##.##..', '.###...', '..#....'],
    'locked': ['..###..', '.#...#.', '.#...#.', '#######', '###.###', '###.###', '#######'],
    'open': ['...#...', '...#...', '..###..', '#######', '..###..', '...#...', '...#...'],
}


def disc(state: str) -> np.ndarray:
    rim_l, rim_d, c_l, c, c_d = STATES[state]
    img = np.zeros((SIZE + 2, SIZE, 4), np.uint8)
    yy, xx = np.mgrid[0:SIZE, 0:SIZE] + 0.5
    cx = cy = SIZE / 2
    r = np.hypot(xx - cx, yy - cy)
    # light from the upper left: +1 lit, -1 shaded
    side = ((cx - xx) + (cy - yy)) / (r + 1e-6)
    body = img[:SIZE]
    inside = r <= SIZE / 2
    body[inside] = (*OUTLINE, 255)
    rim = r <= SIZE / 2 - 1
    body[rim] = (*rim_l, 255)
    body[rim & (side < -0.2)] = (*rim_d, 255)
    centre = r <= SIZE / 2 - 3.2
    body[centre & ~(r <= SIZE / 2 - 4.2)] = (*OUTLINE, 255)
    inner = r <= SIZE / 2 - 4.2
    body[inner] = (*c, 255)
    body[inner & (side > 0.45) & (r > 2.2)] = (*c_l, 255)
    body[inner & (side < -0.45) & (r > 2.2)] = (*c_d, 255)
    # a speck of shine on the rim
    body[3, 6] = body[4, 5] = (255, 248, 222, 255)
    # a soft drop shadow under the disc
    below = np.zeros((SIZE + 2, SIZE), bool)
    below[2:, :] = inside
    shadow = below & (img[..., 3] == 0)
    img[shadow] = (30, 18, 10, 110)
    g = GLYPHS[state]
    gy, gx = SIZE // 2 - 3, SIZE // 2 - 3
    for y, row in enumerate(g):
        for x, ch in enumerate(row):
            if ch == '#':
                img[gy + y, gx + x] = (*GLYPH_LIGHT, 255) if state != 'locked' else (232, 220, 196, 255)
    if state == 'locked':
        # the keyhole and shackle shading
        img[gy + 4:gy + 6, gx + 3] = (*OUTLINE, 255)
    return img


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
