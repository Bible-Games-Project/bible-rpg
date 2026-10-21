"""Full-resolution characters (same density as the supplied Adam sprite).

Frames are 64 x 120 art pixels, soles on row 117, body centred on x = 32
(pixel i mirrors 63 - i). Sources:

* Adam, side view: the supplied sprite itself (art/reference/adam-sprite.webp).
* Adam, front head: the supplied portrait (art/reference/adam-talk.webp)
  reduced to the sprite's scale. Eve's and God's heads are derived from
  their portraits the same way, so faces always match the dialogue art.
* Bodies, garments and limbs in the other views are built here with the
  reference palette, outline and shading rules.
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

FW, FH = 64, 120
SOLE = 117
CX = 32.0

FRONT_LIGHT = np.array([-0.38, -0.48, 0.79])
FRONT_LIGHT = FRONT_LIGHT / np.linalg.norm(FRONT_LIGHT)
SIDE_LIGHT = np.array([0.5, -0.5, 0.71])
SIDE_LIGHT = SIDE_LIGHT / np.linalg.norm(SIDE_LIGHT)


@dataclass
class Look:
    name: str
    skin: list
    hair: list
    female: bool = False


ADAM = Look('adam', P['skin'], P['hair'])
EVE = Look('eve', P['skin_eve'], P['hair_eve'], female=True)


@dataclass
class Pose:
    bob: int = 0
    lift_l: int = 0
    lift_r: int = 0
    hand_l: int = 0
    hand_r: int = 0


# ---------------------------------------------------------------------------
# generic painting helpers
# ---------------------------------------------------------------------------

def paint_form(img: np.ndarray, mask: np.ndarray, rmp, normals, lo: int, hi: int, light=FRONT_LIGHT,
               bias: float = 0.0, wrap: float = 0.35, outline_dark: int = 1, outline_lit: int | None = None) -> np.ndarray:
    """Shade a form with the given normals, then give it a selective outline:
    dark on the shadow side, a mid tone on the lit side (like the reference)."""
    nx, ny, nz = normals
    v = px.lambert(nx, ny, nz, light=light, ambient=0.0, wrap=wrap)
    idx = px.quantize(v, len(rmp), lo, hi, bias)
    px.paint(img, mask, rmp, idx)
    e = px.edge(mask)
    lit = nx * light[0] + ny * light[1]
    for y, x in zip(*np.where(e)):
        if outline_lit is not None and lit[y, x] > 0.25:
            img[y, x] = rmp[outline_lit]
        else:
            img[y, x] = rmp[outline_dark]
    return idx


def capsule_normals(caps):
    nx, ny, nz, m = px.normals_capsules(FW, FH, caps)
    return (nx, ny, nz), m


def ell(cx, cy, rx, ry):
    return px.m_ellipse(FW, FH, cx, cy, rx, ry)


def ell_n(cx, cy, rx, ry):
    return px.normals_ellipsoid(FW, FH, cx, cy, rx, ry)


def blend(base, parts, w=0.6):
    bx, by, bz = [a.copy() for a in base]
    for m, (nx, ny, nz) in parts:
        bx = np.where(m, bx * (1 - w) + nx * w, bx)
        by = np.where(m, by * (1 - w) + ny * w, by)
        bz = np.where(m, bz * (1 - w) + nz * w, bz)
    n = np.sqrt(bx * bx + by * by + bz * bz) + 1e-6
    return bx / n, by / n, bz / n


def mirror_x(v: float) -> float:
    return 2 * CX - v


def line(img, pts, color, mask=None):
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for k in range(n + 1):
            x = int(round(x0 + (x1 - x0) * k / n))
            y = int(round(y0 + (y1 - y0) * k / n))
            if 0 <= x < img.shape[1] and 0 <= y < img.shape[0] and (mask is None or mask[y, x]):
                img[y, x] = color


# ---------------------------------------------------------------------------
# leaves in the style of the reference skirt
# ---------------------------------------------------------------------------

def ref_leaf(img: np.ndarray, x0: float, y0: float, ang: float, length: float, width: float, rmp=None,
             shift: int = 0, light=FRONT_LIGHT, vein: bool = True) -> np.ndarray:
    """One leaf hanging from (x0, y0); ang in radians (0 = straight down).
    Lit half bright yellow-green, shaded half darker, a midrib, dark outline."""
    rmp = rmp or P['leaf']
    H, W = img.shape[:2]
    dx, dy = math.sin(ang), math.cos(ang)
    nxp, nyp = dy, -dx
    tip = (x0 + dx * length, y0 + dy * length)
    m1 = (x0 + dx * length * 0.42, y0 + dy * length * 0.42)
    pts = [(x0 + nxp * width * 0.25, y0 + nyp * width * 0.25),
           (m1[0] + nxp * width, m1[1] + nyp * width),
           (x0 + dx * length * 0.78 + nxp * width * 0.55, y0 + dy * length * 0.78 + nyp * width * 0.55),
           tip,
           (x0 + dx * length * 0.78 - nxp * width * 0.55, y0 + dy * length * 0.78 - nyp * width * 0.55),
           (m1[0] - nxp * width, m1[1] - nyp * width),
           (x0 - nxp * width * 0.25, y0 - nyp * width * 0.25)]
    m = px.m_poly(W, H, pts)
    if not m.any():
        return m
    xs, ys = px.grid(W, H)
    side = (xs - x0) * dy - (ys - y0) * dx          # >0 on the +normal side
    t = np.clip(((xs - x0) * dx + (ys - y0) * dy) / length, 0, 1)
    lit_side = (side * nxp * light[0] + side * nyp * light[1]) > 0
    # broad gradient: middle of the leaf brightest, base and tip darker
    g = 1 - np.abs(t - 0.5) * 1.3
    base_lit = 5 + shift
    base_dark = 3 + shift
    idx = np.where(lit_side, base_lit + (g > 0.55) * 2 + (g > 0.2), base_dark + (g > 0.45) * 1 + (g > 0.75))
    idx = np.clip(idx, 1, len(rmp) - 1)
    px.paint(img, m, rmp, idx)
    if vein:
        n = int(length)
        for k in range(1, n - 1):
            x = int(round(x0 + dx * k))
            y = int(round(y0 + dy * k))
            if 0 <= x < W and 0 <= y < H and m[y, x]:
                img[y, x] = rmp[max(1, base_dark - 1)] if k < n * 0.75 else rmp[max(1, base_dark)]
    px.outline_inner(img, m, rmp[0 if shift <= 0 else 1])
    return m


# ---------------------------------------------------------------------------
# heads from portraits
# ---------------------------------------------------------------------------

def reduce_point(img: np.ndarray, s: float, o: float) -> np.ndarray:
    h, w = img.shape[:2]
    th, tw = int((h - o) / s), int((w - o) / s)
    out = np.zeros((th, tw, 4), np.uint8)
    for y in range(th):
        for x in range(tw):
            cy, cx = int(o + y * s + s / 2), int(o + x * s + s / 2)
            out[y, x] = img[min(cy, h - 1), min(cx, w - 1)]
    return out


def head_from_portrait(path: str, ramps: tuple[str, ...], cut_row: int = 30, scale: float = 1.6, offset: float = 0.3) -> np.ndarray:
    """Reduce a 64x66 portrait to the sprite's scale and return a frame-sized
    layer containing the head and neck (rows above cut_row of the reduced
    portrait), positioned so the hair top sits on row 2 and the face is
    centred on CX."""
    por = np.array(Image.open(path).convert('RGBA'))
    r = reduce_point(por, scale, offset)
    r = st.snap(r, *ramps)
    r = st.denoise(r)
    r[cut_row:] = 0
    ys, xs = np.where(r[:, :, 3] > 0)
    top = ys.min()
    layer = px.blank(FW, FH)
    ox = int(round(CX - r.shape[1] / 2))
    px.over(layer, r[top:], ox, 2)
    return layer


# ---------------------------------------------------------------------------
# front / back body
# ---------------------------------------------------------------------------

def body_front(look: Look, pose: Pose, back: bool = False, parts=('legs', 'torso', 'arms'), rng=None) -> dict:
    """Returns layers: legs, torso, arms (each a frame-sized image)."""
    skin = look.skin
    fem = look.female
    b = pose.bob
    L = {}
    # ---------------------------------------------------------------- legs
    legs = px.blank(FW, FH)
    for side, lift in ((-1, pose.lift_l), (1, pose.lift_r)):
        def X(v):
            return v if side < 0 else mirror_x(v)
        hip = (X(26.6 if not fem else 27.2), 70.0 + b)
        knee = (X(26.4 if not fem else 27.0), 96.0 + b * 0.5 - lift * 0.8)
        calf = (X(26.4 if not fem else 27.0), 101.5 - lift * 0.6)
        ankle = (X(26.8 if not fem else 27.3), 110.5 - lift)
        caps = [(hip[0], hip[1], knee[0], knee[1], 6.2 if not fem else 5.8, 4.2),
                (knee[0], knee[1], calf[0], calf[1], 4.2, 4.7 if not fem else 4.3),
                (calf[0], calf[1], ankle[0], ankle[1], 4.7 if not fem else 4.3, 2.7)]
        n, m = capsule_normals(caps)
        layer = px.blank(FW, FH)
        paint_form(layer, m, skin, n, lo=3, hi=11 if side < 0 else 10, bias=-0.04 if side < 0 else -0.1,
                   outline_dark=1, outline_lit=3)
        # knee cap and shin highlight, calf shadow on the inner side
        kx, ky = int(round(knee[0])), int(round(knee[1]))
        for dx, dy, tone in ((-1, -1, 10), (0, -1, 11), (-1, 0, 10), (1, 1, 6), (0, 1, 7)):
            if m[ky + dy, kx + dx]:
                layer[ky + dy, kx + dx] = skin[tone - (0 if side < 0 else 1)]
        for y in range(int(calf[1]) - 3, int(ankle[1]) - 1):
            ix = int(round(calf[0] - side * 2.6))
            if m[y, ix] and not px.edge(m)[y, ix]:
                layer[y, ix] = skin[5]
        # foot
        fy = SOLE - lift
        fx = ankle[0]
        foot = px.m_poly(FW, FH, [(fx - 3.2, fy - 7.2), (fx + 3.2, fy - 7.2), (fx + 4.8, fy - 2.0), (fx + 4.6, fy + 0.9),
                                  (fx - 4.6, fy + 0.9), (fx - 4.8, fy - 2.0)])
        fn = ell_n(fx - 0.6, fy - 4.5, 6.0, 6.5)
        paint_form(layer, foot, skin, fn, lo=3, hi=11, bias=-0.02, outline_dark=1, outline_lit=2)
        if not back:
            # toes: small light bumps separated by darker lines
            for tx in range(int(fx - 3), int(fx + 4), 2):
                if foot[fy, tx]:
                    layer[fy, tx] = skin[4]
            for tx in range(int(fx - 4), int(fx + 5)):
                if foot[fy - 1, tx] and tx % 2 == 0:
                    layer[fy - 1, tx] = skin[9]
        else:
            for tx in range(int(fx - 2), int(fx + 3)):
                if foot[fy - 6, tx]:
                    layer[fy - 6, tx] = skin[8]
        px.over(legs, layer)
    L['legs'] = legs
    # --------------------------------------------------------------- torso
    torso = px.blank(FW, FH)
    sw = 0.0 if not fem else 3.0         # narrower shoulders for Eve
    ww = 0.0 if not fem else 1.6
    pts = [(20.0 + sw, 34.8 + b), (24.0 + sw * 0.5, 32.6 + b), (27.2, 31.0 + b), (36.8, 31.0 + b), (mirror_x(24.0 + sw * 0.5), 32.6 + b),
           (mirror_x(20.0 + sw), 34.8 + b), (mirror_x(16.6 + sw), 39.0 + b), (mirror_x(17.0 + sw + ww), 46.0 + b),
           (mirror_x(19.2 + ww), 52.0 + b), (mirror_x(19.8 + ww), 57.5 + b), (19.8 + ww, 57.5 + b), (19.2 + ww, 52.0 + b),
           (17.0 + sw + ww, 46.0 + b), (16.6 + sw, 39.0 + b)]
    tm = px.m_poly(FW, FH, pts)
    neck = px.m_poly(FW, FH, [(27.2, 26.0 + b), (36.8, 26.0 + b), (37.4, 33.0 + b), (26.6, 33.0 + b)])
    tm |= neck
    base_n = ell_n(CX - 1.5, 44.0 + b, 18.0, 22.0)
    sub = []
    if not back:
        if not fem:
            for cx in (24.6, mirror_x(24.6)):
                sub.append((ell(cx, 42.0 + b, 7.6, 5.4), ell_n(cx - 0.6, 41.0 + b, 8.2, 6.6)))
            for cy in (50.0, 53.0, 56.0):
                for cx in (28.6, mirror_x(28.6)):
                    sub.append((ell(cx, cy + b, 3.0, 1.6), ell_n(cx - 0.3, cy - 0.4 + b, 3.4, 2.2)))
    else:
        for cx in (24.0, mirror_x(24.0)):
            sub.append((ell(cx, 42.0 + b, 6.6, 6.6), ell_n(cx - 0.6, 41.0 + b, 7.4, 7.4)))
        sub.append((ell(CX, 50.0 + b, 9.0, 8.0), ell_n(CX - 0.6, 49.0 + b, 10.0, 9.0)))
    n = blend(base_n, sub, 0.55)
    paint_form(torso, tm, skin, n, lo=4, hi=12, bias=-0.05, outline_dark=1, outline_lit=3)
    # neck shadow under the jaw
    for y in range(int(26 + b), int(30 + b)):
        for x in range(27, 37):
            if tm[y, x]:
                torso[y, x] = skin[4 if x < 32 else 3] if y < 28 + b else skin[6 if x < 32 else 5]
    if not back:
        if not fem:
            # collarbones, lower edge of the pectorals, sternum, abdominal lines, obliques
            line(torso, [(19, 35 + b), (24, 36 + b), (29, 35 + b)], skin[7], tm)
            line(torso, [(mirror_x(19), 35 + b), (mirror_x(24), 36 + b), (mirror_x(29), 35 + b)], skin[6], tm)
            line(torso, [(18, 45 + b), (22, 47 + b), (27, 47.5 + b), (31, 46 + b)], skin[5], tm)
            line(torso, [(33, 46 + b), (37, 47.5 + b), (42, 47 + b), (46, 45 + b)], skin[4], tm)
            line(torso, [(32, 38 + b), (32, 56 + b)], skin[6], tm)
            for y in (51, 54):
                line(torso, [(28, y + b), (31, y + b)], skin[6], tm)
                line(torso, [(33, y + b), (36, y + b)], skin[5], tm)
            line(torso, [(20, 50 + b), (22, 56 + b)], skin[6], tm)
            line(torso, [(mirror_x(20), 50 + b), (mirror_x(22), 56 + b)], skin[4], tm)
            # navel
            torso[int(56 + b), 31] = skin[5]
    else:
        # spine and shoulder blades
        line(torso, [(32, 33 + b), (32, 56 + b)], skin[6], tm)
        line(torso, [(21, 38 + b), (24, 44 + b), (27, 46 + b)], skin[6], tm)
        line(torso, [(mirror_x(21), 38 + b), (mirror_x(24), 44 + b), (mirror_x(27), 46 + b)], skin[5], tm)
    L['torso'] = torso
    # ---------------------------------------------------------------- arms
    arms = px.blank(FW, FH)
    for side, hd in ((-1, pose.hand_l), (1, pose.hand_r)):
        def X(v):
            return v if side < 0 else mirror_x(v)
        o = 0.0 if not fem else 2.0
        k = 1.0 if not fem else 0.8
        def A(x, y):
            # arm contour point: x relative to the left arm, scaled for Eve
            cx0 = 15.0
            return (X(cx0 + (x - cx0) * k + o), y + b + (hd if y > 58 else 0))
        outline_pts = [A(20.0, 33.6), A(15.6, 35.0), A(12.8, 37.6), A(11.6, 41.0), A(11.2, 45.0), A(11.0, 49.0),
                       A(10.6, 53.0), A(10.0, 56.5), A(10.0, 61.0), A(10.6, 66.0), A(16.6, 66.0), A(16.4, 61.0),
                       A(16.2, 56.5), A(16.6, 53.0), A(17.6, 49.0), A(18.4, 45.0), A(19.2, 41.0), A(20.4, 37.0)]
        m = px.m_poly(FW, FH, outline_pts)
        sh, el, wr = A(16.2, 37.0), A(13.8, 53.0), A(13.4, 65.0)
        (nx, ny, nz), _ = capsule_normals([(sh[0], sh[1], el[0], el[1], 4.4 * k, 3.6 * k), (el[0], el[1], wr[0], wr[1], 3.6 * k, 2.9 * k)])
        cap = ell(*A(16.0, 38.6), 4.6 * k, 4.4 * k)
        nx, ny, nz = blend((nx, ny, nz), [(cap, ell_n(*A(15.6, 37.4), 5.2 * k, 5.2 * k)),
                                          (ell(*A(14.4, 46.0), 3.8 * k, 5.4 * k), ell_n(*A(14.0, 45.0), 4.4 * k, 6.4 * k)),
                                          (ell(*A(13.2, 56.0), 3.4 * k, 4.4 * k), ell_n(*A(12.8, 55.0), 4.0 * k, 5.4 * k))], 0.45)
        layer = px.blank(FW, FH)
        paint_form(layer, m, skin, (nx, ny, nz), lo=3, hi=12 if side < 0 else 10, bias=-0.02 if side < 0 else -0.1,
                   outline_dark=1, outline_lit=3)
        # elbow crease and bicep/forearm separation
        ex = int(round(el[0] - side * 1.4))
        for yy in (52, 53):
            if m[int(yy + b), ex] and not px.edge(m)[int(yy + b), ex]:
                layer[int(yy + b), ex] = skin[6]
        hx, hy = A(13.6, 69.4)
        hm = ell(hx, hy, 3.4 if not fem else 3.0, 4.6 if not fem else 4.2)
        paint_form(layer, hm, skin, ell_n(hx - 0.8, hy - 1.2, 4.2, 5.8), lo=3, hi=11, bias=-0.04, outline_dark=1, outline_lit=2)
        # fingers: two short darker lines at the bottom of the hand
        for k in (-1, 1):
            fx = int(round(hx + k * 1.2))
            for yy in range(int(hy + 1), int(hy + 4)):
                if hm[yy, fx] and not px.edge(hm)[yy, fx]:
                    layer[yy, fx] = skin[6]
        px.over(arms, layer)
    L['arms'] = arms
    return L


# ---------------------------------------------------------------------------
# garments
# ---------------------------------------------------------------------------

def leaf_skirt_front(look: Look, pose: Pose, back: bool, rng: random.Random, long: bool = False) -> np.ndarray:
    """Overlapping leaves of varied size and angle tied at the waist, the way
    the reference skirt is drawn: back leaves first (darker, pointing
    outwards), then shorter front leaves; dark gaps between them."""
    img = px.blank(FW, FH)
    b = pose.bob
    top = 56.5 + b
    extra = 0.0 if not long else 7.0
    leaves = []
    for i in range(9):
        t = i / 8
        x = 18.5 + t * 27.0 + rng.uniform(-1.0, 1.0)
        ang = (0.5 - t) * 1.05 + rng.uniform(-0.12, 0.12)
        leaves.append((x, top + rng.uniform(0.5, 3.0), ang, 22 + extra + rng.uniform(-3, 4), rng.uniform(5.2, 6.8), -1))
    for i in range(7):
        t = i / 6
        x = 20.5 + t * 23.0 + rng.uniform(-1.2, 1.2)
        ang = (0.5 - t) * 0.7 + rng.uniform(-0.15, 0.15)
        leaves.append((x, top + rng.uniform(-0.5, 2.0), ang, 18 + extra + rng.uniform(-3, 5), rng.uniform(5.4, 7.0), 0 if i % 3 else 1))
    for i in range(3):
        x = 24.0 + i * 8.0 + rng.uniform(-1.5, 1.5)
        leaves.append((x, top + 9 + extra * 0.6 + rng.uniform(-1, 2), rng.uniform(-0.25, 0.25), 14 + rng.uniform(-2, 3), 5.6, 1 if not back else 0))
    for (x, y, ang, ln, wd, sh) in leaves:
        ref_leaf(img, x, y, ang, ln, wd, shift=sh if not back else min(sh, 0))
    for x in range(19, 46):
        y = int(top + (0 if (x % 4) < 2 else 1))
        if img[y, x, 3] or img[y + 1, x, 3]:
            img[y, x] = P['leaf'][1 if x % 2 else 2]
            if rng.random() < 0.5:
                img[y - 1, x] = P['leaf'][2]
    return img


def leaf_top_front(look: Look, pose: Pose, back: bool, rng: random.Random) -> np.ndarray:
    """Eve's modest leaf garment: leaves across the chest and over the shoulders."""
    img = px.blank(FW, FH)
    b = pose.bob
    for x, ang in ((22.0, 0.5), (27.0, 0.2), (32.0, 0.0), (37.0, -0.2), (42.0, -0.5)):
        ref_leaf(img, x, 34.5 + b, ang, 12.0, 4.8, shift=-1)
    for x, ang in ((21.0, 0.3), (26.4, 0.1), (32.0, 0.0), (37.6, -0.1), (43.0, -0.3)):
        ref_leaf(img, x, 39.0 + b, ang, 12.5, 5.0, shift=0 if not back else -1)
    for x, ang in ((19.5, 0.12), (mirror_x(19.5), -0.12)):
        ref_leaf(img, x, 33.0 + b, ang, 10.5, 4.2, shift=0)
    return img


