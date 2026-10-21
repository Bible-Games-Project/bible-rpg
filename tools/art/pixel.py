"""Small pixel-art toolkit shared by every asset generator.

Every generated sprite in the game goes through these helpers so that the
whole world follows the same rules that were measured on the Adam reference
sprite (art/reference/adam-sprite.webp):

* One art pixel is the smallest unit. The game renders at integer zoom.
* Forms are shaded with a light coming from the upper left (characters seen
  from the side are lit from the direction they face, like the reference).
* Shading uses short, hand-picked colour ramps (dark -> light), never smooth
  gradients, and no dithering.
* Silhouettes get a 1px "selective" outline: the darkest tone of the part's
  own ramp instead of pure black (the reference uses dark red-brown on skin,
  near-black brown on hair and very dark green on leaves).

Images are numpy arrays shaped (h, w, 4), dtype uint8, RGBA.
"""

from __future__ import annotations

import math
import random
from typing import Callable, Iterable, Sequence

import numpy as np
from PIL import Image, ImageDraw

Color = tuple[int, int, int, int]

LIGHT = np.array([-0.55, -0.62, 0.56])
LIGHT = LIGHT / np.linalg.norm(LIGHT)


# --------------------------------------------------------------------------
# Colours
# --------------------------------------------------------------------------

def hexc(h: str, a: int = 255) -> Color:
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def ramp(*hexes: str) -> list[Color]:
    return [hexc(h) for h in hexes]


def mix(c1: Sequence[int], c2: Sequence[int], t: float) -> Color:
    return tuple(int(round(c1[i] * (1 - t) + c2[i] * t)) for i in range(3)) + (255,)  # type: ignore


def darken(c: Sequence[int], f: float) -> Color:
    return (int(c[0] * f), int(c[1] * f), int(c[2] * f), 255)


