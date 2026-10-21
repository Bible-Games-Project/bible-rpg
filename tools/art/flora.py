"""Trees, bushes, plants and rocks of the garden (top-down 3/4 view).

Trees are exported as two aligned layers (trunk + canopy) so the game can
fade only the foliage when a character walks behind it, plus metadata:
anchor at the trunk base, a trunk collider and fruit slots.

Foliage is built from lobes of leaf clumps lit from the upper left, with
pointed leaf tips along the silhouette and the reference's leaf greens.
"""

from __future__ import annotations

import math
import random

import numpy as np

import pixel as px
import style as st
from style import P

LIGHT = px.LIGHT


# ---------------------------------------------------------------------------
# trunks
# ---------------------------------------------------------------------------

def trunk(w, h, bx, by, top_y, half_base, half_top, rmp, rng, lean=0.0, roots=3, branches=()):
    img = px.blank(w, h)
    xs, ys = px.grid(w, h)
    span = max(1.0, by - top_y)

    def cx_of(yy):
        t = np.clip((by - yy) / span, 0, 1)
        return bx + lean * t * t * span + np.sin(t * 2.4) * 1.2

    def half_of(yy):
        t = np.clip((by - yy) / span, 0, 1)
        flare = np.clip(1 - (by - yy) / 16.0, 0, 1) ** 2 * (half_base * 0.75)
        return half_base + (half_top - half_base) * t + flare

    mask = (np.abs(xs - cx_of(ys)) <= half_of(ys)) & (ys <= by) & (ys >= top_y)
    sides = [-1, 1, -1, 1, 0][:roots]
    for i, s in enumerate(sides):
        if s == 0:
            continue
        reach = half_base + rng.uniform(5, 10) + (4 if i >= 2 else 0)
        mask |= px.m_capsule(w, h, bx + s * half_base * 0.3, by - 9, bx + s * reach, by - (0.4 if i < 2 else 3.0), 4.2, 1.4)
    for (x0, y0, x1, y1, r0, r1) in branches:
        mask |= px.m_capsule(w, h, x0, y0, x1, y1, r0, r1)
    nx, ny, nz = px.normals_cylinder_v(w, h, cx_of, lambda yy: half_of(yy) + 1.0)
    idx = px.shade(img, mask, rmp, (nx, ny * 0, nz), lo=1, hi=len(rmp) - 2, ambient=0.0, bias=-0.04)
    lk = px.ramp_lookup(rmp)
    e = px.edge(mask)
    u = (xs - cx_of(ys)) / np.maximum(half_of(ys), 0.5)
    phase = rng.random()
    wob = np.sin(ys * 0.25 + phase * 6) * 0.08 + np.sin(ys * 0.7 + phase * 3) * 0.04
    g = (u * 2.6 + wob + phase) % 1.0
    groove = (g < 0.13) & mask & ~e & (ys < by - 2)
    ridge = (g >= 0.13) & (g < 0.24) & mask & ~e
    breaks = np.array([[rng.random() < 0.12 for _ in range(w)] for _ in range(h)])
    for y, x in zip(*np.where(groove & ~breaks)):
        img[y, x] = rmp[max(1, lk.get(tuple(img[y, x, :3]), 3) - 2)]
    for y, x in zip(*np.where(ridge & ~breaks)):
        if u[y, x] < 0.3:
            img[y, x] = rmp[min(len(rmp) - 1, lk.get(tuple(img[y, x, :3]), 3) + 1)]
    px.outline_inner(img, mask, rmp[0])
    for x in range(w):
        col = np.where(mask[:, x])[0]
        if len(col) and col.max() >= by - 3:
            img[col.max(), x] = rmp[0]
    return img, mask


# ---------------------------------------------------------------------------
# foliage
# ---------------------------------------------------------------------------