# ---------------------------------------------------------------------------
# hair texture synthesis (back of the head, long hair)
# ---------------------------------------------------------------------------

def hair_source(look: Look) -> np.ndarray:
    """Curly hair texture cut from the reference sprite's hair, recoloured
    to the character's hair ramp."""
    side = np.array(Image.open(_ref_sprite()).convert('RGBA'))
    src = st.snap(side[1:20, 2:26], 'hair', 'skin')
    hl = px.ramp_lookup(P['hair'])
    tex = np.zeros_like(src)
    for y in range(src.shape[0]):
        for x in range(src.shape[1]):
            k = tuple(src[y, x, :3])
            if src[y, x, 3] and k in hl:
                tex[y, x] = look.hair[min(len(look.hair) - 1, hl[k])]
    return tex


def _ref_sprite() -> str:
    import os
    return os.path.join(os.path.dirname(__file__), '..', '..', 'art', 'derived', 'adam-side.png')


def synth_hair(mask: np.ndarray, look: Look, rng: random.Random, light=FRONT_LIGHT, darken_below: float | None = None) -> np.ndarray:
    """Fill a mask with curl texture: random patches of the reference hair,
    then re-lit so the whole mass reads as one volume."""
    tex = hair_source(look)
    th, tw = tex.shape[:2]
    out = px.blank(FW, FH)
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return out
    hl = px.ramp_lookup(look.hair)
    P_ = 6
    for y0 in range(ys.min() - 2, ys.max() + 1, P_ - 1):
        for x0 in range(xs.min() - 2, xs.max() + 1, P_ - 1):
            for _ in range(10):
                sx, sy = rng.randrange(0, tw - P_), rng.randrange(0, th - P_)
                patch = tex[sy:sy + P_, sx:sx + P_]
                if (patch[:, :, 3] > 0).mean() > 0.95:
                    break
            for dy in range(P_):
                for dx in range(P_):
                    y, x = y0 + dy, x0 + dx
                    if 0 <= y < FH and 0 <= x < FW and mask[y, x] and patch[dy, dx, 3]:
                        out[y, x] = patch[dy, dx]
    # relight: shift tones by the volume of the mass
    n = px.normals_dome(mask)
    v = px.lambert(*n, light=light, ambient=0.0, wrap=0.3)
    for y, x in zip(ys, xs):
        if not out[y, x, 3]:
            out[y, x] = look.hair[2]
            continue
        k = hl.get(tuple(out[y, x, :3]), 3)
        delta = int(round((v[y, x] - 0.55) * 4))
        if darken_below is not None and y > darken_below:
            delta -= 1
        out[y, x] = look.hair[int(np.clip(k + delta, 0, len(look.hair) - 1))]
    e = px.edge(mask)
    for y, x in zip(*np.where(e)):
        out[y, x] = look.hair[0]
    return st.denoise(out)


