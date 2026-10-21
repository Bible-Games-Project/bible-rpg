"""Turn AI-generated "pixel art" images into true pixel-art sprites without
losing any of their drawing pixels.

Generated images draw every art pixel as a block of roughly N x N image
pixels (about 8 for art/reference/adam-sprite.webp), but the blocks are not
perfectly regular. This module finds the block boundaries along each axis
(dynamic programming over the edge-energy profile with a variable spacing)
and samples the centre of every block, so each drawing pixel becomes exactly
one sprite pixel.
"""

from __future__ import annotations

import numpy as np
from PIL import Image


def load_rgba(path: str) -> np.ndarray:
    return np.array(Image.open(path).convert('RGBA')).astype(np.float32)


def remove_background(img: np.ndarray, white_tol: float = 28.0) -> np.ndarray:
    """Make the background transparent. Images that already have alpha keep
    it; images on a plain white/light background get it removed by flood
    fill from the borders."""
    out = img.copy()
    a = out[:, :, 3]
    if (a < 10).mean() > 0.05:
        out[:, :, 3] = np.where(a > 128, 255, 0)
        return out
    h, w = a.shape
    bg = out[0, 0, :3]
    diff = np.abs(out[:, :, :3] - bg).sum(axis=2)
    cand = diff < white_tol * 3
    seen = np.zeros((h, w), bool)
    stack = [(0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)]
    stack += [(0, x) for x in range(0, w, 8)] + [(h - 1, x) for x in range(0, w, 8)]
    stack += [(y, 0) for y in range(0, h, 8)] + [(y, w - 1) for y in range(0, h, 8)]
    while stack:
        y, x = stack.pop()
        if y < 0 or x < 0 or y >= h or x >= w or seen[y, x] or not cand[y, x]:
            continue
        seen[y, x] = True
        stack.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
    out[:, :, 3] = np.where(seen, 0, 255)
    return out


def _boundaries(profile: np.ndarray, pmin: float, pmax: float) -> list[int]:
    """Choose cut positions maximising edge energy with spacing in
    [pmin, pmax] (dynamic programming)."""
    n = len(profile)
    lo, hi = int(np.floor(pmin)), int(np.ceil(pmax))
    best = np.full(n + 1, -1e18)
    prev = np.full(n + 1, -1, int)
    for s in range(0, hi + 1):
        best[s] = profile[s] if s < n else 0.0
    for i in range(0, n + 1):
        if best[i] < -1e17:
            continue
        for step in range(lo, hi + 1):
            j = i + step
            if j > n:
                break
            v = best[i] + (profile[j] if j < n else 0.0)
            if v > best[j]:
                best[j] = v
                prev[j] = i
    # end anywhere within the last period
    end = max(range(max(0, n - hi), n + 1), key=lambda k: best[k])
    cuts = []
    k = end
    while k >= 0 and prev[k] != -1:
        cuts.append(k)
        k = prev[k]
    cuts.append(k)
    return sorted(set(cuts))


def detect_grid(img: np.ndarray, period: float | None = None) -> tuple[list[int], list[int], float]:
    rgb = img[:, :, :3]
    a = img[:, :, 3] > 0
    dx = np.abs(np.diff(rgb, axis=1)).sum(axis=2) * (a[:, 1:] | a[:, :-1])
    dy = np.abs(np.diff(rgb, axis=0)).sum(axis=2) * (a[1:, :] | a[:-1, :])
    px_ = np.concatenate([[0], dx.sum(axis=0)])
    py_ = np.concatenate([[0], dy.sum(axis=1)])
    if period is None:
        period = estimate_period(px_, py_)
    # every cut costs the mean edge energy, so cuts land on real block edges
    # instead of splitting flat areas into extra pixels
    xs = _boundaries(px_ - px_.mean() * 1.0, period * 0.8, period * 1.25)
    ys = _boundaries(py_ - py_.mean() * 1.0, period * 0.8, period * 1.25)
    return xs, ys, period


def estimate_period(px_: np.ndarray, py_: np.ndarray) -> float:
    best, bestp = -1.0, 8.0
    for p10 in range(30, 260):
        p = p10 / 10
        score = 0.0
        for prof in (px_, py_):
            c = prof - prof.mean()
            k = int(round(p))
            if k < 2 or k >= len(c) // 4:
                continue
            ac = (c[:-k] * c[k:]).sum() / ((c * c).sum() + 1e-9)
            score += ac
        # prefer the fundamental period over its multiples
        if score > best * 1.08:
            best, bestp = score, p
    return bestp


def sample_grid(img: np.ndarray, xs: list[int], ys: list[int]) -> np.ndarray:
    out = np.zeros((len(ys) - 1, len(xs) - 1, 4), np.uint8)
    for j in range(len(ys) - 1):
        y0, y1 = ys[j], ys[j + 1]
        for i in range(len(xs) - 1):
            x0, x1 = xs[i], xs[i + 1]
            # centre region of the block (avoid compression fringes)
            cy0, cy1 = y0 + (y1 - y0) // 4, y1 - (y1 - y0) // 4
            cx0, cx1 = x0 + (x1 - x0) // 4, x1 - (x1 - x0) // 4
            blk = img[cy0:max(cy1, cy0 + 1), cx0:max(cx1, cx0 + 1)].reshape(-1, 4)
            if (blk[:, 3] > 0).mean() < 0.5:
                continue
            b = blk[blk[:, 3] > 0][:, :3]
            out[j, i, :3] = np.median(b, axis=0).round().astype(np.uint8)
            out[j, i, 3] = 255
    return out


def extract(path: str, period: float | None = None, bbox: tuple[int, int, int, int] | None = None) -> tuple[np.ndarray, float]:
    """Return (sprite, period). bbox = (x0, y0, x1, y1) in image pixels."""
    img = remove_background(load_rgba(path))
    if bbox:
        x0, y0, x1, y1 = bbox
        img = img[y0:y1, x0:x1]
    ys_, xs_ = np.where(img[:, :, 3] > 0)
    pad = 4
    img = img[max(0, ys_.min() - pad):ys_.max() + pad + 1, max(0, xs_.min() - pad):xs_.max() + pad + 1]
    xs, ys, p = detect_grid(img, period)
    sprite = sample_grid(img, xs, ys)
    yy, xx = np.where(sprite[:, :, 3] > 0)
    sprite = sprite[yy.min():yy.max() + 1, xx.min():xx.max() + 1]
    return sprite, p


def upscale(sprite: np.ndarray, k: int) -> np.ndarray:
    return np.repeat(np.repeat(sprite, k, axis=0), k, axis=1)


if __name__ == '__main__':
    import sys
    sp, p = extract(sys.argv[1])
    print('period', p, 'sprite', sp.shape[1], 'x', sp.shape[0])
    Image.fromarray(sp).save(sys.argv[2])
