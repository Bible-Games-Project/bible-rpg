"""Game assets from the generated art (art/generated, see gen_images.py).

Runs as the last group of build_all.py and replaces the procedural sprites
with the generated ones: characters (walk strips), animals, trees (split into
trunk and canopy, with pickable fruit), cherub, flaming sword, serpent and
portraits.

Generated "pixel art" has soft, uneven blocks, so every subject is resampled
onto a regular grid sized for the game (1 art pixel = 1 world pixel, Adam
116 px tall); the block colour is the median of the centre of each cell.
"""

from __future__ import annotations

import colorsys
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from extract import load_rgba, remove_background  # noqa: E402
from gen_images import ROOT, load_jobs, output_of  # noqa: E402
from ingest import is_magenta, remove_magenta  # noqa: E402

# ---------------------------------------------------------------- utilities


def has_output(job: str) -> bool:
    folder = os.path.join(ROOT, 'art', 'generated', job)
    return os.path.isdir(folder) and any(f.endswith('.png') for f in os.listdir(folder))


def J(job: str) -> str:
    """The job to use: its newest restyled version ("v3-...", then "v2-...")
    once generated, else the job itself."""
    return next((f'{v}-{job}' for v in ('v3', 'v2') if has_output(f'{v}-{job}')), job)


def cutout(job: str) -> np.ndarray:
    """A generated image (v2 style when available) or a repository image
    path, with its flat background removed."""
    path = job if os.path.exists(os.path.join(ROOT, job)) else output_of(load_jobs(), J(job))
    img = load_rgba(os.path.join(ROOT, path))
    return remove_magenta(img) if is_magenta(img) else remove_background(img)