# ---------------------------------------------------------------------------
# composition
# ---------------------------------------------------------------------------

def portrait_path(name: str) -> str:
    import os
    return os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'portraits', f'{name}.png')


_head_cache: dict = {}


def front_head(look: Look) -> np.ndarray:
    if look.name not in _head_cache:
        ramps = ('skin', 'hair', 'eye') if look.name == 'adam' else ('skin_eve', 'hair_eve', 'eye', 'lips')
        _head_cache[look.name] = head_from_portrait(portrait_path(look.name), ramps)
    return _head_cache[look.name]


def back_head(look: Look) -> np.ndarray:
    key = look.name + ':back'
    if key not in _head_cache:
        fh = front_head(look)
        sil = fh[:, :, 3] > 0
        ys = np.where(sil.any(axis=1))[0]
        mask = sil.copy()
        mask[ys.max() - 5:] = False      # leave the nape to the neck
        if look.female:
            mask |= px.m_poly(FW, FH, [(18.0, 14.0), (46.0, 14.0), (47.0, 54.0), (40.0, 60.0), (32.0, 61.0), (24.0, 60.0), (17.0, 54.0)])
        _head_cache[key] = synth_hair(mask, look, random.Random(5), darken_below=40)
    return _head_cache[key]


def compose_front(look: Look, pose: Pose, back: bool = False, outfit: str = 'leaves', seed: int = 7) -> np.ndarray:
    rng = random.Random(seed)
    L = body_front(look, pose, back)
    img = px.blank(FW, FH)
    px.over(img, L['legs'])
    px.over(img, L['torso'])
    if outfit == 'leaves':
        px.over(img, leaf_skirt_front(look, pose, back, rng, long=look.female))
        if look.female:
            px.over(img, leaf_top_front(look, pose, back, random.Random(seed + 3)))
    px.over(img, L['arms'])
    if back:
        head = back_head(look)
    else:
        head = eve_front_head() if look.female else front_head(look)
    px.over(img, px.shift(head, 0, pose.bob))
    return img


