"""Generate art with the OpenAI Image API, with a hard spending cap.

    python3 tools/art/gen_images.py list
    python3 tools/art/gen_images.py estimate eve-sprite god-sprite --quality low
    python3 tools/art/gen_images.py run eve-sprite --quality low
    python3 tools/art/gen_images.py spent

Jobs (prompts and reference images) live in art/prompts/eden.json. Every
paid call is recorded in art/generated/ledger.json, and a call is refused
before it is sent if the worst-case cost would take the total past the
budget (ART_BUDGET_USD, default 5). The maintainer's OpenAI account also has
prepaid credit with auto-recharge off, so the budget is enforced twice.

The key is a Bearer network secret of the cloud environment for
api.openai.com: the environment's proxy adds it to requests, so this script
never sees it. OPENAI_API_KEY is used instead when set (local runs). Never put
a key in the repository or the chat. Uses only the standard library.
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
JOBS = os.path.join(ROOT, 'art', 'prompts', 'eden.json')
OUT = os.path.join(ROOT, 'art', 'generated')
LEDGER = os.path.join(OUT, 'ledger.json')
API = 'https://api.openai.com/v1/images'

MODEL = os.environ.get('ART_IMAGE_MODEL', 'gpt-image-2')
BUDGET = float(os.environ.get('ART_BUDGET_USD', '5'))

# Worst-case output cost per image (USD) by model and quality, from the
# published per-image prices (checked October 2026). Used to refuse a call
# before it is sent; the real cost is then taken from the reported tokens.
OUTPUT_CEILING = {
    'gpt-image-2': {'low': 0.007, 'medium': 0.055, 'high': 0.215},
    'gpt-image-1.5': {'low': 0.012, 'medium': 0.05, 'high': 0.2},
    'gpt-image-1': {'low': 0.016, 'medium': 0.063, 'high': 0.25},
    'gpt-image-1-mini': {'low': 0.006, 'medium': 0.015, 'high': 0.052},
}
# Conservative allowance for each reference image sent with a prompt, and
# for the prompt text itself.
REFERENCE_CEILING = 0.03
TEXT_CEILING = 0.004
# USD per token (text input, image input, image output) to compute the real
# cost from the usage the API reports.
TOKEN_PRICES = {
    'gpt-image-2': (5e-6, 8e-6, 30e-6),
    'gpt-image-1.5': (5e-6, 8e-6, 32e-6),
    'gpt-image-1': (5e-6, 10e-6, 40e-6),
    'gpt-image-1-mini': (2e-6, 2.5e-6, 8e-6),
}


def load_jobs() -> dict:
    with open(JOBS) as f:
        return json.load(f)


def load_ledger() -> list:
    if not os.path.exists(LEDGER):
        return []
    with open(LEDGER) as f:
        return json.load(f)


def spent() -> float:
    return round(sum(e['cost'] for e in load_ledger()), 4)


def ceiling(job: dict, quality: str) -> float:
    table = OUTPUT_CEILING.get(MODEL)
    if not table:
        sys.exit(f'No price table for model {MODEL}; add one to OUTPUT_CEILING first.')
    return table[quality] + REFERENCE_CEILING * len(job.get('references', [])) + TEXT_CEILING


def real_cost(usage: dict | None) -> float | None:
    if not usage or MODEL not in TOKEN_PRICES:
        return None
    text_in, image_in, image_out = TOKEN_PRICES[MODEL]
    details = usage.get('input_tokens_details') or {}
    text = details.get('text_tokens', usage.get('input_tokens', 0) - details.get('image_tokens', 0))
    images = details.get('image_tokens', 0)
    return text * text_in + images * image_in + usage.get('output_tokens', 0) * image_out


def full_prompt(spec: dict, job: dict) -> str:
    return f"{job['prompt']}\n\n{spec['style']}"


def multipart(fields: dict, files: list[tuple[str, str]]) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    parts: list[bytes] = []
    for k, v in fields.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    for field, path in files:
        mime = 'image/webp' if path.endswith('.webp') else 'image/png'
        with open(path, 'rb') as f:
            data = f.read()
        head = f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="{os.path.basename(path)}"\r\nContent-Type: {mime}\r\n\r\n'
        parts.append(head.encode() + data + b'\r\n')
    parts.append(f'--{boundary}--\r\n'.encode())
    return b''.join(parts), f'multipart/form-data; boundary={boundary}'


def output_of(spec: dict, jid: str) -> str:
    """The image a job settled on: its `approved` file, else its latest
    medium-quality output, else its latest output."""
    job = next((j for j in spec['jobs'] if j['id'] == jid), None)
    if job and job.get('approved'):
        return job['approved']
    folder = os.path.join(OUT, jid)
    files = sorted(f for f in os.listdir(folder) if f.endswith('.png')) if os.path.isdir(folder) else []
    if not files:
        sys.exit(f'Reference @{jid} has no output yet; generate it first.')
    medium = [f for f in files if f.endswith('-medium.png')]
    return os.path.relpath(os.path.join(folder, (medium or files)[-1]), ROOT)


def reference_paths(spec: dict, job: dict) -> list[str]:
    """References are repository paths, or @job for another job's output."""
    return [os.path.join(ROOT, output_of(spec, r[1:]) if r.startswith('@') else r) for r in job.get('references', [])]


