"""Dialogue portraits (64 x 66 art pixels, the scale of the supplied
Adam portrait). Eve's and God's portraits are edits of the supplied Adam
portrait so every face shares its drawing style; the serpent is drawn with
the same palette and outline rules.

Each portrait also gets animation overlays (mouth open, eyes half closed,
eyes closed) cut to the smallest rectangle that changes.
"""

from __future__ import annotations

import math
import os
import random

import numpy as np
from PIL import Image

import pixel as px
import style as st
from style import P
from chars import ref_leaf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
W, H = 64, 66
LIGHT = np.array([-0.38, -0.48, 0.79])
LIGHT = LIGHT / np.linalg.norm(LIGHT)


def load_adam() -> np.ndarray:
    return st.snap(np.array(Image.open(os.path.join(ROOT, 'art', 'derived', 'adam-portrait.png')).convert('RGBA')), 'skin', 'hair', 'eye')


def recolor(img: np.ndarray, src: str, dst: str) -> np.ndarray:
    out = img.copy()
    lk = px.ramp_lookup(P[src])
    for y in range(img.shape[0]):
        for x in range(img.shape[1]):
            if img[y, x, 3]:
                i = lk.get(tuple(img[y, x, :3]))
                if i is not None:
                    out[y, x] = P[dst][min(i, len(P[dst]) - 1)]
    return out


def shade(img, mask, rmp, normals, lo, hi, bias=0.0, wrap=0.35, light=LIGHT):
    v = px.lambert(*normals, light=light, ambient=0.0, wrap=wrap)
    idx = px.quantize(v, len(rmp), lo, hi, bias)
    px.paint(img, mask, rmp, idx)
    return idx


def put(img, x, y, c):
    if 0 <= x < img.shape[1] and 0 <= y < img.shape[0]:
        img[y, x] = c


def hair_patches(src: np.ndarray, hair_ramp: str) -> np.ndarray:
    """Hair-only texture from a portrait (the curls on top of the head)."""
    lk = px.ramp_lookup(P[hair_ramp])
    region = src[0:20, 14:50].copy()
    for y in range(region.shape[0]):
        for x in range(region.shape[1]):
            if not region[y, x, 3] or tuple(region[y, x, :3]) not in lk:
                region[y, x] = (0, 0, 0, 0)
    return region


def fill_hair(img: np.ndarray, mask: np.ndarray, tex: np.ndarray, rmp, rng: random.Random, flow: float = 0.0,
              light=LIGHT, base_shift: int = 0, outline_ok: np.ndarray | None = None) -> None:
    """Patch-based curl texture inside mask, re-lit by the mass volume.
    flow > 0 stretches the patches vertically (long, falling hair)."""
    th, tw = tex.shape[:2]
    Pp = 5
    lk = px.ramp_lookup(rmp)
    layer = np.zeros_like(img)
    ys, xs = np.where(mask)
    step_y = Pp - 1 + int(flow)
    for y0 in range(ys.min() - 2, ys.max() + 1, step_y):
        for x0 in range(xs.min() - 2, xs.max() + 1, Pp - 1):
            for _ in range(20):
                sx, sy = rng.randrange(0, tw - Pp), rng.randrange(0, th - Pp)
                patch = tex[sy:sy + Pp, sx:sx + Pp]
                if (patch[:, :, 3] > 0).mean() > 0.95:
                    break
            for dy in range(step_y):
                for dx in range(Pp):
                    y, x = y0 + dy, x0 + dx
                    py = min(Pp - 1, int(dy * Pp / step_y))
                    if 0 <= y < img.shape[0] and 0 <= x < img.shape[1] and mask[y, x] and patch[py, dx, 3]:
                        layer[y, x] = patch[py, dx]
    n = px.normals_dome(mask)
    v = px.lambert(*n, light=light, ambient=0.0, wrap=0.3)
    for y, x in zip(ys, xs):
        k = lk.get(tuple(layer[y, x, :3]), 2) if layer[y, x, 3] else 2
        k = int(np.clip(k + round((v[y, x] - 0.5) * 4) + base_shift, 0, len(rmp) - 1))
        img[y, x] = rmp[k]
    # outline only against the background (not where the mass meets other hair/skin)
    hh, ww = mask.shape
    for y, x in zip(*np.where(px.edge(mask))):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if not (0 <= yy < hh and 0 <= xx < ww) or (not mask[yy, xx] and not img[yy, xx, 3] and not (outline_ok is not None and not outline_ok[yy, xx])):
                img[y, x] = rmp[0]
                break


