"""Animals, the serpent, the cherubim and the flaming sword.

Same density, palette rules and lighting as the characters: side views are
lit from the front (the direction the animal faces), outlines use the
darkest tone of each ramp, fur and wool use clustered textures.

Animals face right; the game mirrors them for left. Each animal sheet holds
[idle0, idle1, walk0, walk1, walk2, walk3].
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field

import numpy as np
from PIL import Image

import pixel as px
import style as st
from style import P
from chars import SIDE_LIGHT, FRONT_LIGHT, strands, paint_form

L = SIDE_LIGHT


def blankf(w, h):
    return px.blank(w, h)


def shade_mask(img, mask, rmp, normals, lo, hi, bias=0.0, wrap=0.35, light=L, outline=0, outline_lit=None):
    nx, ny, nz = normals
    v = px.lambert(nx, ny, nz, light=light, ambient=0.0, wrap=wrap)
    idx = px.quantize(v, len(rmp), lo, hi, bias)
    px.paint(img, mask, rmp, idx)
    e = px.edge(mask)
    lit = nx * light[0] + ny * light[1]
    for y, x in zip(*np.where(e)):
        img[y, x] = rmp[outline_lit] if (outline_lit is not None and lit[y, x] > 0.3) else rmp[outline]
    return idx


def curls_fill(img, mask, rmp, rng, lo, hi, spacing=2.6, size=1.6, light=L):
    """Woolly/curly texture: small lit clumps over a darker base."""
    h, w = mask.shape
    gn = px.normals_dome(mask)
    gl = px.lambert(*gn, light=light, ambient=0.0, wrap=0.3)
    for y, x in zip(*np.where(mask)):
        img[y, x] = rmp[int(np.clip(lo + gl[y, x] * (hi - lo) * 0.6, lo, hi))]
    ys, xs = np.where(mask)
    pts = []
    yy = ys.min() - 1.0
    row = 0
    while yy <= ys.max() + 1:
        xx = xs.min() - (spacing / 2 if row % 2 else 0) - 1
        while xx <= xs.max() + 1:
            cx, cy = xx + rng.uniform(-0.7, 0.7), yy + rng.uniform(-0.6, 0.6)
            if 0 <= int(cy) < h and 0 <= int(cx) < w and mask[int(cy), int(cx)]:
                pts.append((cx, cy))
            xx += spacing
        yy += spacing * 0.85
        row += 1
    pts.sort(key=lambda p: p[1])
    for cx, cy in pts:
        lv = gl[int(cy), int(cx)]
        tone = lo + 1 + int(round(lv * (hi - lo - 1)))
        r = size * rng.uniform(0.85, 1.15)
        for dy in range(-3, 4):
            for dx in range(-3, 4):
                x, y = int(cx + dx), int(cy + dy)
                if not (0 <= x < w and 0 <= y < h and mask[y, x]):
                    continue
                ox, oy = x + 0.5 - cx, y + 0.5 - cy
                d = math.hypot(ox, oy)
                if d > r:
                    continue
                k = (ox * light[0] + oy * light[1]) / max(r, 0.01)
                t = tone + (1 if k > 0.35 else 0) - (1 if k < -0.35 else 0)
                if k < -0.65:
                    t = lo
                img[y, x] = rmp[int(np.clip(t, lo, hi))]


# ---------------------------------------------------------------------------
# quadrupeds
# ---------------------------------------------------------------------------

@dataclass
class Quad:
    """Side-view quadruped facing right. Body = chest + barrel + rump
    ellipses (cx, cy, rx, ry). Legs are joint chains: a list of
    (dx, dy, radius) offsets from the top point, top to hoof."""
    name: str
    W: int
    H: int
    fur: str
    chest: tuple
    barrel: tuple
    rump: tuple
    shoulder: tuple
    hip: tuple
    front: list
    hind: list
    neck: list = field(default_factory=list)      # capsule chain [(x, y, r), ...]
    texture: str = 'short'
    belly: str | None = None
    tail: list = field(default_factory=list)
    tail_ramp: str | None = None
    hoof: str = 'hoof'
    hoof_size: float = 2.0
    stride: float = 0.4
    fur_lo: int = 2


def leg_points(top, chain, swing: float, flex: float, front: bool):
    """Absolute joint positions. swing rotates the whole leg; flex bends the
    lower joints (knee forward for front legs, hock back for hind legs)."""
    pts = [top]
    x, y = top
    ca, sa = math.cos(swing), math.sin(swing)
    for i, (dx, dy, r) in enumerate(chain):
        rx_ = dx * ca + dy * sa
        ry_ = -dx * sa + dy * ca
        if i >= 1 and flex:
            b = flex * (1 if front else -1) * (1.2 if i == 1 else 0.7)
            cb, sb = math.cos(b), math.sin(b)
            rx_, ry_ = rx_ * cb + ry_ * sb, -rx_ * sb + ry_ * cb
        x, y = x + rx_, y + ry_
        pts.append((x, y))
    return pts


def draw_leg(img, q: Quad, top, chain, swing, flex, far: bool, front: bool, body_mask, top_r: float):
    """Fur-covered leg segments followed by a short hoof/paw segment."""
    rmp = P[q.fur if q.texture != 'wool' else 'rabbit']
    pts = leg_points(top, chain, swing, flex, front)
    radii = [top_r] + [r for (_, _, r) in chain]
    caps = [(x0, y0, x1, y1, r0, r1) for (x0, y0), (x1, y1), r0, r1 in zip(pts[:-1], pts[1:], radii[:-1], radii[1:])]
    leg_caps, hoof_cap = caps[:-1], caps[-1]
    nx, ny, nz, m = px.normals_capsules(q.W, q.H, leg_caps)
    # fetlock / knee bulges
    for (x, y), r in zip(pts[1:-1], radii[1:-1]):
        m |= px.m_ellipse(q.W, q.H, x, y, r * 1.12, r * 0.95)
    layer = blankf(q.W, q.H)
    v = px.lambert(nx, ny, nz, light=L, ambient=0.0, wrap=0.3)
    idx = px.quantize(v, len(rmp), 1 if far else 2, len(rmp) - (5 if far else 2), -0.2 if far else 0.0)
    px.paint(layer, m, rmp, idx)
    for y, x in zip(*np.where(px.edge(m))):
        if far or not body_mask[y, x]:
            layer[y, x] = rmp[0] if far else rmp[1]
    hm = px.m_capsule(q.W, q.H, *hoof_cap)
    hr = P[q.hoof] if q.hoof in P else rmp
    hv = px.lambert(*px.normals_capsules(q.W, q.H, [hoof_cap])[:3], light=L, ambient=0.0, wrap=0.3)
    px.paint(layer, hm & ~m, hr, px.quantize(hv, len(hr), 0, len(hr) - (2 if far else 1), 0.0))
    for y, x in zip(*np.where(px.edge(hm) & ~m)):
        layer[y, x] = hr[0]
    if not far:
        inside = body_mask & m & (px.grid(q.W, q.H)[1] < top[1] + chain[0][1] * 0.55)
        layer[inside] = (0, 0, 0, 0)
    px.over(img, layer)
    return pts


def quad_frames(q: Quad, head_fn, extra_fn=None, seed: int = 1) -> list[np.ndarray]:
    """[idle0, idle1, walk0..3]"""
    frames = []
    phases = [None, None, 0.0, math.pi / 2, math.pi, 3 * math.pi / 2]
    xs, ys = px.grid(q.W, q.H)
    for i, ph in enumerate(phases):
        rng = random.Random(seed)
        img = blankf(q.W, q.H)
        bob = 0 if ph is None else (1 if math.cos(ph * 2) > 0 else 0)
        idle_alt = (i == 1)

        def gait(offset):
            if ph is None:
                return 0.0, 0.0
            a = ph + offset
            return -math.sin(a) * q.stride, max(0.0, math.cos(a)) * 0.9

        body = np.zeros((q.H, q.W), bool)
        parts = []
        for (cx, cy, rx, ry) in (q.chest, q.barrel, q.rump):
            mm = px.m_ellipse(q.W, q.H, cx, cy + bob, rx, ry)
            body |= mm
            parts.append((mm, px.normals_ellipsoid(q.W, q.H, cx + rx * 0.1, cy + bob - ry * 0.2, rx * 1.15, ry * 1.25)))
        neck = np.zeros_like(body)
        if q.neck:
            caps = [(x0, y0 + bob, x1, y1 + bob, r0, r1) for (x0, y0, r0), (x1, y1, r1) in zip(q.neck[:-1], q.neck[1:])]
            nn = px.normals_capsules(q.W, q.H, caps)
            neck = nn[3]
            parts.append((neck & ~body, nn[:3]))
        sil = body | neck
        # far legs and tail, behind the body
        sw, fl = gait(math.pi)
        draw_leg(img, q, (q.shoulder[0] - 4, q.shoulder[1] + bob), q.front, sw, fl, True, True, sil, q.front[0][2] + 1)
        sw, fl = gait(0.0)
        draw_leg(img, q, (q.hip[0] - 4, q.hip[1] + bob), q.hind, sw, fl, True, False, sil, q.hind[0][2] + 1)
        if q.tail:
            draw_tail(img, q, bob, i)
        # body volume: dome normals of the whole silhouette blended with the parts
        dn = px.normals_dome(sil)
        nx, ny, nz = [a.copy() for a in dn]
        for mm, (px_, py_, pz_) in parts:
            nx = np.where(mm, nx * 0.4 + px_ * 0.6, nx)
            ny = np.where(mm, ny * 0.4 + py_ * 0.6, ny)
            nz = np.where(mm, nz * 0.4 + pz_ * 0.6, nz)
        nrm = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2) + 1e-6
        layer = blankf(q.W, q.H)
        rmp = P[q.fur]
        if q.texture == 'wool':
            curls_fill(layer, body, rmp, rng, 2, len(rmp) - 1)
            if q.neck:
                shade_mask(layer, neck & ~body, rmp, (nx / nrm, ny / nrm, nz / nrm), lo=3, hi=len(rmp) - 2, outline=1)
            for y, x in zip(*np.where(px.edge(sil))):
                layer[y, x] = rmp[1]
        else:
            shade_mask(layer, sil, rmp, (nx / nrm, ny / nrm, nz / nrm), lo=q.fur_lo, hi=len(rmp) - 2, outline=0, outline_lit=2)
            if q.belly:
                fy = ny / nrm
                br = P[q.belly]
                bm = sil & (fy > 0.5) & ~px.edge(sil) & (ys > q.barrel[1] + bob)
                for y, x in zip(*np.where(bm)):
                    k = 5 + int((fy[y, x] - 0.5) * 8) + ((x + y) % 3 == 0)
                    layer[y, x] = br[int(np.clip(k, 5, len(br) - 2))]
            lk = px.ramp_lookup(rmp)
            pts_y, pts_x = np.where(sil & ~px.edge(sil))
            for _ in range(int(sil.sum() / 16)):
                j = rng.randrange(len(pts_x))
                y, x = pts_y[j], pts_x[j]
                k = lk.get(tuple(layer[y, x, :3]), 4)
                for d in range(3):
                    yy, xx = min(q.H - 1, y + d), max(0, x - d // 2)
                    if sil[yy, xx] and not px.edge(sil)[yy, xx]:
                        layer[yy, xx] = rmp[max(1, k - 1)]
        px.over(img, layer)
        if extra_fn:
            extra_fn(img, q, bob, i, rng)
        sw, fl = gait(0.0)
        draw_leg(img, q, (q.shoulder[0], q.shoulder[1] + bob), q.front, sw, fl, False, True, sil, q.front[0][2] + 1)
        sw, fl = gait(math.pi)
        draw_leg(img, q, (q.hip[0], q.hip[1] + bob), q.hind, sw, fl, False, False, sil, q.hind[0][2] + 1)
        head_fn(img, q, bob, idle_alt and ph is None, rng)
        frames.append(st.denoise(img))
    return frames


def draw_tail(img, q: Quad, bob: int, frame: int):
    pts = q.tail
    caps = [(x0 - (frame % 2) * i * 0.4, y0 + bob, x1 - (frame % 2) * (i + 1) * 0.4, y1 + bob, r0, r1)
            for i, ((x0, y0, r0), (x1, y1, r1)) in enumerate(zip(pts[:-1], pts[1:]))]
    nx, ny, nz, m = px.normals_capsules(q.W, q.H, caps)
    layer = blankf(q.W, q.H)
    ramp = P[q.tail_ramp or q.fur]
    if q.tail_ramp:
        strands(layer, m, ramp, 0, len(ramp) - 3, light=L, freq=0.9, wave=0.4, outline=0)
    else:
        shade_mask(layer, m, ramp, (nx, ny, nz), lo=1, hi=len(ramp) - 3, outline=0)
    px.over(img, layer)


def eye(img, x, y, white=False):
    img[y, x] = P['hair'][0]
    if white:
        img[y - 1, x] = P['eye'][1]


def head_shape(img, q, pts, ramp, center, radii, lo=3, hi=None, lit=2):
    m = px.m_poly(q.W, q.H, pts)
    hi = hi if hi is not None else len(P[ramp]) - 2
    shade_mask(img, m, P[ramp], px.normals_ellipsoid(q.W, q.H, center[0], center[1], radii[0], radii[1]), lo=lo, hi=hi, outline=0, outline_lit=lit)
    return m


# ----------------------------------------------------------------- species

def sheep() -> list[np.ndarray]:
    q = Quad('sheep', 88, 70, 'wool', chest=(54, 34, 15, 15), barrel=(40, 33, 20, 16), rump=(24, 33, 14, 15),
             shoulder=(54, 42), hip=(25, 42), front=[(1, 9, 3.6), (0, 8, 2.4), (0, 5, 2.0), (1, 3, 2.4)], hind=[(2, 9, 4.0), (-2, 8, 2.4), (0, 5, 2.0), (1, 3, 2.4)],
             texture='wool', tail=[(11, 30, 4.0), (9, 37, 3.0)], hoof_size=2.2, stride=0.38, fur_lo=3)
    q.fur = 'wool'

    def legs_dark(img, q, bob, i, rng):
        pass

    def head(img, q, bob, alt, rng):
        dy = 1 if alt else 0
        hx, hy = 68, 25 + bob + dy
        face = head_shape(img, q, [(hx - 7, hy - 6), (hx + 4, hy - 5), (hx + 12, hy + 1), (hx + 14, hy + 7), (hx + 9, hy + 11), (hx - 2, hy + 9), (hx - 8, hy + 3)],
                          'rabbit', (hx + 2, hy), (12, 9), lo=3, hi=9, lit=3)
        cap = px.m_ellipse(q.W, q.H, hx - 3, hy - 5, 8, 5.5)
        layer = blankf(q.W, q.H)
        curls_fill(layer, cap, P['wool'], rng, 3, 10)
        for y, x in zip(*np.where(px.edge(cap))):
            layer[y, x] = P['wool'][2]
        px.over(img, layer)
        ear = px.m_poly(q.W, q.H, [(hx - 4, hy - 1), (hx - 14, hy + 2), (hx - 13, hy + 5), (hx - 3, hy + 3)])
        shade_mask(img, ear, P['rabbit'], px.normals_ellipsoid(q.W, q.H, hx - 8, hy + 1, 6, 4), lo=2, hi=7, outline=1)
        eye(img, hx + 3, hy + 1)
        img[hy, hx + 3] = P['rabbit'][2]
        img[hy + 7, hx + 12] = P['nose'][2]
        img[hy + 7, hx + 13] = P['nose'][1]
        img[hy + 9, hx + 10] = P['rabbit'][3]
    frames = quad_frames(q, head, seed=3)
    # legs of a sheep are dark tan, not wool
    return frames


def goat() -> list[np.ndarray]:
    q = Quad('goat', 88, 80, 'goat', chest=(54, 42, 13, 12), barrel=(40, 42, 18, 12), rump=(25, 41, 12, 12),
             shoulder=(54, 48), hip=(26, 47), front=[(1, 10, 3.6), (0, 9, 2.2), (0, 6, 1.8), (1, 3, 2.2)], hind=[(3, 10, 4.2), (-3, 9, 2.4), (0, 6, 1.8), (1, 3, 2.2)],
             neck=[(56, 40, 6.5), (63, 27, 5.0)], belly='rabbit', tail=[(14, 34, 2.4), (11, 29, 1.6)], stride=0.42)

    def head(img, q, bob, alt, rng):
        hx, hy = 67, 22 + bob + (1 if alt else 0)
        face = head_shape(img, q, [(hx - 6, hy - 5), (hx + 3, hy - 4), (hx + 12, hy + 4), (hx + 13, hy + 8), (hx + 7, hy + 10), (hx - 3, hy + 6), (hx - 7, hy + 1)],
                          'goat', (hx + 1, hy), (11, 8), lo=3, hi=9)
        for t in range(10):
            x, y = int(hx + 1 + t * 1.0), int(hy - 3 + t * 0.8)
            if face[y, x]:
                img[y, x] = P['rabbit'][8]
        beard = px.m_poly(q.W, q.H, [(hx + 3, hy + 7), (hx + 9, hy + 9), (hx + 6, hy + 17), (hx + 3, hy + 14)])
        strands(img, beard, P['goat'], 1, 6, light=L, freq=1.4, outline=0)
        horn = np.zeros((q.H, q.W), bool)
        for t in np.linspace(0, 1, 22):
            x = hx - 2 - math.sin(t * 2.3) * 10
            y = hy - 5 - math.sin(t * 1.6) * 10
            horn |= px.m_ellipse(q.W, q.H, x, y, 2.4 - t * 1.4, 2.4 - t * 1.4)
        shade_mask(img, horn, P['horn'], px.normals_dome(horn), lo=1, hi=6, outline=0)
        ear = px.m_poly(q.W, q.H, [(hx - 4, hy - 1), (hx - 13, hy + 1), (hx - 12, hy + 4), (hx - 3, hy + 2)])
        shade_mask(img, ear, P['goat'], px.normals_ellipsoid(q.W, q.H, hx - 8, hy + 1, 6, 3), lo=2, hi=7, outline=0)
        eye(img, hx + 2, hy)
        img[hy + 6, hx + 12] = P['nose'][1]
    return quad_frames(q, head, seed=5)


def deer() -> list[np.ndarray]:
    q = Quad('deer', 108, 116, 'deer', chest=(66, 64, 14, 13), barrel=(48, 64, 20, 12), rump=(30, 62, 13, 13),
             shoulder=(65, 70), hip=(31, 69), front=[(1, 15, 4.0), (0, 14, 2.4), (0, 9, 1.8), (1, 3, 2.2)], hind=[(4, 14, 5.0), (-4, 14, 2.6), (0, 9, 1.8), (1, 3, 2.2)],
             neck=[(68, 60, 7.4), (78, 40, 5.2)], belly='rabbit', tail=[(18, 55, 3.0), (16, 59, 2.0)], stride=0.45)

    def spots(img, q, bob, i, rng):
        r = random.Random(8)
        for _ in range(16):
            x = r.randrange(28, 66)
            y = r.randrange(54, 66) + bob
            if img[y, x, 3] and img[y + 1, x, 3] and img[y, x + 1, 3]:
                img[y, x] = P['rabbit'][9]
                img[y, x + 1] = P['rabbit'][8]

    def head(img, q, bob, alt, rng):
        hx, hy = 82, 34 + bob + (1 if alt else 0)
        face = head_shape(img, q, [(hx - 6, hy - 6), (hx + 3, hy - 4), (hx + 14, hy + 4), (hx + 15, hy + 7), (hx + 9, hy + 9), (hx - 2, hy + 6), (hx - 7, hy + 1)],
                          'deer', (hx + 2, hy), (12, 8), lo=3, hi=9)
        for x in range(hx + 2, hx + 10):
            if face[hy + 6, x]:
                img[hy + 6, x] = P['rabbit'][8]
        ant = np.zeros((q.H, q.W), bool)
        for (x0, y0, x1, y1, r) in ((hx - 1, hy - 5, hx - 6, hy - 21, 1.5), (hx - 6, hy - 21, hx - 14, hy - 29, 1.2), (hx - 5, hy - 15, hx + 3, hy - 25, 1.1),
                                    (hx - 6, hy - 21, hx - 3, hy - 32, 1.0), (hx - 3, hy - 9, hx - 13, hy - 15, 1.0)):
            ant |= px.m_capsule(q.W, q.H, x0, y0, x1, y1, r, r * 0.7)
        shade_mask(img, ant, P['horn'], px.normals_dome(ant), lo=1, hi=6, outline=0)
        ear = px.m_poly(q.W, q.H, [(hx - 4, hy - 3), (hx - 14, hy - 8), (hx - 15, hy - 5), (hx - 5, hy + 1)])
        shade_mask(img, ear, P['deer'], px.normals_ellipsoid(q.W, q.H, hx - 9, hy - 4, 6, 4), lo=2, hi=8, outline=0)
        eye(img, hx + 3, hy)
        img[hy + 4, hx + 14] = P['nose'][0]
    return quad_frames(q, head, extra_fn=spots, seed=7)


def lion() -> list[np.ndarray]:
    q = Quad('lion', 118, 84, 'lion', chest=(72, 44, 16, 16), barrel=(52, 45, 22, 14), rump=(31, 44, 15, 15),
             shoulder=(71, 52), hip=(32, 52), front=[(1, 11, 5.6), (0, 9, 4.0), (1, 4, 3.6), (2, 3, 4.0)], hind=[(4, 11, 6.6), (-3, 10, 4.0), (1, 4, 3.6), (2, 3, 4.0)],
             neck=[(74, 42, 10.0), (82, 34, 9.0)], belly='lion', tail=[(17, 40, 2.0), (8, 47, 1.7), (4, 58, 1.5)], hoof='lion', hoof_size=3.6, stride=0.36)

    def tuft(img, q, bob, i, rng):
        m = px.m_ellipse(q.W, q.H, 4 - (i % 2) * 1, 60 + bob, 2.8, 3.4)
        strands(img, m, P['mane'], 1, 6, light=L, outline=0)

    def head(img, q, bob, alt, rng):
        hx, hy = 90, 32 + bob + (1 if alt else 0)
        mane = px.m_ellipse(q.W, q.H, hx - 6, hy + 3, 15, 18) | px.m_ellipse(q.W, q.H, hx - 13, hy + 14, 11, 11)
        mane &= ~px.m_poly(q.W, q.H, [(hx + 2, hy - 7), (hx + 22, hy), (hx + 22, hy + 14), (hx + 2, hy + 13)])
        strands(img, mane, P['mane'], 1, 8, light=L, freq=0.9, wave=0.5, seed=1.0, outline=0)
        face = head_shape(img, q, [(hx - 4, hy - 6), (hx + 6, hy - 6), (hx + 13, hy + 1), (hx + 15, hy + 6), (hx + 13, hy + 11), (hx + 4, hy + 13), (hx - 4, hy + 9)],
                          'lion', (hx + 3, hy + 2), (12, 10), lo=3, hi=9)
        muzzle = px.m_ellipse(q.W, q.H, hx + 10, hy + 7, 5, 4)
        shade_mask(img, muzzle, P['lion'], px.normals_ellipsoid(q.W, q.H, hx + 10, hy + 6, 6, 5), lo=6, hi=10, outline=3)
        for (x, y, c) in ((hx + 14, hy + 4, 0), (hx + 13, hy + 4, 1), (hx + 14, hy + 5, 0), (hx + 12, hy + 9, 1), (hx + 11, hy + 9, 1)):
            img[y, x] = P['nose'][c]
        eye(img, hx + 5, hy)
        img[hy - 1, hx + 4] = P['lion'][3]
        img[hy - 1, hx + 5] = P['lion'][3]
        ear = px.m_ellipse(q.W, q.H, hx - 1, hy - 7, 3, 3)
        shade_mask(img, ear, P['lion'], px.normals_ellipsoid(q.W, q.H, hx - 1, hy - 8, 3, 3), lo=3, hi=8, outline=0)
    return quad_frames(q, head, extra_fn=tuft, seed=9)


def horse() -> list[np.ndarray]:
    q = Quad('horse', 148, 140, 'horse', chest=(92, 74, 18, 18), barrel=(68, 76, 26, 17), rump=(42, 72, 19, 18),
             shoulder=(91, 84), hip=(43, 82), front=[(1, 17, 6.2), (0, 16, 3.6), (1, 11, 2.8), (1, 4, 3.4)], hind=[(5, 16, 7.4), (-5, 16, 3.8), (1, 11, 2.8), (1, 4, 3.4)],
             neck=[(96, 70, 11.0), (104, 52, 8.4), (108, 42, 7.0)], tail=[(24, 64, 3.6), (19, 80, 4.2), (19, 98, 3.0)], tail_ramp='hair',
             hoof_size=3.0, stride=0.4)

    def head(img, q, bob, alt, rng):
        hx, hy = 110, 38 + bob + (1 if alt else 0)
        face = head_shape(img, q, [(hx - 7, hy - 7), (hx + 3, hy - 7), (hx + 15, hy + 9), (hx + 23, hy + 16), (hx + 23, hy + 22), (hx + 15, hy + 24), (hx + 3, hy + 13), (hx - 7, hy + 5)],
                          'horse', (hx + 6, hy + 6), (16, 14), lo=3, hi=9)
        for t in range(16):
            x, y = int(hx + 3 + t * 1.15), int(hy - 3 + t * 1.15)
            if face[y, x]:
                img[y, x] = P['rabbit'][9]
        mane = px.m_poly(q.W, q.H, [(hx - 8, hy - 9), (hx - 1, hy - 9), (hx - 7, hy + 8), (hx - 15, hy + 24), (hx - 23, hy + 36), (hx - 22, hy + 26), (hx - 14, hy + 4)])
        strands(img, mane, P['hair'], 0, 6, light=L, freq=0.8, wave=0.4, seed=2.0, outline=0)
        ear = px.m_poly(q.W, q.H, [(hx - 2, hy - 6), (hx - 3, hy - 16), (hx + 2, hy - 8)])
        shade_mask(img, ear, P['horse'], px.normals_ellipsoid(q.W, q.H, hx - 2, hy - 9, 3, 6), lo=2, hi=8, outline=0)
        eye(img, hx + 3, hy + 2)
        img[hy + 1, hx + 3] = P['horse'][2]
        img[hy + 19, hx + 21] = P['horse'][0]
        img[hy + 22, hx + 18] = P['horse'][1]
    return quad_frames(q, head, seed=11)


def camel() -> list[np.ndarray]:
    q = Quad('camel', 164, 168, 'camel', chest=(96, 88, 16, 17), barrel=(72, 88, 26, 16), rump=(46, 86, 16, 16),
             shoulder=(95, 98), hip=(47, 96), front=[(1, 22, 5.8), (0, 20, 3.4), (2, 13, 2.8), (2, 4, 4.4)], hind=[(5, 22, 7.0), (-5, 20, 3.6), (2, 13, 2.8), (2, 4, 4.4)],
             neck=[(102, 90, 8.6), (118, 76, 6.8), (122, 58, 6.2), (128, 46, 5.6)], tail=[(30, 80, 2.2), (27, 96, 1.6)], hoof='camel', hoof_size=4.0, stride=0.34)

    def hump(img, q, bob, i, rng):
        h = px.m_ellipse(q.W, q.H, 68, 68 + bob, 22, 16)
        layer = blankf(q.W, q.H)
        shade_mask(layer, h, P['camel'], px.normals_ellipsoid(q.W, q.H, 70, 64 + bob, 24, 18), lo=2, hi=9, outline=0, outline_lit=2)
        for y, x in zip(*np.where(h & (px.grid(q.W, q.H)[1] > 76 + bob))):
            layer[y, x] = (0, 0, 0, 0)
        px.over(img, layer)

    def head(img, q, bob, alt, rng):
        hx, hy = 130, 42 + bob + (1 if alt else 0)
        face = head_shape(img, q, [(hx - 6, hy - 6), (hx + 4, hy - 6), (hx + 18, hy + 2), (hx + 22, hy + 8), (hx + 20, hy + 13), (hx + 10, hy + 12), (hx - 2, hy + 8), (hx - 7, hy + 2)],
                          'camel', (hx + 6, hy + 2), (16, 10), lo=3, hi=9)
        lip = px.m_ellipse(q.W, q.H, hx + 18, hy + 11, 4, 2.6)
        shade_mask(img, lip, P['camel'], px.normals_ellipsoid(q.W, q.H, hx + 18, hy + 10, 5, 3), lo=3, hi=8, outline=0)
        eye(img, hx + 4, hy - 1)
        img[hy - 2, hx + 4] = P['camel'][2]
        img[hy - 2, hx + 3] = P['camel'][2]
        img[hy + 5, hx + 20] = P['camel'][0]
        ear = px.m_ellipse(q.W, q.H, hx - 4, hy - 5, 2.2, 2.6)
        shade_mask(img, ear, P['camel'], px.normals_ellipsoid(q.W, q.H, hx - 4, hy - 6, 3, 3), lo=2, hi=7, outline=0)
    return quad_frames(q, head, extra_fn=hump, seed=13)


def rabbit() -> list[np.ndarray]:
    """A hare sitting up, hopping when it moves."""
    W, H = 40, 40
    frames = []
    for i, (squash, hop) in enumerate([(0, 0), (0, 0), (2, 0), (0, 4), (-1, 7), (0, 3)]):
        img = blankf(W, H)
        rng = random.Random(4)
        y0 = 38 - hop
        body = px.m_ellipse(W, H, 17, y0 - 9 + squash * 0.5, 11 + squash * 0.5, 8 - squash * 0.4)
        haunch = px.m_ellipse(W, H, 13, y0 - 7, 7, 6)
        m = body | haunch
        shade_mask(img, m, P['rabbit'], px.normals_ellipsoid(W, H, 18, y0 - 11, 13, 10), lo=2, hi=9, outline=0, outline_lit=2)
        for y, x in zip(*np.where(m & (px.grid(W, H)[1] > y0 - 4))):
            if not px.edge(m)[y, x]:
                img[y, x] = P['rabbit'][9]
        tail = px.m_ellipse(W, H, 5.5, y0 - 10, 3, 3)
        shade_mask(img, tail, P['wool'], px.normals_ellipsoid(W, H, 6, y0 - 11, 3, 3), lo=6, hi=10, outline=3)
        head = px.m_ellipse(W, H, 29, y0 - 17, 7, 6)
        shade_mask(img, head, P['rabbit'], px.normals_ellipsoid(W, H, 30, y0 - 18, 8, 7), lo=3, hi=10, outline=0, outline_lit=2)
        tilt = 1 if i == 1 else 0
        for ex, sh in ((24 - tilt, 0), (27 - tilt, 1)):
            ear = px.m_capsule(W, H, ex + 2, y0 - 21, ex - 1 - tilt * 2, y0 - 33, 2.2, 1.7)
            shade_mask(img, ear, P['rabbit'], px.normals_capsules(W, H, [(ex + 2, y0 - 21, ex - 1, y0 - 33, 2.2, 1.7)])[:3], lo=2 - sh, hi=8 - sh, outline=0)
            for yy in range(y0 - 31, y0 - 22):
                xx = int(round(ex + 0.5 - (yy - (y0 - 21)) * 0.25 - tilt))
                if ear[yy, xx] and not px.edge(ear)[yy, xx] and sh == 1:
                    img[yy, xx] = P['pink'][4]
        eye(img, 31, y0 - 18)
        img[y0 - 16, 35] = P['pink'][2]
        # paws
        for fx in (24, 27):
            pm = px.m_ellipse(W, H, fx, y0 - 2, 2.2, 2)
            shade_mask(img, pm, P['rabbit'], px.normals_ellipsoid(W, H, fx, y0 - 3, 3, 3), lo=4, hi=9, outline=1)
        foot = px.m_ellipse(W, H, 14, y0 - 1.5, 6, 1.8)
        shade_mask(img, foot, P['rabbit'], px.normals_ellipsoid(W, H, 14, y0 - 2, 7, 3), lo=3, hi=8, outline=1)
        frames.append(st.denoise(img))
    return frames


def dove() -> list[np.ndarray]:
    """Rock dove: [idle0, idle1 (head bob), walk0..3 (pecking walk)] plus 2 flight frames."""
    W, H = 32, 28
    frames = []
    for i in range(8):
        img = blankf(W, H)
        flying = i >= 6
        bob = [0, 1, 0, 1, 0, 1, 0, 0][i]
        y0 = 25 if not flying else 18
        if not flying:
            for lx in (14, 17):
                for yy in range(y0 - 3, y0 + 1):
                    img[yy, lx + (1 if (i % 2 and lx == 17) else 0)] = P['pink'][3]
        body = px.m_ellipse(W, H, 15, y0 - 8, 9, 6)
        tail = px.m_poly(W, H, [(7, y0 - 10), (1, y0 - 8), (1, y0 - 5), (8, y0 - 6)])
        m = body | tail
        shade_mask(img, m, P['dove'], px.normals_ellipsoid(W, H, 16, y0 - 10, 10, 8), lo=3, hi=11, outline=1, outline_lit=3)
        # folded wing with darker bars
        if not flying:
            wing = px.m_ellipse(W, H, 13, y0 - 8, 7, 4)
            shade_mask(img, wing, P['dove'], px.normals_ellipsoid(W, H, 13, y0 - 10, 8, 5), lo=4, hi=10, outline=2)
            for x in (11, 12, 15, 16):
                img[y0 - 8, x] = P['dove'][2]
        else:
            up = i == 6
            wing = px.m_poly(W, H, [(10, y0 - 9), (20, y0 - 9), (14, y0 - (21 if up else 1)), (5, y0 - (19 if up else 0))])
            shade_mask(img, wing, P['dove'], px.normals_dome(wing), lo=4, hi=11, outline=1)
        hx, hy = 23, y0 - 13 + bob
        head = px.m_ellipse(W, H, hx, hy, 3.6, 3.4)
        shade_mask(img, head, P['dove'], px.normals_ellipsoid(W, H, hx, hy - 1, 4, 4), lo=4, hi=11, outline=1, outline_lit=3)
        # iridescent neck
        for x, y in ((20, hy + 3), (21, hy + 3), (21, hy + 4), (20, hy + 4)):
            img[y, x] = P['leaf'][6] if (x + y) % 2 else P['flower_purple'][4]
        img[hy - 1, hx + 1] = P['hair'][0]
        img[hy, hx + 4] = P['dove'][4]
        img[hy, hx + 5] = P['dove'][3]
        frames.append(img)
    return frames


# ---------------------------------------------------------------------------
# the serpent
# ---------------------------------------------------------------------------

def serpent_body(W, H, path, r_fn, head_at_end=True):
    caps = []
    for i, ((x0, y0), (x1, y1)) in enumerate(zip(path[:-1], path[1:])):
        t0 = i / (len(path) - 1)
        t1 = (i + 1) / (len(path) - 1)
        caps.append((x0, y0, x1, y1, r_fn(t0), r_fn(t1)))
    return caps


def paint_serpent(img, caps, W, H, belly_side: float = 1.0):
    sp, bl = P['serpent'], P['belly']
    nx, ny, nz, m = px.normals_capsules(W, H, caps)
    v = px.lambert(nx, ny, nz, light=FRONT_LIGHT, ambient=0.0, wrap=0.3)
    idx = px.quantize(v, len(sp), 2, 9, -0.02)
    px.paint(img, m, sp, idx)
    for y, x in zip(*np.where(m & (ny * belly_side > 0.45))):
        img[y, x] = bl[4 if (x % 3) else 3]
    sl = px.ramp_lookup(sp)
    for y, x in zip(*np.where(m & (ny < 0.2))):
        if (x // 3 + y // 3) % 3 == 0 and (x + y) % 2 == 0:
            k = sl.get(tuple(img[y, x, :3]), 5)
            img[y, x] = sp[max(1, k - 3)]
    for y, x in zip(*np.where(px.edge(m))):
        img[y, x] = sp[0]
    return m


def serpent_head(img, W, H, hx, hy, facing=1, open_mouth=False):
    sp = P['serpent']
    f = facing
    pts = [(hx - f * 6, hy - 3), (hx + f * 2, hy - 4.6), (hx + f * 8, hy - 3), (hx + f * 10.6, hy - 0.4), (hx + f * 9, hy + 2.6),
           (hx + f * 2, hy + 3.6), (hx - f * 6, hy + 3)]
    m = px.m_poly(W, H, pts)
    v = px.lambert(*px.normals_ellipsoid(W, H, hx + f * 1, hy - 1, 9, 5), light=FRONT_LIGHT, ambient=0.0, wrap=0.3)
    idx = px.quantize(v, len(sp), 3, 10, 0.0)
    px.paint(img, m, sp, idx)
    for x in range(max(0, int(min(hx - f * 4, hx + f * 9))), min(W, int(max(hx - f * 4, hx + f * 9)) + 1)):
        if m[int(hy + 2), x]:
            img[int(hy + 2), x] = P['belly'][4]
    for y, x in zip(*np.where(px.edge(m))):
        img[y, x] = sp[0]
    ex = int(round(hx + f * 4))
    img[int(hy - 1), ex] = P['gold'][7]
    img[int(hy - 1), ex + (1 if f > 0 else -1)] = P['hair'][0]
    img[int(hy - 2), ex] = sp[2]
    return m


def serpent_frames() -> dict:
    out = {}
    # coiled on a branch in the tree: idle sway (4 frames) and tongue flick
    W, H = 84, 56
    tree_frames = []
    for i in range(4):
        img = blankf(W, H)
        sway = [0, 1, 2, 1][i]
        loop = [(8, 30), (18, 24), (30, 26), (40, 34), (50, 30), (56, 22), (54 + sway, 15), (60 + sway, 10)]
        caps = serpent_body(W, H, loop, lambda t: 3.0 + 1.6 * math.sin(math.pi * min(1, t * 1.2)))
        paint_serpent(img, caps, W, H)
        # hanging coil under the branch
        coil = [(22, 28), (20, 38), (26, 44), (34, 40), (33, 32)]
        caps2 = serpent_body(W, H, coil, lambda t: 3.6)
        paint_serpent(img, caps2, W, H)
        serpent_head(img, W, H, 64 + sway, 9, 1)
        if i == 2:
            for x in range(75 + sway, min(W, 79 + sway)):
                img[9, x] = P['pink'][2]
            img[8, min(W - 1, 79 + sway)] = P['pink'][3]
            img[10, min(W - 1, 79 + sway)] = P['pink'][3]
        tree_frames.append(img)
    out['tree'] = tree_frames
    # slithering on the ground (after Genesis 3:14), facing right
    W, H = 96, 28
    ground = []
    for i in range(4):
        img = blankf(W, H)
        ph = i * math.pi / 2
        path = [(x, 17 + math.sin(x * 0.11 + ph) * 4.0 * min(1.0, (x / 60))) for x in range(4, 80, 5)]
        caps = serpent_body(W, H, path, lambda t: 1.6 + 3.6 * math.sin(math.pi * min(1, t * 1.1) ** 0.7))
        paint_serpent(img, caps, W, H)
        serpent_head(img, W, H, 82, path[-1][1] - 1, 1)
        ground.append(img)
    out['ground'] = ground
    return out


# ---------------------------------------------------------------------------
# cherubim and the flaming sword
# ---------------------------------------------------------------------------

def cherub_frames() -> list[np.ndarray]:
    """A tall, majestic winged guardian in white and gold, standing guard with
    raised wings; the face is serene and full of light. Two idle frames."""
    import chars as ch
    frames = []
    W, H = 184, 172
    iv, gold = P['ivory'], P['gold']
    for flap in (0, 2):
        img = blankf(W, H)
        cx = W / 2

        def edge_pt(t, s):
            # arched leading edge: shoulder -> top -> outer tip
            pts = [(8, 62), (20, 26), (40, 8), (64, 18)]
            seg = min(2, int(t * 3))
            u = t * 3 - seg
            (x0, y0), (x1, y1) = pts[seg], pts[seg + 1]
            return cx + s * (x0 + (x1 - x0) * u), y0 + (y1 - y0) * u - flap * (t > 0.2)

        for s in (-1, 1):
            wing = blankf(W, H)
            for row, (n, off, ln, wd, ramp, lo) in enumerate(((13, 30, 46, 6.0, iv, 4), (14, 15, 32, 5.6, iv, 5), (16, 4, 15, 4.6, gold, 6))):
                for k in range(n):
                    t = 0.06 + 0.94 * k / (n - 1)
                    bx, by = edge_pt(t, s)
                    by += off * (0.55 + 0.45 * t)
                    length = ln * (0.8 + 0.35 * t) if row == 0 else ln
                    ang = s * (0.08 + 0.4 * t)
                    tx, ty = bx + math.sin(ang) * length, by + math.cos(ang) * length
                    cap = (bx, by, tx, ty, wd, wd * 0.5)
                    nx, ny, nz, m = px.normals_capsules(W, H, [cap])
                    v = px.lambert(nx, ny, nz, light=FRONT_LIGHT, ambient=0.0, wrap=0.45)
                    idx = px.quantize(v, len(ramp), lo, len(ramp) - 1, 0.02)
                    layer = blankf(W, H)
                    px.paint(layer, m, ramp, idx)
                    for j in range(3, int(length) - 2):
                        x = int(round(bx + (tx - bx) * j / length))
                        y = int(round(by + (ty - by) * j / length))
                        if 0 <= x < W and 0 <= y < H and m[y, x] and not px.edge(m)[y, x]:
                            layer[y, x] = ramp[max(2, lo - 1)]
                    for y, x in zip(*np.where(px.edge(m))):
                        layer[y, x] = gold[3]
                    px.over(wing, layer)
            # golden leading edge (the wing's "arm")
            arm = np.zeros((H, W), bool)
            for t in np.linspace(0, 1, 40):
                x, y = edge_pt(t, s)
                arm |= px.m_ellipse(W, H, x, y + 2, 4.2 - t * 1.6, 4.2 - t * 1.6)
            shade_mask(wing, arm, gold, px.normals_dome(arm), lo=5, hi=10, light=FRONT_LIGHT, outline=3)
            px.over(img, wing)
        # robe
        robe = px.m_poly(W, H, [(cx - 13, 50), (cx + 13, 50), (cx + 16, 60), (cx + 15, 92), (cx + 21, 166), (cx - 21, 166), (cx - 15, 92), (cx - 16, 60)])
        n = px.normals_ellipsoid(W, H, cx - 3, 108, 24, 66)
        v = px.lambert(*n, light=FRONT_LIGHT, ambient=0.0, wrap=0.4)
        idx = px.quantize(v, len(iv), 5, 11, 0.04)
        px.paint(img, robe, iv, idx)
        for x0 in (cx - 10, cx - 4, cx + 3, cx + 9):
            for y in range(98, 166):
                x = int(round(x0 + (x0 - cx) * 0.35 * (y - 98) / 68))
                if robe[y, x] and not px.edge(robe)[y, x]:
                    img[y, x] = iv[max(4, idx[y, x] - 2)]
        for y, x in zip(*np.where(px.edge(robe))):
            img[y, x] = gold[3]
        for x in range(W):
            col = np.where(robe[:, x])[0]
            if len(col):
                img[col.max() - 1, x] = gold[7]
                img[col.max() - 2, x] = gold[5]
            if robe[88, x]:
                img[88, x] = gold[8]
                img[89, x] = gold[6]
                img[90, x] = gold[4]
        # shoulders/sleeves and folded arms
        for sgn in (-1, 1):
            sl = px.m_poly(W, H, [(cx + sgn * 12, 51), (cx + sgn * 19, 56), (cx + sgn * 20, 72), (cx + sgn * 8, 78), (cx + sgn * 8, 66)])
            shade_mask(img, sl, iv, px.normals_ellipsoid(W, H, cx + sgn * 14, 62, 9, 14), lo=5, hi=11, light=FRONT_LIGHT, outline=3)
        arms = px.m_ellipse(W, H, cx, 74, 13, 5)
        shade_mask(img, arms, iv, px.normals_ellipsoid(W, H, cx - 2, 72, 14, 7), lo=6, hi=11, light=FRONT_LIGHT, outline=3)
        hands = px.m_ellipse(W, H, cx, 76, 3.6, 3.2)
        shade_mask(img, hands, ch.GOD_SKIN, px.normals_ellipsoid(W, H, cx - 1, 75, 4, 4), lo=5, hi=11, light=FRONT_LIGHT, outline=2)
        # neck and head (Eve's beardless face, golden hair, luminous skin)
        neck = px.m_rect(W, H, int(cx) - 4, 40, int(cx) + 4, 52)
        shade_mask(img, neck, ch.GOD_SKIN, px.normals_ellipsoid(W, H, cx - 1, 46, 5, 8), lo=4, hi=9, light=FRONT_LIGHT, outline=2)
        head = ch.eve_front_head()
        face_layer = blankf(W, H)
        px.over(face_layer, head[0:31], int(cx - ch.CX), 12)
        hl = px.ramp_lookup(P['hair_eve'])
        skl = px.ramp_lookup(P['skin_eve'])
        for y in range(H):
            for x in range(W):
                if face_layer[y, x, 3]:
                    k = tuple(face_layer[y, x, :3])
                    if k in hl:
                        face_layer[y, x] = gold[min(10, 2 + hl[k])]
                    elif k in skl:
                        face_layer[y, x] = ch.GOD_SKIN[min(12, skl[k] + 1)]
        px.over(img, face_layer)
        frames.append(st.denoise(img))
    return frames


def flaming_sword_frames(n: int = 16) -> list[np.ndarray]:
    """The flaming sword which turned every way (Genesis 3:24). Drawn at 8x
    and point-sampled per rotation so every frame stays crisp; the flames
    flicker between frames."""
    from PIL import ImageDraw
    S = 72
    K = 8
    c = S * K // 2
    fl, gold, iv = P['flame'], P['gold'], P['ivory']
    frames = []
    for k in range(n):
        big = Image.new('RGBA', (S * K, S * K), (0, 0, 0, 0))
        d = ImageDraw.Draw(big)
        rng = random.Random(k * 7 + 3)
        L_ = 210
        # outer flames: tongues along both edges of the blade
        for j in range(9):
            t = j / 8
            y = c - 40 - t * L_
            for sgn in (-1, 1):
                w = (42 - t * 26) * rng.uniform(0.8, 1.25)
                d.polygon([(c + sgn * 6, y + 26), (c + sgn * w, y + rng.uniform(-8, 8)), (c + sgn * 10, y - 30 - rng.uniform(0, 18))], fill=fl[5])
        d.polygon([(c - 26, c - 30), (c, c - 60 - L_ - rng.uniform(10, 40)), (c + 26, c - 30)], fill=fl[6])
        d.polygon([(c - 16, c - 34), (c, c - 40 - L_), (c + 16, c - 34)], fill=fl[8])
        # blade
        d.polygon([(c - 10, c - 34), (c, c - 30 - L_ + 20), (c + 10, c - 34)], fill=iv[10])
        d.line([(c + 3, c - 40), (c + 3, c - L_)], fill=iv[7], width=5)
        # guard, grip, pommel
        d.rectangle([c - 40, c - 36, c + 40, c - 22], fill=gold[7])
        d.rectangle([c - 40, c - 26, c + 40, c - 20], fill=gold[4])
        d.rectangle([c - 8, c - 20, c + 8, c + 40], fill=P['bark'][4])
        for yy in range(c - 16, c + 40, 10):
            d.line([(c - 8, yy), (c + 8, yy + 4)], fill=P['bark'][2], width=3)
        d.ellipse([c - 14, c + 36, c + 14, c + 62], fill=gold[6])
        rot = big.rotate(-k * 360 / n, resample=Image.NEAREST, center=(c, c - 70))
        arr = np.array(rot)
        small = arr[K // 2::K, K // 2::K].copy()
        m = small[:, :, 3] > 0
        small[m, 3] = 255
        px.outline_inner(small, m, fl[2])
        frames.append(small)
    return frames


# ---------------------------------------------------------------------------
# build
# ---------------------------------------------------------------------------

ANIMALS = {
    'sheep': sheep, 'goat': goat, 'rabbit': rabbit, 'deer': deer,
    'lion': lion, 'dove': dove, 'horse': horse, 'camel': camel,
}


def build(m: dict, save, strip, sheet_entry) -> None:
    sprites = m.setdefault('sprites', {})
    for name, fn in ANIMALS.items():
        frames = fn()
        f = save(strip(frames), f'sprites/animal-{name}.png')
        h, w = frames[0].shape[:2]
        extra = {'idle': [0, 1], 'walk': [2, 3, 4, 5]}
        if name == 'dove':
            extra['fly'] = [6, 7]
        sprites[f'animal-{name}'] = sheet_entry(f, frames, (w // 2, h - 2), **extra)
        print('  animal', name, w, 'x', h)
    sf = serpent_frames()
    for key, frames in sf.items():
        f = save(strip(frames), f'sprites/serpent-{key}.png')
        h, w = frames[0].shape[:2]
        sprites[f'serpent-{key}'] = sheet_entry(f, frames, (w // 2, h - 2))
    cf = cherub_frames()
    f = save(strip(cf), 'sprites/cherub.png')
    sprites['cherub'] = sheet_entry(f, cf, (cf[0].shape[1] // 2, cf[0].shape[0] - 3))
    sw = flaming_sword_frames()
    f = save(strip(sw), 'sprites/flaming-sword.png')
    sprites['flaming-sword'] = sheet_entry(f, sw, (sw[0].shape[1] // 2, sw[0].shape[0] // 2))
    print('  serpent, cherub, sword')


if __name__ == '__main__':
    import sys
    rows = []
    imgs = [sheep()[0], goat()[0], rabbit()[0], deer()[0], lion()[0], dove()[0], horse()[0], camel()[0]]
    W = sum(i.shape[1] + 6 for i in imgs)
    H = max(i.shape[0] for i in imgs)
    c = blankf(W, H)
    x = 0
    for i in imgs:
        px.over(c, i, x, H - i.shape[0])
        x += i.shape[1] + 6
    px.preview(c, sys.argv[1], 2, (110, 150, 80, 255))