# Ramps are ordered dark -> light. Many come straight from the colours that
# were sampled from the supplied Adam references.
R = {
    # Adam's skin, sampled from the sprite + portrait references.
    'skin': ramp('#6e2c1a', '#8a3b24', '#a24a2d', '#b85a38', '#cc6c45', '#dc7c50', '#e98d5c', '#f29f69', '#f9b47c'),
    # Eve: same family, a touch lighter and rosier.
    'skin_eve': ramp('#6e2c1e', '#8c3e2a', '#a85234', '#bf6441', '#d4774e', '#e2895b', '#ee9c69', '#f6ae79', '#fcc18c'),
    'hair': ramp('#1a0a0c', '#2b1211', '#3e1b15', '#52251a', '#68301f', '#7f3f27', '#965033', '#ad6440'),
    'hair_eve': ramp('#160909', '#25100f', '#371812', '#4b2117', '#612b1c', '#783822', '#90482b', '#a85a36'),
    'leaf': ramp('#0f2412', '#173418', '#244a2c', '#35601f', '#4f7a2c', '#6c9d3c', '#8fbd4c', '#b4d96a'),
    'leaf_dark': ramp('#0b1a10', '#112617', '#18361f', '#244a2c', '#2f5e2c', '#437a34', '#5d9440', '#7bae4e'),
    'leaf_blue': ramp('#0c1d18', '#122c24', '#1b3f31', '#26553e', '#356c4a', '#4b8657', '#68a166', '#8cbc7a'),
    'olive_leaf': ramp('#1b2618', '#283624', '#3a4a31', '#4e5f3f', '#66754f', '#808d63', '#9caa7c', '#bcc79a'),
    'fig_leaf': ramp('#0e2410', '#16371a', '#205024', '#2f6a2b', '#428535', '#5ba041', '#7cbb52', '#a3d46a'),
    'bark': ramp('#1f120d', '#2f1c14', '#43291c', '#5a3826', '#795039', '#946a48', '#ad8560', '#c6a07a'),
    'bark_grey': ramp('#1e1a17', '#2e2823', '#423a32', '#5a5045', '#73685a', '#8e8270', '#a99d88', '#c4b9a2'),
    'earth': ramp('#2a1a12', '#3e281b', '#553824', '#6d4a30', '#86603f', '#9d7650', '#b48d64', '#c9a57c'),
    'soil': ramp('#20140e', '#2f1d14', '#41291b', '#553624', '#6b462f', '#82583a'),
    'sand': ramp('#6a5032', '#86683f', '#a6844f', '#c69a66', '#d6b07c', '#e4c597', '#efd9b4'),
    'stone': ramp('#1d1f24', '#2e3036', '#43454b', '#5b5c5f', '#757471', '#908d86', '#aca79c', '#c8c2b4'),
    'stone_warm': ramp('#241c18', '#372b24', '#4c3d33', '#635244', '#7c6a58', '#978470', '#b19e88', '#cbb9a2'),
    'water': ramp('#0f1a2e', '#17233d', '#1d3552', '#24486a', '#2e6184', '#3c7c9b', '#5a9db4', '#8cc3cf', '#cfe9ea'),
    'gold': ramp('#4e2f10', '#6e4416', '#8f5c1e', '#b67c2c', '#d9a145', '#e8b45b', '#f2cc7d', '#fae4a8', '#fff6d8'),
    'ivory': ramp('#5c4f3e', '#7f705a', '#a39378', '#c4b597', '#ddd0b2', '#f0e5cc', '#f8f0dc', '#fdf8ec', '#ffffff'),
    'robe_shadow': ramp('#3a3446', '#4f4a5e', '#6a6678', '#8a8794', '#aeaab0'),
    'wool': ramp('#4a4038', '#6a5e52', '#8e8272', '#b0a592', '#cdc3ae', '#e2dac6', '#f2ecdc', '#fbf8ee'),
    'goat': ramp('#24160f', '#3a2418', '#523420', '#6b452b', '#86593a', '#a1724d', '#bb8c63', '#d2a77d'),
    'deer': ramp('#2e1609', '#45220f', '#5f3216', '#7b431f', '#97572a', '#b06c38', '#c8854b', '#dca167'),
    'lion': ramp('#3b2210', '#583318', '#774722', '#965f2f', '#b47a3e', '#cc9452', '#deae69', '#ecc88a'),
    'mane': ramp('#21110a', '#351c0f', '#4c2815', '#63351b', '#7b4322', '#93542b', '#a96835'),
    'rabbit': ramp('#3a2e26', '#54443a', '#706052', '#8c7c6c', '#a89886', '#c2b4a0', '#d8ccb8', '#ece4d4'),
    'horse': ramp('#1e100b', '#2f1a11', '#432518', '#5a321f', '#723f27', '#8b5032', '#a3643f', '#ba7b51'),
    'camel': ramp('#4a3420', '#644830', '#7f5e3e', '#9a764f', '#b38e62', '#c8a477', '#d9ba8f', '#e8d0aa'),
    'dove': ramp('#3e3e48', '#5a5a66', '#7a7a86', '#9a9aa4', '#b9b8c0', '#d4d2d6', '#e8e6e6', '#f8f6f2'),
    'serpent': ramp('#0e1a10', '#16291a', '#203a22', '#2e4f2a', '#426634', '#5a7f3e', '#789a4c', '#9bb460'),
    'serpent_belly': ramp('#4a4022', '#6a5c30', '#8d7c42', '#ad9a58', '#c8b670', '#dccd8c'),
    'fig': ramp('#1f0f1c', '#341a2e', '#4d2742', '#6a3658', '#874870', '#a35f88', '#bf7ea0'),
    'pomegranate': ramp('#2e0a0c', '#4c1113', '#6e1a1a', '#922420', '#b5342a', '#cf4e38', '#e2704a', '#f09a6a'),
    'date': ramp('#2a1208', '#41200e', '#5c3014', '#7a421b', '#9a5a24', '#ba7631', '#d29444'),
    'olive_fruit': ramp('#151a0c', '#222a12', '#33401a', '#465624', '#5d6e30', '#7a8a40'),
    'grape': ramp('#120c1e', '#1e1430', '#2c1e46', '#3e2a5e', '#543c78', '#6e5292', '#8c6cac'),
    'forbidden': ramp('#2a0a08', '#47120c', '#6a1c10', '#902a14', '#b53e1a', '#d25a22', '#e5823a', '#f0aa58', '#f8d080'),
    'life_fruit': ramp('#5a3a10', '#7d5518', '#a07222', '#c49134', '#ddb04c', '#efcc6c', '#f8e39a', '#fff4cc'),
    'flower_white': ramp('#6a6458', '#a8a294', '#d8d2c2', '#f2ecdc', '#fffaf0'),
    'flower_yellow': ramp('#6a4a10', '#a07418', '#d0a228', '#e8c84a', '#f6e27a'),
    'flower_red': ramp('#4a1214', '#7a1e20', '#a83232', '#c84c44', '#e27a64'),
    'flower_pink': ramp('#5a2434', '#8a3c54', '#b85a74', '#d97a8a', '#f0a6ae'),
    'flower_blue': ramp('#22204a', '#36327a', '#5050a8', '#7470c8', '#a49ee0'),
    'flower_orange': ramp('#5a2a0c', '#8a4414', '#c0641e', '#dc8a34', '#f0b05a'),
    'skin_tunic': ramp('#2c1a10', '#432819', '#5c3a24', '#77502f', '#91683d', '#a8804f', '#bf9a66', '#d4b382'),
    'thorn': ramp('#1a1610', '#2c2618', '#433a22', '#5c522c', '#776c38', '#948a4a'),
    'shadow': [(10, 22, 12, 255)],
}