def fill_strands(img: np.ndarray, mask: np.ndarray, rmp, lo: int, hi: int, light=LIGHT, freq: float = 1.05,
                 wave: float = 0.28, seed: float = 0.0, outline: int = 2) -> None:
    """Flowing hair/beard: wavy vertical strands lit by the volume of the
    whole mass. Strand edges get a darker line so the locks read clearly."""
    hh, ww = mask.shape
    xs, ys = px.grid(ww, hh)
    n = px.normals_dome(mask)
    vol = px.lambert(*n, light=light, ambient=0.0, wrap=0.3)
    phase = (xs + 2.2 * np.sin(ys * wave + xs * 0.15 + seed)) * freq
    strand = np.sin(phase)
    t = vol * 0.75 + (strand * 0.5 + 0.5) * 0.25
    idx = np.clip(np.floor(t * (hi - lo + 1)) + lo, lo, hi).astype(int)
    idx = np.where(strand < -0.82, np.maximum(lo, idx - 2), idx)
    for y, x in zip(*np.where(mask)):
        img[y, x] = rmp[idx[y, x]]
    for y, x in zip(*np.where(px.edge(mask))):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if not (0 <= yy < hh and 0 <= xx < ww) or (not mask[yy, xx] and not img[yy, xx, 3]):
                img[y, x] = rmp[outline]
                break


# ---------------------------------------------------------------------------
# Eve
# ---------------------------------------------------------------------------

def continue_shading(img: np.ndarray, mask: np.ndarray, rmp, normals, ref_row: int, lo: int, hi: int, fade: float = 10.0) -> None:
    """Shade `mask` with `normals`, then shift each column so its first row
    matches the existing tones on `ref_row` (seamless continuation)."""
    lk = px.ramp_lookup(rmp)
    v = px.lambert(*normals, light=LIGHT, ambient=0.0, wrap=0.35)
    idx = px.quantize(v, len(rmp), lo, hi, 0.0)
    for x in range(img.shape[1]):
        col = np.where(mask[:, x])[0]
        if len(col) == 0:
            continue
        ref = lk.get(tuple(img[ref_row, x, :3])) if img[ref_row, x, 3] else None
        off = 0 if ref is None else ref - idx[col.min(), x]
        for y in col:
            k = idx[y, x] + off * max(0.0, 1 - (y - col.min()) / fade)
            img[y, x] = rmp[int(np.clip(round(k), lo, hi))]