def bbox(mask: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(mask)
    return int(ys.min()), int(xs.min()), int(ys.max()) + 1, int(xs.max()) + 1


def clean_mask(alpha: np.ndarray, min_px: int = 400) -> np.ndarray:
    """Opaque pixels without the specks the background removal leaves."""
    m = alpha > 0
    h, w = m.shape
    cell = 4
    gh, gw = h // cell, w // cell
    coarse = m[:gh * cell, :gw * cell].reshape(gh, cell, gw, cell).mean(axis=(1, 3)) > 0.3
    keep = np.zeros_like(coarse)
    seen = np.zeros_like(coarse)
    for y0, x0 in zip(*np.nonzero(coarse)):
        if seen[y0, x0]:
            continue
        comp = [(y0, x0)]
        seen[y0, x0] = True
        i = 0
        while i < len(comp):
            y, x = comp[i]
            i += 1
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < gh and 0 <= nx < gw and coarse[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    comp.append((ny, nx))
        if len(comp) * cell * cell >= min_px:
            for y, x in comp:
                keep[y, x] = True
    full = np.zeros_like(m)
    grown = keep | np.roll(keep, 1, 0) | np.roll(keep, -1, 0) | np.roll(keep, 1, 1) | np.roll(keep, -1, 1)
    full[:gh * cell, :gw * cell] = np.repeat(np.repeat(grown, cell, 0), cell, 1)
    return m & full


def rows_of_subjects(img: np.ndarray, counts: list[int] | None = None) -> list[list[tuple[int, int, int, int]]]:
    """Bounding boxes of the separate subjects, grouped in rows, left to right.
    With `counts` (subjects expected per row) close subjects are split apart
    and stray bits are merged into their neighbours."""
    mask = clean_mask(img[:, :, 3])
    bands = runs(mask.any(axis=1), min_gap=12)
    out = []
    for r, (y0, y1) in enumerate(bands):
        band = mask[y0:y1]
        spans = runs(band.any(axis=0), min_gap=2)
        if counts and r < len(counts):
            spans = fit_spans(band, spans, counts[r])
        line = []
        for x0, x1 in spans:
            sy0, sx0, sy1, sx1 = bbox(band[:, x0:x1])
            line.append((y0 + sy0, x0 + sx0, y0 + sy1, x0 + sx1))
        out.append(line)
    return out


def fit_spans(band: np.ndarray, spans: list[tuple[int, int]], n: int) -> list[tuple[int, int]]:
    spans = list(spans)
    while len(spans) > n:
        gaps = [spans[i + 1][0] - spans[i][1] for i in range(len(spans) - 1)]
        i = int(np.argmin(gaps))
        spans[i:i + 2] = [(spans[i][0], spans[i + 1][1])]
    prof = np.convolve(band.sum(axis=0).astype(float), np.ones(7) / 7, mode='same')
    while len(spans) < n:
        i = max(range(len(spans)), key=lambda k: spans[k][1] - spans[k][0])
        a, b = spans[i]
        lo, hi = a + (b - a) // 5, b - (b - a) // 5
        cut = lo + int(np.argmin(prof[lo:hi]))
        spans[i:i + 1] = [(a, cut), (cut, b)]
    return spans


def runs(flags: np.ndarray, min_gap: int) -> list[tuple[int, int]]:
    """Runs of True separated by at least min_gap False values."""
    idx = np.nonzero(flags)[0]
    if not len(idx):
        return []
    out = []
    start = prev = idx[0]
    for i in idx[1:]:
        if i - prev > min_gap:
            out.append((int(start), int(prev) + 1))
            start = i
        prev = i
    out.append((int(start), int(prev) + 1))
    return [r for r in out if r[1] - r[0] > 6]


def split_strip(img: np.ndarray, n: int) -> list[tuple[int, int, int, int]]:
    """n evenly spaced subjects in one row (walk strips): cut at the emptiest
    column near each expected boundary, even where feet nearly touch."""
    mask = clean_mask(img[:, :, 3])
    y0, x0, y1, x1 = bbox(mask)
    prof = mask[:, x0:x1].sum(axis=0).astype(float)
    prof = np.convolve(prof, np.ones(9) / 9, mode='same')
    step = (x1 - x0) / n
    cuts = [x0]
    for k in range(1, n):
        lo, hi = int(k * step - step * 0.35), int(k * step + step * 0.35)
        cuts.append(x0 + lo + int(np.argmin(prof[lo:hi])))
    cuts.append(x1)
    boxes = []
    for a, b in zip(cuts, cuts[1:]):
        sub = mask[:, a:b]
        sy0, sx0, sy1, sx1 = bbox(sub)
        boxes.append((sy0, a + sx0, sy1, a + sx1))
    return boxes


def resample(img: np.ndarray, box: tuple[int, int, int, int], period: float) -> np.ndarray:
    """Sample a subject onto a regular grid of `period` image pixels."""
    y0, x0, y1, x1 = box
    crop = img[y0:y1, x0:x1]
    h = max(1, int(round((y1 - y0) / period)))
    w = max(1, int(round((x1 - x0) / period)))
    out = np.zeros((h, w, 4), np.uint8)
    py = (y1 - y0) / h
    px = (x1 - x0) / w
    for j in range(h):
        a0, a1 = int(j * py), max(int(j * py) + 1, int((j + 1) * py))
        c0, c1 = a0 + (a1 - a0) // 4, a1 - (a1 - a0) // 4
        for i in range(w):
            b0, b1 = int(i * px), max(int(i * px) + 1, int((i + 1) * px))
            d0, d1 = b0 + (b1 - b0) // 4, b1 - (b1 - b0) // 4
            blk = crop[c0:max(c1, c0 + 1), d0:max(d1, d0 + 1)].reshape(-1, 4)
            opaque = blk[blk[:, 3] > 0]
            if len(opaque) * 2 < len(blk):
                continue
            out[j, i, :3] = np.median(opaque[:, :3], axis=0).round().astype(np.uint8)
            out[j, i, 3] = 255
    return trim(decontaminate(out))


MAGENTA = np.array([255.0, 0.0, 255.0])


def excess(c) -> float:
    """How much more red and blue than green a colour has."""
    return (float(c[0]) + float(c[2])) / 2 - float(c[1])


def decontaminate(s: np.ndarray) -> np.ndarray:
    """Clean the magenta background out of the outer two pixel rings: bright
    magenta is dropped, and a pixel that is a blend of a nearby colour with
    magenta takes that colour back. Real pink or red (blossom, fruit) is not
    such a blend, so it stays."""
    out = s.copy()
    a = s[:, :, 3] > 0
    ring = lambda m: m & np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1)  # noqa: E731
    inner = ring(a)
    edge = a & ~inner
    near = a & ~ring(inner)
    hgt, wid = a.shape
    for y, x in zip(*np.nonzero(near)):
        c = s[y, x, :3].astype(float)
        h, sat, v = hsv(c)
        if edge[y, x] and 0.8 < h < 0.97 and sat > 0.3 and v > 0.6:
            out[y, x] = 0
            continue
        e = excess(c)
        if e < -20:
            continue
        nb = [s[yy, xx, :3] for yy in range(max(0, y - 2), min(hgt, y + 3)) for xx in range(max(0, x - 2), min(wid, x + 3))
              if a[yy, xx] and excess(s[yy, xx, :3]) < e - 25]
        if len(nb) < 3:
            continue
        f = np.median(np.array(nb, float), axis=0)
        d = f - MAGENTA
        alpha = float(np.dot(c - MAGENTA, d) / max(1.0, float(np.dot(d, d))))
        if 0.15 < alpha < 0.97 and np.linalg.norm(c - (MAGENTA + alpha * d)) < 32:
            out[y, x, :3] = f.round().astype(np.uint8)
    return out


def trim(s: np.ndarray) -> np.ndarray:
    ys, xs = np.nonzero(s[:, :, 3])
    if not len(ys):
        return s
    return s[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def fit(img: np.ndarray, box, height: int) -> np.ndarray:
    return resample(img, box, (box[2] - box[0]) / height)


def place(sprite: np.ndarray, w: int, h: int, cx: int, bottom: int, center: float | None = None) -> np.ndarray:
    """Put a sprite in a w x h cell with its `center` column on cx and its
    last row on `bottom`."""
    out = np.zeros((h, w, 4), np.uint8)
    sh, sw = sprite.shape[:2]
    c = sw / 2 if center is None else center
    ox = int(round(cx - c))
    oy = bottom - sh + 1
    for y in range(sh):
        ty = oy + y
        if not 0 <= ty < h:
            continue
        for x in range(sw):
            tx = ox + x
            if 0 <= tx < w and sprite[y, x, 3]:
                out[ty, tx] = sprite[y, x]
    return out


def torso_center(s: np.ndarray) -> float:
    h = s.shape[0]
    band = s[int(h * 0.2):int(h * 0.5), :, 3] > 0
    xs = np.nonzero(band)[1]
    return float(np.median(xs)) if len(xs) else s.shape[1] / 2


def hsv(c) -> tuple[float, float, float]:
    return colorsys.rgb_to_hsv(c[0] / 255, c[1] / 255, c[2] / 255)


def tint(s: np.ndarray, factor: float, hue_shift: float = 0.0) -> np.ndarray:
    out = s.copy()
    for y, x in zip(*np.nonzero(s[:, :, 3])):
        h, sat, v = hsv(s[y, x, :3])
        r, g, b = colorsys.hsv_to_rgb((h + hue_shift) % 1, sat, min(1, v * factor))
        out[y, x, :3] = [int(r * 255), int(g * 255), int(b * 255)]
    return out


# --------------------------------------------------------------- characters

# size of people, animals and creatures relative to the world (1 = Adam 116 px)
CREATURE_SCALE = float(os.environ.get('ART_CREATURE_SCALE', '0.86'))
TREE_SCALE = float(os.environ.get('ART_TREE_SCALE', '1.1'))
TARGET_H = {k: round(v * CREATURE_SCALE) for k, v in {'adam': 116, 'eve': 112, 'god': 120}.items()}
SETS = [('adam', 'leaves'), ('adam', 'fig'), ('adam', 'tunic'), ('eve', 'leaves'), ('eve', 'fig'), ('eve', 'tunic'), ('god', 'robe')]
DIRS = ('down', 'up', 'right')


def breathe(s: np.ndarray) -> np.ndarray:
    """Idle frame 2: head and shoulders one pixel lower."""
    out = s.copy()
    h = s.shape[0]
    cut = int(h * 0.42)
    top = s[:cut].copy()
    out[:cut + 1] = 0
    out[1:cut + 1] = np.where(top[:, :, 3:4] > 0, top, out[1:cut + 1])
    out[cut + 1:] = s[cut + 1:]
    return out


# The maintainer's casting of the generated sheets: at the start Adam and
# Eve wear little (a leaf skirt; a leaf top and skirt), when they dress
# themselves (mission 7) they wear trousers and a sweater of leaves, and the
# coats of skins (mission 9) are the tunics.
VIEW_SHEETS = {
    ('adam', 'leaves'): 'v2-adam-fig-views', ('eve', 'leaves'): 'v2-eve-fig-views',
    ('adam', 'fig'): 'v3-adam-views', ('eve', 'fig'): 'v3-eve-views',
    ('adam', 'tunic'): 'v2-adam-tunic-views', ('eve', 'tunic'): 'v2-eve-tunic-views',
    ('god', 'robe'): 'v2-god-views',
}


def view_sheet(char: str, outfit: str) -> str | None:
    """The clean three-view sheet (front, back, side) of a character."""
    job = VIEW_SHEETS.get((char, outfit))
    if job and has_output(job):
        return job
    job = J(f'{char}-views' if outfit in ('leaves', 'robe') else f'{char}-{outfit}-views')
    if job.startswith(('v2-', 'v3-')):
        return job
    return {('adam', 'leaves'): 'adam-sprite', ('eve', 'leaves'): 'eve-sprite', ('god', 'robe'): 'god-sprite'}.get((char, outfit))


def standing(char: str, outfit: str, d: str) -> np.ndarray:
    """One clean standing frame: from the three-view sheet when there is one
    (its back views are right, unlike some walk strips), else the first frame
    of the walk strip."""
    sheet = view_sheet(char, outfit)
    if sheet and (d in ('down', 'up') or sheet.startswith(('v2-', 'v3-'))):
        img = cutout(sheet)
        box = split_strip(img, 3)[DIRS.index(d)]
    else:
        img = cutout(f'walk-{char}-{outfit}-{d}')
        box = split_strip(img, 5)[0]
    return resample(img, box, (box[2] - box[0]) / TARGET_H[char])


def row_runs(row: np.ndarray) -> list[tuple[int, int]]:
    out, start = [], None
    for x, v in enumerate(row):
        if v and start is None:
            start = x
        elif not v and start is not None:
            out.append((start, x))
            start = None
    if start is not None:
        out.append((start, len(row)))
    return out


def legs_of(s: np.ndarray) -> tuple[int, int]:
    """(first row of the legs, column between them) for a front or back view.
    Long robes show no gap: then only the feet step."""
    a = s[:, :, 3] > 0
    h, w = a.shape
    bottom = int(np.nonzero(a.any(axis=1))[0].max())
    top, miss = None, 0
    gaps = []
    for y in range(bottom - 1, int(h * 0.5), -1):
        r = row_runs(a[y])
        if len(r) >= 2:
            top, miss = y, 0
            mid = w / 2
            pairs = [(r[i][1], r[i + 1][0]) for i in range(len(r) - 1)]
            g = min(pairs, key=lambda p: abs((p[0] + p[1]) / 2 - mid))
            gaps.append((g[0] + g[1]) / 2)
        else:
            miss += 1
            if miss > 2:
                break
    if top is None or bottom - top < 6:
        return bottom - 6, int(round(torso_center(s)))
    return top, int(round(float(np.median(gaps))))


# rows of empty room above and below the standing frame, for raised bodies
# and for feet reaching toward the viewer
ROOM = 3


def step(stand: np.ndarray, top: int, split: int, lift_l: int, lift_r: int, bob: int, keep: np.ndarray | None = None) -> np.ndarray:
    """A walking frame made from the standing frame: each leg raised by its
    lift (negative: lowered, reaching toward the viewer), the body above the
    legs moved by bob (down positive). `keep` marks pixels below the hips
    that move with the body (hands). A copy of the hips under the body fills
    the gap when the body rises."""
    h, w = stand.shape[:2]
    out = np.zeros((h + 2 * ROOM, w, 4), np.uint8)
    keep = np.zeros((h, w), bool) if keep is None else keep
    legs = np.where(keep[:, :, None], 0, stand).astype(np.uint8)
    overlap = 3
    for x0, x1, lift in ((0, split, lift_l), (split, w, lift_r)):
        part = legs[top - overlap:, x0:x1]
        y = ROOM + top - overlap - lift
        region = out[y:y + part.shape[0], x0:x1]
        out[y:y + part.shape[0], x0:x1] = np.where(part[:, :, 3:4] > 0, part, region)
    body = np.zeros_like(stand)
    body[:top] = stand[:top]
    body[keep] = stand[keep]
    y = ROOM + bob
    out[y:y + h] = np.where(body[:, :, 3:4] > 0, body, out[y:y + h])
    return out


def arm_bands(s: np.ndarray) -> list[tuple[int, int, int, int]]:
    """Forearms of a front or back view as (x0, x1, y0, y1): the columns
    outside the gap between arm and body (where the arms hang free), from
    elbow height down to the hand. Long sleeves of a robe show no gap: no
    arms then."""
    h, w = s.shape[:2]
    a = s[:, :, 3] > 0
    lefts, rights = [], []
    for y in range(int(0.3 * h), int(0.62 * h)):
        r = row_runs(a[y])
        if len(r) >= 2:
            if r[0][1] < 0.35 * w:
                lefts.append(r[0][1])
            if r[-1][0] > 0.65 * w:
                rights.append(r[-1][0])
    out = []
    y0 = int(0.42 * h)
    if len(lefts) >= 2:
        x1 = int(np.median(lefts))
        rows = [y for y in range(y0, int(0.68 * h)) if a[y, :max(1, x1 - 1)].any()]
        if rows:
            out.append((0, x1, y0, max(rows) + 1))
    if len(rights) >= 2:
        x0 = int(np.median(rights))
        rows = [y for y in range(y0, int(0.68 * h)) if a[y, min(w - 1, x0 + 1):].any()]
        if rows:
            out.append((x0, w, y0, max(rows) + 1))
    return out


def stretch_arm(s: np.ndarray, band: tuple[int, int, int, int], e: int) -> np.ndarray:
    """The forearm in `band` drawn e pixels longer (swinging toward the
    viewer) or shorter (swinging away)."""
    if e == 0:
        return s
    x0, x1, y0, y1 = band
    out = s.copy()
    part = s[y0:y1, x0:x1].copy()
    out[y0:y1, x0:x1] = 0
    n = y1 - y0
    m = max(1, n + e)
    new = np.stack([part[min(n - 1, int(r * n / m))] for r in range(m)])
    m = min(m, out.shape[0] - y0)
    out[y0:y0 + m, x0:x1] = np.where(new[:m, :, 3:4] > 0, new[:m], out[y0:y0 + m, x0:x1])
    return out


# eight-frame walk seen from the front or back. Legs: pixels each foot is
# raised (negative: lowered, the leg reaching toward the viewer); body bob
# (down positive); arms: pixels the left hand moves down (swinging toward
# the viewer) or up, the right hand the opposite. Each arm swings against
# the leg on its side.
WALK_LEGS_L = (-2, -1, 0, 1, 3, 6, 8, 4)
WALK_LEGS_R = (3, 6, 8, 4, -2, -1, 0, 1)
WALK_BOB = (1, 1, -1, 0, 1, 1, -1, 0)
WALK_ARM_L = (-3, -2, 0, 2, 3, 2, 0, -2)
# frames per second of the eight-frame walks, at the player's speed (the game
# scales it with the actual speed)
WALK_FPS = 15


def front_back_frames(char: str, outfit: str, d: str) -> tuple[list[np.ndarray], int]:
    """Idle and walking frames for a front or back view on one canvas, and
    the canvas row of the standing feet."""
    stand = standing(char, outfit, d)
    h, w = stand.shape[:2]
    top, split = legs_of(stand)
    bands = arm_bands(stand)
    pad = lambda f: np.pad(f, ((ROOM, ROOM), (0, 0), (0, 0)))  # noqa: E731
    frames = [pad(stand), pad(breathe(stand))]
    for i in range(len(WALK_BOB)):
        body = stand
        keep = np.zeros((h, w), bool)
        for b in bands:
            e = WALK_ARM_L[i] if b[0] == 0 else -WALK_ARM_L[i]
            body = stretch_arm(body, b, e)
            keep[b[2]:min(h, b[3] + max(0, e)), b[0]:b[1]] = True
        keep &= body[:, :, 3] > 0
        frames.append(step(body, top, split, WALK_LEGS_L[i], WALK_LEGS_R[i], WALK_BOB[i], keep))
    return frames, h - 1 + ROOM


def rotate_part(part: np.ndarray, angle: float, pivot: tuple[float, float], k: int = 4) -> np.ndarray:
    """Rotate an RGBA layer around pivot (x, y) keeping clean pixels: rotate
    a k-times enlarged copy, then take the centre of each k x k block."""
    h, w = part.shape[:2]
    big = Image.fromarray(part).resize((w * k, h * k), Image.NEAREST)
    big = big.rotate(angle, resample=Image.NEAREST, center=(pivot[0] * k, pivot[1] * k))
    return np.asarray(big)[k // 2::k, k // 2::k].copy()


# near-leg angle (degrees, forward positive) for an eight-frame side step
# cycle; the arms swing against the legs by ARM_SWING of that angle
SIDE_CYCLE = (18, 9, 0, -9, -18, -9, 0, 9)
ARM_SWING = 0.45

# The near arm of a side view (x0, x1, y0, y1 in the standing frame) where
# it cannot be told from the body by colour: bare arms over bare skin or
# over a tunic of much the same colour. Measured on the current sheets of
# VIEW_SHEETS; measure again if those are regenerated.
SIDE_ARMS = {
    ('adam', 'leaves'): (4, 10, 24, 60), ('eve', 'leaves'): (10, 15, 25, 59),
    ('adam', 'tunic'): (4, 11, 24, 60), ('eve', 'tunic'): (8, 13, 27, 61),
}


def side_arm_band(stand: np.ndarray, char: str, outfit: str) -> tuple[int, int, int, int] | None:
    """The near arm of a side view, from the shoulder to the hand. Sleeves
    are the colour of the clothes, so the hand finds it: the largest patch of
    non-green (skin) at hand height, with the arm straight above it."""
    if (char, outfit) in SIDE_ARMS:
        return SIDE_ARMS[(char, outfit)]
    h, w = stand.shape[:2]
    y0, y1 = int(0.45 * h), int(0.66 * h)
    skin = np.zeros((h, w), bool)
    for y in range(y0, y1):
        for x in range(w):
            c = stand[y, x]
            if c[3]:
                hh, ss, vv = hsv(c[:3])
                skin[y, x] = not 0.15 < hh < 0.45 and vv > 0.45
    groups = [g for g in blobs(skin) if len(g) >= 6]
    if not groups:
        return None
    g = max(groups, key=len)
    ys = [p[0] for p in g]
    xs = [p[1] for p in g]
    return (min(xs), max(xs) + 1, int(0.24 * h), max(ys) + 1)


def split_arm(stand: np.ndarray, band: tuple[int, int, int, int]) -> tuple[np.ndarray, np.ndarray]:
    """(arm, body): the arm's pixels on their own, and the body with the
    place of the arm filled by mirroring what lies beside it in the same row
    (chest side first), so the texture runs on without a seam when the arm
    swings away."""
    x0, x1, y0, y1 = band
    h, w = stand.shape[:2]
    arm = np.zeros_like(stand)
    arm[y0:y1, x0:x1] = stand[y0:y1, x0:x1]
    body = stand.copy()
    bw = x1 - x0
    for y in range(y0, y1):
        for x in range(x0, x1):
            if not stand[y, x, 3]:
                continue
            body[y, x] = 0
            for sx in (2 * x1 - 1 - x, 2 * x0 - 1 - x, x1, x0 - 1):
                if 0 <= sx < w and not x0 <= sx < x1 and stand[y, sx, 3]:
                    body[y, x] = stand[y, sx]
                    break
    return arm, body


def side_frames(stand: np.ndarray, char: str = '', outfit: str = '') -> tuple[list[np.ndarray], int] | None:
    """Idle and walking frames for a side view on one canvas, all made from
    one standing frame, and the canvas row of the standing feet: both legs
    swing from the hip and the arms from the shoulder, against the legs (the
    far limbs a little darker, behind the body); the lowest foot stays on
    the ground. None when no legs show (long robes)."""
    h, w = stand.shape[:2]
    a = stand[:, :, 3] > 0
    widths = a.sum(axis=1)
    top = next((y for y in range(int(h * 0.6), h) if widths[y] <= 0.45 * widths.max()), None)
    if top is None or h - top < 0.15 * h:
        return None
    lower = np.zeros_like(a)
    lower[top:] = a[top:]
    legs = max(blobs(lower), key=len)  # hands hanging below the hem stay with the body
    leg_mask = np.zeros_like(a)
    for y, x in legs:
        leg_mask[y, x] = True
    band = side_arm_band(stand, char, outfit)
    if band:
        leg_mask[band[2]:band[3], band[0]:band[1]] = False
    cols = np.nonzero(leg_mask[top])[0]
    pivot = ((cols.min() + cols.max() + 1) / 2, top - round(0.1 * h))
    leg = np.where(leg_mask[:, :, None], stand, 0).astype(np.uint8)
    for y in range(pivot[1], top):  # hidden under the clothes: keeps the hip joined
        leg[y] = np.where(leg_mask[top][:, None], stand[top], 0)
    body = np.where(leg_mask[:, :, None], 0, stand).astype(np.uint8)
    arm = np.zeros_like(stand)
    if band:
        arm, body = split_arm(body, band)
    pad = 14
    grow = lambda f: np.pad(f, ((ROOM, ROOM), (pad, pad), (0, 0)))  # noqa: E731
    leg, body, arm = grow(leg), grow(body), grow(arm)
    dark = lambda f: np.concatenate([(f[:, :, :3] * 0.8).astype(np.uint8), f[:, :, 3:]], axis=2)  # noqa: E731
    far_leg, far_arm = dark(leg), dark(arm)
    hip = (pivot[0] + pad, pivot[1] + ROOM)
    shoulder = ((band[0] + band[1]) / 2 + pad, band[2] + 2 + ROOM) if band else hip
    ground = h - 1 + ROOM
    frames = [grow(stand), grow(breathe(stand))]
    for angle in SIDE_CYCLE:
        swing = -angle * ARM_SWING
        out = np.zeros_like(body)
        layers = (rotate_part(far_arm, -swing, shoulder), rotate_part(far_leg, -angle, hip), rotate_part(leg, angle, hip),
                  body, rotate_part(arm, swing, shoulder))
        for layer in layers:
            out = np.where(layer[:, :, 3:4] > 0, layer, out)
        low = int(np.nonzero(out[:, :, 3].any(axis=1))[0].max())
        frames.append(np.roll(out, ground - low, axis=0))
    used = np.nonzero(np.any([f[:, :, 3].any(axis=0) for f in frames], axis=0))[0]
    return [f[:, used.min():used.max() + 1] for f in frames], ground


def robe_side_frames(stand: np.ndarray) -> tuple[list[np.ndarray], int]:
    """Side walk for a robe down to the feet: the feet take short steps
    under the hem (the far foot darker), the lower robe sways with them and
    the body bobs. All from the standing frame."""
    h, w = stand.shape[:2]
    feet_top = int(0.93 * h)
    sway_top = int(0.6 * h)
    pad = 6
    grow = lambda f: np.pad(f, ((ROOM, ROOM), (pad, pad), (0, 0)))  # noqa: E731
    feet = np.zeros_like(stand)
    feet[feet_top:] = stand[feet_top:]
    body = stand.copy()
    body[feet_top:] = 0
    # the robe reaches over the top of the feet
    body[feet_top:feet_top + 2] = np.where(stand[feet_top:feet_top + 2, :, 3:4] > 0, stand[feet_top:feet_top + 2], 0)
    near, body = grow(feet), grow(body)
    far = near.copy()
    far[:, :, :3] = (far[:, :, :3] * 0.8).astype(np.uint8)
    frames = [grow(stand), grow(breathe(stand))]
    n = len(SIDE_CYCLE)
    for i in range(n):
        phase = 2 * np.pi * i / n
        step_x = int(round(3 * np.cos(phase)))
        lift = 1 if abs(np.sin(phase)) > 0.9 else 0
        out = np.zeros_like(body)
        for layer, dx, dy in ((far, -step_x, -lift), (near, step_x, -lift)):
            moved = np.roll(np.roll(layer, dx, axis=1), dy, axis=0)
            out = np.where(moved[:, :, 3:4] > 0, moved, out)
        swayed = body.copy()
        for y in range(sway_top, feet_top + 2):
            t = (y - sway_top) / (feet_top + 2 - sway_top)
            swayed[y + ROOM] = np.roll(body[y + ROOM], int(round(2 * np.cos(phase) * t)), axis=0)
        bob = -1 if lift else 0
        swayed = np.roll(swayed, bob, axis=0)
        out = np.where(swayed[:, :, 3:4] > 0, swayed, out)
        frames.append(out)
    return frames, h - 1 + ROOM


def walk_frames(char: str, outfit: str, d: str) -> list[np.ndarray] | tuple[list[np.ndarray], int]:
    """Side frames on one canvas, with the canvas row of the feet: legs and
    arms swinging, or for a long robe short steps under the hem. Without a
    clean side view: the generated strides (each frame on its own)."""
    if (view_sheet(char, outfit) or '').startswith(('v2-', 'v3-')):
        stand = standing(char, outfit, d)
        return side_frames(stand, char, outfit) or robe_side_frames(stand)
    img = cutout(f'walk-{char}-{outfit}-{d}')
    img[:, :, 3] = np.where(clean_mask(img[:, :, 3]), img[:, :, 3], 0)
    boxes = split_strip(img, 5)
    period = (boxes[0][2] - boxes[0][0]) / TARGET_H[char]
    frames = [resample(img, b, period) for b in boxes]
    stand = frames[0]

    def legs_diff(a: np.ndarray, b: np.ndarray) -> float:
        h = min(a.shape[0], b.shape[0])
        w = min(a.shape[1], b.shape[1])
        la = a[h // 2:h, :w, 3] > 0
        lb = b[h // 2:h, :w, 3] > 0
        return float((la ^ lb).mean())

    strides = frames[1:]
    a = max(strides, key=lambda f: legs_diff(f, stand))
    rest = [f for f in strides if f is not a]
    b = max(rest, key=lambda f: legs_diff(f, a))
    return [stand, breathe(stand), a, stand, b, stand]


def build_characters(m: dict, save, strip, sheet_entry) -> np.ndarray:
    chars = m.setdefault('characters', {})
    adam_front = None
    for char, outfit in SETS:
        sets = {d: front_back_frames(char, outfit, d) if d in ('down', 'up') else walk_frames(char, outfit, d) for d in DIRS}
        # frames on a shared canvas keep two rows under the standing feet
        shared = {d: fr for d, fr in sets.items() if isinstance(fr, tuple)}
        single = {d: fr for d, fr in sets.items() if not isinstance(fr, tuple)}
        frames = [f for fr, _ in shared.values() for f in fr] + [f for fr in single.values() for f in fr]
        w = max(f.shape[1] for f in frames) + 6
        w += w % 2
        h = max([base + 3 for _, base in shared.values()] + [f.shape[0] + 2 for fr in single.values() for f in fr]) + 1
        for d, fr in sets.items():
            if d in shared:
                fs, base = fr
                c = torso_center(fs[0][:base + 1])
                cells = [place(f[:base + 3], w, h, w // 2, h - 1, c) for f in fs]
                extra = {'idle': [0, 1], 'walk': list(range(2, len(fs))), 'walkFps': WALK_FPS}
            else:
                cells = [place(f, w, h, w // 2, h - 3, torso_center(f)) for f in fr]
                extra = {'idle': [0, 1], 'walk': [2, 3, 4, 5]}
            file = save(strip(cells), f'sprites/char-{char}-{outfit}-{d}.png')
            chars.setdefault(char, {}).setdefault(outfit, {})[d] = sheet_entry(file, cells, (w // 2, h - 3), **extra)
        if (char, outfit) == ('adam', 'leaves'):
            adam_front = sets['down'][0][0][ROOM:-ROOM]
        print(f'  {char}/{outfit}: {w}x{h}')
    return adam_front


def build_sleeping(m: dict, save, sheet_entry, front: np.ndarray) -> None:
    lying = np.rot90(front, 1).copy()
    file = save(lying, 'sprites/adam-sleeping.png')
    m['sprites']['adam-sleeping'] = sheet_entry(file, [lying], (lying.shape[1] // 2, lying.shape[0] - 1))


# ------------------------------------------------------------ simple sprites


def bob(s: np.ndarray, lift: float = 0.7) -> np.ndarray:
    """Second frame for walking: the body above the legs one pixel up."""
    out = s.copy()
    cut = int(s.shape[0] * lift)
    out[0:cut - 1] = s[1:cut]
    return out


def sprite_sheet(m, save, strip, sheet_entry, key: str, frames: list[np.ndarray], folder: str = 'sprites', **extra) -> None:
    w = max(f.shape[1] for f in frames) + 2
    h = max(f.shape[0] for f in frames) + 2
    cells = [place(f, w, h, w // 2, h - 2) for f in frames]
    file = save(strip(cells) if len(cells) > 1 else cells[0], f'{folder}/{key}.png')
    m.setdefault('sprites', {})[key] = sheet_entry(file, cells, (w // 2, h - 2), **extra)


ANIMALS = [  # order in the "animals" sheet, target height in world pixels
    [('horse', 116), ('camel', 132), ('lion', 74), ('deer', 104)],
    [('sheep', 58), ('goat', 64), ('rabbit', 32), ('dove', 22)],
]


# animation strips: frame 1 standing, then six frames of walking (the hare
# hops; the dove walks two frames and flies four)
ANIMATION_JOBS = {name: f'walk-animal-{name}' for name in ('horse', 'camel', 'lion', 'deer', 'sheep', 'goat', 'rabbit')}
ANIMATION_JOBS['dove'] = 'fly-animal-dove'
JUMPS = {'rabbit', 'dove'}  # frames keep their height above the ground


def build_animals(m, save, strip, sheet_entry) -> None:
    if has_output('v2-animals') and not has_output(f'v2-{ANIMATION_JOBS["horse"]}'):
        build_still_animals(m, save, strip, sheet_entry)
        return
    for row in ANIMALS:
        for name, height in row:
            img = cutout(ANIMATION_JOBS[name])
            boxes = split_strip(img, 7)
            period = (boxes[0][2] - boxes[0][0]) / (height * CREATURE_SCALE)
            base = boxes[0][2]
            frames = []
            for b in boxes:
                f = resample(img, b, period)
                up = max(0, int(round((base - b[2]) / period))) if name in JUMPS else 0
                frames.append((f, up))
            w = max(f.shape[1] for f, _ in frames) + 4
            w += w % 2
            h = max(f.shape[0] + up for f, up in frames) + 2
            center = (lambda f: f.shape[1] / 2) if name == 'dove' else torso_center
            cells = [place(f, w, h, w // 2, h - 2 - up, center(f)) for f, up in frames]
            if name == 'dove':
                extra = {'idle': [0], 'walk': [1, 0, 2, 0], 'walkFps': 6, 'fly': [3, 4, 5, 6]}
            else:
                extra = {'idle': [0], 'walk': [1, 2, 3, 4, 5, 6], 'walkFps': 8 if name != 'rabbit' else 11}
            key = f'animal-{name}'
            file = save(strip(cells), f'sprites/{key}.png')
            m['sprites'][key] = sheet_entry(file, cells, (w // 2, h - 2), **extra)
            print(f'  animal {name}: {w}x{h}, {len(cells)} frames')


def animal_boxes() -> tuple[np.ndarray, dict[str, tuple[int, int, int, int]]]:
    img = cutout('animals')
    rows = rows_of_subjects(img, [len(r) for r in ANIMALS])
    return img, {name: box for want, got in zip(ANIMALS, rows) for (name, _), box in zip(want, got)}


def build_still_animals(m, save, strip, sheet_entry) -> None:
    """Animals from the sheet with a small step bob, until their walk strips exist."""
    img, boxes = animal_boxes()
    for row in ANIMALS:
        for name, height in row:
            s = fit(img, boxes[name], round(height * CREATURE_SCALE))
            sprite_sheet(m, save, strip, sheet_entry, f'animal-{name}', [s, bob(s)], idle=[0], walk=[0, 1])
            print(f'  animal {name} (still): {s.shape[1]}x{s.shape[0]}')


def rotations(s: np.ndarray, n: int) -> list[np.ndarray]:
    size = int(np.ceil(np.hypot(*s.shape[:2]))) + 2
    base = Image.new('RGBA', (size, size))
    base.alpha_composite(Image.fromarray(s), ((size - s.shape[1]) // 2, (size - s.shape[0]) // 2))
    return [np.array(base.rotate(-360 * i / n, resample=Image.NEAREST)) for i in range(n)]


def build_cherub_and_sword(m, save, strip, sheet_entry) -> None:
    img = cutout('cherub')
    line = max(rows_of_subjects(img), key=len)
    boxes = sorted(line, key=lambda b: (b[3] - b[1]) * (b[2] - b[0]), reverse=True)
    cherub_box, sword_box = boxes[0], boxes[1]
    c = fit(img, cherub_box, round(176 * CREATURE_SCALE))
    sprite_sheet(m, save, strip, sheet_entry, 'cherub', [c, bob(c, 1.0)])
    sword = fit(img, sword_box, round(84 * CREATURE_SCALE))
    frames = rotations(sword, 16)
    size = frames[0].shape[0]
    file = save(strip(frames), 'sprites/flaming-sword.png')
    m['sprites']['flaming-sword'] = sheet_entry(file, frames, (size // 2, size // 2))
    print(f'  cherub {c.shape[1]}x{c.shape[0]}, sword {sword.shape[1]}x{sword.shape[0]}')


def build_serpent(m, save, strip, sheet_entry) -> None:
    img = cutout('serpent')
    subjects = [b for row in rows_of_subjects(img) for b in row]
    subjects.sort(key=lambda b: (b[3] - b[1]) / max(1, b[2] - b[0]))
    tree_box, ground_box = subjects[0], subjects[-1]
    t = resample(img, tree_box, (tree_box[3] - tree_box[1]) / (90 * CREATURE_SCALE))
    g = resample(img, ground_box, (ground_box[3] - ground_box[1]) / (104 * CREATURE_SCALE))
    sprite_sheet(m, save, strip, sheet_entry, 'serpent-tree', [t, t])
    sprite_sheet(m, save, strip, sheet_entry, 'serpent-ground', [g, bob(g, 1.0)])
    print(f'  serpent {t.shape[1]}x{t.shape[0]}, {g.shape[1]}x{g.shape[0]}')


# ------------------------------------------------------------------- trees

# sheet -> trees in order: (key, target height, fruit sprite, fruit hues)
TREES = {
    'trees-garden': [('oak-large', 250, None), ('fig', 196, 'fig'), ('pomegranate', 184, 'pomegranate')],
    'trees-land': [('olive', 196, None), ('palm', 262, 'date'), ('cypress', 244, None)],
    'trees-sacred': [('tree-of-life', 300, 'life'), ('forbidden-tree', 290, 'forbidden')],
    'trees-small': [('oak-medium', 204, None), ('oak-small', 156, None), ('blossom', 190, None)],
    'bushes': [('bush-round', 64, None), ('bush-dark', 70, None), ('bush-flower', 64, None), ('bush-berry', 64, None), ('grapevine', 118, None)],
}
KIND = {'fig': 'fig', 'pomegranate': 'pomegranate', 'palm': 'palm', 'tree-of-life': 'life', 'forbidden-tree': 'forbidden', 'grapevine': 'vine'}


MAX_FRUIT = {'life': 16, 'forbidden': 22}


def is_leaf(c) -> bool:
    h, s, v = hsv(c)
    return (0.14 <= h <= 0.48 and s > 0.18) or (s < 0.22 and v > 0.75)


def is_fruit(c, kind: str) -> bool:
    """Fruit painted in the canopy that becomes pickable. Dates and the
    golden fruit of the tree of life share their colours with the bark, so
    they stay painted (those trees have no pickable fruit)."""
    h, s, v = hsv(c)
    if kind in ('pomegranate', 'forbidden'):
        return (h < 0.03 or h > 0.95) and s > 0.55 and v > 0.4
    if kind in ('fig', 'grape'):
        return 0.72 < h < 0.93 and s > 0.22 and v < 0.75
    return False


def blobs(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    seen = np.zeros_like(mask)
    out = []
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        comp = [(y0, x0)]
        seen[y0, x0] = True
        i = 0
        while i < len(comp):
            y, x = comp[i]
            i += 1
            for ny in (y - 1, y, y + 1):
                for nx in (x - 1, x, x + 1):
                    if 0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1] and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        comp.append((ny, nx))
        out.append(comp)
    return out


def grow(m: np.ndarray) -> np.ndarray:
    return m | np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)


def take_fruit(s: np.ndarray, kind: str) -> tuple[np.ndarray, list[list[int]]]:
    """Paint the fruit out of a canopy and return where it was: the game
    draws pickable fruit sprites there instead."""
    h, w = s.shape[:2]
    limit = canopy_split(s)
    fm = np.zeros((h, w), bool)
    for y, x in zip(*np.nonzero(s[:limit, :, 3])):
        fm[y, x] = is_fruit(s[y, x, :3], kind)
    opaque = s[:, :, 3] > 0
    grown = grow(fm) & opaque
    groups = [g for g in blobs(grown) if len(g) >= 8]
    # the fruit's highlights, stem and crown: anything not leaf-coloured close to it
    near = grow(grow(grown)) & opaque
    paint = np.zeros((h, w), bool)
    for y, x in zip(*np.nonzero(near)):
        paint[y, x] = grown[y, x] or not is_leaf(s[y, x, :3])
    out = s.copy()
    for y, x in zip(*np.nonzero(paint)):
        for r in range(2, 8):
            win = s[max(0, y - r):y + r + 1, max(0, x - r):x + r + 1].reshape(-1, 4)
            leaves = [c for c in win if c[3] and is_leaf(c[:3]) and not is_fruit(c[:3], kind)]
            if len(leaves) >= 3:
                out[y, x, :3] = np.median(np.array(leaves)[:, :3], axis=0).astype(np.uint8)
                break
    # spread the slots over the canopy (orchard trees use the first four)
    order = np.random.default_rng(3).permutation(len(groups))
    slots = []
    for i in order[:MAX_FRUIT.get(kind, 12)]:
        g = groups[i]
        slots.append([int(round(np.mean([p[1] for p in g]))), int(min(p[0] for p in g))])
    return out, slots


def canopy_split(s: np.ndarray) -> int:
    """First row below the canopy (the lowest row that is still leafy)."""
    h, w = s.shape[:2]
    leafy = np.array([sum(1 for x in range(w) if s[y, x, 3] and is_leaf(s[y, x, :3])) for y in range(h)])
    rows = np.nonzero(leafy > leafy.max() * 0.25)[0]
    split = int(rows.max()) + 1 if len(rows) else int(h * 0.6)
    return min(split, h - 6)


def split_tree(s: np.ndarray) -> tuple[np.ndarray, np.ndarray, int, int, list[int]]:
    """Canopy above the lowest leafy row, trunk below; base point; collider.
    The canopy keeps two rows of the trunk under it: drawn scaled down with
    smooth filtering, two images that only touched would show a thin line
    of ground between them."""
    h, w = s.shape[:2]
    split = canopy_split(s)
    canopy = s.copy()
    canopy[split + 2:] = 0
    trunk = s.copy()
    trunk[:split] = 0
    # base: bottom of the trunk; the collider spans the trunk a little above the roots
    bottom = int(np.nonzero(s[:, :, 3].any(axis=1))[0].max())
    probe = max(split, bottom - max(8, (bottom - split) // 2))
    xs = np.nonzero(s[probe, :, 3])[0]
    if len(xs):
        runs_ = runs(s[probe, :, 3] > 0, 1)
        mid = w / 2
        x0, x1 = min(runs_, key=lambda r: abs((r[0] + r[1]) / 2 - mid))
    else:
        x0, x1 = w // 2 - 8, w // 2 + 8
    cw = max(12, min(48, x1 - x0))
    cx = (x0 + x1) // 2
    base_y = bottom - 3
    collider = [cx - cw // 2, base_y - 12, cw, 14]
    return trunk, canopy, cx, base_y, collider


def build_trees(m, save, strip, sheet_entry) -> None:
    trees = m.setdefault('trees', {})
    for job, specs in TREES.items():
        img = cutout(job)
        boxes = [b for row in rows_of_subjects(img) for b in row]
        boxes.sort(key=lambda b: b[1])
        if len(boxes) != len(specs):
            boxes = sorted(boxes, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]), reverse=True)[:len(specs)]
            boxes.sort(key=lambda b: b[1])
        for (key, height, fruit_kind), box in zip(specs, boxes):
            s = fit(img, box, round(height * TREE_SCALE))
            slots: list[list[int]] = []
            if fruit_kind:
                s, slots = take_fruit(s, fruit_kind)
            trunk, canopy, ax, ay, collider = split_tree(s)
            # a variant: the same tree, a shade darker
            variants = [key] if key in ('tree-of-life', 'forbidden-tree', 'blossom', 'grapevine') or key.startswith('bush-') else [f'{key}-a', f'{key}-b']
            for i, name in enumerate(variants):
                tr, ca = (trunk, canopy) if i == 0 else (tint(trunk, 0.92), tint(canopy, 0.9, 0.01))
                tf = save(tr, f'trees/{name}-trunk.png')
                cf = save(ca, f'trees/{name}-canopy.png')
                trees[name] = {
                    'trunk': tf, 'canopy': cf, 'width': int(s.shape[1]), 'height': int(s.shape[0]),
                    'anchorX': int(ax), 'anchorY': int(ay), 'collider': [int(v) for v in collider],
                    'fruit': slots, 'kind': KIND.get(key, 'bush' if key.startswith('bush-') else 'tree'),
                }
            print(f'  tree {key}: {s.shape[1]}x{s.shape[0]}, fruit {len(slots)}')


# ---------------------------------------------------------------- portraits

PORTRAITS = {'eve': 'eve-portrait', 'god': 'god-portrait', 'serpent': 'serpent-portrait'}
ADAM_TALK = 'art/reference/v2/adam-talk.webp'


def adam_portrait() -> np.ndarray:
    """The maintainer's portrait, every drawn pixel kept (its own grid)."""
    import extract
    s, _ = extract.extract(os.path.join(ROOT, ADAM_TALK), 10.6)
    return s


def portrait(job: str, pw: int, ph: int) -> np.ndarray:
    img = cutout(job)
    mask = clean_mask(img[:, :, 3])
    box = bbox(mask)
    s = fit(img, box, ph)
    if s.shape[1] > pw:
        x0 = (s.shape[1] - pw) // 2
        s = s[:, x0:x0 + pw]
    out = np.zeros((ph, pw, 4), np.uint8)
    out[ph - s.shape[0]:, (pw - s.shape[1]) // 2:(pw - s.shape[1]) // 2 + s.shape[1]] = s
    return out


def lum(c) -> float:
    return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]


def find_eyes(p: np.ndarray) -> list[tuple[int, int, int, int]]:
    """Boxes (y0, x0, y1, x1) of the two eyes: a dark pupil with the white of
    the eye beside it, on each side of the face. Eyebrows are dark (or white)
    but never both. Positions are proportions of a 64 x 66 portrait."""
    fy, fx = p.shape[0] / 66, p.shape[1] / 64
    oy, ox = round(16 * fy), round(14 * fx)
    face = p[oy:round(36 * fy), ox:round(50 * fx)]
    h, w = face.shape[:2]
    dark = np.zeros((h, w), bool)
    white = np.zeros((h, w), bool)
    for y, x in zip(*np.nonzero(face[:, :, 3])):
        c = face[y, x, :3]
        dark[y, x] = lum(c) < 100
        white[y, x] = lum(c) > 185 and hsv(c)[1] < 0.3
    mid = w / 2
    best: dict[bool, tuple[float, tuple[int, int, int, int]]] = {}
    for g in blobs(dark):
        if not 2 <= len(g) <= 70 * fx * fy:
            continue
        ys = [q[0] for q in g]
        xs = [q[1] for q in g]
        y0, y1, x0, x1 = min(ys), max(ys) + 1, min(xs), max(xs) + 1
        near = white[max(0, y0 - 1):y1 + 1, max(0, x0 - 3):x1 + 3]
        if not near.any():
            continue
        # the eye opening is where the white is: brows joined to the lashes stay out
        wy, wx = np.nonzero(near)
        top = max(0, y0 - 1) + wy.min()
        bottom = max(0, y0 - 1) + wy.max() + 1
        left = max(0, x0 - 3)
        cols = np.nonzero((dark | white)[top:bottom, left:x1 + 3].any(axis=0))[0]
        ex0, ex1 = left + cols.min(), left + cols.max() + 1
        side = np.mean(xs) < mid
        score = near.sum() + len(g)
        if side not in best or score > best[side][0]:
            best[side] = (score, (top + oy - 1, ex0 + ox, bottom + oy + 1, ex1 + ox))
    if len(best) < 2:
        return []
    return [best[True][1], best[False][1]]


def human_eye(c) -> bool:
    """Pupil, iris or white of a human eye."""
    return lum(c) < 100 or (lum(c) > 185 and hsv(c)[1] < 0.35)


def snake_eye(c) -> bool:
    """The serpent's golden iris, slit pupil or highlight."""
    h, sat, v = hsv(c)
    return lum(c) < 90 or (0.08 < h < 0.16 and sat > 0.6 and v > 0.55) or (lum(c) > 200 and sat < 0.35)


def eye_spans(p: np.ndarray, box: tuple[int, int, int, int], is_eye=human_eye) -> dict[int, tuple[int, int]]:
    """Row -> (first, last + 1) column of the eye itself inside its box: the
    eye-coloured pixels joined to the pupil, so hair or brows that reach
    into the box stay untouched."""
    y0, x0, y1, x1 = box
    h, w = y1 - y0, x1 - x0
    cand = np.zeros((h, w), bool)
    for y in range(h):
        for x in range(w):
            c = p[y0 + y, x0 + x]
            cand[y, x] = bool(c[3]) and is_eye(c[:3])
    groups = sorted(blobs(cand), key=len, reverse=True)
    if not groups:
        return {}
    eye = groups[0]
    spans: dict[int, tuple[int, int]] = {}
    for y, x in eye:
        a, b = spans.get(y0 + y, (x0 + x, x0 + x + 1))
        spans[y0 + y] = (min(a, x0 + x), max(b, x0 + x + 1))
    return spans


def eye_patches(p: np.ndarray, boxes: list[tuple[int, int, int, int]], is_eye=human_eye) -> list[tuple[np.ndarray, int, int]]:
    """Half-closed and closed eyes: the eyelid (the skin just above the
    lashes) comes down over the eye, row by row, and the lash line moves
    down with it. Only the eye's own pixels change."""
    if not boxes:
        return []
    py0 = min(b[0] for b in boxes)
    py1 = max(b[2] for b in boxes)
    px0 = min(b[1] for b in boxes)
    px1 = max(b[3] for b in boxes)
    eyes = [eye_spans(p, b, is_eye) for b in boxes]
    if not all(eyes):
        return []

    def skin_near(y: int, a: int, b: int) -> np.ndarray:
        for yy in (y, y - 1, y + 1):
            cs = [p[yy, x, :3] for x in range(a, b) if p[yy, x, 3] and lum(p[yy, x, :3]) >= 100 and hsv(p[yy, x, :3])[1] > 0.12]
            if len(cs) >= max(2, (b - a) // 2):
                return np.median(np.array(cs), axis=0).astype(np.uint8)
        return np.array([210, 150, 110], np.uint8)

    frames = []
    for fraction in (0.5, 1.0):
        r = p[py0:py1, px0:px1].copy()
        for spans in eyes:
            rows = sorted(spans)
            top, bottom = rows[0], rows[-1]
            a = min(s[0] for s in spans.values())
            b = max(s[1] for s in spans.values())
            lid = skin_near(top - 1, a, b)
            lash = np.median(np.array([p[top, x, :3] for x in range(*spans[top])]), axis=0).astype(np.uint8)
            n = len(rows) if fraction == 1.0 else max(1, int(round(len(rows) * fraction)))
            for y in rows[:n]:
                s0, s1 = spans[y]
                r[y - py0, s0 - px0:s1 - px0, :3] = lid
            line = rows[min(n, len(rows) - 1)] if fraction < 1.0 else bottom
            s0, s1 = spans[line]
            s0, s1 = max(s0, a + 1), min(s1, b - 1)
            r[line - py0, s0 - px0:s1 - px0, :3] = lash
        frames.append((r, px0, py0))
    return frames


def mouth_patches(p: np.ndarray, eye_y: float) -> list[tuple[np.ndarray, int, int]]:
    """Mouth half open and open: a dark gap below the line of the lips. The
    lip line is the longest run of pixels darker than the skin of its row,
    near the middle of the face under the nose (nostril shadows are dark
    too, but short). Hair is darker still: it breaks a run and is left out
    of the skin it is compared with."""
    fy, fx = p.shape[0] / 66, p.shape[1] / 64
    cx = p.shape[1] // 2
    span = range(cx - round(8 * fx), cx + round(8 * fx) + 1)
    best = None
    for y in range(int(eye_y + 8 * fy), min(p.shape[0] - 3, int(eye_y + 13 * fy) + 1)):
        skin = [lum(p[y, x, :3]) for x in span if p[y, x, 3] and lum(p[y, x, :3]) >= 65]
        if len(skin) < 6:
            continue
        ref = float(np.percentile(skin, 75))  # the lips can fill half the row
        start = None
        for x in list(span) + [None]:
            v = lum(p[y, x, :3]) if x is not None and p[y, x, 3] else 0
            dark = x is not None and 65 <= v < ref - 18
            if dark and start is None:
                start = x
            elif not dark and start is not None:
                a, b = start, x if x is not None else span[-1] + 1
                start = None
                centre = (a + b) / 2
                if b - a < max(4, round(3 * fx)) or abs(centre - cx) > 6 * fx:
                    continue
                key = (b - a, -abs(centre - cx))
                if best is None or key > best[0]:
                    best = (key, y, a, b)
    if best is None:
        return []
    _, by, x0, x1 = best
    inner = np.array([60, 28, 28], np.uint8)
    frames = []
    for n in (1, 2):
        r = p[by:by + n + 1, x0:x1].copy()
        for yy in range(1, n + 1):
            r[yy, 1:-1, :3] = inner
        frames.append((r, x0, by))
    return frames


# The serpent's portrait, measured on the current v2 image (94 x 87); measure
# again if it is regenerated. (y0, x0, y1, x1)
SERPENT_EYE = (16, 33, 24, 46)
SERPENT_TONGUE = (36, 0, 48, 16)


def serpent_parts(p: np.ndarray) -> tuple[np.ndarray, list, list]:
    """(base, tongue frames, eye frames): the serpent speaks by flicking its
    forked tongue, so the base portrait has none and the two "mouth" frames
    draw it half and fully out, from its root at the mouth."""
    y0, x0, y1, x1 = SERPENT_TONGUE
    region = p[y0:y1, x0:x1]
    pts = [(y, x) for y, x in zip(*np.nonzero(region[:, :, 3]))]
    base = p.copy()
    base[y0:y1, x0:x1, 3] = 0
    mouth = []
    if pts:
        root = min(pts, key=lambda q: (q[0], -q[1]))
        dist = {q: np.hypot(q[0] - root[0], q[1] - root[1]) for q in pts}
        far = max(dist.values()) or 1
        for share in (0.5, 1.0):
            patch = np.zeros_like(region)
            for q in pts:
                if dist[q] <= far * share + 0.01:
                    patch[q] = region[q]
            mouth.append((patch, x0, y0))
    return base, mouth, eye_patches(base, [SERPENT_EYE], snake_eye)


def build_portraits(m, save) -> None:
    out = m.setdefault('portraits', {})
    todo: list[tuple[str, np.ndarray]] = []
    if has_output('v2-eve-portrait'):
        todo.append(('adam', adam_portrait()))
    ph, pw = todo[0][1].shape[:2] if todo else (66, 64)
    for name, job in PORTRAITS.items():
        todo.append((name, portrait(job, pw, ph)))
    for name, p in todo:
        ph, pw = p.shape[:2]
        if name == 'serpent':
            p, mouth, eyes = serpent_parts(p)
        else:
            boxes = find_eyes(p)
            eye_y = np.mean([(b[0] + b[2]) / 2 for b in boxes]) if boxes else 25
            mouth, eyes = mouth_patches(p, eye_y), eye_patches(p, boxes)
        entry = {'file': save(p, f'portraits/{name}.png'), 'width': pw, 'height': ph, 'mouth': [], 'eyes': []}
        for kind, frames in (('mouth', mouth), ('eyes', eyes)):
            for i, (img, x, y) in enumerate(frames):
                f = save(img, f'portraits/{name}-{kind}-{i}.png')
                entry[kind].append({'file': f, 'x': int(x), 'y': int(y), 'w': int(img.shape[1]), 'h': int(img.shape[0])})
        out[name] = entry
        print(f'  portrait {name}: eyes {len(entry["eyes"])}, mouth {len(entry["mouth"])}')


# ----------------------------------------------------------- props, items

# subjects per row in each sheet, with the sprite key and its height
PROPS = {
    'props-nature': [
        [('rock-large', 46), ('rock-medium', 28), ('rock-small', 12), ('rock-mossy', 36), ('log', 30)],
        [('fern-a', 32), ('fern-b', 40), ('flowers-white', 16), ('flowers-yellow', 16), ('flowers-blue', 16)],
        [('flowers-pink', 16), ('flowers-red', 16), ('flowers-purple', 16), ('grass-tuft-0', 16), ('grass-tuft-1', 13), ('grass-tuft-2', 10)],
        [('reeds', 44), ('lily-pad', 14), ('mushrooms', 13), ('flat-stone', 20), ('grain-plant', 40)],
    ],
    'props-items': [
        [('basket', 22), ('basket-full', 24), ('gourd', 22), ('gourd-full', 22)],
        [('digging-stick', 12), ('seeds', 16), ('fig-leaf', 20), ('fruit-fig', 11)],
        [('fruit-pomegranate', 13), ('fruit-dates', 14), ('fruit-grapes', 15), ('fruit-forbidden', 13), ('fruit-life', 12)],
    ],
    'props-farm': [
        [('soil-marked', 30), ('soil-tilled', 30), ('soil-seeded', 30), ('soil-watered', 30), ('plant-sprout', 12)],
        [('plant-young', 22), ('plant-grown', 32), ('thorns', 22), ('thistle', 32), ('stepping-stone', 14)],
    ],
}
# drawn centred on their position instead of standing on it
CENTERED = {'lily-pad', 'stepping-stone', 'soil-marked', 'soil-tilled', 'soil-seeded', 'soil-watered'}


def build_props(m, save, sheet_entry) -> None:
    for job, rows in PROPS.items():
        img = cutout(job)
        found = rows_of_subjects(img, [len(r) for r in rows])
        for want, got in zip(rows, found):
            for (key, height), box in zip(want, got):
                sp = fit(img, box, height)
                h, w = sp.shape[:2]
                if key.startswith('fruit-'):
                    anchor = (w // 2, 1)
                elif key in CENTERED:
                    anchor = (w // 2, h // 2)
                else:
                    anchor = (w // 2, h - 1)
                f = save(sp, f'props/{key}.png')
                m['sprites'][key] = sheet_entry(f, [sp], anchor)
        print(f'  {job}: {sum(len(r) for r in rows)} sprites')


# ------------------------------------------------------------------ terrain


def seamless(c: np.ndarray, seed: int) -> np.ndarray:
    """A tileable 32x32 texture: the crop in the middle, the crop shifted by
    half a tile at the edges, dithered together in between."""
    t = c[:32, :32]
    o = np.roll(np.roll(t, 16, 0), 16, 1)
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:32, 0:32]
    edge = np.minimum(np.minimum(xx, 31 - xx), np.minimum(yy, 31 - yy))
    use_o = rng.random((32, 32)) > np.clip((edge - 2) / 8, 0, 1)
    out = np.where(use_o[:, :, None], o, t).copy()
    out[:, :, 3] = 255
    return out


def swatches() -> dict[str, list[np.ndarray]]:
    img = cutout('terrain')
    line = max(rows_of_subjects(img, [5]), key=len)
    names = ['grass', 'meadow', 'path', 'water', 'dry']
    out = {}
    for name, box in zip(names, line):
        y0, x0, y1, x1 = box
        inset = (y1 - y0) // 10
        tex = resample(img, (y0 + inset, x0 + inset, y1 - inset, x1 - inset), 4.4)
        crops = []
        h, w = tex.shape[:2]
        for oy in (0, max(0, h - 32)):
            for ox in (0, max(0, w - 32), max(0, (w - 32) // 2)):
                if h >= 32 and w >= 32:
                    crops.append(tex[oy:oy + 32, ox:ox + 32])
        out[name] = [seamless(c, i) for i, c in enumerate(crops)]
    return out


def desaturate(t: np.ndarray, sat: float, val: float) -> np.ndarray:
    out = t.copy()
    for y in range(t.shape[0]):
        for x in range(t.shape[1]):
            h, s, v = hsv(t[y, x, :3])
            r, g, b = colorsys.hsv_to_rgb(h, s * sat, v * val)
            out[y, x, :3] = [int(r * 255), int(g * 255), int(b * 255)]
    return out


def shade(c: np.ndarray, k: float) -> tuple[int, int, int, int]:
    return (int(min(255, c[0] * k)), int(min(255, c[1] * k)), int(min(255, c[2] * k)), 255)


GRASS_STYLE = os.environ.get('ART_GRASS', 'scene')  # scene | calm | soft | texture


def lum_sorted(tiles: list[np.ndarray]) -> np.ndarray:
    px = np.concatenate([t.reshape(-1, 4)[:, :3] for t in tiles]).astype(float)
    return px[np.argsort(px @ np.array([0.3, 0.59, 0.11]))]


def soften(t: np.ndarray, k: float = 0.45) -> np.ndarray:
    """The same texture with less contrast: pixels pulled toward the median."""
    med = np.median(t.reshape(-1, 4)[:, :3], axis=0)
    out = t.copy()
    out[:, :, :3] = np.clip(med + (t[:, :, :3].astype(float) - med) * k, 0, 255).astype(np.uint8)
    return out


def flower_colors(meadow: list[np.ndarray]) -> list[np.ndarray]:
    return [c for f in meadow for c in f.reshape(-1, 4)[:, :3] if hsv(c)[1] > 0.35 and not 0.15 < hsv(c)[0] < 0.45]


def sprinkle(t: np.ndarray, colors: list[np.ndarray], seed: int, n: int = 3) -> np.ndarray:
    """Tiny flowers (two pixels and a shadow) on a grass tile."""
    out = t.copy()
    rng = np.random.default_rng(seed)
    dark = lum_sorted([t])[int(32 * 32 * 0.1)].astype(np.uint8)
    for _ in range(n if colors else 0):
        x, y = int(rng.integers(1, 30)), int(rng.integers(1, 30))
        c = colors[int(rng.integers(0, len(colors)))]
        out[y, x, :3] = c
        out[y, x + 1, :3] = c
        out[y + 1, x, :3] = dark
    return out


def calm_grass(source: list[np.ndarray], seed: int) -> np.ndarray:
    """Quiet grass in the generated colours: one base shade with scattered
    lighter and darker pixels and a few short blades. Nothing reaches across
    the tile, so tiles join without seams."""
    px = lum_sorted(source)
    shades = [px[int(len(px) * q)].astype(np.uint8) for q in (0.12, 0.32, 0.5, 0.68, 0.88)]
    rng = np.random.default_rng(seed)
    t = np.zeros((32, 32, 4), np.uint8)
    t[:, :, 3] = 255
    t[:, :, :3] = shades[2]
    r = rng.random((32, 32))
    t[r < 0.1, :3] = shades[1]
    t[r > 0.92, :3] = shades[3]
    for _ in range(12):
        x, y = int(rng.integers(0, 32)), int(rng.integers(0, 32))
        dark = rng.random() < 0.55
        t[y, x, :3] = shades[0] if dark else shades[4]
        t[(y + 1) % 32, x, :3] = shades[1] if dark else shades[3]
    return t


# the maintainer's reference scene: its open meadow sets the grass colours
STYLE_SCENE = 'art/reference/v2/style-scene.webp'
MEADOW_AREA = (0.25, 0.3, 0.75, 0.75)  # x0, y0, x1, y1 as fractions of the image
GRASS_HUE = float(os.environ.get('ART_GRASS_HUE', '8'))  # degrees toward green
GRASS_SAT = float(os.environ.get('ART_GRASS_SAT', '0.88'))


def scene_shades() -> list[np.ndarray]:
    """Grass colours of the reference meadow, dark to light: its sunlit
    yellow-green pixels only (no sand, shadows or flowers), by brightness."""
    a = np.asarray(Image.open(os.path.join(ROOT, STYLE_SCENE)).convert('RGB'))
    h, w = a.shape[:2]
    x0, y0, x1, y1 = MEADOW_AREA
    px = a[int(y0 * h):int(y1 * h):3, int(x0 * w):int(x1 * w):3].reshape(-1, 3)
    keep = [c for c in px if 50 / 360 < hsv(c)[0] < 90 / 360 and hsv(c)[1] > 0.5 and hsv(c)[2] > 0.45]
    g = np.array(keep, float)
    g = g[np.argsort(g @ np.array([0.3, 0.59, 0.11]))]
    shades = [g[int(len(g) * q)] for q in (0.1, 0.25, 0.5, 0.9)]
    shades.append(shades[3] * 0.7 + np.array([255, 250, 150]) * 0.3)
    # a touch greener and calmer than the sunlit picture, for a whole map
    out = []
    for c in shades:
        h, s, v = colorsys.rgb_to_hsv(*(c / 255))
        r, g_, b = colorsys.hsv_to_rgb((h + GRASS_HUE / 360) % 1, s * GRASS_SAT, v)
        out.append(np.array([r * 255, g_ * 255, b * 255]).round().astype(np.uint8))
    return out


def scene_grass(shades: list[np.ndarray], seed: int) -> np.ndarray:
    """Smooth grass like the reference meadow: one base colour with a few
    soft, slightly darker patches, small darker tufts and light specks.
    Everything wraps around the tile edges, so tiles join without seams."""
    rng = np.random.default_rng(seed)
    t = np.zeros((32, 32, 4), np.uint8)
    t[:, :, 3] = 255
    t[:, :, :3] = shades[2]
    yy, xx = np.mgrid[0:32, 0:32]
    for _ in range(3):
        cx, cy = rng.random() * 32, rng.random() * 32
        rx, ry = 2.5 + rng.random() * 3, 1.5 + rng.random() * 2
        dx = (xx - cx + 16) % 32 - 16
        dy = (yy - cy + 16) % 32 - 16
        inside = (dx / rx) ** 2 + (dy / ry) ** 2 < 1 + 0.35 * rng.random((32, 32))
        t[inside, :3] = shades[1]
    tufts = [[(0, 0), (1, 1), (0, 2)], [(1, 0), (0, 1), (1, 1)], [(0, 1), (1, 0), (1, 2)]]
    for _ in range(3):
        x, y = int(rng.integers(0, 32)), int(rng.integers(0, 32))
        for dy, dx in tufts[int(rng.integers(0, len(tufts)))]:
            t[(y + dy) % 32, (x + dx) % 32, :3] = shades[0]
    for _ in range(4):
        x, y = int(rng.integers(0, 32)), int(rng.integers(0, 32))
        t[y, x, :3] = shades[4]
    return t


def grass_sets(sw: dict) -> tuple[list[np.ndarray], list[np.ndarray]]:
    """Plain grass tiles and grass with tiny flowers. The flowered ones are
    the same tiles with flowers added, so they never show as squares."""
    if GRASS_STYLE == 'scene':
        shades = scene_shades()
        grass = [scene_grass(shades, i) for i in range(6)]
    elif GRASS_STYLE == 'soft':
        grass = [soften(t) for t in sw['grass']]
    elif GRASS_STYLE == 'calm':
        grass = [calm_grass(sw['grass'], i) for i in range(6)]
    else:
        grass = list(sw['grass'])
    colors = flower_colors(sw['meadow'])
    meadow = [sprinkle(grass[i % len(grass)], colors, 40 + i) for i in range(4)]
    return grass, meadow


def build_terrain(m, save, strip, sheet_entry) -> None:
    """Rebuild the ground tiles with the generated textures; the procedural
    builder still draws the shapes where grass meets paths and water."""
    import terrain
    from style import P
    sw = swatches()
    # the first generated dirt was a saturated orange: calm it to a soft
    # earth; the v2 sand already has the reference scene's colour
    if J('terrain') == 'terrain':
        for k in ('path', 'dry'):
            sw[k] = [desaturate(t, 0.62, 0.86) for t in sw[k]]
    med = {k: np.median(np.concatenate([t.reshape(-1, 4) for t in v])[:, :3], axis=0) for k, v in sw.items()}
    grass, meadow = grass_sets(sw)

    def grass_tile(seed: int, base: int = 6, density: int = 7, flowers: int = 0, ramp: str = 'grass') -> np.ndarray:
        src = meadow if flowers >= 6 else grass
        return src[seed % len(src)]

    terrain.grass_tile = grass_tile
    terrain.dirt_tile = lambda seed: sw['path'][seed % len(sw['path'])]
    if GRASS_STYLE == 'scene':
        # dry earth as smooth as the grass: the generated cracks were busy
        h, s, v = colorsys.rgb_to_hsv(*(med['dry'] / 255))
        dry = np.array(colorsys.hsv_to_rgb(h, s * 0.75, v * 0.95)) * 255
        tones = [np.array(shade(dry, k)[:3], np.uint8) for k in (0.84, 0.93, 1.0, 1.05)]
        tones.append((tones[3] * 0.75 + np.array([255, 240, 200]) * 0.25).astype(np.uint8))
        sw['dry'] = [scene_grass(tones, 20 + i) for i in range(4)]
    terrain.dry_tile = lambda seed: sw['dry'][seed % len(sw['dry'])]
    terrain.water_tile = lambda frame: np.roll(np.roll(sw['water'][0], frame * 2, 1), frame, 0)
    P['earth'][3] = shade(med['path'], 0.72)
    P['grass'][5] = shade(med['grass'], 0.85)
    P['grass'][6] = shade(med['grass'], 1.0)
    P['sand'][1] = shade(med['path'], 0.8)
    P['sand'][3] = shade(med['path'], 0.95)
    P['sand'][5] = shade(med['path'], 1.08)
    P['water'][4] = shade(med['water'], 0.85)
    P['water'][6] = shade(med['water'], 1.2)
    # the procedural builder darkens one palette colour in deep water; the
    # generated texture has its own depth, so match nothing
    P['water'][5] = (999, 0, 0, 255)
    terrain.build(m, save, strip, sheet_entry)


# --------------------------------------------------------------------- main


def build(m: dict, save, strip, sheet_entry) -> None:
    m.setdefault('sprites', {})
    front = build_characters(m, save, strip, sheet_entry)
    build_sleeping(m, save, sheet_entry, front)
    build_animals(m, save, strip, sheet_entry)
    build_cherub_and_sword(m, save, strip, sheet_entry)
    build_serpent(m, save, strip, sheet_entry)
    build_trees(m, save, strip, sheet_entry)
    build_props(m, save, sheet_entry)
    build_portraits(m, save)
    build_terrain(m, save, strip, sheet_entry)