def nearest_in(c: Sequence[int], palette: Sequence[Sequence[int]]) -> Color:
    best = None
    bd = 1e18
    for p in palette:
        d = (c[0] - p[0]) ** 2 * 0.3 + (c[1] - p[1]) ** 2 * 0.59 + (c[2] - p[2]) ** 2 * 0.11
        if d < bd:
            bd = d
            best = p
    return tuple(best[:3]) + (255,)  # type: ignore


# --------------------------------------------------------------------------
# Images
# --------------------------------------------------------------------------

def blank(w: int, h: int) -> np.ndarray:
    return np.zeros((h, w, 4), np.uint8)


def load(path: str) -> np.ndarray:
    return np.array(Image.open(path).convert('RGBA'))


def save(img: np.ndarray, path: str) -> None:
    Image.fromarray(img).save(path, optimize=True)


def put(img: np.ndarray, x: int, y: int, c: Sequence[int]) -> None:
    h, w = img.shape[:2]
    if 0 <= x < w and 0 <= y < h:
        if len(c) == 4 and c[3] == 0:
            img[y, x] = (0, 0, 0, 0)
        else:
            img[y, x] = (c[0], c[1], c[2], c[3] if len(c) == 4 else 255)


def get(img: np.ndarray, x: int, y: int) -> Color | None:
    h, w = img.shape[:2]
    if 0 <= x < w and 0 <= y < h and img[y, x, 3] > 0:
        return tuple(int(v) for v in img[y, x])  # type: ignore
    return None


def over(dst: np.ndarray, src: np.ndarray, x: int = 0, y: int = 0) -> np.ndarray:
    """Paste src onto dst at (x, y) using binary alpha (pixel art has no
    partial transparency except for explicitly translucent effects)."""
    h, w = src.shape[:2]
    H, W = dst.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0:
        return dst
    s = src[y0 - y:y1 - y, x0 - x:x1 - x]
    d = dst[y0:y1, x0:x1]
    a = s[:, :, 3:4].astype(np.float32) / 255.0
    full = s[:, :, 3] == 255
    blended = (s[:, :, :3] * a + d[:, :, :3] * (1 - a)).astype(np.uint8)
    out_a = np.maximum(d[:, :, 3], s[:, :, 3])
    d[:, :, :3] = np.where(s[:, :, 3:4] > 0, blended, d[:, :, :3])
    d[:, :, 3] = np.where(full, 255, out_a)
    return dst


