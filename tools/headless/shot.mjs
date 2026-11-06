// Runs a script body as async (page, sleep, out) in headless Chromium.
// Viewport from VW/VH. See setup.sh.
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import fs from 'node:fs';
const exe = await chromium.executablePath();
const args = chromium.args.filter((a) => !a.includes('single-process') && !a.includes('no-zygote'));
const browser = await puppeteer.launch({ executablePath: exe, args, headless: true, defaultViewport: { width: +(process.env.VW || 800), height: +(process.env.VH || 450) } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('[t]')) console.log('CONSOLE', m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const body = fs.readFileSync(process.argv[2], 'utf8');
const fn = new Function('page', 'sleep', 'out', `return (async()=>{${body}})()`);
try { await fn(page, sleep, process.argv[3] || '/tmp/shot'); } catch (e) { console.log('ERR', e.message); }
await browser.close();
