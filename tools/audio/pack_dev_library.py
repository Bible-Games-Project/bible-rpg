"""Pack the maintainer's voice and sound library (src/ui/DevLibrary.ts).

    python3 tools/audio/pack_dev_library.py <option dir>... [--out DIR] [--voices DIR]

Reads art/sfx/library.json (the voices, the characters and the CC0 sound
options by category). Every option that is not a path under public/ is an
MP3 named after it in one of the option dirs (built from the CC0 sources
listed in art/sfx/options.json); they are joined back to back into one file,
<out>/sounds.mp3 (one file instead of a hundred: the Claude artifact of the
game holds at most 511 files, of standard web types), and <out>/library.json
gets the spec with the byte range of each.

--voices DIR: also pack the voice previews (DIR/<voice id>.mp3) into
<out>/voices-<n>.mp3, under 12 MB each. Only for the Claude artifact, whose
page may not load the previews from ElevenLabs' site: they are ElevenLabs'
samples, not ours to publish with the game.

--out defaults to public/assets/dev.
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SPEC = os.path.join(ROOT, 'art', 'sfx', 'library.json')
VOICE_PACK_MAX = 12_000_000


def main() -> None:
    args = sys.argv[1:]
    out = os.path.join(ROOT, 'public', 'assets', 'dev')
    voices = None
    dirs: list[str] = []
    while args:
        a = args.pop(0)
        if a == '--out':
            out = args.pop(0)
        elif a == '--voices':
            voices = args.pop(0)
        else:
            dirs.append(a)
    spec = json.load(open(SPEC))
    spec.pop('about', None)
    os.makedirs(out, exist_ok=True)

    items: dict[str, list[int]] = {}
    with open(os.path.join(out, 'sounds.mp3'), 'wb') as pack:
        for cat in spec['categories'].values():
            for sound, *_ in cat['options']:
                if '/' in sound:
                    if not os.path.exists(os.path.join(ROOT, 'public', sound)):
                        sys.exit(f'missing public/{sound}')
                    continue
                if sound in items:
                    continue
                path = next((os.path.join(d, f'{sound}.mp3') for d in dirs if os.path.exists(os.path.join(d, f'{sound}.mp3'))), None)
                if not path:
                    sys.exit(f'missing {sound}.mp3 in {dirs}')
                data = open(path, 'rb').read()
                items[sound] = [pack.tell(), len(data)]
                pack.write(data)
    spec['pack'] = {'file': 'sounds.mp3', 'items': items}

    if voices:
        ids = sorted({v[0] for g in spec['voiceGroups'] for v in g['voices']})
        files: list[str] = []
        vitems: dict[str, list[int]] = {}
        pack = None
        for vid in ids:
            path = os.path.join(voices, f'{vid}.mp3')
            if not os.path.exists(path):
                continue
            data = open(path, 'rb').read()
            if pack is None or pack.tell() + len(data) > VOICE_PACK_MAX:
                if pack:
                    pack.close()
                files.append(f'voices-{len(files) + 1}.mp3')
                pack = open(os.path.join(out, files[-1]), 'wb')
            vitems[vid] = [len(files) - 1, pack.tell(), len(data)]
            pack.write(data)
        if pack:
            pack.close()
        spec['voicePacks'] = {'files': files, 'items': vitems}

    with open(os.path.join(out, 'library.json'), 'w') as f:
        json.dump(spec, f, ensure_ascii=False, separators=(',', ':'))
    size = os.path.getsize(os.path.join(out, 'sounds.mp3'))
    print(f'{len(items)} sounds ({size / 1e6:.1f} MB)' + (f', {len(vitems)} voices in {len(files)} packs' if voices else ''))


if __name__ == '__main__':
    main()