def flip_h(img: np.ndarray) -> np.ndarray:
    return img[:, ::-1].copy()


def crop_to_content(img: np.ndarray) -> tuple[np.ndarray, int, int]:
    ys, xs = np.where(img[:, :, 3] > 0)
    if len(xs) == 0:
        return img[:1, :1].copy(), 0, 0
    return img[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy(), int(xs.min()), int(ys.min())


def shift(img: np.ndarray, dx: int, dy: int) -> np.ndarray:
    out = np.zeros_like(img)
    return over(out, img, dx, dy)


def scale_nearest(img: np.ndarray, k: int) -> np.ndarray:
    return np.repeat(np.repeat(img, k, axis=0), k, axis=1)


# --------------------------------------------------------------------------
# Masks
# --------------------------------------------------------------------------

def grid(w: int, h: int) -> tuple[np.ndarray, np.ndarray]:
    ys, xs = np.mgrid[0:h, 0:w]
    return xs + 0.5, ys + 0.5


def m_ellipse(w: int, h: int, cx: float, cy: float, rx: float, ry: float) -> np.ndarray:
    xs, ys = grid(w, h)
    return ((xs - cx) / rx) ** 2 + ((ys - cy) / ry) ** 2 <= 1.0


def m_poly(w: int, h: int, pts: Iterable[tuple[float, float]]) -> np.ndarray:
    im = Image.new('L', (w, h), 0)
    ImageDraw.Draw(im).polygon([(float(x), float(y)) for x, y in pts], fill=255)
    return np.array(im) > 0


def m_capsule(w: int, h: int, x0: float, y0: float, x1: float, y1: float, r0: float, r1: float | None = None) -> np.ndarray:
    if r1 is None:
        r1 = r0
    xs, ys = grid(w, h)
    dx, dy = x1 - x0, y1 - y0
    ll = dx * dx + dy * dy
    if ll == 0:
        t = np.zeros_like(xs)
    else:
        t = np.clip(((xs - x0) * dx + (ys - y0) * dy) / ll, 0, 1)
    px, py = x0 + t * dx, y0 + t * dy
    r = r0 + (r1 - r0) * t
    return (xs - px) ** 2 + (ys - py) ** 2 <= r * r


def m_rect(w: int, h: int, x0: int, y0: int, x1: int, y1: int) -> np.ndarray:
    m = np.zeros((h, w), bool)
    m[max(0, y0):max(0, y1), max(0, x0):max(0, x1)] = True
    return m


def edge(mask: np.ndarray, diag: bool = False) -> np.ndarray:
    """Pixels inside the mask touching the outside (4- or 8-connected)."""
    p = np.pad(mask, 1, constant_values=False)
    n = ~p[:-2, 1:-1] | ~p[2:, 1:-1] | ~p[1:-1, :-2] | ~p[1:-1, 2:]
    if diag:
        n |= ~p[:-2, :-2] | ~p[:-2, 2:] | ~p[2:, :-2] | ~p[2:, 2:]
    return mask & n


def dilate(mask: np.ndarray, diag: bool = False) -> np.ndarray:
    p = np.pad(mask, 1, constant_values=False)
    out = p[1:-1, 1:-1] | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
    if diag:
        out |= p[:-2, :-2] | p[:-2, 2:] | p[2:, :-2] | p[2:, 2:]
    return out


def erode(mask: np.ndarray, diag: bool = False) -> np.ndarray:
    return ~dilate(~mask, diag)


def distance_inside(mask: np.ndarray) -> np.ndarray:
    """Approximate Euclidean distance from each inside pixel to the outside
    (two-pass chamfer 3-4)."""
    h, w = mask.shape
    INF = 10 ** 6
    d = np.where(mask, INF, 0).astype(np.int64)
    d = np.pad(d, 1, constant_values=0)
    for y in range(1, h + 1):
        row = d[y]
        up = d[y - 1]
        for x in range(1, w + 1):
            if row[x]:
                row[x] = min(row[x], up[x] + 3, up[x - 1] + 4, up[x + 1] + 4, row[x - 1] + 3)
    for y in range(h, 0, -1):
        row = d[y]
        dn = d[y + 1]
        for x in range(w, 0, -1):
            if row[x]:
                row[x] = min(row[x], dn[x] + 3, dn[x - 1] + 4, dn[x + 1] + 4, row[x + 1] + 3)
    return d[1:-1, 1:-1] / 3.0


# --------------------------------------------------------------------------
# Shading
# --------------------------------------------------------------------------

def normals_ellipsoid(w: int, h: int, cx: float, cy: float, rx: float, ry: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    xs, ys = grid(w, h)
    nx = (xs - cx) / rx
    ny = (ys - cy) / ry
    rr = np.clip(nx * nx + ny * ny, 0, 1)
    nz = np.sqrt(1 - rr)
    return nx, ny, nz


def normals_dome(mask: np.ndarray, radius: float | None = None, flat: float = 0.0) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Treat a silhouette as a puffy dome and return per-pixel normals."""
    d = distance_inside(mask)
    if radius is None:
        radius = max(1.0, float(d.max()))
    t = np.clip(d / radius, 0, 1)
    hgt = np.sqrt(1 - (1 - t) ** 2) * radius
    hgt = hgt * (1 - flat) + flat * radius
    gy, gx = np.gradient(hgt)
    nx, ny, nz = -gx, -gy, np.ones_like(gx)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    return nx / n, ny / n, nz / n


def normals_cylinder_v(w: int, h: int, cx_of_y: Callable[[np.ndarray], np.ndarray], r_of_y: Callable[[np.ndarray], np.ndarray]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    xs, ys = grid(w, h)
    cx = cx_of_y(ys)
    r = np.maximum(r_of_y(ys), 0.5)
    nx = np.clip((xs - cx) / r, -1, 1)
    nz = np.sqrt(1 - nx * nx)
    return nx, np.zeros_like(nx) - 0.15, nz


def normals_capsules(w: int, h: int, caps: Sequence[tuple[float, float, float, float, float, float]]) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Cylinder normals for a chain of capsules (x0, y0, x1, y1, r0, r1).
    Returns (nx, ny, nz, mask). Each pixel takes the normal of the capsule
    whose axis is closest relative to its radius."""
    xs, ys = grid(w, h)
    best = np.full((h, w), 9.0)
    nx = np.zeros((h, w))
    ny = np.zeros((h, w))
    for (x0, y0, x1, y1, r0, r1) in caps:
        dx, dy = x1 - x0, y1 - y0
        ll = dx * dx + dy * dy
        t = np.zeros_like(xs) if ll == 0 else np.clip(((xs - x0) * dx + (ys - y0) * dy) / ll, 0, 1)
        ppx, ppy = x0 + t * dx, y0 + t * dy
        r = r0 + (r1 - r0) * t
        ox, oy = (xs - ppx) / r, (ys - ppy) / r
        d = np.sqrt(ox * ox + oy * oy)
        sel = d < best
        best = np.where(sel, d, best)
        nx = np.where(sel, ox, nx)
        ny = np.where(sel, oy, ny)
    mask = best <= 1.0
    rr = np.clip(nx * nx + ny * ny, 0, 1)
    nz = np.sqrt(1 - rr)
    return nx, ny, nz, mask


def lambert(nx, ny, nz, light=LIGHT, ambient: float = 0.25, wrap: float = 0.25) -> np.ndarray:
    d = nx * light[0] + ny * light[1] + nz * light[2]
    d = (d + wrap) / (1 + wrap)
    return np.clip(ambient + (1 - ambient) * np.clip(d, 0, 1), 0, 1)


def quantize(v: np.ndarray, n: int, lo: int = 0, hi: int | None = None, bias: float = 0.0) -> np.ndarray:
    if hi is None:
        hi = n - 1
    idx = np.floor(np.clip(v + bias, 0, 0.9999) * (hi - lo + 1)) + lo
    return np.clip(idx, lo, hi).astype(int)


def paint(img: np.ndarray, mask: np.ndarray, rmp: Sequence[Color], idx: np.ndarray | int) -> None:
    if isinstance(idx, (int, np.integer)):
        idx = np.full(mask.shape, int(idx))
    colors = np.array(rmp, np.uint8)
    sel = mask
    img[sel] = colors[np.clip(idx[sel], 0, len(rmp) - 1)]


def shade(img: np.ndarray, mask: np.ndarray, rmp: Sequence[Color], normals, lo: int = 0, hi: int | None = None,
          ambient: float = 0.25, bias: float = 0.0, light=LIGHT) -> np.ndarray:
    v = lambert(*normals, light=light, ambient=ambient)
    idx = quantize(v, len(rmp), lo, hi, bias)
    paint(img, mask, rmp, idx)
    return idx


def outline_inner(img: np.ndarray, mask: np.ndarray, color: Color | Callable[[Color], Color], diag: bool = False) -> None:
    e = edge(mask, diag)
    ys, xs = np.where(e)
    for y, x in zip(ys, xs):
        c = color(tuple(int(v) for v in img[y, x])) if callable(color) else color  # type: ignore
        img[y, x] = c


def outline_outer(img: np.ndarray, color: Color | Callable[[Color], Color], diag: bool = False, only_below: bool = False) -> None:
    """Add a 1px outline around every opaque pixel."""
    m = img[:, :, 3] > 0
    ring = dilate(m, diag) & ~m
    if only_below:
        ring &= np.roll(m, 1, axis=0)
    ys, xs = np.where(ring)
    for y, x in zip(ys, xs):
        if callable(color):
            # use the colour of an adjacent opaque pixel
            src = None
            for dx, dy in ((0, -1), (-1, 0), (1, 0), (0, 1), (-1, -1), (1, -1), (-1, 1), (1, 1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < m.shape[0] and 0 <= xx < m.shape[1] and m[yy, xx]:
                    src = tuple(int(v) for v in img[yy, xx])
                    break
            img[y, x] = color(src)  # type: ignore
        else:
            img[y, x] = color


def ramp_lookup(rmp: Sequence[Color]) -> dict[tuple[int, int, int], int]:
    return {tuple(c[:3]): i for i, c in enumerate(rmp)}


def darker_in(rmp: Sequence[Color], steps: int = 1) -> Callable[[Color], Color]:
    lk = ramp_lookup(rmp)

    def f(c: Color) -> Color:
        i = lk.get(tuple(c[:3]))
        if i is None:
            return darken(c, 0.6)
        return rmp[max(0, i - steps)]
    return f


def recolor(img: np.ndarray, src: Sequence[Color], dst: Sequence[Color]) -> np.ndarray:
    out = img.copy()
    for a, b in zip(src, dst):
        m = (img[:, :, 0] == a[0]) & (img[:, :, 1] == a[1]) & (img[:, :, 2] == a[2]) & (img[:, :, 3] > 0)
        out[m, :3] = b[:3]
    return out


def map_to_palette(img: np.ndarray, palette: Sequence[Color]) -> np.ndarray:
    out = img.copy()
    cache: dict[tuple[int, int, int], Color] = {}
    h, w = img.shape[:2]
    for y in range(h):
        for x in range(w):
            if img[y, x, 3] == 0:
                continue
            k = tuple(int(v) for v in img[y, x, :3])
            if k not in cache:
                cache[k] = nearest_in(k, palette)
            out[y, x, :3] = cache[k][:3]
            out[y, x, 3] = 255
    return out


# --------------------------------------------------------------------------
# Clustered textures (foliage, curls, wool)
# --------------------------------------------------------------------------

def blob_cluster(img: np.ndarray, region: np.ndarray, rmp: Sequence[Color], rng: random.Random,
                 count: int, rmin: float, rmax: float, lo: int = 1, hi: int | None = None,
                 global_normals=None, global_weight: float = 0.55, rim: int | None = 0,
                 order: str = 'y', light=LIGHT, ambient: float = 0.3, clip: bool = True,
                 bias: float = 0.0) -> np.ndarray:
    """Fill a region with overlapping shaded round clumps.

    Each clump is lit like a small sphere and blended with the normal of the
    whole shape, so the mass reads as one volume made of many clumps (the way
    leaves, curls and wool are drawn in the reference style). Returns the
    mask of painted pixels.
    """
    h, w = region.shape
    if hi is None:
        hi = len(rmp) - 1
    ys, xs = np.where(region)
    if len(xs) == 0:
        return np.zeros_like(region)
    pts = []
    for _ in range(count):
        i = rng.randrange(len(xs))
        pts.append((xs[i] + rng.random(), ys[i] + rng.random(), rng.uniform(rmin, rmax)))
    if order == 'y':
        pts.sort(key=lambda p: p[1])
    painted = np.zeros_like(region)
    for (cx, cy, r) in pts:
        m = m_ellipse(w, h, cx, cy, r, r * 0.9)
        if clip:
            m &= region
        if not m.any():
            continue
        nx, ny, nz = normals_ellipsoid(w, h, cx, cy, r, r * 0.9)
        if global_normals is not None:
            gx, gy, gz = global_normals
            nx = nx * (1 - global_weight) + gx * global_weight
            ny = ny * (1 - global_weight) + gy * global_weight
            nz = nz * (1 - global_weight) + gz * global_weight
            n = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-6
            nx, ny, nz = nx / n, ny / n, nz / n
        v = lambert(nx, ny, nz, light=light, ambient=ambient)
        idx = quantize(v, len(rmp), lo, hi, bias)
        if rim is not None:
            # dark crescent along the lower edge of each clump
            mb = m & ~np.roll(m, -1, axis=0)
            mb |= m & ~np.roll(m, -1, axis=1) & (np.roll(m, 1, axis=0))
            idx = np.where(mb, np.maximum(lo, np.minimum(idx - 2, rim + lo)), idx)
        paint(img, m, rmp, idx)
        painted |= m
    return painted


def scatter_points(region: np.ndarray, rng: random.Random, n: int, min_dist: float) -> list[tuple[int, int]]:
    ys, xs = np.where(region)
    pts: list[tuple[int, int]] = []
    tries = 0
    while len(pts) < n and tries < n * 60 and len(xs):
        tries += 1
        i = rng.randrange(len(xs))
        p = (int(xs[i]), int(ys[i]))
        if all((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 >= min_dist * min_dist for q in pts):
            pts.append(p)
    return pts


# --------------------------------------------------------------------------
# Sheets
# --------------------------------------------------------------------------

def sheet(frames: Sequence[np.ndarray], cols: int | None = None) -> np.ndarray:
    fh, fw = frames[0].shape[:2]
    if cols is None:
        cols = len(frames)
    rows = math.ceil(len(frames) / cols)
    out = blank(fw * cols, fh * rows)
    for i, f in enumerate(frames):
        out[(i // cols) * fh:(i // cols + 1) * fh, (i % cols) * fw:(i % cols + 1) * fw] = f
    return out


def preview(img: np.ndarray, path: str, zoom: int = 6, bg: Color = (110, 140, 80, 255)) -> None:
    h, w = img.shape[:2]
    base = Image.new('RGBA', (w, h), bg)
    base.alpha_composite(Image.fromarray(img))
    base.resize((w * zoom, h * zoom), Image.NEAREST).save(path)
