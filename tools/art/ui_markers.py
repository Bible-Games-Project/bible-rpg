"""Round story-map markers in the palette of the story map painting
(art/reference/v2/story-map.webp): a dark brown outline, a sand rim like the
path and a bevelled centre. One small pixel-art disc per state, drawn here
and scaled up by the menu with pixelated rendering.

    python3 tools/art/ui_markers.py     # writes public/assets/ui/map-node-*.png
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


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for state in STATES:
        Image.fromarray(disc(state)).save(os.path.join(OUT, f'map-node-{state}.png'), optimize=True)
        print('wrote', f'map-node-{state}.png')


if __name__ == '__main__':
    main()
