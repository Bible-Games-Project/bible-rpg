"""The story map background: the maintainer's painting
(art/reference/v2/story-map.webp) with darker outlines and deeper shadows,
like the cover (the maintainer asked for the cover's black shading so both
look alike). Every edge gets ink on its darker side, except in the bright
sky and clouds, which keep their soft shading.

    python3 tools/art/story_map.py      # writes public/assets/ui/story-map.webp
"""

from __future__ import annotations

import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'art', 'reference', 'v2', 'story-map.webp')
OUT = os.path.join(ROOT, 'public', 'assets', 'ui', 'story-map.webp')

INK_STRENGTH = 5.5
INK_MIN = 0.08
INK_RGB = np.array([18, 12, 10], float)


def main() -> None:
    a = np.asarray(Image.open(SRC).convert('RGB')).astype(float)
    lum = a @ np.array([0.299, 0.587, 0.114])
    blur = np.asarray(Image.fromarray(lum.astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.2))).astype(float)
    # how much darker each pixel is than its surroundings: the dark side of an edge
    ink = np.clip(np.clip(blur - lum, 0, None) * INK_STRENGTH / 255, 0, 1) ** 0.8
    ink[ink < INK_MIN] = 0
    ink *= np.clip((225 - blur) / 70, 0, 1)
    out = a * (1 - ink[..., None]) + INK_RGB * ink[..., None]
    # deeper shadows
    out *= 1 - 0.35 * np.clip(1 - lum / 140, 0, 1)[..., None]
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(OUT, quality=90, method=6)
    print('wrote', os.path.relpath(OUT, ROOT))


if __name__ == '__main__':
    main()
