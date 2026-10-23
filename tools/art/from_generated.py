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


def cutout(job: str) -> np.ndarray:
    img = load_rgba(os.path.join(ROOT, output_of(load_jobs(), job)))
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


def decontaminate(s: np.ndarray) -> np.ndarray:
    """Drop bright magenta-tinted pixels left from the background on edges."""
    out = s.copy()
    a = s[:, :, 3] > 0
    edge = a & ~(np.roll(a, 1, 0) & np.roll(a, -1, 0) & np.roll(a, 1, 1) & np.roll(a, -1, 1))
    for y, x in zip(*np.nonzero(edge)):
        h, sat, v = hsv(s[y, x, :3])
        if 0.8 < h < 0.97 and sat > 0.3 and v > 0.6:
            out[y, x] = 0
    return out


def trim_bottom(f: np.ndarray) -> np.ndarray:
    """Drop the empty rows under a frame that shares a canvas with others,
    keeping its columns (so frames stay aligned) and its feet on the baseline:
    the canvas bottom is the standing feet row."""
    return f[:-1]


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
CREATURE_SCALE = float(os.environ.get('ART_CREATURE_SCALE', '1'))
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


# the clean three-view sheets (front, back, side) for the first outfits
VIEW_SHEETS = {('adam', 'leaves'): 'adam-sprite', ('eve', 'leaves'): 'eve-sprite', ('god', 'robe'): 'god-sprite'}


def standing(char: str, outfit: str, d: str) -> np.ndarray:
    """One clean standing frame: from the three-view sheet when there is one
    (its back views are right, unlike some walk strips), else the first frame
    of the walk strip."""
    sheet = VIEW_SHEETS.get((char, outfit))
    if sheet and d in ('down', 'up'):
        img = cutout(sheet)
        box = split_strip(img, 3)[0 if d == 'down' else 1]
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


def step(stand: np.ndarray, top: int, split: int, lift_l: int, lift_r: int, bob: int) -> np.ndarray:
    """A walking frame made from the standing frame: each leg raised by its
    lift, the body above the legs moved by bob (down positive). A copy of the
    hips under the body fills the gap when the body rises."""
    h, w = stand.shape[:2]
    out = np.zeros((h + 2, w, 4), np.uint8)
    overlap = 3
    for x0, x1, lift in ((0, split, lift_l), (split, w, lift_r)):
        part = stand[top - overlap:, x0:x1]
        y = 1 + top - overlap - lift
        region = out[y:y + part.shape[0], x0:x1]
        m = part[:, :, 3:4] > 0
        out[y:y + part.shape[0], x0:x1] = np.where(m, part, region)
    body = stand[:top]
    y = 1 + bob
    region = out[y:y + top]
    out[y:y + top] = np.where(body[:, :, 3:4] > 0, body, region)
    return out


# (left lift, right lift, body bob) for an eight-frame step cycle seen from the front or back
STEP_CYCLE = [(0, 0, 1), (2, 0, 0), (4, 0, -1), (2, 0, 0), (0, 0, 1), (0, 2, 0), (0, 4, -1), (0, 2, 0)]


def front_back_frames(char: str, outfit: str, d: str) -> list[np.ndarray]:
    stand = standing(char, outfit, d)
    top, split = legs_of(stand)
    pad = lambda f: np.vstack([np.zeros((1, f.shape[1], 4), np.uint8), f, np.zeros((1, f.shape[1], 4), np.uint8)])  # noqa: E731
    still = pad(stand)
    return [still, pad(breathe(stand))] + [step(stand, top, split, *c) for c in STEP_CYCLE]