# ---------------------------------------------------------------------------
# side view (facing right)
# ---------------------------------------------------------------------------

SIDE_X = int(CX - 16)       # where the 33-wide reference sprite sits in the frame

# (knee_x, knee_y, ankle_x, ankle_y, heel_lift)
S_STAND = (29.6, 96.5, 28.6, 109.6, 0)
S_FORWARD = (34.6, 96.0, 37.4, 109.6, 0)
S_BACK = (25.4, 96.4, 21.0, 108.0, 4)
S_SWING = (35.4, 93.0, 30.4, 104.4, 'swing')
S_HIP = (30.0, 78.0)


def reference_side() -> np.ndarray:
    side = np.array(Image.open(_ref_sprite()).convert('RGBA'))
    frame = px.blank(FW, FH)
    px.over(frame, side, SIDE_X, 1)
    return frame


def side_upper(frame: np.ndarray, skin) -> np.ndarray:
    """The reference without its legs (skin below the hand is removed; the
    leaf skirt stays)."""
    out = frame.copy()
    leaf = set(tuple(c[:3]) for c in P['leaf'])
    snapped = st.snap(frame, 'skin', 'hair', 'leaf')
    for y in range(75, FH):
        for x in range(FW):
            if out[y, x, 3] and tuple(snapped[y, x, :3]) not in leaf:
                out[y, x] = (0, 0, 0, 0)
    return out


def side_leg(img: np.ndarray, skin, pose, bob: int, far: bool) -> None:
    kx, ky, ax, ay, heel = pose
    hx, hy = S_HIP[0] + (-1.0 if far else 0.6), S_HIP[1] + bob
    mid = ((kx + ax) / 2 - 1.0, (ky + ay) / 2 - 0.5)
    caps = [(hx, hy, kx, ky, 5.4, 3.8), (kx, ky, mid[0], mid[1], 3.8, 4.4), (mid[0], mid[1], ax, ay, 4.4, 2.4)]
    (nx, ny, nz), m = capsule_normals(caps)
    sole = SOLE + 0.95
    if heel == 'swing':
        pts = [(ax - 2.6, ay - 1.6), (ax + 2.2, ay - 1.6), (ax + 9.0, ay + 3.0), (ax + 9.4, ay + 5.6), (ax - 2.8, ay + 5.0)]
    elif heel:
        pts = [(ax - 2.6, ay - 1.4), (ax + 2.4, ay - 1.4), (ax + 9.6, sole - 3.0), (ax + 10.4, sole), (ax + 3.6, sole), (ax - 3.0, ay + 4.6)]
    else:
        pts = [(ax - 2.6, ay - 1.8), (ax + 2.2, ay - 1.8), (ax + 8.4, sole - 4.0), (ax + 11.6, sole - 2.2), (ax + 12.2, sole),
               (ax - 3.6, sole), (ax - 3.8, sole - 3.0)]
    fm = px.m_poly(FW, FH, pts)
    fn = ell_n(ax + 3.0, ay + 1.0, 9.0, 7.0)
    nx = np.where(fm & ~m, fn[0], nx)
    ny = np.where(fm & ~m, fn[1], ny)
    nz = np.where(fm & ~m, fn[2], nz)
    allm = m | fm
    layer = px.blank(FW, FH)
    paint_form(layer, allm, skin, (nx, ny, nz), lo=3 if not far else 2, hi=11 if not far else 7, light=SIDE_LIGHT,
               bias=0.0 if not far else -0.12, outline_dark=1 if not far else 0, outline_lit=3 if not far else 1)
    if not far:
        # knee cap, shin line and ankle bone like the reference
        for dx, dy, t in ((1, -1, 10), (1, 0, 9), (0, 1, 7)):
            yy, xx = int(ky + dy), int(kx + 2.4 + dx)
            if 0 <= yy < FH and 0 <= xx < FW and allm[yy, xx] and not px.edge(allm)[yy, xx]:
                layer[yy, xx] = skin[t]
        layer[int(ay), int(ax + 1)] = skin[9]
    px.over(img, layer)


S_CYCLE = [  # (near, far, bob)
    (S_FORWARD, S_BACK, 2),
    (S_STAND, S_SWING, 0),
    (S_BACK, S_FORWARD, 2),
    (S_SWING, S_STAND, 0),
]


def compose_side(skin, upper: np.ndarray, near, far, bob: int) -> np.ndarray:
    img = px.blank(FW, FH)
    side_leg(img, skin, far, bob, True)
    side_leg(img, skin, near, bob, False)
    px.over(img, px.shift(upper, 0, bob))
    return img


F_CYCLE = [
    Pose(bob=2, hand_l=1, hand_r=-1),
    Pose(bob=0, lift_l=4, hand_l=-2, hand_r=2),
    Pose(bob=2, hand_l=-1, hand_r=1),
    Pose(bob=0, lift_r=4, hand_l=2, hand_r=-2),
]


def breathe(img: np.ndarray, rows: int = 52) -> np.ndarray:
    out = img.copy()
    out[0:rows] = img[1:rows + 1]
    return out


# ---------------------------------------------------------------------------
# Eve
# ---------------------------------------------------------------------------

def eve_front_head() -> np.ndarray:
    """Head from Eve's portrait (same reduction as Adam's) plus the long
    hair falling in front of the shoulders."""
    key = 'eve:front'
    if key in _head_cache:
        return _head_cache[key]
    por = np.array(Image.open(portrait_path('eve')).convert('RGBA'))
    r = reduce_point(por, 1.6, 0.3)
    r = st.snap(r, 'skin_eve', 'hair_eve', 'eye', 'lips', 'leaf')
    r = st.denoise(r)
    hair_lk = px.ramp_lookup(P['hair_eve'])
    for y in range(r.shape[0]):
        for x in range(r.shape[1]):
            if y >= 29 and r[y, x, 3] and tuple(r[y, x, :3]) not in hair_lk:
                r[y, x] = (0, 0, 0, 0)
    ys, xs = np.where(r[:, :, 3] > 0)
    layer = px.blank(FW, FH)
    ox = int(round(CX - r.shape[1] / 2))
    px.over(layer, r[ys.min():], ox, 2)
    # continue the locks down to the chest
    rng = random.Random(9)
    m = np.zeros((FH, FW), bool)
    for side in (-1, 1):
        pts = [(19.0, 30.0), (24.0, 30.0), (24.6, 44.0), (23.6, 54.0), (21.0, 60.0), (17.6, 56.0), (17.0, 44.0)]
        if side > 0:
            pts = [(mirror_x(x), y) for x, y in pts]
        m |= px.m_poly(FW, FH, pts)
    old_locks = (layer[:, :, 3] > 0) & (np.arange(FH)[:, None] >= 30)
    sel = m | old_locks
    locks = synth_hair(sel, EVE, rng, darken_below=48)
    layer[sel] = locks[sel]
    _head_cache[key] = layer
    return layer


