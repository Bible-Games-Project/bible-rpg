"""Markers for the menus and the world:

- the story-map pins: the maintainer's padlock pins
  (art/reference/v2/story-pin-locked.webp, story-pin-open.webp), trimmed and
  reduced. A story still to unlock shows the closed padlock, one that can be
  played or is done the open one;
- the objective arrow in pixel art, without an outline, in a blue violet
  opposite the meadow's yellow green on the colour wheel (the maintainer
  asked for the grass's complementary colour), lit from the upper left like
  the art and drawn pixel by pixel at 16 headings (a rotated pixel image
  looks ragged). The world marker uses the one pointing down, the HUD's
  edge arrow the others. Rejected before: a bevelled marker, smooth violet
  arrows, gold pixel arrows with a dark outline and a painted gold arrow.

    python3 tools/art/ui_markers.py     # writes public/assets/ui/map-node-*.png, arrows.png
"""

from __future__ import annotations

import os

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REF = os.path.join(ROOT, 'art', 'reference', 'v2')
OUT = os.path.join(ROOT, 'public', 'assets', 'ui')

# pin height in the game files (shown at about half that on a 2x screen)
PIN_HEIGHT = 132
# state -> the maintainer's pin
PINS = {'locked': 'story-pin-locked.webp', 'open': 'story-pin-open.webp', 'done': 'story-pin-open.webp'}


def pin(name: str) -> Image.Image:
    img = Image.open(os.path.join(REF, name)).convert('RGBA')
    img = img.crop(img.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
    w = round(img.width * PIN_HEIGHT / img.height)
    return img.resize((w, PIN_HEIGHT), Image.LANCZOS)


ARROW_SIZE = 15
ARROW_HEADINGS = 16
# blue violet from lit to shaded (the meadow is a yellow green of hue ~66°)
ARROW_RAMP = [(214, 204, 255), (168, 150, 255), (128, 104, 236), (98, 74, 204), (72, 52, 164)]


def arrow(heading: float) -> np.ndarray:
    """An arrow (head and shaft), pointing along `heading` (radians,
    0 = right, clockwise on screen)."""
    n = ARROW_SIZE
    c = (n - 1) / 2
    # the shape pointing right, around the centre
    poly = np.array([(8.6, 0.0), (1.2, -6.6), (1.2, -2.5), (-7.8, -2.5), (-7.8, 2.5), (1.2, 2.5), (1.2, 6.6)]) * (n / 19)
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
    body = np.pad(cover >= 0.45, 1)
    img = np.zeros(body.shape + (4,), np.uint8)
    # light from the upper left: lighter toward it across the shape
    ys, xs = np.nonzero(body)
    cy, cx = ys.mean(), xs.mean()
    proj = ((cx - xs) + (cy - ys)) / np.sqrt(2)
    lo, hi = proj.min(), proj.max()
    for y, x, v in zip(ys, xs, proj):
        t = (v - lo) / max(1e-6, hi - lo)
        img[y, x] = (*ARROW_RAMP[1 + min(2, int((1 - t) * 3))], 255)
    # no outline: the edges facing the light catch it, the others are the
    # darkest shade of the arrow itself
    for y, x in zip(ys, xs):
        if not body[y - 1, x] or not body[y, x - 1]:
            img[y, x] = (*ARROW_RAMP[0], 255)
        elif not body[y + 1, x] or not body[y, x + 1]:
            img[y, x] = (*ARROW_RAMP[4], 255)
    return img


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for state, name in PINS.items():
        pin(name).save(os.path.join(OUT, f'map-node-{state}.png'), optimize=True)
        print('wrote', f'map-node-{state}.png')
    frames = [arrow(2 * np.pi * i / ARROW_HEADINGS) for i in range(ARROW_HEADINGS)]
    Image.fromarray(np.concatenate(frames, axis=1)).save(os.path.join(OUT, 'arrows.png'), optimize=True)
    print('wrote arrows.png', frames[0].shape[1], 'px cells x', len(frames))


if __name__ == '__main__':
    main()
