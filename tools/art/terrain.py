"""Ground tiles (32 x 32) for the Eden tilemap.

Base layer: grass variants (seamless, clustered blades, no noise).
Overlay layers use corner-based Wang sets (16 tiles: index = TL*1 + TR*2 +
BL*4 + BR*8, where a set bit means that corner belongs to the terrain), so
paths, water and dry ground get organic edges against the grass:

  path   - packed earth with pebbles; grass overhangs the edge
  water  - the river, with a sandy bank and ripples (3 animation frames)
  dry    - the cracked, thorny ground outside the garden

The game composes the map from a corner grid (see src/game/world/terrain.ts).
"""

from __future__ import annotations

import math
import random

import numpy as np

import pixel as px
from style import P

T = 32


def wrap_put(img, x, y, c):
    img[y % T, x % T] = c


def tuft(img, x, y, rmp, tone, rng, h=None):
    """A small clump of 2-4 blades, darker at the base, lit tips."""
    h = h or rng.randint(3, 5)
    blades = rng.choice([(-1, 0, 1), (-1, 1), (0, 1), (-2, 0, 2)])
    for b in blades:
        lean = 0 if b == 0 else (1 if b > 0 else -1)
        for k in range(h):
            xx = x + b + (lean if k >= h - 1 else 0)
            t = tone + (1 if k >= h - 2 else 0) - (1 if k == 0 else 0)
            wrap_put(img, xx, y - k, rmp[max(0, min(len(rmp) - 1, t))])


def grass_tile(seed: int, base: int = 6, density: int = 7, flowers: int = 0, ramp: str = 'grass') -> np.ndarray:
    rng = random.Random(seed)
    g = P[ramp]
    img = np.zeros((T, T, 4), np.uint8)
    img[:, :] = g[base]
    # a few small darker clusters (shadows between grass clumps)
    for _ in range(4):
        x, y = rng.randrange(T), rng.randrange(T)
        for dx, dy in ((0, 0), (1, 0), (0, 1), (-1, 0), (1, 1)):
            if rng.random() < 0.8:
                wrap_put(img, x + dx, y + dy, g[base - 1])
    # tufts on a jittered grid so they are evenly spread
    cells = []
    step = T / math.sqrt(max(1, density))
    yy = 0.0
    while yy < T:
        xx = 0.0
        while xx < T:
            cells.append((int(xx + rng.uniform(0, step)), int(yy + rng.uniform(0, step))))
            xx += step
        yy += step
    for (x, y) in cells:
        tone = base + rng.choice([-2, -1, 1, 2])
        tuft(img, x, y, g, tone, rng)
    for _ in range(flowers):
        x, y = rng.randrange(T), rng.randrange(T)
        col = rng.choice(['flower_white', 'flower_yellow', 'flower_blue', 'flower_pink'])
        wrap_put(img, x, y, P[col][4])
        wrap_put(img, x + 1, y, P[col][3])
        wrap_put(img, x, y + 1, g[base - 2])
    return img


