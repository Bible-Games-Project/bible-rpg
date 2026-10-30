"""Mix the recorded CC0 sounds (art/sfx/sources, credits in art/sfx/CREDITS.md)
into the short clips the game plays (public/assets/sfx/*.mp3): mono, 44.1 kHz,
each peaking at PEAK_DB. The game falls back to its synthesized sound when a
clip cannot be loaded (src/core/audio.ts, SAMPLES). Needs ffmpeg.

    python3 tools/audio/build_sfx.py
"""

from __future__ import annotations

import os
import re
import subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'art', 'sfx', 'sources')
OUT = os.path.join(ROOT, 'public', 'assets', 'sfx')
PEAK_DB = -1.0

# each clip: its sources (file, start delay s, gain, extra filters) and length
TRIM = 'silenceremove=start_periods=1:start_threshold=-35dB'
# for very quiet recordings (-35 dB cut them away entirely)
TRIM_QUIET = 'silenceremove=start_periods=1:start_threshold=-58dB'
CLIPS = {
    # a bite with its snap, then a softer chew
    'bite': ([
        ('eating-crunch-2.ogg', 0.0, 1.0, TRIM),
        ('eating-crunch-4.ogg', 0.55, 0.5, TRIM + ',lowpass=f=3500'),
    ], 1.4),
    # a cherub landing: a hard thump, a deep boom and the ground shaking
    'land': ([
        ('landing-thump.wav', 0.0, 0.9, TRIM),
        ('distant-boom.ogg', 0.0, 1.0, ''),
        ('earthquake.ogg', 0.02, 0.45, 'atrim=0:1.8,lowpass=f=900,afade=t=in:d=0.04,afade=t=out:st=0.5:d=1.3'),
    ], 2.4),
    # fig leaves gathered and tied: rustles, and the cord pulled through
    'sew-leaves': ([
        ('dry-leaves-rustle-02.flac', 0.0, 2.0, TRIM),
        ('kenney-cloth1.ogg', 0.6, 0.8, TRIM),
        ('dry-leaves-rustle-05.flac', 0.95, 2.4, TRIM),
        ('kenney-clothBelt.ogg', 1.55, 0.9, TRIM),
    ], 2.4),
    # gathering grain seeds: a crunchy handful
    'seed': ([
        ('steps-leaves-01.ogg', 0.0, 1.0, TRIM_QUIET),
        ('steps-leaves-02.ogg', 0.16, 1.8, TRIM_QUIET),
    ], 0.75),
    # a fig leaf picked
    'leaf-pick': ([('dry-leaves-rustle-09.flac', 0.0, 1.0, TRIM)], 0.65),
    # the gourd dipped in the river and filling
    'fill': ([
        ('water-splash-02.ogg', 0.0, 0.8, TRIM),
        ('water-flow.ogg', 0.12, 1.0, 'atrim=0:1.3,afade=t=in:d=0.15'),
    ], 1.5),
    # water poured on the seeds, glugging out of the gourd
    'pour': ([('water-poured-from-bottle.mp3', 0.0, 1.0, 'atrim=7.55:9.2,asetpts=PTS-STARTPTS,afade=t=in:d=0.05')], 1.6),
    # the serpent: a long hiss, then a shorter one
    'hiss': ([
        ('hiss-1.mp3', 0.0, 1.0, TRIM),
        ('hiss-3.mp3', 1.25, 0.75, TRIM),
    ], 2.3),
    # something set down on the grass
    'drop': ([('kenney-dropLeather.ogg', 0.0, 1.0, TRIM)], 0.45),
}
# footsteps on grass: six single steps, played in turn at random
for i, step in enumerate(['L1', 'R1', 'L2', 'R2', 'L3', 'R3'], 1):
    CLIPS[f'step-{i}'] = ([(f'footstep-sand-{step}.flac', 0.0, 1.0, TRIM)], 0.45)


def ffmpeg(*args: str) -> str:
    return subprocess.run(['ffmpeg', '-hide_banner', '-y', *args], capture_output=True, text=True, check=True).stderr


def mix(parts: list[tuple[str, float, float, str]], length: float, gain_db: float) -> tuple[str, list[str]]:
    """The ffmpeg filter graph (output [out]) and its input arguments."""
    inputs, chains = [], []
    for i, (file, delay, gain, extra) in enumerate(parts):
        inputs += ['-i', os.path.join(SRC, file)]
        f = [extra] if extra else []
        f += ['aformat=sample_rates=44100:channel_layouts=mono', f'volume={gain}', f'adelay={int(delay * 1000)}:all=1']
        chains.append(f'[{i}:a]' + ','.join(f) + f'[a{i}]')
    labels = ''.join(f'[a{i}]' for i in range(len(parts)))
    fade = min(0.3, length / 3)
    graph = ';'.join(chains) + f';{labels}amix=inputs={len(parts)}:normalize=0,atrim=0:{length},afade=t=out:st={length - fade}:d={fade},volume={gain_db}dB[out]'
    return graph, inputs


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for name, (parts, length) in CLIPS.items():
        out = os.path.join(OUT, f'{name}.mp3')
        graph, inputs = mix(parts, length, 0.0)
        # measure the mix's peak, then render it at PEAK_DB
        # (astats works in floating point: volumedetect stopped at 0 dB)
        log = ffmpeg(*inputs, '-filter_complex', graph + ';[out]astats=measure_perchannel=none[v]', '-map', '[v]', '-f', 'null', '-')
        peak = float(re.search(r'Peak level dB: (-?[\d.]+)', log.split('Overall')[-1]).group(1))
        graph, inputs = mix(parts, length, PEAK_DB - peak)
        ffmpeg(*inputs, '-filter_complex', graph, '-map', '[out]', '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', out)
        print('wrote', os.path.relpath(out, ROOT), f'(peak was {peak} dB)')


if __name__ == '__main__':
    main()
