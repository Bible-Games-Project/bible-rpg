"""Build every game sprite and the asset manifest.

    python3 tools/art/build_all.py            # everything
    python3 tools/art/build_all.py chars      # one group (chars, portraits, creatures, flora, terrain, items, from_generated, ui_markers)

Sources: the supplied references in art/reference (never modified), the
generators in this folder and, last, the generated art in art/generated
(from_generated.py), which replaces the procedural sprites it covers. Output: public/assets/** and
src/data/generated/assets.json (merged, so groups can be rebuilt alone).
"""

from __future__ import annotations

import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
PUB = os.path.join(ROOT, 'public', 'assets')
MANIFEST = os.path.join(ROOT, 'src', 'data', 'generated', 'assets.json')


def save(img: np.ndarray, rel: str) -> str:
    path = os.path.join(PUB, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(img).save(path, optimize=True)
    return f'assets/{rel}'


def strip(frames: list[np.ndarray]) -> np.ndarray:
    """Frames side by side. The first and last column of each frame are left
    empty: the game draws scaled down with smooth filtering, which samples a
    little past a frame's edge, and a neighbour's pixels there would show as
    a thin line."""
    h, w = frames[0].shape[:2]
    out = np.zeros((h, w * len(frames), 4), np.uint8)
    for i, f in enumerate(frames):
        out[:, i * w + 1:(i + 1) * w - 1] = f[:, 1:w - 1]
    return out


def sheet_entry(file: str, frames: list[np.ndarray], anchor: tuple[int, int], **extra) -> dict:
    h, w = frames[0].shape[:2]
    d = {'file': file, 'frameWidth': int(w), 'frameHeight': int(h), 'frames': len(frames), 'anchorX': int(anchor[0]), 'anchorY': int(anchor[1])}
    d.update(extra)
    return d


def build_references() -> None:
    """Extract the supplied Adam references at their native pixel grid."""
    import extract as ex
    side, _ = ex.extract(os.path.join(ROOT, 'art', 'reference', 'adam-sprite.webp'), 7.5)
    h, w = side.shape[:2]
    pad = np.zeros((h + 2, w + 2, 4), np.uint8)
    pad[1:h + 1, 1:w + 1] = side
    derived = os.path.join(ROOT, 'art', 'derived')
    os.makedirs(derived, exist_ok=True)
    Image.fromarray(pad).save(os.path.join(derived, 'adam-side.png'))
    por, _ = ex.extract(os.path.join(ROOT, 'art', 'reference', 'adam-talk.webp'), 15.0)
    Image.fromarray(por).save(os.path.join(derived, 'adam-portrait.png'))


def build_chars(m: dict) -> None:
    import chars as ch
    out = m.setdefault('characters', {})
    for look in (ch.ADAM, ch.EVE):
        for outfit in ('leaves', 'fig', 'tunic'):
            frames = ch.character_frames(look, outfit)
            for d, fr in frames.items():
                f = save(strip(fr), f'sprites/char-{look.name}-{outfit}-{d}.png')
                out.setdefault(look.name, {}).setdefault(outfit, {})[d] = sheet_entry(f, fr, (ch.CX, ch.SOLE), idle=[0, 1], walk=[2, 3, 4, 5])
            print(f'  {look.name}/{outfit}')
    frames = ch.god_frames()
    for d, fr in frames.items():
        f = save(strip(fr), f'sprites/char-god-robe-{d}.png')
        out.setdefault('god', {}).setdefault('robe', {})[d] = sheet_entry(f, fr, (ch.CX, ch.SOLE), idle=[0, 1], walk=[2, 3, 4, 5])
    print('  god/robe')
    # lying asleep (Genesis 2:21): Adam's front idle turned 90 degrees, eyes closed
    idle = ch.outfit_front(ch.ADAM, ch.Pose(), False, 'leaves')
    closed = idle.copy()
    for y in range(15, 19):
        for x in range(22, 42):
            c = tuple(int(v) for v in closed[y, x, :3])
            if closed[y, x, 3] and (c in [tuple(e[:3]) for e in ch.P['eye']] or c in [tuple(e[:3]) for e in ch.P['hair'][:3]]):
                closed[y, x] = closed[19, x] if closed[19, x, 3] else ch.P['skin'][8]
    lying = np.rot90(closed, 1).copy()
    f = save(lying, 'sprites/adam-sleeping.png')
    m.setdefault('sprites', {})['adam-sleeping'] = sheet_entry(f, [lying], (lying.shape[1] // 2, lying.shape[0] - 1))


def build_portraits(m: dict) -> None:
    import portraits as pt
    m['portraits'] = pt.build(os.path.join(PUB, 'portraits'))
    print('  portraits:', ', '.join(m['portraits']))


GROUPS = ['references', 'portraits', 'chars', 'creatures', 'flora', 'terrain', 'items', 'from_generated', 'ui_markers']


def main() -> None:
    wanted = sys.argv[1:] or GROUPS
    m: dict = {}
    if os.path.exists(MANIFEST):
        with open(MANIFEST) as f:
            m = json.load(f)
    for g in GROUPS:
        if g not in wanted:
            continue
        print(g)
        if g == 'references':
            build_references()
        elif g == 'portraits':
            build_portraits(m)
        elif g == 'chars':
            build_chars(m)
        elif g == 'ui_markers':
            __import__(g).main()
        else:
            mod = __import__(g)
            mod.build(m, save, strip, sheet_entry)
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    with open(MANIFEST, 'w') as f:
        json.dump(m, f, indent=1)
        f.write('\n')
    print('manifest written')


if __name__ == '__main__':
    main()