def clumps(img, m, rmp, rng, rmin, rmax, lobe_n, lo, hi, bias):
    h, w = m.shape
    ys, xs = np.where(m)
    if len(xs) == 0:
        return
    step = (rmin + rmax) / 2 * 1.25
    pts = []
    y = ys.min() - step * 0.3
    row = 0
    while y <= ys.max() + step:
        x = xs.min() - (step / 2 if row % 2 else 0)
        while x <= xs.max() + step:
            jx, jy = x + rng.uniform(-step * 0.3, step * 0.3), y + rng.uniform(-step * 0.25, step * 0.25)
            if 0 <= int(jy) < h and 0 <= int(jx) < w and m[int(jy), int(jx)]:
                pts.append((jx, jy, rng.uniform(rmin, rmax)))
            x += step
        y += step * 0.78
        row += 1
    pts.sort(key=lambda p: p[1])
    gx, gy, gz = lobe_n
    for cx, cy, r in pts:
        cm = px.m_ellipse(w, h, cx, cy, r, r * 0.85) & m
        if not cm.any():
            continue
        nx, ny, nz = px.normals_ellipsoid(w, h, cx, cy, r, r * 0.85)
        wgt = 0.55
        nx2, ny2, nz2 = nx * (1 - wgt) + gx * wgt, ny * (1 - wgt) + gy * wgt, nz * (1 - wgt) + gz * wgt
        nn = np.sqrt(nx2 ** 2 + ny2 ** 2 + nz2 ** 2) + 1e-6
        v = px.lambert(nx2 / nn, ny2 / nn, nz2 / nn, ambient=0.0, wrap=0.15)
        idx = px.quantize(v, len(rmp), lo, hi, bias)
        rim = cm & ~np.roll(cm, -1, axis=0)
        rim2 = cm & ~np.roll(cm, -2, axis=0) & ~rim
        idx = np.where(rim, np.maximum(lo, idx - 2), idx)
        idx = np.where(rim2, np.maximum(lo, idx - 1), idx)
        px.paint(img, cm, rmp, idx)
        # small pointed leaf highlights on the lit side of the clump
        for _ in range(max(1, int(r / 3))):
            a = rng.uniform(math.pi * 1.05, math.pi * 1.6)
            lx, ly = int(cx + math.cos(a) * r * 0.45), int(cy + math.sin(a) * r * 0.45)
            if 0 <= ly < h - 1 and 0 <= lx < w - 1 and cm[ly, lx] and idx[ly, lx] >= hi - 2:
                img[ly, lx] = rmp[min(len(rmp) - 1, hi)]
                img[ly + 1, lx] = rmp[min(len(rmp) - 1, hi - 1)]


def canopy(w, h, lobes, rmp, rng, clump=(8.0, 12.0), lo=1, hi=None, bias=-0.06, tips=True):
    hi = hi if hi is not None else len(rmp) - 2
    img = px.blank(w, h)
    region = np.zeros((h, w), bool)
    lk = px.ramp_lookup(rmp)
    for (cx, cy, rx, ry) in sorted(lobes, key=lambda l: l[1] + l[3]):
        m = px.m_ellipse(w, h, cx, cy, rx, ry)
        for _ in range(int((rx + ry) * 0.5)):
            a = rng.uniform(0, math.tau)
            r = rng.uniform(clump[0] * 0.7, clump[1] * 0.85)
            m |= px.m_ellipse(w, h, cx + math.cos(a) * (rx - r * 0.5), cy + math.sin(a) * (ry - r * 0.5), r, r * 0.85)
        band = m.copy()
        for _ in range(4):
            band = band | np.roll(band, -1, axis=0) | np.roll(band, 1, axis=1)
        band &= region & ~m
        for y, x in zip(*np.where(band)):
            img[y, x] = rmp[max(lo, lk.get(tuple(img[y, x, :3]), lo + 1) - 2)]
        ln = px.normals_ellipsoid(w, h, cx + rx * 0.08, cy + ry * 0.08, rx * 1.12, ry * 1.18)
        layer = px.blank(w, h)
        px.shade(layer, m, rmp, ln, lo=lo, hi=lo + 2, ambient=0.0)
        clumps(layer, m, rmp, rng, clump[0], clump[1], ln, lo, hi, bias)
        img[m] = layer[m]
        region |= m
    if tips:
        # pointed leaf tips sticking out of the silhouette
        e = px.edge(region)
        ys, xs = np.where(e)
        for y, x in zip(ys, xs):
            if rng.random() < 0.09:
                dx = 1 if x > w / 2 else -1
                dy = 1 if y > h * 0.5 else -1
                for k in range(1, 3):
                    yy, xx = y + (dy if k == 2 else 0), x + dx * k
                    if 0 <= yy < h and 0 <= xx < w and not region[yy, xx]:
                        img[yy, xx] = rmp[max(lo, lk.get(tuple(img[y, x, :3]), lo + 2))]
                        region[yy, xx] = True
    under = region & ~np.roll(region, -5, axis=0)
    for y, x in zip(*np.where(under)):
        img[y, x] = rmp[max(lo, min(lk.get(tuple(img[y, x, :3]), lo + 1) - 1, lo + 3))]
    px.outline_inner(img, region, rmp[0])
    return img, region


