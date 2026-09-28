// Umami KVKK smoke (headless Chromium): builds with the VITE_UMAMI_* env into dist-umami/, serves it with a tiny static
// server (vite preview refuses unknown Host headers) and opens it as http://fenomen.teserix.com/ (host-resolver-rules -> local preview; the analytics module refuses
// localhost). analiz.teserix.com is never contacted: its script is answered with a fake tracker.
// Usage: npm run smoke:umami   (PORT=4189 by default; use a free port, e.g. PORT=4193 npm run smoke:umami)
// v2.1: also runs the "[privacy-net]" section: real request capture proving ZERO requests to the Umami host before the
// notice, after "Kapat", after switching off in Settings and on reload while off (+ a positive control when on).
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
const UMAMI_HOST = new URL(ENV.VITE_UMAMI_SRC).hostname;          // analiz.teserix.com
// safety net: even a request that escaped interception could never reach the real Umami server (port 9 = discard, closed)
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--host-resolver-rules=MAP fenomen.teserix.com 127.0.0.1:' + PORT + ', MAP ' + UMAMI_HOST + ' 127.0.0.1:9'] });
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
  await privacyNet();
} catch (e) { ok('umami smoke crashed: ' + e.message, false); }

// ============ [privacy-net] ZERO requests to the Umami host unless stats are on (network request interception) ============
// Every request of the browser context is captured (context 'request' event + a route on the Umami host that answers
// locally + the page's own resource timing). The fake tracker below behaves like the real Umami script: automatic
// pageview on load and on history.pushState/replaceState/popstate, umami.track(name) -> POST /api/send, and before every
// send it honours localStorage 'umami.disabled' and the data-before-send hook. So an "off" that failed would show up
// as a real network request here.
async function privacyNet() {
  const TAG = '[privacy-net] ';
  const FAKE_REAL = '(function(){var s=document.currentScript;var hook=s&&s.getAttribute("data-before-send");var ep=new URL("/api/send",s.src).href;var site=s.getAttribute("data-website-id");' +
    'function send(type,payload){try{if(localStorage.getItem("umami.disabled"))return;}catch(e){}var h=hook&&window[hook];if(typeof h==="function"){payload=h(type,payload);if(!payload)return;}' +
    'fetch(ep,{method:"POST",keepalive:true,headers:{"Content-Type":"application/json"},body:JSON.stringify({type:type,payload:payload})}).catch(function(){});}' +
    'function pv(){send("event",{website:site,url:location.pathname});}' +
    'window.umami={track:function(n){send("event",{website:site,name:n,url:location.pathname});}};' +
    '["pushState","replaceState"].forEach(function(k){var o=history[k];history[k]=function(){var r=o.apply(this,arguments);pv();return r;};});' +
    'window.addEventListener("popstate",pv);pv();})();';
  const isUmami = (u) => { try { const h = new URL(u).hostname; return h === UMAMI_HOST || h.endsWith('.' + UMAMI_HOST); } catch (e) { return false; } };
  async function context() {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'tr-TR' });
    const all = [];                                        // every request of the context (pages, workers, subresources)
    ctx.on('request', (r) => all.push(r.url()));
    const routed = [];
    await ctx.route((u) => isUmami(u.href), (r) => { routed.push(r.request().url()); const u = new URL(r.request().url());
      return u.pathname.endsWith('.js') ? r.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_REAL }) : r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
    const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(e.message));
    const count = () => ({ seen: all.filter(isUmami).length, routed: routed.length });
    const timing = () => p.evaluate((h) => performance.getEntriesByType('resource').filter((e) => { try { return new URL(e.name).hostname === h; } catch (x) { return false; } }).length, UMAMI_HOST);
    return { ctx, p, all, routed, errors, count, timing };
  }
  const settle = (p) => p.waitForTimeout(800);
  const events = async (p) => {                            // Umami-tracked game events + SPA navigation (pageviews)
    await p.evaluate(() => { window.__fenomen.ctrl.reset(); history.pushState({}, '', '/nav-a'); history.replaceState({}, '', '/nav-b'); history.back(); });
    await settle(p);
  };
  const createChar = async (p) => { await p.waitForSelector('[data-test=creator]'); await p.fill('[data-test=channel-input]', 'Gizlilik'); await p.click('[data-test=creator-next]'); await p.click('[data-test=path-vlog]'); await p.click('[data-test=creator-start]'); await p.waitForSelector('[data-test=shoot]'); await p.evaluate(() => { const f = window.__fenomen; f.ctrl.state.tut = 99; f.ui.updateTutorial(); }); };
  // the Settings switch is reached through the real UI (a character is created first; the creator screen has no ⚙)
  const toggle = async (p) => { if (!(await p.$('[data-test=settings-open]'))) await createChar(p); await p.click('[data-test=settings-open]'); await p.click('[data-test=tel-toggle]'); await p.evaluate(() => window.__fenomen.ui.closeModal()); };
  const zero = (c) => c.seen === 0 && c.routed === 0;

  // (a) fresh load, empty storage, notice not answered
  {
    const T = await context();
    await T.p.goto(BASE, { waitUntil: 'load' }); await T.p.waitForSelector('[data-test=tel-banner]'); await settle(T.p);
    await events(T.p); await T.p.reload({ waitUntil: 'load' }); await T.p.waitForSelector('[data-test=tel-banner]'); await settle(T.p);
    const c = T.count(), tm = await T.timing();
    ok(TAG + '(a) before the notice: ZERO requests to ' + UMAMI_HOST + ' (load, events, navigation, reload)', zero(c) && tm === 0, JSON.stringify({ c, tm, hits: T.all.filter(isUmami) }));
    ok(TAG + '(a) before the notice: every request stays on the game origin', T.all.every((u) => u.startsWith(BASE) || /^(data|blob):/.test(u)), T.all.filter((u) => !u.startsWith(BASE)).join(' | '));
    ok(TAG + '(a) before the notice: nothing Umami-related stored, no script tag', await T.p.evaluate(() => !Object.keys(localStorage).some((k) => /umami/i.test(k)) && !document.querySelector('script[data-test=umami-script]')));
    await T.ctx.close();
  }
  // (b) notice answered with "Kapat"
  {
    const T = await context();
    await T.p.goto(BASE, { waitUntil: 'load' }); await T.p.click('[data-test=tel-off]'); await settle(T.p);
    await events(T.p); await T.p.reload({ waitUntil: 'load' }); await T.p.waitForSelector('[data-test=creator]'); await events(T.p);
    const c = T.count(), tm = await T.timing();
    ok(TAG + '(b) after "Kapat": ZERO requests to ' + UMAMI_HOST + ' (events, navigation, reload)', zero(c) && tm === 0 && !(await T.p.$('script[data-test=umami-script]')), JSON.stringify({ c, tm }));
    await T.ctx.close();
  }
  // positive control + (c) switched off in Settings after an earlier accept + (d) reload while off
  {
    const T = await context();
    await T.p.goto(BASE, { waitUntil: 'load' }); await T.p.click('[data-test=tel-ok]');
    await T.p.waitForFunction(() => !!document.querySelector('script[data-test=umami-script]'), null, { timeout: 3000 }).catch(() => {});
    await settle(T.p); await events(T.p);
    const on = T.count(), sends = T.all.filter((u) => isUmami(u) && u.endsWith('/api/send')).length;
    ok(TAG + 'positive control: stats ON -> requests to ' + UMAMI_HOST + ' DO occur (script right after "Tamam" via sync(), pageview + events)', T.all.some((u) => isUmami(u) && u.endsWith('/script.js')) && sends >= 3 && on.routed >= 4 && (await T.timing()) >= 1, JSON.stringify({ on, sends }));
    await createChar(T.p); await settle(T.p);
    const mark = T.count(), markAll = T.all.length;         // taken BEFORE the switch is touched: nothing may follow it
    await toggle(T.p);                                      // Settings > Gizlilik switch OFF (real UI click)
    ok(TAG + '(c) switch is off in storage', (await T.p.evaluate(() => localStorage.getItem('fenomen_tel'))) === 'off');
    await events(T.p); await events(T.p);
    const after = T.count();
    ok(TAG + '(c) switched off in Settings: ZERO requests to ' + UMAMI_HOST + ' from that moment (events + navigation pageviews)', after.seen === mark.seen && after.routed === mark.routed, JSON.stringify({ mark, after, extra: T.all.slice(markAll).filter(isUmami) }));
    // (d) reload while off (same browser profile)
    await T.p.reload({ waitUntil: 'load' }); await T.p.waitForSelector('[data-test=creator]'); await settle(T.p); await events(T.p);
    const rl = T.count();
    ok(TAG + '(d) reload while off: ZERO requests to ' + UMAMI_HOST + ', no script tag', rl.seen === mark.seen && rl.routed === mark.routed && (await T.timing()) === 0 && !(await T.p.$('script[data-test=umami-script]')), JSON.stringify({ mark, rl }));
    // switched back on: resumes at once (same capture sees it again)
    await toggle(T.p); await settle(T.p); await events(T.p);
    const back = T.count();
    ok(TAG + 'switched back on: requests resume (script + sends)', back.seen > rl.seen && back.routed > rl.routed, JSON.stringify({ rl, back }));
    ok(TAG + 'no page errors', T.errors.length === 0, T.errors.join(' | '));
    await T.ctx.close();
  }
}

await browser.close();
server.close();
fs.rmSync(OUT, { recursive: true, force: true });
console.log(results.join('\n'));
console.log((results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
