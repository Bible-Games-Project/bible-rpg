"""The light of God's coming and going: a semi-transparent burst drawn here
(soft white-gold core, thin tapered rays of uneven length, a few sparkles)
instead of an expanding disc of light, which the maintainer disliked ("los
círculos de luz"). The game fades it in, turns it slowly and fades it out.

    python3 tools/art/holy_burst.py     # writes public/assets/fx/holy-burst.png
"""

from __future__ import annotations

import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'fx', 'holy-burst.png')
SIZE = 512
RAYS = 34
SEED = 7


def main() -> None:
    rng = np.random.default_rng(SEED)
    n = SIZE
    yy, xx = np.mgrid[0:n, 0:n] + 0.5
    dx, dy = xx - n / 2, yy - n / 2
    r = np.hypot(dx, dy) / (n / 2)
    a = np.arctan2(dy, dx)
    light = np.zeros((n, n))
    # thin rays, each its own length, width and strength, fading outward
    for i in range(RAYS):
        ang = 2 * np.pi * (i + rng.uniform(-0.3, 0.3)) / RAYS
        length = rng.uniform(0.45, 0.98)
        width = rng.uniform(0.012, 0.03)
        strength = rng.uniform(0.35, 0.9)
        d = np.angle(np.exp(1j * (a - ang)))
        across = np.exp(-((d / (width / np.maximum(r, 0.05) * 0.5 + width)) ** 2))
        along = np.clip(1 - r / length, 0, 1) ** 1.6
        light = np.maximum(light, strength * across * along)
    # the soft core
    light = np.maximum(light, np.exp(-(r / 0.16) ** 2))
    light += 0.35 * np.exp(-(r / 0.42) ** 2)
    # a few sparkles among the rays
    for _ in range(26):
        sr, sa = rng.uniform(0.15, 0.75), rng.uniform(0, 2 * np.pi)
        sx, sy = n / 2 + np.cos(sa) * sr * n / 2, n / 2 + np.sin(sa) * sr * n / 2
        size = rng.uniform(1.2, 3.2)
        light += rng.uniform(0.4, 0.9) * np.exp(-((xx - sx) ** 2 + (yy - sy) ** 2) / (2 * size**2))
    light = np.clip(light, 0, 1)
    soft = np.asarray(Image.fromarray((light * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6))).astype(float) / 255
    # white at the heart, warm gold outward
    warm = np.clip(r / 0.7, 0, 1)[..., None]
    rgb = np.array([255, 255, 246]) * (1 - warm) + np.array([255, 214, 120]) * warm
    img = np.zeros((n, n, 4), np.uint8)
    img[..., :3] = rgb.astype(np.uint8)
    img[..., 3] = np.clip(soft * 235, 0, 255).astype(np.uint8)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    Image.fromarray(img, 'RGBA').save(OUT, optimize=True)
    print('wrote', os.path.relpath(OUT, ROOT))


if __name__ == '__main__':
    main()
