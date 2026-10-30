"""Voice the dialogue with ElevenLabs text to speech (the maintainer's choice):
each spoken line becomes public/assets/voice/<lang>/<key>.mp3, listed with its
text in manifest.json there. The game plays a line's file only while the
manifest text still matches the line, so an edited line falls silent until it
is voiced again (src/core/voices.ts).

Only lines whose text or voice changed are sent again (each costs credits).
The API key is a network secret of the cloud environment, added to every
request to api.elevenlabs.io by the agent proxy; it is never in this repo.
Needs ffmpeg.

    python3 tools/audio/build_voices.py            # voice what changed
    python3 tools/audio/build_voices.py --dry-run  # list it, with its cost
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import tempfile
import urllib.error
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
API = 'https://api.elevenlabs.io/v1/text-to-speech'
MODEL = 'eleven_v4'
SEED = 7
# less steady than the default 0.5: a more natural, less read-out delivery
# (the maintainer asked it of God and the narrator)
NATURAL = {'stability': 0.3, 'similarity_boost': 0.75}
# ElevenLabs' own voices, chosen by the maintainer from a test of three per
# character. The free plan cannot use Voice Library voices over the API: the
# maintainer's choice for the serpent, "Dante - Growly and Menacing Monster"
# (wXvR48IpOq9HACltTmt7), needs a paid plan.
Voice = tuple[str, str, dict | None]
VOICES: dict[str, Voice] = {
    'god': ('Bill', 'pqHfZKP75CvOlQylNhV4', NATURAL),
    'adam': ('Chris', 'iP95p4xoKVk53GoZ742B', None),
    'eve': ('River', 'SAz9YHcvj6GT2YYXdXww', None),
    'serpent': ('Callum', 'N2lVS1w4EtoT3dr4eOWO', None),
}
# reads the gold scripture cards, the creation verse and the short narrations
NARRATOR: Voice = ('George', 'JBFqnCBsd6RMkjVDRZzb', NATURAL)
# words a voice would spell out or stress wrongly, written as spoken
SPOKEN = {'LORD': 'Lord'}


def lines(lang: str) -> dict[str, tuple[str, str]]:
    """Every line to voice: key -> (speaker, text). Narrations that name a
    key or carry a value ("Adam called it {name}") stay unvoiced."""
    eden = json.load(open(os.path.join(ROOT, 'src', 'i18n', lang, 'eden.json')))
    out: dict[str, tuple[str, str]] = {'creation': ('narrator', eden['creation']['verse'])}
    for sid, verse in eden['scripture'].items():
        out[f'scripture.{sid}'] = ('narrator', verse['text'])
    for did, said in eden['dialogue'].items():
        for i, line in enumerate(said):
            text = line['t']
            if '{' in text or text.startswith('Gameplay'):
                continue
            out[f'{did}.{i}'] = (line['s'], text)
    return out


def voice_for(speaker: str) -> Voice | None:
    return NARRATOR if speaker == 'narrator' else VOICES.get(speaker)


def speak(voice: Voice, text: str) -> bytes:
    for word, said in SPOKEN.items():
        text = text.replace(word, said)
    body: dict = {'text': text, 'model_id': MODEL, 'seed': SEED}
    if voice[2]:
        body['voice_settings'] = voice[2]
    req = urllib.request.Request(
        f'{API}/{voice[1]}?output_format=mp3_44100_128',
        data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', 'Accept': 'audio/mpeg'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        raise SystemExit(f'ElevenLabs refused ({e.code}): {e.read()[:300].decode(errors="replace")}')


def finish(raw: bytes, out: str) -> None:
    """Silence trimmed at both ends, loudness evened out between voices,
    mono MP3 at 64 kb/s."""
    with tempfile.NamedTemporaryFile(suffix='.mp3') as tmp:
        tmp.write(raw)
        tmp.flush()
        trim = 'silenceremove=start_periods=1:start_threshold=-50dB'
        chain = f'{trim},areverse,{trim},areverse,loudnorm=I=-18:TP=-1.5:LRA=11,afade=t=in:d=0.01'
        subprocess.run(
            ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', tmp.name, '-af', chain,
             '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '64k', out],
            check=True,
        )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--lang', default='en')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    folder = os.path.join(ROOT, 'public', 'assets', 'voice', args.lang)
    path = os.path.join(folder, 'manifest.json')
    manifest = json.load(open(path)) if os.path.exists(path) else {}
    todo, cost = [], 0
    wanted = lines(args.lang)
    for key, (speaker, text) in wanted.items():
        voice = voice_for(speaker)
        if not voice:
            continue
        entry = {'text': text, 'voice': voice[0], 'model': MODEL}
        if voice[2]:
            entry['settings'] = voice[2]
        if manifest.get(key) != entry or not os.path.exists(os.path.join(folder, f'{key}.mp3')):
            todo.append((key, voice, entry))
            cost += len(text)
    print(f'{len(todo)} lines to voice, about {cost} credits')
    if args.dry_run:
        for key, voice, entry in todo:
            print(f'  {key:28} {voice[0]:8} {entry["text"][:70]}')
        return
    os.makedirs(folder, exist_ok=True)
    for key, voice, entry in todo:
        finish(speak(voice, entry['text']), os.path.join(folder, f'{key}.mp3'))
        manifest[key] = entry
        # saved after every line, so an interrupted run loses nothing paid for
        json.dump(dict(sorted(manifest.items())), open(path, 'w'), indent=2, ensure_ascii=False)
        print('voiced', key, voice[0])
    # lines that no longer exist
    for key in [k for k in manifest if k not in wanted]:
        del manifest[key]
        if os.path.exists(os.path.join(folder, f'{key}.mp3')):
            os.remove(os.path.join(folder, f'{key}.mp3'))
        print('removed', key)
    json.dump(dict(sorted(manifest.items())), open(path, 'w'), indent=2, ensure_ascii=False)


if __name__ == '__main__':
    main()