def eve_side_upper() -> np.ndarray:
    ref = st.snap(reference_side(), 'skin', 'hair', 'leaf')
    out = ref.copy()
    sk = px.ramp_lookup(P['skin'])
    hl = px.ramp_lookup(P['hair'])
    xs, ys = px.grid(FW, FH)
    for y in range(FH):
        for x in range(FW):
            if not out[y, x, 3]:
                continue
            k = tuple(out[y, x, :3])
            if k in sk:
                out[y, x] = P['skin_eve'][sk[k]]
            elif k in hl:
                out[y, x] = P['hair_eve'][min(9, hl[k])]
    skin = P['skin_eve']
    # a smaller, softer nose than Adam's
    for y in (20, 21, 22):
        out[y, 46] = (0, 0, 0, 0)
    out[21, 45] = skin[9]
    out[20, 45] = skin[8]
    out[22, 45] = skin[1]
    # remove the beard
    beard = px.m_poly(FW, FH, [(33.0, 21.5), (47.5, 20.5), (47.0, 27.0), (43.5, 31.5), (37.0, 32.5), (32.0, 30.0), (32.0, 24.0)])
    hair_now = np.array([[tuple(out[y, x, :3]) in px.ramp_lookup(P['hair_eve']) for x in range(FW)] for y in range(FH)])
    out[beard & hair_now & (ys >= 22)] = (0, 0, 0, 0)
    # new lower face in profile: upper lip, lips, chin, jaw, and the neck
    face = px.m_poly(FW, FH, [(37.0, 20.0), (45.6, 21.6), (45.2, 23.0), (44.4, 23.4), (44.9, 24.4), (44.2, 25.4), (44.6, 26.4),
                              (43.6, 28.0), (41.2, 29.2), (37.0, 28.8), (34.0, 27.0), (33.6, 22.0)])
    neck = px.m_poly(FW, FH, [(30.0, 23.0), (38.6, 27.6), (39.0, 35.0), (28.6, 35.0)])
    layer = px.blank(FW, FH)
    paint_form(layer, neck, skin, ell_n(35.0, 30.0, 6.0, 9.0), lo=3, hi=9, light=SIDE_LIGHT, bias=-0.08, outline_dark=1, outline_lit=4)
    paint_form(layer, face, skin, ell_n(40.0, 20.0, 7.5, 9.5), lo=4, hi=11, light=SIDE_LIGHT, bias=0.0, outline_dark=1, outline_lit=4)
    lips = P['lips']
    for x, y, c in ((44, 24, lips[1]), (43, 24, lips[0]), (44, 25, lips[2]), (43, 25, lips[1]), (43, 26, skin[6]), (42, 27, skin[9]),
                    (41, 23, skin[8]), (38, 26, skin[5]), (39, 27, skin[4])):
        layer[y, x] = c
    sel = (layer[:, :, 3] > 0) & ((out[:, :, 3] == 0) | (ys >= 22) & (xs >= 30))
    out[sel] = layer[sel]
    # thinner brow, lashes
    out[18, 41] = P['hair_eve'][2]
    out[18, 42] = P['hair_eve'][3]
    out[19, 43] = P['hair_eve'][0]
    # long hair down the back, behind the shoulders
    back = px.m_poly(FW, FH, [(18.0, 16.0), (30.0, 18.0), (31.0, 24.0), (28.6, 32.0), (26.0, 44.0), (24.4, 56.0), (22.6, 64.0),
                              (19.0, 66.0), (16.0, 60.0), (15.4, 48.0), (16.0, 32.0)])
    hair_layer = synth_hair(back, EVE, random.Random(4), light=SIDE_LIGHT, darken_below=44)
    res = px.blank(FW, FH)
    px.over(res, hair_layer)
    px.over(res, out)
    # the part of the mane over the top of the shoulder stays in front
    front_part = back & (ys < 40) & (xs < 30)
    res[front_part & (hair_layer[:, :, 3] > 0)] = hair_layer[front_part & (hair_layer[:, :, 3] > 0)]
    # modest leaf top over the chest
    top = px.blank(FW, FH)
    rng = random.Random(8)
    for x, ang in ((28.0, 0.25), (32.0, 0.05), (36.0, -0.15), (40.0, -0.45)):
        ref_leaf(top, x, 34.5, ang, 12.0, 4.6, shift=-1, light=SIDE_LIGHT)
    for x, ang in ((29.0, 0.15), (33.0, -0.05), (37.0, -0.25), (40.5, -0.55)):
        ref_leaf(top, x, 39.0, ang, 11.0, 4.8, shift=0, light=SIDE_LIGHT)
    px.over(res, top)
    # longer skirt: one more ring of leaves under the reference skirt
    sk2 = px.blank(FW, FH)
    for x, ang in ((22.0, 0.5), (26.0, 0.25), (30.0, 0.05), (34.0, -0.1), (38.0, -0.3), (42.0, -0.55)):
        ref_leaf(sk2, x, 72.0, ang, 18.0, 5.6, shift=-1 if x < 30 else 0, light=SIDE_LIGHT)
    under = px.blank(FW, FH)
    px.over(under, sk2)
    px.over(under, res)
    return under


# ---------------------------------------------------------------------------
# strands (white hair / beards) for sprites
# ---------------------------------------------------------------------------

def strands(img: np.ndarray, mask: np.ndarray, rmp, lo: int, hi: int, light=FRONT_LIGHT, freq: float = 1.1,
            wave: float = 0.3, seed: float = 0.0, outline: int = 2) -> None:
    hh, ww = mask.shape
    xs, ys = px.grid(ww, hh)
    n = px.normals_dome(mask)
    vol = px.lambert(*n, light=light, ambient=0.0, wrap=0.3)
    phase = (xs + 2.0 * np.sin(ys * wave + xs * 0.15 + seed)) * freq
    sv = np.sin(phase)
    t = vol * 0.75 + (sv * 0.5 + 0.5) * 0.25
    idx = np.clip(np.floor(t * (hi - lo + 1)) + lo, lo, hi).astype(int)
    idx = np.where(sv < -0.82, np.maximum(lo, idx - 2), idx)
    before = img[:, :, 3].copy()
    for y, x in zip(*np.where(mask)):
        img[y, x] = rmp[idx[y, x]]
    # outline only against empty space, never where the mass joins the head
    for y, x in zip(*np.where(px.edge(mask))):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if not (0 <= yy < hh and 0 <= xx < ww) or (not mask[yy, xx] and before[yy, xx] == 0):
                img[y, x] = rmp[outline]
                break


# ---------------------------------------------------------------------------
# God: a luminous, serene human figure in a white robe (artistic representation)
# ---------------------------------------------------------------------------

GOD_SKIN = [P['skin'][min(12, i + 2)] for i in range(13)]


def god_front(step: int = 0, back: bool = False) -> np.ndarray:
    iv, gold = P['ivory'], P['gold']
    sway = {0: 0, 1: 2, 2: 0, 3: -2, 4: 0}[step]
    bob = 2 if step in (1, 3) else 0
    img = px.blank(FW, FH)
    xs, ys = px.grid(FW, FH)
    # feet in sandals peeking under the hem
    for side, lift in ((-1, 3 if step == 2 else 0), (1, 3 if step == 4 else 0)):
        fx = CX + side * 6.0
        foot = px.m_poly(FW, FH, [(fx - 4.0, SOLE - 4 - lift), (fx + 4.0, SOLE - 4 - lift), (fx + 4.6, SOLE + 0.9 - lift), (fx - 4.6, SOLE + 0.9 - lift)])
        paint_form(img, foot, GOD_SKIN, ell_n(fx - 0.6, SOLE - 3, 6, 6), lo=3, hi=10, outline_dark=1, outline_lit=2)
        for x in range(int(fx - 4), int(fx + 5)):
            if foot[SOLE - 2 - lift, x]:
                img[SOLE - 2 - lift, x] = P['tunic'][3]
            if foot[SOLE - lift, x]:
                img[SOLE - lift, x] = P['tunic'][2]
    # robe
    hem_l, hem_r = 11.0 + sway * 0.6, 53.0 + sway * 0.6
    robe = px.m_poly(FW, FH, [(20.0, 34.0 + bob), (27.0, 31.0 + bob), (37.0, 31.0 + bob), (44.0, 34.0 + bob), (47.4, 40.0 + bob),
                              (47.0, 56.0 + bob), (49.0, 80.0), (hem_r, 114.0), (hem_r - 1.5, 115.6), (hem_l + 1.5, 115.6), (hem_l, 114.0),
                              (15.0, 80.0), (17.0, 56.0 + bob), (16.6, 40.0 + bob)])
    n = ell_n(CX - 3.0, 70.0, 26.0, 52.0)
    v = px.lambert(*n, light=FRONT_LIGHT, ambient=0.0, wrap=0.4)
    idx = px.quantize(v, len(iv), 5, 10, 0.04)
    px.paint(img, robe, iv, idx)
    # folds: long shallow valleys from the waist to the hem
    for f, x0 in enumerate((22.0, 27.0, 33.0, 38.0, 43.0)):
        for y in range(60, 116):
            t = (y - 60) / 56
            x = int(round(x0 + (x0 - CX) * 0.35 * t + sway * t * 0.8))
            if 0 <= x < FW and robe[y, x] and not px.edge(robe)[y, x]:
                k = idx[y, x]
                img[y, x] = iv[max(4, k - 2)]
                if x - 1 >= 0 and robe[y, x - 1]:
                    img[y, x - 1] = iv[min(10, k + 1)] if x < CX else img[y, x - 1]
    for y, x in zip(*np.where(px.edge(robe))):
        img[y, x] = iv[3]
    # gold trim: hem, mantle edges, sash
    for x in range(FW):
        col = np.where(robe[:, x])[0]
        if len(col) and col.max() > 100:
            img[col.max() - 1, x] = gold[6]
            img[col.max() - 2, x] = gold[8]
    if not back:
        for y in range(36 + bob, 114):
            t = (y - 36) / 78
            for xl in (int(round(27.5 - t * 7 + sway * t * 0.5)), int(round(36.5 + t * 7 + sway * t * 0.5))):
                if 0 <= xl < FW and robe[y, xl]:
                    img[y, xl] = gold[7 if xl < CX else 5]
    for x in range(17, 48):
        for dy, c in ((0, 8), (1, 6), (2, 4)):
            y = 56 + bob + dy
            if robe[y, x]:
                img[y, x] = gold[c]
    if not back:
        for y in range(59 + bob, 72 + bob):
            for x in (30, 31):
                img[y, x] = gold[6 if x == 30 else 4]
    # wide sleeves with hands
    for side in (-1, 1):
        def X(v):
            return v if side < 0 else mirror_x(v)
        sl = px.m_poly(FW, FH, [(X(20.0), 33.6 + bob), (X(14.6), 36.0 + bob), (X(11.6), 44.0 + bob), (X(9.6), 56.0 + bob), (X(7.0), 68.0 + bob),
                                (X(17.4), 68.0 + bob), (X(17.0), 56.0 + bob), (X(18.6), 44.0 + bob), (X(20.6), 38.0 + bob)])
        hand = ell(X(12.4), 70.4 + bob, 3.2, 3.8)
        paint_form(img, hand, GOD_SKIN, ell_n(X(12.0), 69.0 + bob, 4.0, 5.0), lo=4, hi=11, outline_dark=1, outline_lit=3)
        sn = blend(ell_n(X(13.0), 50.0 + bob, 8.0, 22.0), [], 0)
        paint_form(img, sl, iv, sn, lo=5, hi=10 if side < 0 else 9, bias=0.03, outline_dark=3, outline_lit=4)
        for x in range(FW):
            col = np.where(sl[:, x])[0]
            if len(col):
                img[col.max(), x] = gold[7]
                img[col.max() - 1, x] = gold[5]
    # head
    if back:
        hair = np.zeros((FH, FW), bool)
        hair |= px.m_poly(FW, FH, [(20.0, 4.0), (44.0, 4.0), (47.0, 14.0), (46.0, 30.0), (43.0, 40.0), (32.0, 42.0), (21.0, 40.0), (18.0, 30.0), (17.0, 14.0)])
        hair |= ell(CX, 13.0, 13.6, 12.0)
        strands(img, hair, iv, 3, 10, seed=0.5)
    else:
        img_head = god_front_head()
        px.over(img, px.shift(img_head, 0, bob))
    return img