def finish(trunk_img, tmask, can, low, w, h, base, half, bark, fruit=(), kind='tree', collider=None):
    lk = px.ramp_lookup(bark)
    for y, x in zip(*np.where(tmask)):
        if y < low + 12:
            steps = 3 if y < low + 4 else 2 if y < low + 9 else 1
            trunk_img[y, x] = bark[max(0, lk.get(tuple(trunk_img[y, x, :3]), 3) - steps)]
    col = collider or (int(base[0] - half - 2), int(base[1] - 12), int(half * 2 + 4), 14)
    return {'trunk': trunk_img, 'canopy': can, 'w': w, 'h': h, 'base': base, 'collider': col, 'fruit': list(fruit), 'kind': kind}


def jitter(lobes, rng, d=4.0):
    return [(cx + rng.uniform(-d, d), cy + rng.uniform(-d, d), rx * rng.uniform(0.93, 1.06), ry * rng.uniform(0.93, 1.06)) for cx, cy, rx, ry in lobes]


def fruit_slots(cmask, rng, n, x_range, y_range, min_d2):
    h = cmask.shape[0]
    out = []
    for _ in range(n):
        for _try in range(60):
            x, y = rng.randrange(*x_range), rng.randrange(*y_range)
            if cmask[y, x] and cmask[min(h - 1, y + 8), x] and all((x - a) ** 2 + (y - b) ** 2 > min_d2 for a, b in out):
                out.append((x, y))
                break
    return out


# ---------------------------------------------------------------------------
# tree types
# ---------------------------------------------------------------------------

def broadleaf(seed, size='large', rmp=None):
    rng = random.Random(seed)
    rmp = rmp or P['leaf']
    S = {'large': 2.0, 'medium': 1.55, 'small': 1.1}[size]
    w, h = int(112 * S), int(128 * S)
    bx, by = w / 2, h - 6
    lobes = [(56, 50, 40, 32), (34, 60, 22, 20), (78, 58, 24, 22), (56, 30, 28, 20), (44, 72, 20, 14), (70, 72, 20, 14)]
    lobes = jitter([(x * S, y * S, rx * S, ry * S) for x, y, rx, ry in lobes], rng)
    top = 54 * S
    br = [(bx - 2, top + 22 * S, bx - 18 * S, top - 6 * S, 4.6 * S / 2, 2.6 * S / 2), (bx + 2, top + 14 * S, bx + 20 * S, top - 10 * S, 4.2 * S / 2, 2.4 * S / 2)]
    hb = 7.0 * S
    t, tm = trunk(w, h, bx, by, top, hb, hb * 0.68, P['bark'], rng, lean=rng.uniform(-0.04, 0.04), branches=br)
    c, cm = canopy(w, h, lobes, rmp, rng, clump=(5.0 * S, 7.0 * S))
    return finish(t, tm, c, max(y + ry for _, y, _, ry in lobes), w, h, (bx, by), hb, P['bark'])


def blossom(seed):
    tr = broadleaf(seed, 'medium', P['leaf'])
    rng = random.Random(seed + 100)
    can = tr['canopy']
    m = can[:, :, 3] > 0
    e = px.edge(m)
    ys, xs = np.where(m & ~e)
    pal = [P['flower_white'][4], P['flower_white'][5], P['flower_pink'][5], P['flower_pink'][4]]
    for _ in range(int(m.sum() / 30)):
        i = rng.randrange(len(xs))
        x, y = xs[i], ys[i]
        c = rng.choice(pal)
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            if m[min(y + dy, m.shape[0] - 1), min(x + dx, m.shape[1] - 1)] and rng.random() < 0.8:
                can[y + dy, x + dx] = c
        if y + 2 < m.shape[0] and m[y + 2, x]:
            can[y + 2, x] = P['flower_pink'][2]
    return tr