def dirt_tile(seed: int) -> np.ndarray:
    rng = random.Random(seed)
    e = P['earth']
    img = np.zeros((T, T, 4), np.uint8)
    img[:, :] = e[6]
    for _ in range(14):
        x, y = rng.randrange(T), rng.randrange(T)
        wrap_put(img, x, y, e[rng.choice([5, 7])])
        wrap_put(img, x + 1, y, e[rng.choice([5, 7])])
    for _ in range(9):
        x, y = rng.randrange(T), rng.randrange(T)
        s = P['stone_warm']
        k = rng.choice([1, 2])
        for dy in range(k):
            for dx in range(k + 1):
                wrap_put(img, x + dx, y + dy, s[7 - dy])
        wrap_put(img, x, y + k, e[3])
        wrap_put(img, x + k, y + k, e[3])
    for _ in range(5):
        x, y = rng.randrange(T), rng.randrange(T)
        for k in range(rng.randint(2, 4)):
            wrap_put(img, x + k, y + (k // 2), e[4])
    return img


def dry_tile(seed: int) -> np.ndarray:
    rng = random.Random(seed)
    s = P['sand']
    img = np.zeros((T, T, 4), np.uint8)
    img[:, :] = s[3]
    for _ in range(12):
        x, y = rng.randrange(T), rng.randrange(T)
        wrap_put(img, x, y, s[rng.choice([2, 4])])
        wrap_put(img, x + 1, y, s[rng.choice([2, 4])])
    # cracks
    for _ in range(3):
        x, y = rng.randrange(T), rng.randrange(T)
        for k in range(rng.randint(5, 9)):
            wrap_put(img, x, y, s[0])
            x += rng.choice([1, 1, 0])
            y += rng.choice([1, 0, -1])
    for _ in range(2):
        tuft(img, rng.randrange(T), rng.randrange(T), P['thorn'] if 'thorn' in P else P['olive'], 3, rng, 3)
    return img


def water_tile(frame: int) -> np.ndarray:
    w = P['water']
    img = np.zeros((T, T, 4), np.uint8)
    img[:, :] = w[5]
    # ripples: short light dashes that drift with the frame
    rng = random.Random(5)
    for _ in range(7):
        x, y = rng.randrange(T), rng.randrange(T)
        ln = rng.randint(3, 6)
        for k in range(ln):
            wrap_put(img, x + k + frame * 2, y, w[8] if 0 < k < ln - 1 else w[7])
        wrap_put(img, x + 1 + frame * 2, y + 1, w[4])
    rng = random.Random(9 + frame)
    for _ in range(2):
        x, y = rng.randrange(T), rng.randrange(T)
        wrap_put(img, x, y, w[10])
    return img


def field(corners, seed: int, wobble: float = 3.2):
    """Smooth terrain field for one tile: >0.5 inside the terrain. Noise is
    zero on the tile border so neighbouring tiles always line up."""
    tl, tr, bl, br = corners
    xs, ys = np.meshgrid(np.arange(T) + 0.5, np.arange(T) + 0.5)
    u, v = xs / T, ys / T
    su, sv = u * u * (3 - 2 * u), v * v * (3 - 2 * v)
    f = tl * (1 - su) * (1 - sv) + tr * su * (1 - sv) + bl * (1 - su) * sv + br * su * sv
    rng = np.random.default_rng(seed)
    noise = np.zeros_like(f)
    for k in range(3):
        fx, fy, ph = rng.uniform(1, 3), rng.uniform(1, 3), rng.uniform(0, 6.28)
        noise += np.sin(xs / T * math.tau * fx + ph) * np.sin(ys / T * math.tau * fy + ph * 0.7)
    window = np.sin(u * math.pi) * np.sin(v * math.pi)
    return f + noise * window * wobble / T, u, v


def wang_set(kind: str, frame: int = 0) -> list[np.ndarray]:
    tiles = []
    for idx in range(16):
        corners = [(idx >> b) & 1 for b in range(4)]
        f, u, v = field(corners, seed=idx * 13 + (7 if kind == 'water' else 3 if kind == 'dry' else 1))
        img = np.zeros((T, T, 4), np.uint8)
        if kind == 'path':
            tex = dirt_tile(idx % 3)
            inside = f > 0.5
            img[inside] = tex[inside]
            edge = inside & ~(f > 0.56)
            img[edge] = P['earth'][3]
            # grass overhanging the path edge
            rng = random.Random(idx)
            ys, xs = np.where(edge)
            for j in range(0, len(xs), 5):
                if rng.random() < 0.5:
                    x, y = xs[j], ys[j]
                    for k in range(rng.randint(1, 3)):
                        if 0 <= y - k < T:
                            img[y - k, x] = P['grass'][5 + (k > 0)]
        elif kind == 'water':
            tex = water_tile(frame)
            bank = (f > 0.5) & ~(f > 0.6)
            wet = (f > 0.6) & ~(f > 0.64)
            water = f > 0.64
            deep = f > 0.8
            img[bank] = P['sand'][5]
            img[(f > 0.5) & ~(f > 0.53)] = P['sand'][3]
            img[wet] = P['sand'][1]
            img[water] = tex[water]
            img[water & ~deep] = np.where((tex[water & ~deep][:, 0:1] > 0), tex[water & ~deep], tex[water & ~deep])
            sh = water & ~(f > 0.7)
            img[sh] = P['water'][6]
            img[deep & (tex[:, :, 0] == P['water'][5][0])] = P['water'][4]
        elif kind == 'dry':
            tex = dry_tile(idx % 2)
            inside = f > 0.5
            img[inside] = tex[inside]
            img[inside & ~(f > 0.55)] = P['sand'][1]
        tiles.append(img)
    return tiles


def build(m: dict, save, strip, sheet_entry) -> None:
    grass = [grass_tile(i, 6, 7, 0) for i in range(4)] + [grass_tile(10 + i, 6, 10, 3) for i in range(2)] + \
            [grass_tile(30 + i, 6, 12, 6) for i in range(2)]         # 0-3 plain, 4-5 tufty, 6-7 with flowers
    path = wang_set('path')
    water = [wang_set('water', f) for f in range(3)]
    dry = wang_set('dry')
    tiles = grass + path + water[0] + water[1] + water[2] + dry
    cols = 16
    rows = math.ceil(len(tiles) / cols)
    sheet = np.zeros((rows * T, cols * T, 4), np.uint8)
    for i, t in enumerate(tiles):
        sheet[(i // cols) * T:(i // cols + 1) * T, (i % cols) * T:(i % cols + 1) * T] = t
    f = save(sheet, 'tiles/eden-tiles.png')
    base = len(grass)
    m['tiles'] = {
        'file': f, 'tileSize': T, 'columns': cols,
        'grass': [0, 1, 2, 3, 4, 5], 'flowers': [6, 7],
        'path': base, 'water': [base + 16, base + 32, base + 48], 'dry': base + 64,
    }
    print('  tiles', len(tiles))


if __name__ == '__main__':
    import sys
    sheet = []
    path = wang_set('path')
    water = wang_set('water')
    dry = wang_set('dry')
    g = [grass_tile(i, 6, 7, 0) for i in range(4)] + [grass_tile(10, 6, 10, 3), grass_tile(20, 7, 8, 1)]
    # a small sample map: grass with a path cross and a pond
    W, H = 14, 9
    corners_path = np.zeros((H + 1, W + 1), int)
    corners_path[4:6, :] = 1
    corners_path[:, 6:8] = 1
    corners_water = np.zeros((H + 1, W + 1), int)
    corners_water[1:4, 9:13] = 1
    out = np.zeros((H * T, W * T, 4), np.uint8)
    rng = random.Random(1)
    for y in range(H):
        for x in range(W):
            out[y * T:(y + 1) * T, x * T:(x + 1) * T] = g[rng.randrange(len(g))]
            for cg, tiles in ((corners_path, path), (corners_water, water)):
                idx = cg[y, x] + cg[y, x + 1] * 2 + cg[y + 1, x] * 4 + cg[y + 1, x + 1] * 8
                if idx:
                    t = tiles[idx]
                    msk = t[:, :, 3] > 0
                    out[y * T:(y + 1) * T, x * T:(x + 1) * T][msk] = t[msk]
    px.preview(out, sys.argv[1], 2)