def god_front_head() -> np.ndarray:
    key = 'god:front'
    if key in _head_cache:
        return _head_cache[key]
    por = np.array(Image.open(portrait_path('god')).convert('RGBA'))
    r = reduce_point(por, 1.6, 0.3)
    r = st.snap(r, 'skin', 'ivory', 'eye', 'gold')
    r = st.denoise(r)
    r[29:] = 0
    ivl = px.ramp_lookup(P['ivory'])
    for y in range(r.shape[0]):
        for x in range(r.shape[1]):
            if r[y, x, 3] and tuple(r[y, x, :3]) not in ivl and (y < 9 or x < 11 or x > 29):
                nb = [tuple(r[yy, xx, :3]) in ivl for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)) if 0 <= yy < r.shape[0] and 0 <= xx < r.shape[1]]
                if sum(nb) >= 2:
                    r[y, x] = P['ivory'][7]
    ys, xs = np.where(r[:, :, 3] > 0)
    layer = px.blank(FW, FH)
    ox = int(round(CX - r.shape[1] / 2))
    px.over(layer, r[ys.min():], ox, 2)
    iv = P['ivory']
    # the long beard and hair continue over the robe
    beard = px.m_poly(FW, FH, [(23.0, 26.0), (41.0, 26.0), (41.6, 34.0), (39.0, 42.0), (35.0, 50.0), (32.0, 53.0), (29.0, 50.0), (25.0, 42.0), (22.4, 34.0)])
    beard &= np.arange(FH)[:, None] >= 28
    strands(layer, beard, iv, 3, 10, seed=1.0)
    for side in (-1, 1):
        pts = [(18.0, 16.0), (22.6, 18.0), (23.0, 30.0), (22.0, 40.0), (19.6, 44.0), (16.8, 40.0), (16.6, 26.0)]
        if side > 0:
            pts = [(mirror_x(x), y) for x, y in pts]
        lk = px.m_poly(FW, FH, pts) & (np.arange(FH)[:, None] >= 26)
        strands(layer, lk, iv, 3, 10, seed=2.0 + side)
    _head_cache[key] = layer
    return layer


def god_side(step: int = 0) -> np.ndarray:
    """Profile: the reference head recoloured (white hair, luminous skin)
    with a long beard, over a robe."""
    iv, gold = P['ivory'], P['gold']
    sway = {0: 0, 1: 2, 2: 0, 3: -2, 4: 0}[step]
    bob = 2 if step in (1, 3) else 0
    ref = st.snap(reference_side(), 'skin', 'hair', 'leaf')
    head = px.blank(FW, FH)
    sk = px.ramp_lookup(P['skin'])
    hl = px.ramp_lookup(P['hair'])
    for y in range(0, 32):
        for x in range(FW):
            if not ref[y, x, 3]:
                continue
            k = tuple(ref[y, x, :3])
            in_face = (x >= 37 and 13 <= y) or (30 <= x <= 34 and 16 <= y <= 24) or y >= 24
            if k in sk and in_face:
                head[y, x] = GOD_SKIN[sk[k]]
            elif k in sk:
                head[y, x] = iv[7]
            elif k in hl:
                if (y == 19 or y == 20) and x == 41:
                    head[y, x] = P['hair'][1]       # keep the eye dark
                else:
                    head[y, x] = iv[[3, 4, 5, 5, 6, 7, 8, 9, 10, 10][hl[k]]]
    xs, ys = px.grid(FW, FH)
    beard = px.m_poly(FW, FH, [(34.0, 22.0), (46.0, 21.6), (46.0, 30.0), (43.0, 40.0), (39.0, 48.0), (36.0, 44.0), (34.0, 32.0)])
    head[beard & (ys >= 22)] = (0, 0, 0, 0)
    strands(head, beard & (ys >= 22), iv, 3, 10, light=SIDE_LIGHT, seed=0.7)
    hair_back = px.m_poly(FW, FH, [(18.0, 14.0), (30.0, 18.0), (31.0, 28.0), (29.0, 40.0), (24.0, 44.0), (19.0, 40.0), (17.0, 26.0)])
    hb = px.blank(FW, FH)
    strands(hb, hair_back & (ys >= 16), iv, 4, 10, light=SIDE_LIGHT, seed=1.7)
    img = px.blank(FW, FH)
    # sandals
    for k, (fx, lift) in enumerate(((37.0 + max(0, sway), 0), (28.0 - max(0, -sway), 0))):
        foot = px.m_poly(FW, FH, [(fx - 4, SOLE - 4), (fx + 3, SOLE - 4), (fx + 9, SOLE - 1), (fx + 9.6, SOLE + 0.9), (fx - 4.6, SOLE + 0.9)])
        paint_form(img, foot, GOD_SKIN, ell_n(fx + 2, SOLE - 3, 8, 5), lo=3 if k else 2, hi=10 if k else 7, light=SIDE_LIGHT, outline_dark=1)
        for x in range(int(fx - 4), int(fx + 10)):
            if foot[SOLE, x]:
                img[SOLE, x] = P['tunic'][2]
    robe = px.m_poly(FW, FH, [(24.0, 31.0 + bob), (36.0, 30.0 + bob), (40.6, 36.0 + bob), (41.0, 56.0 + bob), (44.0 + sway, 114.0),
                              (42.6 + sway, 115.6), (21.0 + sway * 0.5, 115.6), (20.0 + sway * 0.5, 114.0), (22.6, 80.0), (21.0, 56.0 + bob), (21.6, 38.0 + bob)])
    n = ell_n(30.0, 70.0, 14.0, 52.0)
    v = px.lambert(*n, light=SIDE_LIGHT, ambient=0.0, wrap=0.4)
    idx = px.quantize(v, len(iv), 5, 10, 0.04)
    px.paint(img, robe, iv, idx)
    for x0 in (27.0, 33.0, 38.0):
        for y in range(60, 116):
            t = (y - 60) / 56
            x = int(round(x0 + sway * t * 0.8))
            if robe[y, x] and not px.edge(robe)[y, x]:
                img[y, x] = iv[max(4, idx[y, x] - 2)]
    for y, x in zip(*np.where(px.edge(robe))):
        img[y, x] = iv[3]
    for x in range(FW):
        col = np.where(robe[:, x])[0]
        if len(col) and col.max() > 100:
            img[col.max() - 1, x] = gold[6]
            img[col.max() - 2, x] = gold[8]
    for x in range(20, 43):
        for dy, c in ((0, 8), (1, 6), (2, 4)):
            if robe[56 + bob + dy, x]:
                img[56 + bob + dy, x] = gold[c]
    # sleeve and hand (arm swings a little)
    sl = px.m_poly(FW, FH, [(25.0, 33.0 + bob), (32.0, 33.0 + bob), (35.0 - sway, 56.0 + bob), (37.6 - sway, 68.0 + bob), (26.6 - sway, 68.0 + bob), (24.0, 48.0 + bob)])
    hand = ell(32.6 - sway, 70.4 + bob, 3.0, 3.6)
    paint_form(img, hand, GOD_SKIN, ell_n(33.4 - sway, 69.0 + bob, 4, 5), lo=4, hi=11, light=SIDE_LIGHT, outline_dark=1, outline_lit=3)
    paint_form(img, sl, iv, ell_n(31.0, 50.0 + bob, 9.0, 22.0), lo=5, hi=10, light=SIDE_LIGHT, bias=0.03, outline_dark=3, outline_lit=4)
    for x in range(FW):
        col = np.where(sl[:, x])[0]
        if len(col):
            img[col.max(), x] = gold[7]
            img[col.max() - 1, x] = gold[5]
    px.over(img, px.shift(hb, 0, bob))
    px.over(img, px.shift(head, 0, bob))
    return img


