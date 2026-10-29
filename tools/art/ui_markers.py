"""Painted markers for the menus and the world, drawn here at 4x and
reduced (the maintainer found pixel-art markers too "pixelart" next to the
paintings):

- round story-map medallions in the palette of the story map painting
  (art/reference/v2/story-map.webp): a dark brown outline, a gold rim and a
  glossy centre with a symbol, one per state;
- the objective arrow in the same gold, at 24 headings (one strip) so its
  light and shadow stay put whichever way it points. The world marker uses
  the one pointing down, the HUD's edge arrow the others.

    python3 tools/art/ui_markers.py     # writes public/assets/ui/map-node-*.png, objective-arrows.png
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


# The objective arrow, painted like the medallions (the maintainer disliked
# both the smooth violet arrow and the pixel-art one): gold, bevelled, a dark
# brown outline and a soft shadow, drawn at 24 headings so the light and the
# shadow stay on the upper left and lower right whichever way it points.
ARROW_CELL = 80
ARROW_HEADINGS = 24
ARROW_SS = 4
# from lit to shaded
ARROW_RAMP = [(255, 244, 200), (255, 214, 112), (232, 158, 56), (168, 98, 34)]
# the shape pointing right, in half-cells around the centre
ARROW_SHAPE = [(0.86, 0.0), (0.1, -0.7), (0.1, -0.27), (-0.8, -0.27), (-0.8, 0.27), (0.1, 0.27), (0.1, 0.7)]


def _blur(a: np.ndarray, radius: float) -> np.ndarray:
    from PIL import ImageFilter
    img = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    return np.asarray(img.filter(ImageFilter.GaussianBlur(radius))).astype(float) / 255


def arrow(heading: float) -> np.ndarray:
    """The arrow pointing along `heading` (radians, 0 = right, clockwise on
    screen), lit from the upper left, in a cell of ARROW_CELL px."""
    from PIL import ImageDraw
    k = ARROW_SS
    N = ARROW_CELL * k
    half = N / 2 * 0.86
    cos, sin = np.cos(heading), np.sin(heading)
    pts = [(N / 2 + (x * cos - y * sin) * half, N / 2 + (x * sin + y * cos) * half) for x, y in ARROW_SHAPE]
    shape = Image.new('L', (N, N))
    ImageDraw.Draw(shape).polygon(pts, fill=255)
    # rounded corners
    body = (_blur(np.asarray(shape).astype(float) / 255, 2.2 * k) > 0.5).astype(float)
    outline = (_blur(body, 1.6 * k) > 0.08).astype(float)
    # a bevel: the height rises over ~3 px from the edge; lit where it faces
    # the upper left
    height = np.clip((_blur(body, 3.0 * k) - 0.5) * 2, 0, 1) * body
    gy, gx = np.gradient(height)
    lit = np.clip((gx + gy) / np.sqrt(2) / max(1e-6, np.abs(np.hypot(gx, gy)).max()) * 1.6, -1, 1)
    yy, xx = np.mgrid[0:N, 0:N] + 0.5
    # the flat top: lighter toward the upper left of the arrow
    ys, xs = np.nonzero(body)
    proj = ((xs.mean() - xx) + (ys.mean() - yy)) / np.sqrt(2)
    proj = proj / max(1.0, np.abs(proj[body > 0]).max())
    t = np.clip(0.55 - 0.45 * proj - 0.6 * lit, 0, 1) * (len(ARROW_RAMP) - 1)
    i0 = np.floor(t).astype(int).clip(0, len(ARROW_RAMP) - 2)
    f = (t - i0)[..., None]
    ramp = np.array(ARROW_RAMP, float)
    gold = ramp[i0] * (1 - f) + ramp[i0 + 1] * f
    # a soft gloss along the upper left of the flat top
    gloss = np.clip(proj - 0.25, 0, 1) * (height > 0.95)
    gold = gold * (1 - gloss[..., None] * 0.45) + 255 * gloss[..., None] * 0.45
    out = np.zeros((N, N, 4), float)
    shadow = _blur(np.roll(np.roll(outline, int(2.5 * k), 0), int(1.5 * k), 1), 1.8 * k) * 0.5
    out[..., :3] = OUTLINE
    out[..., 3] = shadow
    out[outline > 0, 3] = 1
    out[body > 0, :3] = gold[body > 0]
    img = Image.fromarray(np.clip(out * [1, 1, 1, 255], 0, 255).astype(np.uint8), 'RGBA')
    return np.asarray(img.resize((ARROW_CELL, ARROW_CELL), Image.LANCZOS))


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for state in STATES:
        Image.fromarray(disc(state)).save(os.path.join(OUT, f'map-node-{state}.png'), optimize=True)
        print('wrote', f'map-node-{state}.png')
    frames = [arrow(2 * np.pi * i / ARROW_HEADINGS) for i in range(ARROW_HEADINGS)]
    Image.fromarray(np.concatenate(frames, axis=1)).save(os.path.join(OUT, 'objective-arrows.png'), optimize=True)
    print('wrote objective-arrows.png', ARROW_CELL, 'px cells x', len(frames))


if __name__ == '__main__':
    main()