def call(spec: dict, job: dict, quality: str) -> dict:
    key = os.environ.get('OPENAI_API_KEY')
    refs = reference_paths(spec, job)
    fields = {'model': MODEL, 'prompt': full_prompt(spec, job), 'size': job.get('size', '1024x1024'), 'quality': quality, 'n': '1'}
    if refs:
        body, ctype = multipart(fields, [('image[]', r) for r in refs])
        url = f'{API}/edits'
    else:
        body, ctype = json.dumps(fields | {'n': 1}).encode(), 'application/json'
        url = f'{API}/generations'
    headers = {'Content-Type': ctype}
    if key:
        headers['Authorization'] = f'Bearer {key}'
    req = urllib.request.Request(url, data=body, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors='replace')[:800]
        sys.exit(f'OpenAI API error {e.code}: {detail}')


def run(ids: list[str], quality: str) -> None:
    spec = load_jobs()
    jobs = {j['id']: j for j in spec['jobs']}
    for jid in ids:
        if jid not in jobs:
            sys.exit(f'Unknown job: {jid}')
    for jid in ids:
        job = jobs[jid]
        worst = ceiling(job, quality)
        total = spent()
        if total + worst > BUDGET:
            sys.exit(f'Stopped before {jid}: spent ${total:.3f}, this call could cost up to ${worst:.3f}, budget ${BUDGET:.2f}.')
        print(f'{jid}: generating ({MODEL}, {quality}, up to ${worst:.3f})…', flush=True)
        t0 = time.time()
        res = call(spec, job, quality)
        cost = real_cost(res.get('usage'))
        cost = round(cost if cost is not None else worst, 4)
        os.makedirs(os.path.join(OUT, jid), exist_ok=True)
        stamp = time.strftime('%Y%m%d-%H%M%S')
        path = os.path.join(OUT, jid, f'{stamp}-{quality}.png')
        with open(path, 'wb') as f:
            f.write(base64.b64decode(res['data'][0]['b64_json']))
        ledger = load_ledger()
        ledger.append({'job': jid, 'file': os.path.relpath(path, ROOT), 'model': MODEL, 'quality': quality, 'cost': cost, 'usage': res.get('usage'), 'at': stamp})
        os.makedirs(OUT, exist_ok=True)
        with open(LEDGER, 'w') as f:
            json.dump(ledger, f, indent=1)
        print(f'  saved {os.path.relpath(path, ROOT)} in {time.time() - t0:.0f}s, cost ${cost:.4f}, total ${spent():.3f} of ${BUDGET:.2f}', flush=True)


def main() -> None:
    args = sys.argv[1:]
    quality = 'low'
    if '--quality' in args:
        i = args.index('--quality')
        quality = args[i + 1]
        del args[i:i + 2]
    if quality not in ('low', 'medium', 'high'):
        sys.exit('quality must be low, medium or high')
    cmd, ids = (args[0], args[1:]) if args else ('list', [])
    spec = load_jobs()
    if cmd == 'list':
        for j in spec['jobs']:
            print(f"{j['id']:<18} {j.get('size', '1024x1024'):<10} refs={len(j.get('references', []))}  {j['title']}")
    elif cmd == 'estimate':
        jobs = [j for j in spec['jobs'] if not ids or j['id'] in ids]
        total = sum(ceiling(j, quality) for j in jobs)
        print(f'{len(jobs)} images at {quality} quality ({MODEL}): up to ${total:.3f}. Spent so far ${spent():.3f} of ${BUDGET:.2f}.')
    elif cmd == 'run':
        run(ids, quality)
    elif cmd == 'spent':
        print(f'Spent ${spent():.3f} of ${BUDGET:.2f} ({len(load_ledger())} images).')
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main()