# ---------------------------------------------------------------------------
# outfits: fig-leaf coverings (Genesis 3:7) and garments of skin (3:21)
# ---------------------------------------------------------------------------

def fig_leaf(img: np.ndarray, x0: float, y0: float, size: float, ang: float, light=FRONT_LIGHT, shift: int = 0) -> np.ndarray:
    """A broad fig leaf with three rounded lobes hanging from (x0, y0)."""
    rmp = P['fig']
    H, W = img.shape[:2]
    dx, dy = math.sin(ang), math.cos(ang)
    nxp, nyp = dy, -dx
    c = (x0 + dx * size * 0.62, y0 + dy * size * 0.62)
    m = px.m_ellipse(W, H, c[0], c[1], size * 0.48, size * 0.48)
    for sgn in (-1, 1):
        lx = c[0] + nxp * sgn * size * 0.4 - dx * size * 0.04
        ly = c[1] + nyp * sgn * size * 0.4 - dy * size * 0.04
        m |= px.m_ellipse(W, H, lx, ly, size * 0.36, size * 0.38)
    tip = (x0 + dx * size * 1.16, y0 + dy * size * 1.16)
    m |= px.m_poly(W, H, [(c[0] + nxp * size * 0.3, c[1] + nyp * size * 0.3), tip, (c[0] - nxp * size * 0.3, c[1] - nyp * size * 0.3)])
    m |= px.m_capsule(W, H, x0, y0, c[0], c[1], 1.0, 1.0)
    n = px.normals_ellipsoid(W, H, c[0] - 0.8, c[1] - 0.8, size * 0.95, size * 0.95)
    v = px.lambert(*n, light=light, ambient=0.0, wrap=0.4)
    idx = px.quantize(v, len(rmp), 3 + shift, 7 + shift, -0.04)
    px.paint(img, m, rmp, np.clip(idx, 1, 8))
    # veins: midrib and two side ribs
    for (ex, ey) in (tip, (c[0] + nxp * size * 0.6, c[1] + nyp * size * 0.6), (c[0] - nxp * size * 0.6, c[1] - nyp * size * 0.6)):
        n_ = int(max(abs(ex - x0), abs(ey - y0))) + 1
        for k in range(1, n_):
            x = int(round(x0 + (ex - x0) * k / n_))
            y = int(round(y0 + (ey - y0) * k / n_))
            if 0 <= x < W and 0 <= y < H and m[y, x] and not px.edge(m)[y, x]:
                img[y, x] = rmp[min(8, 6 + shift)]
    px.outline_inner(img, m, rmp[0])
    return m


def fig_apron_front(pose: Pose, back: bool, fem: bool) -> np.ndarray:
    img = px.blank(FW, FH)
    b = pose.bob
    top = 56.0 + b
    for x, ang, sh in ((18.5, 0.6, -1), (45.5, -0.6, -1), (22.0, 0.4, -1), (42.0, -0.4, -1), (25.5, 0.22, 0), (38.5, -0.22, 0),
                       (29.0, 0.08, 0), (35.0, -0.08, 0), (32.0, 0.0, 1)):
        fig_leaf(img, x, top, 12.0 if not fem else 13.0, ang, shift=sh if not back else min(0, sh))
    for x, ang in ((21.0, 0.3), (26.5, 0.12), (32.0, 0.0), (37.5, -0.12), (43.0, -0.3)):
        fig_leaf(img, x, top + (11.0 if not fem else 15.0), 10.0, ang, shift=0 if not back else -1)
    return img


def fig_top_front(pose: Pose, back: bool, fem: bool) -> np.ndarray:
    img = px.blank(FW, FH)
    b = pose.bob
    if fem:
        for x, y, ang in ((20.0, 32.5, 0.4), (44.0, 32.5, -0.4), (24.5, 34.0, 0.2), (39.5, 34.0, -0.2), (28.5, 34.5, 0.06), (35.5, 34.5, -0.06)):
            fig_leaf(img, x, y + b, 9.0, ang, shift=0 if not back else -1)
        for x, ang in ((23.0, 0.15), (28.0, 0.05), (32.0, 0.0), (36.0, -0.05), (41.0, -0.15)):
            fig_leaf(img, x, 41.0 + b, 7.6, ang, shift=0)
    else:
        for i, (x, y) in enumerate(((21.0, 33.0), (25.0, 38.0), (29.0, 43.0), (33.0, 48.0), (37.0, 52.5), (41.0, 56.0))):
            fig_leaf(img, x, y + b, 6.8, -0.75, shift=0 if i % 2 else -1)
    return img


def tunic_front_layers(pose: Pose, back: bool, fem: bool) -> tuple[np.ndarray, np.ndarray]:
    """(body layer, sleeves layer) of the garment of skin."""
    b = pose.bob
    hem = 92.0 if not fem else 100.0
    body = px.m_poly(FW, FH, [(19.4, 34.4 + b), (26.6, 31.6 + b), (37.4, 31.6 + b), (44.6, 34.4 + b), (47.0, 40.0 + b), (45.6, 52.0 + b),
                              (46.4, 64.0 + b), (49.4, hem - 2), (48.0, hem), (16.0, hem), (14.6, hem - 2), (17.6, 64.0 + b), (18.4, 52.0 + b), (17.0, 40.0 + b)])
    # ragged hem
    xs, ys = px.grid(FW, FH)
    body &= ~((ys > hem - 3) & (np.sin(xs * 1.7) > 0.35))
    layer = px.blank(FW, FH)
    n = ell_n(CX - 2.0, 58.0 + b, 22.0, 40.0)
    v = px.lambert(*n, light=FRONT_LIGHT, ambient=0.0, wrap=0.35)
    base = px.quantize(v, len(P['tunic']), 3, 9, -0.02)
    tex = px.blank(FW, FH)
    strands(tex, body, P['tunic'], 2, 9, freq=0.7, wave=0.5, seed=3.0, outline=1)
    tl = px.ramp_lookup(P['tunic'])
    for y, x in zip(*np.where(body)):
        k = tl.get(tuple(tex[y, x, :3]), 5)
        layer[y, x] = P['tunic'][int(np.clip(round((base[y, x] * 2 + k) / 3), 1, 10))]
    for y, x in zip(*np.where(px.edge(body))):
        layer[y, x] = P['tunic'][1]
    if not back:
        for y in range(int(31 + b), int(38 + b)):
            w = (y - 30 - b) * 0.7
            for x in range(int(CX - w), int(CX + w)):
                layer[y, x] = (0, 0, 0, 0)
        for y in range(int(31 + b), int(38 + b)):
            for x in range(26, 38):
                if not layer[y, x, 3] and body[y, x]:
                    layer[y, x] = P['skin'][7] if x < 32 else P['skin'][6]
    rope = P['rope']
    for x in range(16, 49):
        for dy in (0, 1):
            y = int(57 + b + dy)
            if body[y, x]:
                layer[y, x] = rope[4 if (x + dy) % 2 else 2]
    if not back:
        for y in range(int(59 + b), int(67 + b)):
            layer[y, 23] = rope[3 if y % 2 else 2]
    sleeves = px.blank(FW, FH)
    for side in (-1, 1):
        def X(v):
            return v if side < 0 else mirror_x(v)
        sm = px.m_poly(FW, FH, [(X(20.0), 33.4 + b), (X(15.4), 34.8 + b), (X(11.4), 39.0 + b), (X(10.6), 47.0 + b), (X(18.6), 47.0 + b), (X(20.6), 40.0 + b)])
        sm &= ~((ys > 45 + b) & (np.sin(xs * 2.1) > 0.4))
        tex2 = px.blank(FW, FH)
        strands(tex2, sm, P['tunic'], 2, 9, freq=0.7, wave=0.5, seed=5.0 + side, outline=1)
        v2 = px.lambert(*ell_n(X(14.6), 38.0 + b, 7.0, 9.0), light=FRONT_LIGHT, ambient=0.0, wrap=0.35)
        b2 = px.quantize(v2, len(P['tunic']), 3, 9 if side < 0 else 7, 0.0)
        for y, x in zip(*np.where(sm)):
            k = tl.get(tuple(tex2[y, x, :3]), 5)
            sleeves[y, x] = P['tunic'][int(np.clip(round((b2[y, x] * 2 + k) / 3), 1, 10))]
        for y, x in zip(*np.where(px.edge(sm))):
            sleeves[y, x] = P['tunic'][1]
    return layer, sleeves