def cypress(seed):
    rng = random.Random(seed)
    w, h = 92, 220
    bx, by = 46, 214
    lobes = []
    for i, cy in enumerate(range(30, 190, 17)):
        r = 14 + min(i, 5) * 3.2 - max(0, i - 6) * 3.6
        lobes.append((46 + rng.uniform(-2, 2), cy, r, 16))
    t, tm = trunk(w, h, bx, by, 160, 7.0, 5.0, P['bark'], rng, roots=2)
    c, cm = canopy(w, h, lobes, P['leaf_blue'], rng, clump=(5.0, 7.5))
    return finish(t, tm, c, 196, w, h, (bx, by), 7.0, P['bark'])


def fig(seed):
    rng = random.Random(seed)
    w, h = 196, 184
    bx, by = 98, 178
    br = [(bx - 3, by - 16, bx - 36, by - 68, 5.2, 3.2), (bx + 3, by - 16, bx + 32, by - 72, 5.2, 3.2), (bx, by - 20, bx + 4, by - 80, 5.2, 3.6)]
    t, tm = trunk(w, h, bx, by, by - 44, 10.0, 7.0, P['bark_grey'], rng, branches=br)
    lobes = jitter([(98, 76, 64, 44), (52, 92, 36, 30), (144, 92, 36, 30), (98, 44, 44, 26), (76, 112, 32, 20), (120, 112, 32, 20)], rng)
    c, cm = canopy(w, h, lobes, P['fig'], rng, clump=(9.0, 12.5))
    # large lobed fig leaves around the edge
    for _ in range(18):
        a = rng.uniform(math.pi * 0.9, math.pi * 2.1)
        cx, cy = 98 + math.cos(a) * 66, 80 + math.sin(a) * 46
        lm = px.m_ellipse(w, h, cx, cy, 6.5, 5.5) | px.m_ellipse(w, h, cx - 5, cy - 3, 4.2, 4) | px.m_ellipse(w, h, cx + 5, cy - 3, 4.2, 4)
        lm &= ~cm | px.dilate(px.edge(cm), True)
        px.shade(c, lm, P['fig'], px.normals_ellipsoid(w, h, cx - 1, cy - 1, 9, 8), lo=2, hi=6, ambient=0.0)
        px.outline_inner(c, lm, P['fig'][0])
        cm |= lm
    fr = fruit_slots(cm, rng, 10, (36, 160), (40, 124), 360)
    return finish(t, tm, c, 128, w, h, (bx, by), 10.0, P['bark_grey'], fruit=fr, kind='fig')


def pomegranate(seed):
    rng = random.Random(seed)
    w, h = 148, 160
    bx, by = 74, 154
    br = [(bx - 2, by - 20, bx - 20, by - 56, 4.0, 2.4), (bx + 2, by - 20, bx + 22, by - 60, 4.0, 2.4)]
    t, tm = trunk(w, h, bx, by, by - 40, 7.6, 5.2, P['bark'], rng, branches=br)
    lobes = jitter([(74, 68, 48, 38), (42, 80, 26, 24), (106, 80, 26, 24), (74, 40, 30, 22)], rng)
    c, cm = canopy(w, h, lobes, P['leaf_dark'], rng, clump=(6.0, 9.0))
    ys, xs = np.where(cm & ~px.edge(cm))
    for _ in range(18):
        i = rng.randrange(len(xs))
        y, x = ys[i], xs[i]
        c[y, x] = P['flower_red'][5]
        if x + 1 < w and cm[y, x + 1]:
            c[y, x + 1] = P['flower_red'][4]
    fr = fruit_slots(cm, rng, 9, (28, 120), (30, 108), 300)
    return finish(t, tm, c, 108, w, h, (bx, by), 7.6, P['bark'], fruit=fr, kind='pomegranate')