def eve_portrait() -> np.ndarray:
    rng = random.Random(12)
    adam = load_adam()
    img = recolor(recolor(adam, 'skin', 'skin_eve'), 'hair', 'hair_eve')
    skin = P['skin_eve']
    hair = P['hair_eve']
    tex = hair_patches(img, 'hair_eve')
    xs, ys = px.grid(W, H)
    hl_lk = px.ramp_lookup(hair)

    # 1. shoulders and upper chest: smooth, softer forms
    body = (img[:, :, 3] > 0) & (ys >= 47)
    sh = px.blank(W, H)
    shade(sh, body, skin, px.normals_ellipsoid(W, H, 31.0, 63.0, 33.0, 19.0), lo=4, hi=11, bias=-0.03)
    for x in range(21, 29):
        put(sh, x, 52 + (1 if x > 25 else 0), skin[7])
    for x in range(35, 43):
        put(sh, x, 52 + (1 if x < 38 else 0), skin[6])
    img[body] = sh[body]

    # 2. lower face
    jaw_pts = [(19.6, 29.6), (44.4, 29.6), (43.4, 33.8), (41.0, 37.6), (37.8, 40.8), (34.4, 42.8), (31.6, 43.6),
               (28.8, 42.8), (25.4, 40.8), (22.4, 37.6), (20.4, 33.8)]
    jaw = px.m_poly(W, H, jaw_pts)
    neck = px.m_poly(W, H, [(26.4, 38.0), (37.6, 38.0), (38.6, 49.0), (25.4, 49.0)])
    clear = (ys >= 30) & (ys <= 50) & (xs >= 14) & (xs <= 50) & ~body
    img[clear] = (0, 0, 0, 0)
    nl = px.blank(W, H)
    shade(nl, neck, skin, px.normals_ellipsoid(W, H, 30.0, 47.0, 9.0, 12.0), lo=3, hi=8, bias=-0.04)
    for y in range(42, 46):
        for x in range(25, 39):
            if neck[y, x]:
                nl[y, x] = skin[3 if y < 44 else 4]
    img[neck & clear] = nl[neck & clear]
    for y, x in zip(*np.where(px.edge(neck) & ~jaw & (ys < 47))):
        img[y, x] = skin[2]
    face_mask = jaw & (ys >= 30)
    continue_shading(img, face_mask, skin, px.normals_ellipsoid(W, H, 30.4, 25.0, 15.0, 19.5), 29, 3, 11)
    for y, x in zip(*np.where(px.edge(jaw) & (ys >= 31))):
        img[y, x] = skin[1] if x >= 31 else skin[3]
    # nose base: tip highlight, nostrils, philtrum
    for x, y, c in ((30, 31, 10), (31, 31, 11), (32, 31, 9), (29, 32, 5), (30, 32, 7), (31, 32, 6), (32, 32, 6), (33, 32, 4),
                    (31, 33, 7), (32, 33, 6)):
        put(img, x, y, skin[c])
    # lips
    lips = P['lips']
    upper = [(28, 1), (29, 1), (30, 0), (31, 0), (32, 0), (33, 0), (34, 1), (35, 1)]
    for x, c in upper:
        put(img, x, 35, lips[c])
    for x, c in ((29, 2), (30, 3), (31, 3), (32, 2), (33, 2), (34, 1)):
        put(img, x, 36, lips[c])
    for x in (30, 31, 32, 33):
        put(img, x, 37, skin[5])
    put(img, 27, 35, skin[5])
    put(img, 36, 35, skin[4])
    # chin
    for x, y, c in ((30, 40, 10), (31, 40, 10), (32, 40, 9), (31, 41, 8)):
        put(img, x, y, skin[c])

    # 3. thinner, arched brows
    for y in (20, 21, 22):
        for x in range(19, 44):
            if img[y, x, 3] and (tuple(img[y, x, :3]) in hl_lk or px.ramp_lookup(skin).get(tuple(img[y, x, :3]), 9) <= 4) and 15 <= y:
                if 20 <= x <= 28 or 34 <= x <= 43:
                    img[y, x] = skin[9] if x < 31 else skin[8]
    for x, y in ((21, 21), (22, 20), (23, 20), (24, 20), (25, 20), (26, 20), (27, 21)):
        put(img, x, y, hair[3] if x < 26 else hair[2])
    for x, y in ((35, 21), (36, 20), (37, 20), (38, 20), (39, 20), (40, 20), (41, 21)):
        put(img, x, y, hair[2] if x < 39 else hair[3])
    for x in range(22, 28):
        put(img, x, 22, skin[8])
    for x in range(35, 42):
        put(img, x, 22, skin[7])
    # lashes at the outer corners
    put(img, 21, 23, hair[0])
    put(img, 42, 23, hair[0])

    # 4. long hair from the temples, falling over the shoulders, wavy edges
    def lock(sign: int) -> np.ndarray:
        pts = []
        for y in range(14, 67, 2):
            t = (y - 14) / 52
            inner = 20.6 + (1.6 if 26 <= y <= 31 else 0) + max(0, (y - 31) * 0.22) - max(0, (y - 46) * 0.5)
            inner = min(inner, 25.0)
            outer = 8.0 - t * 3.0 + math.sin(y * 0.55) * 1.3
            pts.append((inner, y))
        pts2 = []
        for y in range(66, 13, -2):
            t = (y - 14) / 52
            outer = 9.5 - t * 4.0 + math.sin(y * 0.55) * 1.3
            pts2.append((outer, y))
        poly = pts + pts2
        if sign > 0:
            poly = [(63 - x, y) for x, y in poly]
        return px.m_poly(W, H, poly)
    long_hair = (lock(-1) | lock(1)) & ~face_mask & ~((ys < 30) & (xs > 21) & (xs < 43))
    hl = img.copy()
    hl[long_hair] = (0, 0, 0, 0)
    fill_hair(hl, long_hair, tex, hair, rng, flow=2.0)
    img[long_hair] = hl[long_hair]

    # 5. modest leaf garment across the chest
    garment = px.blank(W, H)
    for x, ang, y in ((17.0, 0.6, 54.0), (22.5, 0.32, 52.5), (28.0, 0.12, 52.0), (33.5, -0.05, 52.0), (39.0, -0.22, 52.5), (44.5, -0.42, 53.0), (49.0, -0.62, 54.5)):
        ref_leaf(garment, x, y, ang, 15.0, 5.6, shift=-1, light=LIGHT)
    for x, ang in ((20.0, 0.3), (26.0, 0.12), (32.0, 0.0), (38.0, -0.14), (44.0, -0.32)):
        ref_leaf(garment, x, 56.5, ang, 12.5, 5.6, shift=0, light=LIGHT)
    gm = garment[:, :, 3] > 0
    img[gm] = garment[gm]
    return st.denoise(img)


