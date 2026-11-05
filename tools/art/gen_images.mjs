/**
 * Node port of gen_images.py (the console has no Python): generate art with
 * the OpenAI Image API under the same hard budget and the same ledger.
 *
 *   node tools/art/gen_images.mjs run <job...> [--quality low|medium] [--jobs art/prompts/cain.json]
 *   node tools/art/gen_images.mjs spent [--chapter cain]
 *
 * Calls go through the environment's HTTPS proxy (undici ProxyAgent); the key
 * is OPENAI_API_KEY when set, else the proxy adds it. Every paid call is
 * logged in art/generated/ledger.json (with `chapter` when the jobs file has
 * one) and refused when the worst case would pass ART_BUDGET_USD (default 5).
 */
import fs from 'fs';
import path from 'path';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const LEDGER = path.join(ROOT, 'art/generated/ledger.json');
const MODEL = process.env.ART_IMAGE_MODEL || 'gpt-image-2';
const BUDGET = Number(process.env.ART_BUDGET_USD || 5);
const OUTPUT_CEILING = { 'gpt-image-2': { low: 0.007, medium: 0.055, high: 0.215 } };
const TOKEN_PRICES = { 'gpt-image-2': [5e-6, 8e-6, 30e-6] };
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
if (proxy) setGlobalDispatcher(new ProxyAgent(proxy));

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const quality = opt('--quality', 'low');
const jobsFile = path.join(ROOT, opt('--jobs', 'art/prompts/cain.json'));
const chapterOnly = opt('--chapter', null);
const [cmd, ...ids] = args;
const ledger = () => (fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : []);
const spent = (ch = null) => ledger().filter((e) => !ch || e.chapter === ch).reduce((s, e) => s + e.cost, 0);

if (cmd === 'spent') {
  console.log(`total $${spent().toFixed(3)} of $${BUDGET}` + (chapterOnly ? `, ${chapterOnly} $${spent(chapterOnly).toFixed(3)}` : ''));
  process.exit(0);
}
if (cmd !== 'run') {
  console.log('usage: run <job...> [--quality low|medium] | spent [--chapter id]');
  process.exit(1);
}
const spec = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
for (const id of ids) {
  const job = spec.jobs.find((j) => j.id === id);
  if (!job) throw new Error('unknown job ' + id);
  const refs = (job.references || []).map((r) => path.join(ROOT, r));
  const worst = OUTPUT_CEILING[MODEL][quality] * (job.size === '1536x1024' ? 1.5 : 1) + 0.03 * refs.length + 0.004;
  if (spent() + worst > BUDGET) {
    console.log(`Stopped before ${id}: spent $${spent().toFixed(3)}, budget $${BUDGET}`);
    process.exit(2);
  }
  const prompt = `${job.prompt}\n\n${spec[job.style || 'style']}`;
  const form = new FormData();
  form.set('model', MODEL);
  form.set('prompt', prompt);
  form.set('size', job.size || '1024x1024');
  form.set('quality', quality);
  form.set('n', '1');
  for (const r of refs) form.append('image[]', new Blob([fs.readFileSync(r)], { type: r.endsWith('.webp') ? 'image/webp' : 'image/png' }), path.basename(r));
  const headers = process.env.OPENAI_API_KEY ? { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } : {};
  console.log(`${id}: generating (${MODEL}, ${quality}, up to $${worst.toFixed(3)})…`);
  const t0 = Date.now();
  const res = await fetch(`https://api.openai.com/v1/images/${refs.length ? 'edits' : 'generations'}`, { method: 'POST', headers, body: form });
  const j = await res.json();
  if (!res.ok) {
    console.log('OpenAI error', res.status, JSON.stringify(j).slice(0, 600));
    process.exit(3);
  }
  const u = j.usage;
  const [tIn, iIn, iOut] = TOKEN_PRICES[MODEL];
  const det = u?.input_tokens_details || {};
  const cost = u ? Math.round(((det.text_tokens ?? 0) * tIn + (det.image_tokens ?? 0) * iIn + u.output_tokens * iOut) * 1e4) / 1e4 : worst;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const dir = path.join(ROOT, 'art/generated', id);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${stamp}-${quality}.png`);
  fs.writeFileSync(file, Buffer.from(j.data[0].b64_json, 'base64'));
  const l = ledger();
  l.push({ job: id, chapter: spec.chapter, file: path.relative(ROOT, file), model: MODEL, quality, cost, usage: u, at: stamp });
  fs.writeFileSync(LEDGER, JSON.stringify(l, null, 1));
  console.log(`  saved ${path.relative(ROOT, file)} in ${Math.round((Date.now() - t0) / 1000)}s, $${cost}; ${spec.chapter ?? ''} $${spent(spec.chapter).toFixed(3)}, total $${spent().toFixed(3)} of $${BUDGET}`);
}