def outfit_front(look: Look, pose: Pose, back: bool, outfit: str, seed: int = 7) -> np.ndarray:
    if outfit == 'leaves':
        return compose_front(look, pose, back, 'leaves', seed)
    L = body_front(look, pose, back)
    img = px.blank(FW, FH)
    px.over(img, L['legs'])
    px.over(img, L['torso'])
    sleeves = None
    if outfit == 'fig':
        px.over(img, fig_apron_front(pose, back, look.female))
        px.over(img, fig_top_front(pose, back, look.female))
    elif outfit == 'tunic':
        body, sleeves = tunic_front_layers(pose, back, look.female)
        px.over(img, body)
    px.over(img, L['arms'])
    if sleeves is not None:
        px.over(img, sleeves)
    if back:
        head = back_head(look)
    else:
        head = eve_front_head() if look.female else front_head(look)
    px.over(img, px.shift(head, 0, pose.bob))
    return img


def side_arm_layer(upper: np.ndarray, skin) -> np.ndarray:
    """The near arm of the reference side view (in front of garments)."""
    arm = px.m_poly(FW, FH, [(18.0, 33.0), (28.0, 33.0), (29.6, 50.0), (33.0, 56.0), (35.0, 64.0), (34.6, 74.0), (27.0, 74.0), (25.0, 60.0), (20.6, 50.0)])
    out = px.blank(FW, FH)
    sk = px.ramp_lookup(skin)
    snapped = upper
    for y, x in zip(*np.where(arm)):
        if snapped[y, x, 3] and tuple(snapped[y, x, :3]) in sk:
            out[y, x] = snapped[y, x]
    return out


def outfit_side_upper(look: Look, outfit: str) -> np.ndarray:
    if look.female:
        up = eve_side_upper()
        skin_key = 'skin_eve'
    else:
        up = side_upper(reference_side(), ADAM.skin)
        up = st.snap(up, 'skin', 'hair', 'leaf')
        skin_key = 'skin'
    if outfit == 'leaves':
        return up
    skin = P[skin_key]
    arm = side_arm_layer(up, skin)
    out = up.copy()
    xs, ys = px.grid(FW, FH)
    leaf = px.ramp_lookup(P['leaf'])
    # remove the old leaf garments
    for y in range(28, FH):
        for x in range(FW):
            if out[y, x, 3] and tuple(out[y, x, :3]) in leaf:
                out[y, x] = (0, 0, 0, 0)
    # thighs that the leaf skirt was hiding
    thigh = px.m_poly(FW, FH, [(23.0, 56.0), (37.0, 56.0), (38.4, 78.0), (24.4, 80.0)])
    th = px.blank(FW, FH)
    paint_form(th, thigh, skin, ell_n(31.0, 66.0, 8.0, 16.0), lo=3, hi=9, light=SIDE_LIGHT, outline_dark=1, outline_lit=4)
    torso_fill = px.m_poly(FW, FH, [(22.0, 44.0), (37.0, 44.0), (38.0, 57.0), (23.0, 57.0)])
    tf = px.blank(FW, FH)
    paint_form(tf, torso_fill, skin, ell_n(31.0, 48.0, 8.0, 10.0), lo=3, hi=10, light=SIDE_LIGHT, outline_dark=1, outline_lit=4)
    res = px.blank(FW, FH)
    px.over(res, th)
    px.over(res, tf)
    px.over(res, out)
    out = res
    if outfit == 'fig':
        g = px.blank(FW, FH)
        for x, ang, sh in ((21.0, 0.55, -1), (24.5, 0.35, -1), (28.0, 0.15, 0), (31.5, 0.0, 0), (35.0, -0.15, 0), (38.0, -0.4, 1)):
            fig_leaf(g, x, 55.0, 12.0 if not look.female else 13.0, ang, light=SIDE_LIGHT, shift=sh)
        for x, ang in ((23.0, 0.3), (28.0, 0.1), (33.0, -0.05), (37.5, -0.3)):
            fig_leaf(g, x, 66.0 if not look.female else 70.0, 10.0, ang, light=SIDE_LIGHT)
        if look.female:
            for x, y, ang in ((28.0, 32.5, 0.15), (32.0, 33.0, 0.0), (35.5, 33.5, -0.25), (38.5, 35.5, -0.5), (30.0, 39.0, 0.05), (34.5, 40.0, -0.2), (38.0, 41.0, -0.45)):
                fig_leaf(g, x, y, 7.8, ang, light=SIDE_LIGHT)
        else:
            for i, (x, y) in enumerate(((27.0, 33.0), (31.0, 39.0), (34.5, 45.0), (37.0, 51.0))):
                fig_leaf(g, x, y, 6.6, -0.4, light=SIDE_LIGHT, shift=0 if i % 2 else -1)
        px.over(out, g)
    elif outfit == 'tunic':
        hem = 92.0 if not look.female else 100.0
        m = px.m_poly(FW, FH, [(22.0, 31.0), (34.0, 31.0), (38.6, 38.0), (38.6, 50.0), (37.6, 58.0), (40.6, 70.0), (42.0, hem), (20.0, hem), (21.6, 70.0), (21.6, 50.0), (20.6, 38.0)])
        m &= ~((ys > hem - 3) & (np.sin(xs * 1.7) > 0.35))
        layer = px.blank(FW, FH)
        tex = px.blank(FW, FH)
        strands(tex, m, P['tunic'], 2, 9, freq=0.7, wave=0.5, seed=3.0, outline=1)
        v = px.lambert(*ell_n(31.0, 60.0, 12.0, 34.0), light=SIDE_LIGHT, ambient=0.0, wrap=0.35)
        base = px.quantize(v, len(P['tunic']), 3, 9, -0.02)
        tl = px.ramp_lookup(P['tunic'])
        for y, x in zip(*np.where(m)):
            k = tl.get(tuple(tex[y, x, :3]), 5)
            layer[y, x] = P['tunic'][int(np.clip(round((base[y, x] * 2 + k) / 3), 1, 10))]
        for y, x in zip(*np.where(px.edge(m))):
            layer[y, x] = P['tunic'][1]
        for x in range(18, 44):
            for dy in (0, 1):
                if m[57 + dy, x]:
                    layer[57 + dy, x] = P['rope'][4 if (x + dy) % 2 else 2]
        px.over(out, layer)
    px.over(out, arm)
    if outfit == 'tunic':
        sm = px.m_poly(FW, FH, [(19.0, 32.0), (29.0, 32.0), (31.0, 45.0), (21.0, 46.0)])
        sl = px.blank(FW, FH)
        strands(sl, sm, P['tunic'], 3, 9, freq=0.7, wave=0.5, seed=6.0, outline=1)
        px.over(out, sl)
    return out


# ---------------------------------------------------------------------------
# sheets
# ---------------------------------------------------------------------------

def character_frames(look: Look, outfit: str) -> dict[str, list[np.ndarray]]:
    """direction -> [idle0, idle1, walk0, walk1, walk2, walk3]"""
    out = {}
    for d, back in (('down', False), ('up', True)):
        idle = outfit_front(look, Pose(), back, outfit)
        out[d] = [idle, breathe(idle)] + [outfit_front(look, p, back, outfit) for p in F_CYCLE]
    up = outfit_side_upper(look, outfit)
    if look.name == 'adam' and outfit == 'leaves':
        idle = reference_side()
    else:
        idle = compose_side(look.skin, up, S_STAND, S_STAND, 0)
    out['right'] = [idle, breathe(idle)] + [compose_side(look.skin, up, n, f, b) for n, f, b in S_CYCLE]
    return out


def god_frames() -> dict[str, list[np.ndarray]]:
    out = {}
    for d, back in (('down', False), ('up', True)):
        idle = god_front(0, back)
        out[d] = [idle, breathe(idle)] + [god_front(s, back) for s in (1, 2, 3, 4)]
    idle = god_side(0)
    out['right'] = [idle, breathe(idle)] + [god_side(s) for s in (1, 2, 3, 4)]
    return out


if __name__ == '__main__':
    import sys
    frames = []
    for look in (ADAM, EVE):
        for o in ('fig', 'tunic'):
            frames += [outfit_front(look, Pose(), False, o), outfit_front(look, Pose(), True, o),
                       compose_side(look.skin, outfit_side_upper(look, o), S_STAND, S_STAND, 0)]
    px.preview(px.sheet(frames, 6), sys.argv[1], 3, (120, 160, 90, 255))