# ---------------------------------------------------------------------------
# God (artistic representation: a luminous, serene human figure)
# ---------------------------------------------------------------------------

def god_portrait() -> np.ndarray:
    adam = load_adam()
    xs, ys = px.grid(W, H)
    iv = P['ivory']
    gold = P['gold']
    sk_lk = px.ramp_lookup(P['skin'])
    hair_lk = px.ramp_lookup(P['hair'])
    eye_zone = (ys >= 23) & (ys <= 26) & (((xs >= 21) & (xs <= 28)) | ((xs >= 34) & (xs <= 42)))
    img = adam.copy()
    for y in range(H):
        for x in range(W):
            if not img[y, x, 3]:
                continue
            k = tuple(img[y, x, :3])
            if k in sk_lk:
                img[y, x] = P['skin'][min(12, sk_lk[k] + 2)]
            elif k in hair_lk and not eye_zone[y, x]:
                img[y, x] = iv[[2, 3, 3, 4, 5, 6, 7, 8, 9, 9][hair_lk[k]]]
    # white brows
    for y in (21, 22):
        for x in list(range(20, 28)) + list(range(35, 43)):
            k = tuple(adam[y, x, :3])
            if k in hair_lk or sk_lk.get(k, 9) <= 4:
                img[y, x] = iv[6 if y == 21 else 4]
    # top hair: re-light the recoloured curls with stronger contrast
    top = (ys < 22) & np.array([[tuple(img[y, x, :3]) in px.ramp_lookup(iv) for x in range(W)] for y in range(H)]) & (img[:, :, 3] > 0)
    n = px.normals_dome(top)
    vol = px.lambert(*n, light=LIGHT, ambient=0.0, wrap=0.3)
    ivl = px.ramp_lookup(iv)
    for y, x in zip(*np.where(top)):
        k = ivl[tuple(img[y, x, :3])]
        img[y, x] = iv[int(np.clip(k + round((vol[y, x] - 0.6) * 5), 2, 10))]
    # robe
    body = (adam[:, :, 3] > 0) & (ys >= 45)
    robe = px.blank(W, H)
    shade(robe, body, iv, px.normals_ellipsoid(W, H, 29.0, 66.0, 36.0, 22.0), lo=5, hi=10, bias=0.02)
    for x0 in (12, 18, 46, 52):
        for y in range(52, 66):
            x = int(x0 + (y - 52) * (0.25 if x0 < 32 else -0.25))
            if 0 <= x < W and body[y, x]:
                robe[y, x] = iv[6]
    for x in range(14, 50):
        y = int(48 + abs(x - 31.5) * 0.18)
        for dy in (0, 1):
            if 0 <= y + dy < H and body[y + dy, x]:
                robe[y + dy, x] = gold[7 if dy == 0 else 5]
    img[body] = robe[body]
    for y, x in zip(*np.where(px.edge(body) & (ys > 46))):
        img[y, x] = iv[3]
    # long beard
    beard = px.m_poly(W, H, [(18.0, 31.0), (45.0, 31.0), (45.5, 40.0), (42.0, 50.0), (38.0, 58.0), (34.0, 64.0), (31.5, 65.8),
                             (29.0, 64.0), (25.0, 58.0), (21.0, 50.0), (17.5, 40.0)])
    keep_face = px.m_poly(W, H, [(20.5, 28.5), (42.5, 28.5), (41.0, 32.5), (36.5, 34.5), (27.0, 34.5), (22.0, 32.5)])
    beard &= ~keep_face
    img[beard] = (0, 0, 0, 0)
    fill_strands(img, beard, iv, 3, 10, freq=1.1, wave=0.35)
    # moustache over the mouth, calm mouth line
    must = px.m_poly(W, H, [(25.0, 33.0), (31.5, 31.5), (38.0, 33.0), (39.5, 36.0), (35.0, 35.0), (31.5, 35.5), (28.0, 35.0), (23.5, 36.0)])
    fill_strands(img, must, iv, 4, 10, freq=0.9, wave=0.1, outline=3)
    for x in range(29, 35):
        put(img, x, 36, iv[3])
    # long hair over the shoulders
    def lock(sign: int) -> np.ndarray:
        pts = [(20.0, 14.0), (19.6, 30.0), (18.4, 40.0), (18.8, 48.0), (17.6, 56.0)]
        out_pts = [(9.0 + math.sin(y * 0.6) * 1.2, y) for y in range(56, 13, -3)]
        poly = pts + out_pts
        if sign > 0:
            poly = [(63 - x, y) for x, y in poly]
        return px.m_poly(W, H, poly)
    locks = (lock(-1) | lock(1)) & ~beard & ~((ys < 34) & (xs > 20) & (xs < 43))
    img[locks & (ys > 16)] = (0, 0, 0, 0)
    fill_strands(img, locks & (ys > 16), iv, 3, 10, freq=1.2, wave=0.3, seed=1.0)
    # gentle age lines
    for x in range(26, 38):
        if x % 3:
            put(img, x, 18, P['skin'][9])
    for x in (23, 24, 39, 40):
        put(img, x, 27, P['skin'][9])
    return st.denoise(img)


