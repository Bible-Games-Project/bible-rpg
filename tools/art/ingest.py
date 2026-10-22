"""Cut a generated sheet into clean native-resolution sprites.

    python3 tools/art/ingest.py art/generated/eve-sprite/<file>.png art/incoming/eve

Removes the flat background (magenta #FF00FF, or a plain light background),
finds each separate subject, recovers its true pixel grid (see extract.py)
and writes one PNG per subject, numbered in reading order, plus
preview.png (all of them side by side, enlarged) to check the result.
"""

from __future__ import annotations

import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from extract import detect_grid, load_rgba, remove_background, sample_grid  # noqa: E402


def remove_magenta(img: np.ndarray, tol: float = 90.0) -> np.ndarray:
    """Clear magenta and magenta-tinted fringe pixels."""
    out = img.copy()
    r, g, b = out[:, :, 0], out[:, :, 1], out[:, :, 2]
    near = np.sqrt((r - 255) ** 2 + g ** 2 + (b - 255) ** 2) < tol
    # anti-aliased edges: red and blue both well above green
    fringe = (np.minimum(r, b) - g > 70) & (np.abs(r - b) < 70)
    out[:, :, 3] = np.where(near | fringe, 0, 255)
    return out


def is_magenta(img: np.ndarray) -> bool:
    h, w = img.shape[:2]
    corners = np.array([img[2, 2, :3], img[2, w - 3, :3], img[h - 3, 2, :3], img[h - 3, w - 3, :3]])
    return bool(((corners[:, 0] > 200) & (corners[:, 1] < 80) & (corners[:, 2] > 200)).all())


def components(mask: np.ndarray, cell: int = 8, gap: int = 2) -> list[np.ndarray]:
    """Group opaque pixels into subjects. Works on a coarse grid of
    `cell`-pixel cells; parts closer than `gap` cells belong together."""
    h, w = mask.shape
    gh, gw = (h + cell - 1) // cell, (w + cell - 1) // cell
    pad = np.zeros((gh * cell, gw * cell), bool)
    pad[:h, :w] = mask
    coarse = pad.reshape(gh, cell, gw, cell).mean(axis=(1, 3)) > 0.15
    grown = coarse.copy()
    for dy in range(-gap, gap + 1):
        for dx in range(-gap, gap + 1):
            grown |= np.roll(np.roll(coarse, dy, axis=0), dx, axis=1)
    labels = np.zeros((gh, gw), int)
    n = 0
    for y0, x0 in zip(*np.nonzero(grown)):
        if labels[y0, x0]:
            continue
        n += 1
        stack = [(y0, x0)]
        labels[y0, x0] = n
        while stack:
            y, x = stack.pop()
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < gh and 0 <= nx < gw and grown[ny, nx] and not labels[ny, nx]:
                    labels[ny, nx] = n
                    stack.append((ny, nx))
    out = []
    for k in range(1, n + 1):
        # the grown label area also keeps the subject's thin edge pixels
        full = np.repeat(np.repeat(labels == k, cell, axis=0), cell, axis=1)[:h, :w]
        if (full & mask).any():
            out.append(full & mask)
    return out


def ingest(path: str, out_dir: str, min_size: int = 40) -> list[str]:
    img = load_rgba(path)
    img = remove_magenta(img) if is_magenta(img) else remove_background(img)
    mask = img[:, :, 3] > 0
    subjects = []
    for m in components(mask):
        ys, xs = np.nonzero(m)
        if ys.max() - ys.min() < min_size and xs.max() - xs.min() < min_size:
            continue
        subjects.append((ys.min(), xs.min(), ys.max(), xs.max(), m))
    # reading order: rows (by vertical centre), then left to right
    subjects.sort(key=lambda s: (round(((s[0] + s[2]) / 2) / 300), s[1]))
    os.makedirs(out_dir, exist_ok=True)
    written, sprites = [], []
    for i, (y0, x0, y1, x1, m) in enumerate(subjects, 1):
        crop = img[max(0, y0 - 4):y1 + 5, max(0, x0 - 4):x1 + 5].copy()
        crop[:, :, 3] *= m[max(0, y0 - 4):y1 + 5, max(0, x0 - 4):x1 + 5]
        xs_, ys_, period = detect_grid(crop)
        sprite = sample_grid(crop, xs_, ys_)
        yy, xx = np.nonzero(sprite[:, :, 3])
        sprite = sprite[yy.min():yy.max() + 1, xx.min():xx.max() + 1]
        name = os.path.join(out_dir, f'{i:02d}.png')
        Image.fromarray(sprite).save(name)
        written.append(name)
        sprites.append(sprite)
        print(f'{name}: {sprite.shape[1]}x{sprite.shape[0]} art px (block {period:.1f} image px)')
    if sprites:
        k = 3
        hmax = max(s.shape[0] for s in sprites) * k
        wsum = sum(s.shape[1] * k + 16 for s in sprites)
        sheet = Image.new('RGBA', (wsum, hmax), (40, 44, 52, 255))
        x = 0
        for s in sprites:
            big = Image.fromarray(s).resize((s.shape[1] * k, s.shape[0] * k), Image.NEAREST)
            sheet.alpha_composite(big, (x, hmax - big.height))
            x += big.width + 16
        sheet.save(os.path.join(out_dir, 'preview.png'))
    return written


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    ingest(sys.argv[1], sys.argv[2])