def walk_frames(char: str, outfit: str, d: str) -> list[np.ndarray]:
    img = cutout(f'walk-{char}-{outfit}-{d}')
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
        w = max(f.shape[1] for fr in sets.values() for f in fr) + 6
        w += w % 2
        h = max(f.shape[0] for fr in sets.values() for f in fr) + 4
        for d, fr in sets.items():
            if d in ('down', 'up'):
                # the frames share one canvas already: keep their alignment
                c = torso_center(fr[0][1:-1])
                cells = [place(trim_bottom(f), w, h, w // 2, h - 3, c) for f in fr]
                extra = {'idle': [0, 1], 'walk': list(range(2, len(fr))), 'walkFps': 12}
            else:
                cells = [place(f, w, h, w // 2, h - 3, torso_center(f)) for f in fr]
                extra = {'idle': [0, 1], 'walk': [2, 3, 4, 5]}
            file = save(strip(cells), f'sprites/char-{char}-{outfit}-{d}.png')
            chars.setdefault(char, {}).setdefault(outfit, {})[d] = sheet_entry(file, cells, (w // 2, h - 3), **extra)
        if (char, outfit) == ('adam', 'leaves'):
            adam_front = sets['down'][0][1:-1]
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
    """Canopy above the lowest leafy row, trunk below; base point; collider."""
    h, w = s.shape[:2]
    split = canopy_split(s)
    canopy = s.copy()
    canopy[split:] = 0
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
            s = fit(img, box, height)
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
PW, PH = 64, 66


def portrait(job: str) -> np.ndarray:
    img = cutout(job)
    mask = clean_mask(img[:, :, 3])
    box = bbox(mask)
    s = fit(img, box, PH)
    if s.shape[1] > PW:
        x0 = (s.shape[1] - PW) // 2
        s = s[:, x0:x0 + PW]
    out = np.zeros((PH, PW, 4), np.uint8)
    out[PH - s.shape[0]:, (PW - s.shape[1]) // 2:(PW - s.shape[1]) // 2 + s.shape[1]] = s
    return out


def lum(c) -> float:
    return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]


def find_eyes(p: np.ndarray) -> list[tuple[int, int, int, int]]:
    """Boxes (y0, x0, y1, x1) of the two eyes: the dark pupil and lash blobs
    on each side of the face, widened to the white of the eye."""
    oy, ox = 16, 14
    face = p[oy:36, ox:50]
    dark = np.zeros(face.shape[:2], bool)
    for y, x in zip(*np.nonzero(face[:, :, 3])):
        dark[y, x] = lum(face[y, x, :3]) < 70
    groups = [g for g in blobs(dark) if 2 <= len(g) <= 30]
    mid = face.shape[1] / 2
    boxes = []
    for side in (lambda g: np.mean([q[1] for q in g]) < mid, lambda g: np.mean([q[1] for q in g]) >= mid):
        gs = [g for g in groups if side(g)]
        if not gs:
            return []
        g = max(gs, key=lambda g: (len(g), -abs(np.mean([q[0] for q in g]) - 8)))
        ys = [q[0] + oy for q in g]
        xs = [q[1] + ox for q in g]
        y0, y1, x0, x1 = min(ys), max(ys) + 1, min(xs) - 1, max(xs) + 2
        # include the white of the eye next to the pupil
        while x0 > 0 and lum(p[(y0 + y1) // 2, x0 - 1, :3]) > 185:
            x0 -= 1
        while x1 < p.shape[1] and lum(p[(y0 + y1) // 2, x1, :3]) > 185:
            x1 += 1
        boxes.append((y0, x0, min(y1 + 1, y0 + 4), x1))
    return boxes


def eye_patches(p: np.ndarray, boxes: list[tuple[int, int, int, int]]) -> list[tuple[np.ndarray, int, int]]:
    """Half-closed and closed eyes: skin from the cheek painted over the
    eye from the top, with a dark lash line where the lids meet."""
    if not boxes:
        return []
    py0 = min(b[0] for b in boxes)
    py1 = max(b[2] for b in boxes)
    px0 = min(b[1] for b in boxes)
    px1 = max(b[3] for b in boxes)
    cheek = [p[y, x, :3] for (y0, x0, y1, x1) in boxes for y in range(y1, y1 + 2) for x in range(x0, x1)
             if p[y, x, 3] and 100 < lum(p[y, x, :3]) < 235 and hsv(p[y, x, :3])[1] > 0.15]
    skin = np.median(np.array(cheek), axis=0).astype(np.uint8) if cheek else np.array([210, 150, 110], np.uint8)
    lash = min((p[y, x, :3] for (y0, x0, y1, x1) in boxes for y in range(y0, y1) for x in range(x0, x1) if p[y, x, 3]), key=lum)
    frames = []
    for fraction in (0.5, 1.0):
        r = p[py0:py1, px0:px1].copy()
        for (y0, x0, y1, x1) in boxes:
            n = max(1, int(round((y1 - y0) * fraction)))
            for y in range(y0, min(y1, y0 + n)):
                r[y - py0, x0 - px0:x1 - px0, :3] = skin
            line = min(y0 + n, y1 - 1)
            r[line - py0, x0 + 1 - px0:x1 - 1 - px0, :3] = lash
        frames.append((r, px0, py0))
    return frames


def mouth_patches(p: np.ndarray, eye_y: float) -> list[tuple[np.ndarray, int, int]]:
    """Mouth half open and open: a dark gap below the line of the lips,
    which is the darkest row across the middle of the face under the nose."""
    cx = p.shape[1] // 2
    best, by = None, -1
    for y in range(int(eye_y + 6), min(p.shape[0] - 3, int(eye_y + 11) + 1)):
        vals = [lum(p[y, x, :3]) for x in range(cx - 4, cx + 5) if p[y, x, 3]]
        if len(vals) >= 6 and (best is None or np.mean(vals) < best):
            best, by = float(np.mean(vals)), y
    if by < 0:
        return []
    xs = [x for x in range(cx - 6, cx + 6) if p[by, x, 3] and lum(p[by, x, :3]) < best + 30]
    if len(xs) < 4:
        return []
    x0, x1 = min(xs), max(xs) + 1
    if x1 - x0 < 4:
        return []
    inner = np.array([60, 28, 28], np.uint8)
    frames = []
    for n in (1, 2):
        r = p[by:by + n + 1, x0:x1].copy()
        for yy in range(1, n + 1):
            r[yy, 1:-1, :3] = inner
        frames.append((r, x0, by))
    return frames


def build_portraits(m, save) -> None:
    out = m.setdefault('portraits', {})
    for name, job in PORTRAITS.items():
        p = portrait(job)
        entry = {'file': save(p, f'portraits/{name}.png'), 'width': PW, 'height': PH, 'mouth': [], 'eyes': []}
        if name != 'serpent':
            eyes = find_eyes(p)
            eye_y = np.mean([(b[0] + b[2]) / 2 for b in eyes]) if eyes else 25
            for kind, frames in (('mouth', mouth_patches(p, eye_y)), ('eyes', eye_patches(p, eyes))):
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


GRASS_STYLE = os.environ.get('ART_GRASS', 'texture')  # texture | soft | calm


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


def grass_sets(sw: dict) -> tuple[list[np.ndarray], list[np.ndarray]]:
    """Plain grass tiles and grass with tiny flowers. The flowered ones are
    the same tiles with flowers added, so they never show as squares."""
    if GRASS_STYLE == 'soft':
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
    # the generated dirt is a saturated orange: calm it to a soft earth
    for k in ('path', 'dry'):
        sw[k] = [desaturate(t, 0.62, 0.86) for t in sw[k]]
    med = {k: np.median(np.concatenate([t.reshape(-1, 4) for t in v])[:, :3], axis=0) for k, v in sw.items()}
    grass, meadow = grass_sets(sw)

    def grass_tile(seed: int, base: int = 6, density: int = 7, flowers: int = 0, ramp: str = 'grass') -> np.ndarray:
        src = meadow if flowers >= 6 else grass
        return src[seed % len(src)]

    terrain.grass_tile = grass_tile
    terrain.dirt_tile = lambda seed: sw['path'][seed % len(sw['path'])]
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
