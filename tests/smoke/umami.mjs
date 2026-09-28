// Umami KVKK smoke (headless Chromium): builds with the VITE_UMAMI_* env into dist-umami/, serves it with a tiny static
// server (vite preview refuses unknown Host headers) and opens it as http://fenomen.teserix.com/ (host-resolver-rules -> local preview; the analytics module refuses
// localhost). analiz.teserix.com is never contacted: its script is answered with a fake tracker.
// Usage: npm run smoke:umami   (PORT=4189 by default)
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const PORT = +(process.env.PORT || 4189);
const OUT = 'dist-umami';
const ENV = { VITE_UMAMI_SRC: 'https://analiz.teserix.com/script.js', VITE_UMAMI_WEBSITE_ID: '04257fdf-e069-4ecb-9b6a-196aa1e83242', VITE_UMAMI_DOMAINS: 'fenomen.teserix.com,thejackaltr.github.io' };
execSync('npx vite build --outDir ' + OUT + ' --emptyOutDir', { stdio: 'ignore', env: { ...process.env, ...ENV } });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const root = path.resolve(OUT);
const server = http.createServer((req, res) => {
  let f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const BASE = 'http://fenomen.teserix.com/';

const exe = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--host-resolver-rules=MAP fenomen.teserix.com 127.0.0.1:' + PORT] });
const results = []; let failed = 0;
const ok = (name, cond, extra) => { results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); if (!cond) failed++; };
const FAKE = 'window.__umamiCalls = []; window.umami = { track: function (n) { var h = window[document.currentScript && document.currentScript.getAttribute("data-before-send")]; if (h && !h("event", { name: n })) return; window.__umamiCalls.push([].slice.call(arguments)); } };';

async function page(ctx) {
  const hits = [];
  await ctx.route('https://analiz.teserix.com/**', (r) => { hits.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE }); });
  const p = await ctx.newPage(); const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  return { p, hits, errors };
}
const scriptTag = (p) => p.evaluate(() => { const s = document.querySelector('script[src*="analiz.teserix.com"]'); return s ? Object.fromEntries([...s.attributes].map((a) => [a.name, a.value])) : null; });
const calls = (p) => p.evaluate(() => window.__umamiCalls || null);

try {
  // 1) first open: no notice answered -> no script, no request
  {
    const ctx = await browser.newContext(); const { p, hits, errors } = await page(ctx);
    await p.goto(BASE, { waitUntil: 'load' }); await p.waitForSelector('[data-test=creator]'); await p.waitForTimeout(500);
    ok('before notice: Umami script not in page', (await scriptTag(p)) === null);
    ok('before notice: no request to analiz.teserix.com', hits.length === 0, JSON.stringify(hits));
    ok('before notice: no umami keys / ids in localStorage', await p.evaluate(() => !Object.keys(localStorage).some((k) => /umami|install|device/i.test(k))));
    ok('before notice: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  // 2) notice answered "Tamam" (fenomen_tel_notice=1, fenomen_tel=on): loaded with env config; game_start sent
  {
    const ctx = await browser.newContext(); await ctx.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('fenomen_tel_notice', '1'); localStorage.setItem('fenomen_tel', 'on'); sessionStorage.setItem('seeded', '1'); } });
    const { p, hits, errors } = await page(ctx);
    await p.goto(BASE, { waitUntil: 'load' }); await p.waitForSelector('[data-test=creator]');
    await p.waitForFunction(() => window.__umamiCalls && window.__umamiCalls.length > 0, null, { timeout: 5000 }).catch(() => {});
    const tag = await scriptTag(p);
    ok('after notice: one script from env config', hits.filter((u) => u.endsWith('/script.js')).length === 1 && tag && tag['data-website-id'] === ENV.VITE_UMAMI_WEBSITE_ID && tag['data-domains'] === ENV.VITE_UMAMI_DOMAINS, JSON.stringify(tag));
    ok('after notice: DNT / exclude-search / exclude-hash / before-send set', tag && tag['data-do-not-track'] === 'true' && tag['data-exclude-search'] === 'true' && tag['data-exclude-hash'] === 'true' && !!tag['data-before-send']);
    ok('after notice: game_start sent (name only)', JSON.stringify(await calls(p)) === JSON.stringify([['game_start']]), JSON.stringify(await calls(p)));
    // 3) stats turned off (Settings switch = fenomen_tel 'off'): the next events are not sent; before-send drops too
    await p.evaluate(() => localStorage.setItem('fenomen_tel', 'off'));
    await p.evaluate(() => window.__fenomen.ctrl.reset());           // reset_or_prestige hook fires
    ok('stats off: reset_or_prestige NOT sent', JSON.stringify(await calls(p)) === JSON.stringify([['game_start']]), JSON.stringify(await calls(p)));
    ok('stats off: before-send hook drops Umami requests', await p.evaluate(() => window.__fenomenUmamiBeforeSend('event', { name: 'x' }) === null));
    ok('stats off: umami.disabled kill switch set', await p.evaluate(() => localStorage.getItem('umami.disabled') === '1'));
    // back on -> resumes
    await p.evaluate(() => localStorage.setItem('fenomen_tel', 'on'));
    await p.evaluate(() => window.__fenomen.ctrl.reset());
    ok('stats back on: reset_or_prestige sent', JSON.stringify((await calls(p)).at(-1)) === JSON.stringify(['reset_or_prestige']), JSON.stringify(await calls(p)));
    ok('no page errors', errors.length === 0, errors.join(' | '));
    // 4) reload with stats off: script not loaded at all
    await p.evaluate(() => localStorage.setItem('fenomen_tel', 'off'));
    hits.length = 0;
    await p.reload({ waitUntil: 'load' }); await p.waitForSelector('[data-test=creator]'); await p.waitForTimeout(500);
    ok('reload with stats off ("Kapat"): script not loaded, no request', (await scriptTag(p)) === null && hits.length === 0, JSON.stringify(hits));
    await ctx.close();
  }
  // 5) tracker blocked: game unaffected
  {
    const ctx = await browser.newContext(); await ctx.addInitScript(() => { localStorage.setItem('fenomen_tel_notice', '1'); });
    await ctx.route('https://analiz.teserix.com/**', (r) => r.abort('blockedbyclient'));
    const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(BASE, { waitUntil: 'load' }); await p.waitForSelector('[data-test=creator]');
    await p.evaluate(() => window.__fenomen.ctrl.reset());
    ok('tracker blocked: game works, no page errors', errors.length === 0 && await p.evaluate(() => typeof window.umami === 'undefined'), errors.join(' | '));
    await ctx.close();
  }
} catch (e) { ok('umami smoke crashed: ' + e.message, false); }
await browser.close();
server.close();
fs.rmSync(OUT, { recursive: true, force: true });
console.log(results.join('\n'));
console.log((results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
