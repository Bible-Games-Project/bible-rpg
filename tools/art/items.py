"""Small props, items, fruit, farm plot stages, effects and emotes.

Same palette, outline and lighting rules as everything else. Props are
single images anchored at their base; effects are short frame strips.
"""

from __future__ import annotations

import math
import random

import numpy as np

import pixel as px
import style as st
from style import P
from flora import canopy, jitter
from chars import fig_leaf

L = px.LIGHT


def shade(img, mask, rmp, normals, lo, hi, bias=0.0, outline=0, wrap=0.35):
    v = px.lambert(*normals, light=L, ambient=0.0, wrap=wrap)
    idx = px.quantize(v, len(rmp), lo, hi, bias)
    px.paint(img, mask, rmp, idx)
    if outline is not None:
        px.outline_inner(img, mask, rmp[outline])
    return idx


def ell(w, h, cx, cy, rx, ry):
    return px.m_ellipse(w, h, cx, cy, rx, ry)


def ell_n(w, h, cx, cy, rx, ry):
    return px.normals_ellipsoid(w, h, cx, cy, rx, ry)


# ------------------------------------------------------------------ plants

def grass_tuft(seed):
    rng = random.Random(seed)
    w, h = 18, 14
    img = px.blank(w, h)
    g = P['grass']
    for k in range(rng.randint(5, 8)):
        x0 = rng.uniform(3, 15)
        ln = rng.uniform(6, 12)
        lean = rng.uniform(-0.5, 0.5)
        for t in range(int(ln)):
            x = int(round(x0 + lean * t * t / ln))
            y = h - 1 - t
            if 0 <= x < w and 0 <= y < h:
                img[y, x] = g[min(9, 4 + t * 5 // int(ln) + (k % 2))]
    for x in range(w):
        col = np.where(img[:, x, 3] > 0)[0]
        if len(col):
            img[col.max(), x] = g[2]
    return img


def flowers(color, seed):
    rng = random.Random(seed)
    w, h = 22, 16
    img = px.blank(w, h)
    g = P['grass']
    fr = P[color]
    pts = [(rng.uniform(3, 19), rng.uniform(4, 12)) for _ in range(5)]
    for x, y in pts:
        for t in range(3):
            yy = int(y) + 1 + t
            if yy < h:
                img[yy, int(x)] = g[4 + (t == 0)]
    for x, y in pts:
        cx, cy = int(x), int(y)
        for dx, dy, k in ((0, -1, 4), (-1, 0, 3), (1, 0, 4), (0, 1, 2), (0, 0, 5)):
            if 0 <= cy + dy < h and 0 <= cx + dx < w:
                img[cy + dy, cx + dx] = fr[min(len(fr) - 1, k)]
        img[cy, cx] = P['flower_yellow'][4] if color != 'flower_yellow' else P['flower_orange'][3] if 'flower_orange' in P else fr[2]
    return img


def fern(seed, big=False):
    """Low, dense ferns: a hiding place (Genesis 3:8 sequence)."""
    rng = random.Random(seed)
    w, h = (56, 40) if big else (44, 32)
    img = px.blank(w, h)
    rmp = P['leaf']
    m = np.zeros((h, w), bool)
    fronds = 9 if big else 7
    for k in range(fronds):
        a = -math.pi / 2 + (k / (fronds - 1) - 0.5) * 2.4
        ln = rng.uniform(0.75, 1.0) * (h - 6)
        x0, y0 = w / 2, h - 2
        prev = (x0, y0)
        for s in range(1, 13):
            t = s / 12
            x = x0 + math.cos(a) * ln * t * 1.25
            y = y0 + math.sin(a) * ln * t + (ln * t) ** 2 / ln * 0.55
            seg = px.m_capsule(w, h, prev[0], prev[1], x, y, 1.0, 1.0)
            for sd in (-1, 1):
                lx = x + sd * math.cos(a + math.pi / 2) * (4.0 * (1 - t * 0.6))
                ly = y + sd * math.sin(a + math.pi / 2) * (4.0 * (1 - t * 0.6)) + 1.5
                seg |= px.m_capsule(w, h, x, y, lx, ly, 0.9, 0.6)
            v = px.lambert(*px.normals_capsules(w, h, [(prev[0], prev[1], x, y, 5, 5)])[:3], ambient=0.0)
            px.paint(img, seg & ~m, rmp, px.quantize(v, len(rmp), 3, 7 + (k % 2), -0.1))
            m |= seg
            prev = (x, y)
    px.outline_inner(img, m, rmp[0])
    return img


def reeds(seed):
    rng = random.Random(seed)
    w, h = 26, 44
    img = px.blank(w, h)
    for k in range(7):
        x0 = rng.uniform(5, 21)
        ln = rng.uniform(22, 40)
        lean = rng.uniform(-3, 3)
        for t in range(int(ln)):
            x = int(round(x0 + lean * (t / ln) ** 2))
            y = h - 1 - t
            img[y, x] = P['olive'][4 + (t > ln * 0.5) + (k % 2)]
        if k % 3 == 0:
            for t in range(5):
                y = int(h - ln + t)
                x = int(round(x0 + lean))
                img[y, x] = P['earth'][3 + (t > 2)]
                if x + 1 < w:
                    img[y, x + 1] = P['earth'][2]
    return img


def lily_pad(seed):
    rng = random.Random(seed)
    w, h = 22, 12
    img = px.blank(w, h)
    m = ell(w, h, 11, 6, 9, 4.6)
    m &= ~px.m_poly(w, h, [(11, 6), (20, 3), (20, 6)])
    shade(img, m, P['fig'], ell_n(w, h, 10, 5, 10, 6), 3, 7, outline=1)
    if rng.random() < 0.6:
        for dx, dy, k in ((0, 0, 5), (1, 0, 4), (0, -1, 5), (-1, 0, 4)):
            img[4 + dy, 8 + dx] = P['flower_pink'][k]
    return img


def mushrooms():
    w, h = 16, 12
    img = px.blank(w, h)
    for cx, cy, r in ((5, 6, 3.4), (11, 8, 2.6)):
        stem = px.m_rect(w, h, int(cx) - 1, int(cy), int(cx) + 1, h - 1)
        shade(img, stem, P['ivory'], ell_n(w, h, cx, cy + 2, 2, 4), 5, 9, outline=3)
        cap = ell(w, h, cx, cy, r, r * 0.7) & (px.grid(w, h)[1] < cy + 0.5)
        shade(img, cap, P['earth'], ell_n(w, h, cx - 1, cy - 1, r + 1, r), 3, 9, outline=1)
    return img


def grain_plant():
    """Wild grain bearing seed (gameplay prop for the farming activity)."""
    w, h = 34, 40
    img = px.blank(w, h)
    rng = random.Random(3)
    for k in range(7):
        x0 = 8 + k * 3 + rng.uniform(-1, 1)
        ln = rng.uniform(26, 36)
        lean = rng.uniform(-4, 4)
        for t in range(int(ln)):
            x = int(round(x0 + lean * (t / ln) ** 2))
            img[h - 1 - t, x] = P['olive'][5 + (t > ln * 0.6)]
        hx = int(round(x0 + lean))
        for t in range(7):
            y = int(h - ln + t)
            for dx in (-1, 0, 1):
                if (t + dx) % 2 == 0 or dx == 0:
                    img[y, hx + dx] = P['gold'][6 + (dx == 0) - (t > 4)]
            img[y, hx - 1 if t % 2 else hx + 1] = P['gold'][4]
    return img


def thistle(seed):
    rng = random.Random(seed)
    w, h = 30, 32
    img = px.blank(w, h)
    th = P['olive']
    stems = [(9, 20, -0.25), (15, 27, 0.0), (21, 17, 0.3)]
    for x0, ln, lean in stems:
        for t in range(ln):
            x = int(round(x0 + lean * t))
            img[h - 1 - t, x] = th[3 + (t % 3 == 0)]
            if t % 5 == 3:
                img[h - 1 - t, x - 1] = th[5]
                img[h - 2 - t, x + 1] = th[5]
        hx, hy = int(round(x0 + lean * ln)), h - ln
        base = ell(w, h, hx, hy + 1, 2.4, 1.8)
        shade(img, base, P['olive'], ell_n(w, h, hx - 1, hy, 3, 3), 3, 6, outline=1)
        for dx in range(-2, 3):
            for dy in range(-3, 0):
                if abs(dx) + abs(dy + 1.5) < 3:
                    img[hy + dy, hx + dx] = P['flower_purple'][4 if dy < -2 else 3 if (dx + dy) % 2 else 5]
    for sd in (-1, 1):
        for t in range(10):
            x = 15 + sd * t
            y = h - 2 - t // 3
            img[y, x] = th[4]
            if t % 2:
                img[y - 1, x] = th[6]
    return img


def thorns(seed):
    rng = random.Random(seed)
    w, h = 40, 22
    img = px.blank(w, h)
    for k in range(6):
        x, y = rng.uniform(4, 36), h - 2
        a = rng.uniform(-2.6, -0.5)
        for t in range(rng.randint(10, 18)):
            xi, yi = int(round(x)), int(round(y))
            if 0 <= xi < w and 0 <= yi < h:
                img[yi, xi] = P['bark'][3 + (t % 4 == 0)]
                if t % 4 == 2 and 0 <= yi - 1 < h:
                    img[yi - 1, min(w - 1, xi + 1)] = P['bark'][6]
            x += math.cos(a) * 1.1
            y += math.sin(a) * 1.1
            a += rng.uniform(-0.3, 0.3)
    return img


# ------------------------------------------------------------------- rocks

def rock(seed, w, h, ramp='stone', moss=False):
    rng = random.Random(seed)
    img = px.blank(w, h)
    cx, cy = w / 2, h * 0.55
    pts = []
    n = 9
    for k in range(n):
        a = k / n * math.tau
        r = rng.uniform(0.82, 1.0)
        pts.append((cx + math.cos(a) * (w / 2 - 1.5) * r, cy + math.sin(a) * (h * 0.45 - 1) * r))
    m = px.m_poly(w, h, pts)
    m &= px.grid(w, h)[1] < h - 1
    n_ = px.normals_dome(m)
    # facets: blend in a few plane normals so the rock reads as chiselled
    facets = []
    for _ in range(4):
        fx, fy = rng.uniform(-0.6, 0.6), rng.uniform(-0.8, 0.1)
        fz = math.sqrt(max(0.1, 1 - fx * fx - fy * fy))
        px_, py_ = rng.uniform(0, w), rng.uniform(0, h)
        facets.append((fx, fy, fz, px_, py_))
    xs, ys = px.grid(w, h)
    nx, ny, nz = [a.copy() for a in n_]
    for fx, fy, fz, px_, py_ in facets:
        sel = ((xs - px_) ** 2 + (ys - py_) ** 2) < (w * 0.3) ** 2
        nx = np.where(sel & m, nx * 0.4 + fx * 0.6, nx)
        ny = np.where(sel & m, ny * 0.4 + fy * 0.6, ny)
        nz = np.where(sel & m, nz * 0.4 + fz * 0.6, nz)
    nn = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2) + 1e-6
    rmp = P[ramp]
    shade(img, m, rmp, (nx / nn, ny / nn, nz / nn), 2, len(rmp) - 2, outline=0)
    if moss:
        for y, x in zip(*np.where(m & (ny / nn < -0.35) & ~px.edge(m))):
            if (x * 3 + y) % 4:
                img[y, x] = P['leaf'][5 + ((x + y) % 2)]
    for x in range(w):
        col = np.where(m[:, x])[0]
        if len(col):
            img[col.max(), x] = rmp[0]
    return img


def stepping_stone(seed):
    img = rock(seed, 30, 16, 'stone_warm')
    # wet lower rim
    for x in range(30):
        col = np.where(img[:, x, 3] > 0)[0]
        if len(col):
            img[col.max() - 1, x] = P['stone_warm'][1]
    return img


def log_prop():
    w, h = 84, 28
    img = px.blank(w, h)
    m = px.m_capsule(w, h, 8, 16, 76, 14, 8, 7)
    nx, ny, nz, _ = px.normals_capsules(w, h, [(8, 16, 76, 14, 8, 7)])
    shade(img, m, P['bark'], (nx, ny, nz), 1, 8, outline=0)
    for x in range(10, 74, 5):
        for t in range(3):
            y = 11 + t + (x % 3)
            if m[y, x]:
                img[y, x] = P['bark'][2]
    end = ell(w, h, 77, 14, 4.6, 7)
    shade(img, end, P['earth'], ell_n(w, h, 76, 13, 5, 8), 5, 9, outline=2)
    img[14, 77] = P['earth'][4]
    for y, x in zip(*np.where(m & (ny < -0.6) & ~px.edge(m))):
        if (x // 3) % 3 == 0:
            img[y, x] = P['leaf'][6]
    return img


def flat_stone():
    w, h = 46, 22
    img = rock(91, w, h, 'stone_warm')
    return img


# --------------------------------------------------------------- farm plot

def soil(state):
    """32x32 plot tile: grass (marked), tilled, seeded, watered."""
    T = 32
    img = px.blank(T, T)
    rng = random.Random(4)
    if state == 'marked':
        m = ell(T, T, 16, 17, 14, 11)
        for y, x in zip(*np.where(px.edge(m))):
            if (x + y) % 3:
                img[y, x] = P['earth'][4]
        return img
    m = ell(T, T, 16, 17, 14.5, 11.5)
    soil_r = P['soil']
    wet = state in ('watered',)
    lo, hi = (1, 4) if wet else (2, 6)
    shade(img, m, soil_r, ell_n(T, T, 15, 15, 16, 13), lo, hi, outline=0)
    # furrows
    for row in (11, 16, 21):
        for x in range(4, 29):
            if m[row, x]:
                img[row, x] = soil_r[max(0, lo - 1)]
                if m[row - 1, x]:
                    img[row - 1, x] = soil_r[min(6, hi)]
    for _ in range(10):
        x, y = rng.randrange(5, 27), rng.randrange(8, 26)
        if m[y, x]:
            img[y, x] = P['stone_warm'][6]
    if state in ('seeded', 'watered'):
        for row in (11, 16, 21):
            for x in range(8, 26, 5):
                if m[row - 1, x]:
                    img[row - 1, x] = P['gold'][6]
    if wet:
        for _ in range(5):
            x, y = rng.randrange(6, 26), rng.randrange(9, 24)
            if m[y, x]:
                img[y, x] = P['water'][7]
    return img


def plant(stage):
    """Growth stages of the planted crop (a leafy squash-like plant)."""
    w, h = 32, 34
    img = px.blank(w, h)
    rmp = P['leaf']
    if stage == 'sprout':
        for x0 in (11, 16, 21):
            img[h - 2, x0] = rmp[3]
            img[h - 3, x0] = rmp[5]
            img[h - 4, x0 - 1] = rmp[7]
            img[h - 4, x0 + 1] = rmp[6]
        return img
    if stage == 'young':
        for x0 in (10, 16, 22):
            for t in range(6):
                img[h - 2 - t, x0] = rmp[4]
            for sd in (-1, 1):
                m = ell(w, h, x0 + sd * 3, h - 8, 3, 2)
                shade(img, m, rmp, ell_n(w, h, x0 + sd * 3 - 1, h - 9, 3, 3), 3, 7, outline=1)
        return img
    lobes = [(16, 20, 13, 9), (8, 24, 7, 6), (24, 24, 7, 6)]
    c, cm = canopy(w, h, lobes, rmp, random.Random(9), clump=(3.0, 4.4), tips=False)
    px.over(img, c)
    for (x, y) in ((9, 18), (20, 15), (24, 22), (14, 25)):
        for dx, dy, k in ((0, 0, 5), (1, 0, 4), (0, 1, 3), (-1, 0, 4), (0, -1, 5)):
            img[y + dy, x + dx] = P['flower_yellow'][k]
    for x, y in ((12, 28), (19, 27)):
        m = ell(w, h, x, y, 3.4, 2.6)
        shade(img, m, P['gold'], ell_n(w, h, x - 1, y - 1, 4, 3), 4, 8, outline=2)
    return img


# --------------------------------------------------------------- items

def digging_stick():
    w, h = 40, 14
    img = px.blank(w, h)
    m = px.m_capsule(w, h, 3, 10, 36, 5, 1.8, 1.6)
    nx, ny, nz, _ = px.normals_capsules(w, h, [(3, 10, 36, 5, 1.8, 1.6)])
    shade(img, m, P['bark'], (nx, ny, nz), 3, 9, outline=0)
    tip = px.m_poly(w, h, [(33, 3), (39, 4), (34, 8)])
    shade(img, tip, P['bark'], ell_n(w, h, 35, 4, 4, 3), 5, 9, outline=1)
    return img


def gourd(full=False):
    w, h = 16, 22
    img = px.blank(w, h)
    m = ell(w, h, 8, 14, 6.4, 6.6) | ell(w, h, 8, 6, 3.6, 4)
    shade(img, m, P['camel'], ell_n(w, h, 6, 11, 8, 10), 2, 9, outline=0)
    for y in (2, 3):
        img[y, 7] = P['bark'][4]
        img[y, 8] = P['bark'][3]
    if full:
        img[4, 8] = P['water'][9]
        img[5, 8] = P['water'][7]
    return img


def basket(full=0):
    w, h = 26, 22
    img = px.blank(w, h)
    body = px.m_poly(w, h, [(2, 9), (24, 9), (21, 20), (5, 20)])
    shade(img, body, P['rope'], ell_n(w, h, 11, 12, 14, 10), 1, 5, outline=0)
    for y in range(10, 20, 3):
        for x in range(3, 23):
            if body[y, x]:
                img[y, x] = P['rope'][1]
    for x in range(4, 23, 4):
        for y in range(10, 20):
            if body[y, x] and y % 3:
                img[y, x] = P['rope'][2]
    handle = np.zeros((h, w), bool)
    for t in np.linspace(0, math.pi, 30):
        handle |= ell(w, h, 13 + math.cos(t) * 10, 9 - math.sin(t) * 7, 1.1, 1.1)
    handle &= ~body
    shade(img, handle, P['rope'], ell_n(w, h, 12, 3, 12, 8), 2, 5, outline=0)
    if full:
        for (x, y, r) in ((8, 8, 3.2), (14, 7, 3.4), (19, 8, 3.0)):
            fm = ell(w, h, x, y, r, r)
            shade(img, fm, [P['pomegranate'], P['fig_fruit'], P['date']][(x // 6) % 3], ell_n(w, h, x - 1, y - 1, r + 1, r + 1), 3, 8, outline=1)
    return img


def fruit(kind):
    if kind == 'fig':
        w, h = 10, 11
        img = px.blank(w, h)
        m = ell(w, h, 5, 6.5, 4, 4) | px.m_poly(w, h, [(4, 1), (6, 1), (7, 4), (3, 4)])
        shade(img, m, P['fig_fruit'], ell_n(w, h, 4, 5, 5, 6), 2, 7, outline=0)
        img[1, 5] = P['leaf'][3]
        return img
    if kind == 'pomegranate':
        w, h = 12, 13
        img = px.blank(w, h)
        m = ell(w, h, 6, 7, 5, 5)
        shade(img, m, P['pomegranate'], ell_n(w, h, 5, 6, 6, 6), 2, 9, outline=0)
        for x in (5, 6, 7):
            img[2, x] = P['pomegranate'][3]
        img[1, 5] = P['pomegranate'][2]
        img[1, 7] = P['pomegranate'][2]
        return img
    if kind == 'dates':
        w, h = 12, 14
        img = px.blank(w, h)
        for (x, y) in ((4, 4), (8, 4), (3, 8), (6, 7), (9, 8), (5, 11), (8, 11)):
            m = ell(w, h, x, y, 1.8, 2.4)
            shade(img, m, P['date'], ell_n(w, h, x - 0.5, y - 1, 2.4, 3), 2, 8, outline=0)
        for y in range(0, 3):
            img[y, 6] = P['olive'][5]
        return img
    if kind == 'grapes':
        w, h = 12, 15
        img = px.blank(w, h)
        for (x, y) in ((3, 4), (6, 4), (9, 4), (4.5, 7), (7.5, 7), (3, 10), (6, 10), (9, 10), (6, 13), (4.5, 12.4)):
            m = ell(w, h, x, y, 1.9, 1.9)
            shade(img, m, P['grape'], ell_n(w, h, x - 0.6, y - 0.6, 2.4, 2.4), 2, 8, outline=0)
        img[0, 6] = P['olive'][4]
        img[1, 6] = P['olive'][5]
        img[1, 7] = P['leaf'][6]
        return img
    if kind == 'forbidden':
        w, h = 12, 13
        img = px.blank(w, h)
        m = ell(w, h, 6, 7.5, 5, 5)
        shade(img, m, P['forbidden'], ell_n(w, h, 4.6, 6, 6, 6), 2, 11, outline=0)
        img[2, 6] = P['bark'][3]
        img[1, 6] = P['bark'][2]
        img[2, 7] = P['leaf'][6]
        img[2, 8] = P['leaf'][5]
        return img
    if kind == 'life':
        w, h = 11, 12
        img = px.blank(w, h)
        m = ell(w, h, 5.5, 7, 4.2, 4.4)
        shade(img, m, P['gold'], ell_n(w, h, 4, 5.6, 5, 5), 3, 10, outline=1)
        img[2, 5] = P['leaf'][4]
        img[1, 6] = P['leaf'][6]
        return img
    raise KeyError(kind)


def fig_leaf_icon():
    w, h = 18, 20
    img = px.blank(w, h)
    fig_leaf(img, 9, 1, 9.5, 0.0)
    return img


def seeds_icon():
    w, h = 18, 16
    img = px.blank(w, h)
    pouch = ell(w, h, 9, 10, 6.6, 5.4) | px.m_poly(w, h, [(6, 4), (12, 4), (11, 7), (7, 7)])
    shade(img, pouch, P['tunic'], ell_n(w, h, 7, 8, 8, 7), 2, 9, outline=1)
    for x in range(6, 13):
        img[6, x] = P['rope'][3]
    for (x, y) in ((8, 3), (10, 2), (9, 1)):
        img[y, x] = P['gold'][7]
    return img


def water_icon():
    w, h = 16, 18
    img = px.blank(w, h)
    m = px.m_poly(w, h, [(8, 1), (13, 10), (12, 14), (8, 16), (4, 14), (3, 10)])
    shade(img, m, P['water'], ell_n(w, h, 6, 9, 7, 9), 4, 11, outline=2)
    return img


# --------------------------------------------------------------- effects

def stepped_glow(w, h, color, alphas, cx=None, cy=None):
    img = px.blank(w, h)
    cx = w / 2 if cx is None else cx
    cy = h / 2 if cy is None else cy
    for i, a in enumerate(alphas):
        s = 1 - i / len(alphas)
        m = ell(w, h, cx, cy, w / 2 * s, h / 2 * s)
        img[m] = (*color, a)
    return img


def sparkle_frames():
    frames = []
    for k in range(4):
        w, h = 11, 11
        img = px.blank(w, h)
        r = [1, 3, 4, 2][k]
        c = P['gold'][10]
        c2 = P['gold'][8]
        for d in range(-r, r + 1):
            img[5, 5 + d] = c if abs(d) < r else c2
            img[5 + d, 5] = c if abs(d) < r else c2
        if k == 2:
            for d in (-1, 1):
                img[5 + d, 5 + d] = c2
                img[5 + d, 5 - d] = c2
        frames.append(img)
    return frames


def mist_puff():
    return stepped_glow(48, 22, (230, 238, 236), [26, 40, 54])


def splash_frames():
    frames = []
    for k in range(3):
        w, h = 22, 14
        img = px.blank(w, h)
        r = 3 + k * 3
        m = ell(w, h, 11, 9, r, r * 0.45) & ~ell(w, h, 11, 9, r - 1.6, r * 0.45 - 1.0)
        img[m] = P['water'][10 - k]
        if k < 2:
            for (x, y) in ((8, 5 - k * 2), (14, 4 - k * 2), (11, 2)):
                if 0 <= y < h:
                    img[y, x] = P['water'][11]
        frames.append(img)
    return frames


def leaf_frames():
    frames = []
    for k in range(2):
        w, h = 7, 7
        img = px.blank(w, h)
        pts = [(1, 3), (3, 1), (5, 3), (3, 5)] if k == 0 else [(1, 2), (5, 1), (5, 4), (2, 5)]
        m = px.m_poly(w, h, pts)
        img[m] = P['leaf'][6]
        px.outline_inner(img, m, P['leaf'][3])
        frames.append(img)
    return frames


def firefly():
    img = stepped_glow(9, 9, (250, 236, 150), [40, 90, 200])
    img[4, 4] = (255, 250, 210, 255)
    return img


def shadow(w, h):
    return stepped_glow(w, h, (8, 20, 10), [60, 80])


def god_glow():
    """Stepped golden aura (drawn additively behind God)."""
    return stepped_glow(176, 216, (250, 214, 130), [16, 22, 30, 40, 52], cy=104)


def god_rays():
    w, h = 220, 240
    img = px.blank(w, h)
    cx, cy = w / 2, h * 0.42
    xs, ys = px.grid(w, h)
    ang = np.arctan2(ys - cy, xs - cx)
    r = np.hypot((xs - cx) / (w / 2), (ys - cy) / (h / 2))
    for k in range(14):
        a0 = k * math.tau / 14
        d = np.abs((ang - a0 + math.pi) % math.tau - math.pi)
        m = (d < 0.05 + 0.02 * (k % 2)) & (r < 0.96) & (r > 0.28)
        band = np.clip(((1 - r) * 4).astype(int), 0, 3)
        alpha = np.array([18, 30, 42, 56])[band]
        img[m] = np.stack([np.full(m.sum(), 255), np.full(m.sum(), 238), np.full(m.sum(), 190), alpha[m]], axis=1).astype(np.uint8)
    return img


def emote(kind):
    w, h = 18, 20
    img = px.blank(w, h)
    bub = px.m_poly(w, h, [(2, 2), (16, 2), (16, 14), (11, 14), (9, 18), (8, 14), (2, 14)])
    img[bub] = P['ivory'][10]
    px.outline_inner(img, bub, P['hair'][1])
    ink = P['hair'][1]
    if kind == 'exclaim':
        for y in range(4, 10):
            img[y, 9] = ink
            img[y, 8] = ink
        img[11, 8] = ink
        img[11, 9] = ink
    elif kind == 'question':
        for (x, y) in ((7, 5), (8, 4), (9, 4), (10, 4), (11, 5), (11, 6), (10, 7), (9, 8), (9, 9), (9, 11)):
            img[y, x] = ink
    elif kind == 'dots':
        for x in (5, 9, 13):
            img[8, x] = ink
            img[8, x - 1] = ink
    elif kind == 'heart':
        hm = ell(w, h, 7, 7, 2.6, 2.4) | ell(w, h, 11, 7, 2.6, 2.4) | px.m_poly(w, h, [(4.6, 8), (13.4, 8), (9, 13)])
        img[hm] = P['flower_red'][4]
    elif kind == 'drop':
        dm = px.m_poly(w, h, [(9, 3), (12, 8), (11, 11), (9, 12), (7, 11), (6, 8)])
        img[dm] = P['water'][8]
        px.outline_inner(img, dm, P['water'][4])
    return img


def marker_frames():
    """Small golden arrow that bobs above the current objective."""
    frames = []
    for k in range(4):
        w, h = 18, 20
        img = px.blank(w, h)
        oy = [0, 1, 2, 1][k]
        m = px.m_poly(w, h, [(3, 3 + oy), (15, 3 + oy), (15, 7 + oy), (9, 15 + oy), (3, 7 + oy)])
        shade(img, m, P['gold'], ell_n(w, h, 7, 5 + oy, 9, 9), 4, 10, outline=1)
        frames.append(img)
    return frames


# ------------------------------------------------------------------- build

def build(m: dict, save, strip, sheet_entry) -> None:
    sp = m.setdefault('sprites', {})

    def single(key, img, ax=0.5, ay=1.0):
        f = save(img, f'props/{key}.png')
        h, w = img.shape[:2]
        sp[key] = sheet_entry(f, [img], (int(w * ax), int((h - 1) * ay)))

    def frames(key, fr, ax=0.5, ay=1.0, **extra):
        f = save(strip(fr), f'props/{key}.png')
        h, w = fr[0].shape[:2]
        sp[key] = sheet_entry(f, fr, (int(w * ax), int((h - 1) * ay)), **extra)

    for i in range(3):
        single(f'grass-tuft-{i}', grass_tuft(i))
    for c in ('white', 'yellow', 'red', 'blue', 'pink', 'purple'):
        single(f'flowers-{c}', flowers(f'flower_{c}', hash(c) % 100))
    single('fern-a', fern(1))
    single('fern-b', fern(2, big=True))
    single('reeds', reeds(3))
    single('lily-pad', lily_pad(4), ay=0.5)
    single('mushrooms', mushrooms())
    single('grain-plant', grain_plant())
    single('thistle', thistle(5))
    single('thorns', thorns(6))
    single('rock-small', rock(11, 20, 13))
    single('rock-medium', rock(12, 40, 28))
    single('rock-large', rock(13, 70, 48, 'stone_warm'))
    single('rock-mossy', rock(14, 54, 38, 'stone', moss=True))
    single('stepping-stone', stepping_stone(15), ay=0.5)
    single('log', log_prop())
    single('flat-stone', flat_stone())
    for s in ('marked', 'tilled', 'seeded', 'watered'):
        single(f'soil-{s}', soil(s), ay=0.5)
    for s in ('sprout', 'young', 'grown'):
        single(f'plant-{s}', plant(s))
    single('digging-stick', digging_stick(), ay=0.85)
    single('gourd', gourd())
    single('gourd-full', gourd(True))
    single('basket', basket())
    single('basket-full', basket(3))
    for k in ('fig', 'pomegranate', 'dates', 'grapes', 'forbidden', 'life'):
        single(f'fruit-{k}', fruit(k), ay=0.15)
    single('fig-leaf', fig_leaf_icon())
    single('seeds', seeds_icon())
    single('water-drop', water_icon())
    frames('fx-sparkle', sparkle_frames(), ay=0.5)
    single('fx-mist', mist_puff(), ay=0.5)
    frames('fx-splash', splash_frames(), ay=0.7)
    frames('fx-leaf', leaf_frames(), ay=0.5)
    single('fx-firefly', firefly(), ay=0.5)
    single('shadow-small', shadow(26, 9), ay=0.5)
    single('shadow-medium', shadow(46, 14), ay=0.5)
    single('shadow-large', shadow(90, 24), ay=0.5)
    single('god-glow', god_glow(), ay=0.82)
    single('god-rays', god_rays(), ay=0.62)
    for e in ('exclaim', 'question', 'dots', 'heart', 'drop'):
        single(f'emote-{e}', emote(e))
    frames('marker', marker_frames())
    print('  props:', len(sp))


if __name__ == '__main__':
    import sys
    imgs = [grass_tuft(0), flowers('flower_white', 1), flowers('flower_red', 2), fern(1), fern(2, True), reeds(3), lily_pad(4), mushrooms(),
            grain_plant(), thistle(5), thorns(6), rock(11, 20, 13), rock(12, 40, 28), rock(13, 70, 48, 'stone_warm'), rock(14, 54, 38, 'stone', True),
            stepping_stone(15), log_prop(), soil('marked'), soil('tilled'), soil('seeded'), soil('watered'), plant('sprout'), plant('young'),
            plant('grown'), digging_stick(), gourd(), basket(), basket(3), fruit('fig'), fruit('pomegranate'), fruit('dates'), fruit('grapes'),
            fruit('forbidden'), fruit('life'), fig_leaf_icon(), seeds_icon(), water_icon(), emote('exclaim'), emote('question'), marker_frames()[0]]
    W = sum(i.shape[1] + 4 for i in imgs[:20])
    rows = [imgs[:20], imgs[20:]]
    H = sum(max(i.shape[0] for i in r) + 4 for r in rows)
    c = px.blank(max(W, sum(i.shape[1] + 4 for i in imgs[20:])), H)
    y = 0
    for r in rows:
        x = 0
        rh = max(i.shape[0] for i in r)
        for i in r:
            px.over(c, i, x, y + rh - i.shape[0])
            x += i.shape[1] + 4
        y += rh + 4
    px.preview(c, sys.argv[1], 3, (74, 114, 48, 255))