def olive(seed):
    rng = random.Random(seed)
    w, h = 188, 184
    bx, by = 94, 178
    lean = rng.choice([-0.18, 0.18])
    br = [(bx + lean * 60, by - 52, bx - 32, by - 88, 5.0, 2.8), (bx + lean * 60, by - 52, bx + 32, by - 92, 5.0, 2.8)]
    t, tm = trunk(w, h, bx, by, by - 68, 12.0, 7.0, P['bark_grey'], rng, lean=lean, branches=br)
    ys, xs = np.where(tm & ~px.edge(tm))
    for _ in range(6):
        i = rng.randrange(len(xs))
        y, x = ys[i], xs[i]
        t[y:y + 3, x:x + 2] = P['bark_grey'][0]
    lobes = jitter([(94, 72, 60, 36), (48, 84, 32, 24), (140, 84, 32, 24), (80, 48, 36, 22), (116, 52, 32, 20)], rng)
    c, cm = canopy(w, h, lobes, P['olive'], rng, clump=(6.0, 8.5))
    for _ in range(12):
        cx, cy = rng.randrange(40, 148), rng.randrange(48, 100)
        hole = px.m_ellipse(w, h, cx, cy, rng.uniform(3, 5), rng.uniform(2.4, 4)) & cm & ~px.dilate(px.dilate(px.edge(cm), True), True)
        c[hole] = (0, 0, 0, 0)
    return finish(t, tm, c, 112, w, h, (bx, by), 12.0, P['bark_grey'])