# ---------------------------------------------------------------------------
# The serpent
# ---------------------------------------------------------------------------

def serpent_portrait() -> np.ndarray:
    """Head and neck of the serpent, side view facing left: a long narrow
    head, heavy brow over an amber slit-pupil eye, dark blotches along the
    back and pale belly plates."""
    img = px.blank(W, H)
    sp = P['serpent']
    belly = P['belly']
    xs, ys = px.grid(W, H)
    sl = px.ramp_lookup(sp)
    # neck: S curve rising from the bottom right
    pts = [(58.0, 72.0), (54.0, 60.0), (44.0, 52.0), (42.0, 42.0), (46.0, 33.0)]
    caps = [(x0, y0, x1, y1, 7.2, 6.8) for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:])]
    nx, ny, nz, neck = px.normals_capsules(W, H, caps)
    v = px.lambert(nx, ny, nz, light=LIGHT, ambient=0.0, wrap=0.3)
    px.paint(img, neck, sp, px.quantize(v, len(sp), 2, 9, -0.04))
    bm = neck & (nx < -0.3) & (ys > 36)
    for y, x in zip(*np.where(bm)):
        img[y, x] = belly[2] if y % 4 == 0 else belly[4 if nx[y, x] > -0.6 else 5]
    # head
    head_pts = [(7.0, 29.0), (9.0, 25.0), (16.0, 21.5), (27.0, 18.5), (37.0, 18.0), (45.0, 20.5), (50.0, 26.0), (50.0, 33.0),
                (45.0, 36.5), (34.0, 37.0), (22.0, 35.0), (12.0, 33.5), (8.0, 31.5)]
    head = px.m_poly(W, H, head_pts)
    hn = px.normals_ellipsoid(W, H, 30.0, 25.0, 23.0, 13.0)
    hv = px.lambert(*hn, light=LIGHT, ambient=0.0, wrap=0.3)
    px.paint(img, head, sp, px.quantize(hv, len(sp), 2, 10, 0.0))
    # lower jaw / lip scales in belly colour
    for y, x in zip(*np.where(head & (ys >= 31.5 + (xs - 8) * 0.04))):
        img[y, x] = belly[4] if x % 3 else belly[3]
    for x in range(8, 46):
        put(img, x, int(31 + (x - 8) * 0.04), sp[1])
    # large head plates: darker outlines on top of the head
    for (x0, y0, x1, y1) in ((14, 23, 24, 21), (24, 21, 36, 20), (18, 25, 30, 23)):
        n = max(abs(x1 - x0), 1)
        for k in range(n + 1):
            x = int(x0 + (x1 - x0) * k / n)
            y = int(round(y0 + (y1 - y0) * k / n))
            k0 = sl.get(tuple(img[y, x, :3]), 6)
            img[y, x] = sp[max(1, k0 - 2)]
    # back blotches along head and neck
    for (cx, cy, r) in ((40, 22, 2.4), (47, 30, 2.6), (47, 40, 2.8), (46, 49, 2.8), (52, 57, 3.0), (56, 66, 3.0)):
        bl = px.m_ellipse(W, H, cx, cy, r, r * 0.8) & (head | neck) & ~bm
        for y, x in zip(*np.where(bl)):
            k0 = sl.get(tuple(img[y, x, :3]), 6)
            img[y, x] = sp[max(1, k0 - 3)]
    # scale texture on the neck
    for y, x in zip(*np.where(neck & ~bm)):
        if (x + (y // 2) * 2) % 4 == 0 and y % 2 == 0:
            k0 = sl.get(tuple(img[y, x, :3]), 6)
            img[y, x] = sp[max(1, k0 - 1)]
    # heavy brow and the eye
    for x in range(24, 37):
        put(img, x, 21 if 27 <= x <= 34 else 22, sp[3])
    eye = px.m_ellipse(W, H, 31.0, 24.6, 3.4, 2.6)
    px.shade(img, eye, P['gold'], px.normals_ellipsoid(W, H, 30.0, 23.8, 3.8, 3.0), lo=4, hi=9, light=LIGHT, ambient=0.0)
    px.outline_inner(img, eye, sp[0])
    for y in range(23, 27):
        put(img, 31, y, P['hair'][0])
    put(img, 29, 23, P['gold'][10])
    # nostril
    put(img, 11, 26, sp[0])
    put(img, 12, 26, sp[1])
    allm = head | neck
    for y, x in zip(*np.where(px.edge(allm))):
        img[y, x] = sp[0]
    return st.denoise(img)


# ---------------------------------------------------------------------------
# animation overlays
# ---------------------------------------------------------------------------

EYES = [(22, 28), (34, 41)]     # x ranges of the two eyes, rows 24..26


def eye_frames(img: np.ndarray, skin, lash) -> list[np.ndarray]:
    """[half closed, closed]: the upper lid comes down over the eye."""
    half = img.copy()
    closed = img.copy()
    for x0, x1 in EYES:
        for x in range(x0, x1 + 1):
            lid = img[27, x] if img[27, x, 3] else skin[8]
            lk = px.ramp_lookup(skin).get(tuple(lid[:3]), 8)
            lid_c = skin[max(3, lk - 1)]
            for y in (23, 24):
                if y == 24 or not (x0 + 1 <= x <= x1 - 1):
                    pass
            half[24, x] = lid_c
            half[25, x] = lash if x0 < x < x1 else half[25, x]
            closed[24, x] = lid_c
            closed[25, x] = lid_c
            closed[26, x] = lash if x0 < x < x1 else lid_c
    return [half, closed]


def mouth_frames(img: np.ndarray, row: int, x0: int, x1: int, dark, inner) -> list[np.ndarray]:
    """[half open, open]: a dark gap opens on `row`, the lower lip drops a row."""
    half = img.copy()
    opened = img.copy()
    for x in range(x0 + 1, x1):
        half[row, x] = inner
    for x in range(x0, x1 + 1):
        opened[row + 2, x] = img[row + 1, x]
        opened[row + 1, x] = dark if x0 < x < x1 else img[row + 1, x]
        opened[row, x] = dark if x0 < x < x1 else img[row, x]
    return [half, opened]


def eve_mouth_frames(img: np.ndarray) -> list[np.ndarray]:
    half = img.copy()
    opened = img.copy()
    for x in range(30, 34):
        half[36, x] = P['lips'][0]
    for x in range(29, 35):
        opened[37, x] = img[36, x]
        opened[36, x] = P['hair_eve'][1] if 29 < x < 34 else P['lips'][0]
    return [half, opened]


def tongue_frames(img: np.ndarray) -> list[np.ndarray]:
    pk = P['pink']
    a = img.copy()
    for x in (4, 5, 6):
        a[30, x] = pk[2]
    b = img.copy()
    for x in (2, 3, 4, 5, 6):
        b[30, x] = pk[2] if x > 3 else pk[3]
    b[29, 1] = pk[3]
    b[31, 1] = pk[3]
    b[29, 2] = pk[1]
    b[31, 2] = pk[1]
    return [a, b]


def patch(base: np.ndarray, frame: np.ndarray):
    d = np.any(base != frame, axis=2)
    ys, xs = np.where(d)
    if len(xs) == 0:
        return None
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    return frame[y0:y1, x0:x1].copy(), int(x0), int(y0)


def build(out_dir: str) -> dict:
    """Write every portrait and its overlays; return manifest entries."""
    os.makedirs(out_dir, exist_ok=True)
    adam = load_adam()
    eve = eve_portrait()
    god = god_portrait()
    serpent = serpent_portrait()
    specs = {
        'adam': (adam, mouth_frames(adam, 36, 27, 35, P['hair'][1], P['skin'][3]), eye_frames(adam, P['skin'], P['hair'][1])),
        'eve': (eve, eve_mouth_frames(eve), eye_frames(eve, P['skin_eve'], P['hair_eve'][0])),
        'god': (god, mouth_frames(god, 36, 28, 35, P['ivory'][1], P['ivory'][2]), eye_frames(god, P['skin'], P['skin'][4])),
        'serpent': (serpent, tongue_frames(serpent), []),
    }
    manifest = {}
    for name, (base, mouths, eyes) in specs.items():
        Image.fromarray(base).save(os.path.join(out_dir, f'{name}.png'), optimize=True)
        entry = {'file': f'assets/portraits/{name}.png', 'width': W, 'height': H, 'mouth': [], 'eyes': []}
        for kind, frames in (('mouth', mouths), ('eyes', eyes)):
            for i, fr in enumerate(frames):
                pt = patch(base, fr)
                if not pt:
                    continue
                img, x, y = pt
                fn = f'{name}-{kind}-{i}.png'
                Image.fromarray(img).save(os.path.join(out_dir, fn), optimize=True)
                entry[kind].append({'file': f'assets/portraits/{fn}', 'x': x, 'y': y, 'w': int(img.shape[1]), 'h': int(img.shape[0])})
        manifest[name] = entry
    return manifest


if __name__ == '__main__':
    import sys
    rows = []
    for base, mouths, eyes in [(load_adam(), None, None)]:
        pass
    adam, eve, god, serp = load_adam(), eve_portrait(), god_portrait(), serpent_portrait()
    frames = [adam] + mouth_frames(adam, 36, 27, 35, P['hair'][1], P['skin'][3]) + eye_frames(adam, P['skin'], P['hair'][1])
    frames += [eve] + eve_mouth_frames(eve) + eye_frames(eve, P['skin_eve'], P['hair_eve'][0])
    frames += [god] + mouth_frames(god, 36, 28, 35, P['ivory'][0], P['ivory'][2]) + eye_frames(god, P['skin'], P['skin'][4])
    frames += [serp] + tongue_frames(serp) + [serp, serp]
    crops = [f[16:42, 16:48] for f in frames]
    px.preview(px.sheet(crops, 5), sys.argv[1], 6, (38, 50, 74, 255))