def palm(seed):
    rng = random.Random(seed)
    w, h = 176, 248
    bx, by = 88, 242
    bend = rng.choice([-1, 1]) * rng.uniform(8, 16)
    t = px.blank(w, h)
    tm = np.zeros((h, w), bool)
    top = 60
    rows = []
    for y in range(top, by + 1):
        tt = (by - y) / (by - top)
        cx = bx + bend * tt * tt
        half = 7.4 - tt * 2.6 + (3.2 if by - y < 8 else 0)
        rows.append((y, cx, half))
        for x in range(int(cx - half - 1), int(cx + half + 2)):
            if abs(x + 0.5 - cx) <= half:
                tm[y, x] = True
    nx = np.zeros((h, w))
    nz = np.ones((h, w))
    for y, cx, half in rows:
        for x in range(w):
            if tm[y, x]:
                u = (x + 0.5 - cx) / (half + 0.5)
                nx[y, x] = u
                nz[y, x] = math.sqrt(max(0, 1 - u * u))
    idx = px.shade(t, tm, P['bark'], (nx, np.zeros_like(nx), nz), lo=2, hi=8, ambient=0.0)
    for y, cx, half in rows:
        if (by - y) % 7 in (0, 1):
            for x in range(int(cx - half), int(cx + half + 1)):
                if 0 <= x < w and tm[y, x]:
                    t[y, x] = P['bark'][max(1, idx[y, x] - (2 if (by - y) % 7 == 0 else 1))]
    px.outline_inner(t, tm, P['bark'][0])
    crown_x = bx + bend
    c = px.blank(w, h)
    cm = np.zeros((h, w), bool)
    rmp = P['leaf']
    angles = [-2.85, -2.35, -1.9, -1.45, -1.0, -0.5, 0.1, 0.55, -3.35, 0.95, -1.7]
    for k, a in enumerate(angles):
        ln = rng.uniform(62, 76)
        droop = 0.95 if abs(math.sin(a)) < 0.6 else 0.45
        prev = (crown_x, top + 4)
        segs = 22
        for sgi in range(1, segs + 1):
            tt = sgi / segs
            x = crown_x + math.cos(a) * ln * tt
            y = top + 4 + math.sin(a) * ln * tt * 0.7 + droop * (ln * tt) ** 2 / ln * 0.9
            r = 2.8 * (1 - tt) + 1.0
            seg = px.m_capsule(w, h, prev[0], prev[1], x, y, r, r)
            for side in (-1, 1):
                lx = x + side * math.cos(a + math.pi / 2) * (13.0 * (1 - tt * 0.6))
                ly = y + 9.0 * (1 - tt * 0.4)
                seg |= px.m_capsule(w, h, x, y, lx, ly, 1.9, 1.0)
            n = px.normals_capsules(w, h, [(prev[0], prev[1], x, y, 6.0, 6.0)])
            tone = 6 if k % 2 else 7
            v = px.lambert(n[0], n[1], n[2], ambient=0.0)
            id2 = px.quantize(v, len(rmp), 2, tone, -0.05)
            px.paint(c, seg & ~cm, rmp, id2)
            cm |= seg
            prev = (x, y)
    px.outline_inner(c, cm, rmp[0])
    fruit = [(int(crown_x + dx), top + 14 + abs(dx) // 2) for dx in (-11, 9, -2)]
    return {'trunk': t, 'canopy': c, 'w': w, 'h': h, 'base': (bx, by), 'collider': (int(bx - 8), by - 12, 17, 14), 'fruit': fruit, 'kind': 'date'}


def forbidden_tree():
    """The tree of the knowledge of good and evil: an old, wide-spreading tree
    with deep lustrous foliage and red-gold fruit. A landmark, not a
    glowing magical object."""
    rng = random.Random(1717)
    w, h = 304, 312
    bx, by = 152, 300
    br = [(bx - 6, by - 60, bx - 68, by - 132, 8.8, 4.4), (bx + 6, by - 60, bx + 72, by - 128, 8.8, 4.4),
          (bx, by - 72, bx - 12, by - 172, 8.0, 4.8), (bx - 36, by - 104, bx - 92, by - 120, 5.2, 2.8)]
    t, tm = trunk(w, h, bx, by, by - 88, 20.0, 13.2, P['bark'], rng, lean=0.04, roots=5, branches=br)
    lobes = jitter([(152, 104, 112, 68), (72, 128, 56, 44), (232, 124, 60, 44), (152, 56, 76, 40), (100, 168, 52, 28), (204, 168, 52, 28), (152, 160, 60, 28)], rng, 6)
    c, cm = canopy(w, h, lobes, P['leaf_dark'], rng, clump=(9.0, 13.5))
    fr = fruit_slots(cm, rng, 18, (40, 264), (36, 184), 640)
    return finish(t, tm, c, 192, w, h, (bx, by), 20.0, P['bark'], fruit=fr, kind='forbidden', collider=(bx - 24, by - 18, 49, 20))


def tree_of_life():
    rng = random.Random(4242)
    w, h = 272, 328
    bx, by = 136, 316
    gold_bark = [px.mix(c, P['gold'][4], 0.16) for c in P['bark']]
    br = [(bx - 4, by - 80, bx - 52, by - 164, 7.6, 4.0), (bx + 4, by - 80, bx + 56, by - 168, 7.6, 4.0)]
    t, tm = trunk(w, h, bx, by, by - 108, 18.0, 12.0, gold_bark, rng, roots=5, branches=br)
    lobes = jitter([(136, 112, 100, 80), (68, 144, 48, 40), (204, 144, 48, 40), (136, 52, 68, 44), (100, 192, 48, 24), (172, 192, 48, 24)], rng, 6)
    c, cm = canopy(w, h, lobes, P['leaf'], rng, clump=(9.0, 13.0))
    ys, xs = np.where(cm & ~px.edge(cm))
    lk = px.ramp_lookup(P['leaf'])
    for _ in range(int(cm.sum() / 140)):
        i = rng.randrange(len(xs))
        y, x = ys[i], xs[i]
        if lk.get(tuple(c[y, x, :3]), 0) < 5:
            continue          # blossoms only where the foliage is lit
        for dx, dy, k in ((0, 0, 5), (1, 0, 4), (-1, 0, 4), (0, -1, 4), (0, 1, 3)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < h and 0 <= xx < w and cm[yy, xx]:
                c[yy, xx] = P['flower_white'][k]
        if y + 2 < h and cm[y + 2, x]:
            c[y + 2, x] = P['leaf'][2]
    fr = fruit_slots(cm, rng, 16, (44, 228), (32, 200), 600)
    return finish(t, tm, c, 212, w, h, (bx, by), 18.0, gold_bark, fruit=fr, kind='life', collider=(bx - 22, by - 18, 45, 20))


def bush(seed, kind='round'):
    rng = random.Random(seed)
    w, h = 76, 62
    rmp = P['leaf'] if kind not in ('dark',) else P['leaf_dark']
    lobes = jitter([(38, 36, 30, 21), (20, 40, 15, 14), (56, 40, 15, 14), (38, 24, 19, 13)], rng, 2)
    c, cm = canopy(w, h, lobes, rmp, rng, clump=(5.0, 7.5))
    ys, xs = np.where(cm & ~px.edge(cm))
    if kind == 'flower':
        col = rng.choice(['flower_white', 'flower_pink', 'flower_yellow'])
        for _ in range(16):
            i = rng.randrange(len(xs))
            y, x = ys[i], xs[i]
            for dx, dy, k in ((0, 0, 5), (1, 0, 4), (0, 1, 3), (1, 1, 2)):
                if cm[min(h - 1, y + dy), min(w - 1, x + dx)]:
                    c[y + dy, x + dx] = P[col][k]
    if kind == 'berry':
        for _ in range(12):
            i = rng.randrange(len(xs))
            y, x = ys[i], xs[i]
            c[y, x] = P['grape'][7]
            if y + 1 < h:
                c[y + 1, x] = P['grape'][4]
    t = px.blank(w, h)
    return {'trunk': t, 'canopy': c, 'w': w, 'h': h, 'base': (38, 56), 'collider': (16, 46, 45, 12), 'fruit': [], 'kind': 'bush'}


def grapevine(seed):
    rng = random.Random(seed)
    w, h = 104, 84
    rock = px.m_ellipse(w, h, 52, 56, 38, 22)
    img = px.blank(w, h)
    px.shade(img, rock, P['stone_warm'], px.normals_ellipsoid(w, h, 48, 50, 40, 26), lo=1, hi=8, ambient=0.0)
    px.outline_inner(img, rock, P['stone_warm'][0])
    lobes = jitter([(52, 42, 36, 18), (26, 54, 16, 14), (78, 52, 18, 14)], rng, 2)
    c, cm = canopy(w, h, lobes, P['leaf'], rng, clump=(4.6, 6.6))
    fr = [(26, 50), (50, 42), (74, 50), (40, 58)]
    return {'trunk': img, 'canopy': c, 'w': w, 'h': h, 'base': (52, 76), 'collider': (18, 60, 69, 18), 'fruit': fr, 'kind': 'grape'}


TREES = {
    'oak-large-a': lambda: broadleaf(10, 'large'),
    'oak-large-b': lambda: broadleaf(31, 'large', P['leaf_dark']),
    'oak-medium-a': lambda: broadleaf(11, 'medium'),
    'oak-medium-b': lambda: broadleaf(57, 'medium', P['leaf_dark']),
    'oak-small-a': lambda: broadleaf(12, 'small'),
    'oak-small-b': lambda: broadleaf(73, 'small', P['leaf_blue']),
    'blossom': lambda: blossom(90),
    'cypress-a': lambda: cypress(5),
    'cypress-b': lambda: cypress(6),
    'fig-a': lambda: fig(21),
    'fig-b': lambda: fig(22),
    'pomegranate-a': lambda: pomegranate(41),
    'pomegranate-b': lambda: pomegranate(42),
    'olive-a': lambda: olive(61),
    'olive-b': lambda: olive(62),
    'palm-a': lambda: palm(81),
    'palm-b': lambda: palm(82),
    'forbidden-tree': forbidden_tree,
    'tree-of-life': tree_of_life,
    'bush-round': lambda: bush(1, 'round'),
    'bush-dark': lambda: bush(2, 'dark'),
    'bush-flower': lambda: bush(3, 'flower'),
    'bush-berry': lambda: bush(4, 'berry'),
    'grapevine': lambda: grapevine(7),
}


def build_trees(m: dict, save) -> None:
    out = m.setdefault('trees', {})
    for key, fn in TREES.items():
        t = fn()
        tf = save(t['trunk'], f'trees/{key}-trunk.png')
        cf = save(t['canopy'], f'trees/{key}-canopy.png')
        out[key] = {'trunk': tf, 'canopy': cf, 'width': t['w'], 'height': t['h'], 'anchorX': int(t['base'][0]), 'anchorY': int(t['base'][1]),
                    'collider': [int(v) for v in t['collider']], 'fruit': [[int(a), int(b)] for a, b in t['fruit']], 'kind': t['kind']}
        print('  tree', key, t['w'], 'x', t['h'])


if __name__ == '__main__':
    import sys
    names = sys.argv[2:] or list(TREES)
    imgs = []
    for n in names:
        t = TREES[n]()
        img = px.blank(t['w'], t['h'])
        px.over(img, t['trunk'])
        px.over(img, t['canopy'])
        imgs.append(img)
    W = sum(i.shape[1] + 8 for i in imgs)
    H = max(i.shape[0] for i in imgs)
    c = px.blank(W, H)
    x = 0
    for i in imgs:
        px.over(c, i, x, H - i.shape[0])
        x += i.shape[1] + 8
    px.preview(c, sys.argv[1], 1, (74, 114, 48, 255))


def build(m: dict, save, strip, sheet_entry) -> None:
    build_trees(m, save)
