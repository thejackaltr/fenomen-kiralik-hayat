// Umami (analiz.teserix.com), KVKK-gated: no script before the stats notice, same preference key as the v2.1
// anonymous counter (fenomen_tel / fenomen_tel_notice), off = stops at once, env-only config, never hardcoded.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAnalytics, KEYS, BEFORE_SEND } from '../../src/analytics.js';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const CFG = { src: 'https://analiz.teserix.com/script.js', websiteId: '04257fdf-e069-4ecb-9b6a-196aa1e83242', domains: 'fenomen.teserix.com,thejackaltr.github.io' };

function memStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; }
function fakeEnv(host = 'fenomen.teserix.com') {
  const appended = [];
  const listeners = {};
  const mkEl = () => { const attrs = {}; const ls = {}; return { attrs, setAttribute: (k, v) => { attrs[k] = String(v); }, addEventListener: (ev, fn) => { (ls[ev] = ls[ev] || []).push(fn); }, fire: (ev) => (ls[ev] || []).forEach((f) => f()) }; };
  const doc = { head: { appendChild: (el) => appended.push(el) }, createElement: () => mkEl() };
  const win = { location: { hostname: host, protocol: 'https:' }, addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); }, fire: (ev, e) => (listeners[ev] || []).forEach((f) => f(e)) };
  return { doc, win, appended };
}

test('before the stats notice: no script, events dropped (not queued)', () => {
  const st = memStorage(); const { doc, win, appended } = fakeEnv();
  const A = createAnalytics({ win, doc, storage: st, cfg: CFG });
  assert.equal(A.sync(), false);
  assert.equal(A.track('game_start'), 'off');
  assert.equal(appended.length, 0);
  assert.equal(A.tracked().length, 0);
  assert.equal(st.m.size, 0, 'nothing written to storage before the notice (no ids, no flags)');
});

test('notice "Tamam" (fenomen_tel_notice set, fenomen_tel on): script injected once with env config + privacy attrs', () => {
  const st = memStorage(); const { doc, win, appended } = fakeEnv();
  st.setItem(KEYS.notice, '1'); st.setItem(KEYS.pref, 'on');
  const A = createAnalytics({ win, doc, storage: st, cfg: CFG });
  assert.equal(A.track('game_start'), 'queued');
  A.track('share_click');
  assert.equal(appended.length, 1);
  const s = appended[0];
  assert.equal(s.src, CFG.src); assert.equal(s.defer, true);
  assert.equal(s.attrs['data-website-id'], CFG.websiteId);
  assert.equal(s.attrs['data-domains'], CFG.domains);
  assert.equal(s.attrs['data-do-not-track'], 'true');
  assert.equal(s.attrs['data-exclude-search'], 'true');
  assert.equal(s.attrs['data-exclude-hash'], 'true');
  assert.equal(s.attrs['data-before-send'], BEFORE_SEND);
  // tracker arrives: queued names are flushed, names only
  const calls = []; win.umami = { track: (...a) => calls.push(a) };
  s.fire('load');
  assert.deepEqual(calls, [['game_start'], ['share_click']]);
  assert.equal(A.track('reset_or_prestige'), 'sent');
  assert.deepEqual(calls.at(-1), ['reset_or_prestige']);
  assert.ok(!Object.keys(Object.fromEntries(st.m)).some((k) => /id|install|device/i.test(k)), 'no install/device id stored');
});

test('"Kapat" on the notice (fenomen_tel = off): nothing loads, umami.disabled set', () => {
  const st = memStorage(); const { doc, win, appended } = fakeEnv();
  st.setItem(KEYS.notice, '1'); st.setItem(KEYS.pref, 'off');
  const A = createAnalytics({ win, doc, storage: st, cfg: CFG });
  assert.equal(A.track('game_start'), 'off');
  assert.equal(appended.length, 0);
  assert.equal(st.getItem('umami.disabled'), '1');
});

test('turning stats off in Settings stops Umami at once (track + before-send + kill switch); back on resumes', () => {
  const st = memStorage(); const { doc, win } = fakeEnv();
  st.setItem(KEYS.notice, '1');
  const A = createAnalytics({ win, doc, storage: st, cfg: CFG });
  A.sync();
  const calls = []; win.umami = { track: (...a) => calls.push(a) };
  assert.equal(A.track('share_click'), 'sent');
  const before = win[BEFORE_SEND];
  assert.deepEqual(before('event', { x: 1 }), { x: 1 });
  st.setItem(KEYS.pref, 'off');                         // Settings switch (v2.1 tel.setEnabled(false))
  assert.equal(A.track('share_click'), 'off');
  assert.equal(calls.length, 1);
  assert.equal(before('event', { x: 1 }), null, 'Umami own requests (pageview) dropped too');
  assert.equal(A.sync(), false);
  assert.equal(st.getItem('umami.disabled'), '1');
  st.setItem(KEYS.pref, 'on');
  assert.equal(A.sync(), true);
  assert.equal(st.getItem('umami.disabled'), null);
  assert.equal(A.track('share_click'), 'sent');
});

test('another tab answers the notice / flips the switch: storage event re-syncs', () => {
  const st = memStorage(); const { doc, win, appended } = fakeEnv();
  const A = createAnalytics({ win, doc, storage: st, cfg: CFG });
  assert.equal(A.loaded(), false);
  st.setItem(KEYS.notice, '1'); win.fire('storage', { key: KEYS.notice });
  assert.equal(appended.length, 1);
  st.setItem(KEYS.pref, 'off'); win.fire('storage', { key: KEYS.pref });
  assert.equal(st.getItem('umami.disabled'), '1');
});

test('no env config, localhost or file://: never loads even with consent', () => {
  for (const [cfg, host, proto] of [[{ src: '', websiteId: '' }, 'fenomen.teserix.com', 'https:'], [CFG, 'localhost', 'http:'], [CFG, '127.0.0.1', 'http:'], [CFG, '', 'file:']]) {
    const st = memStorage(); const { doc, win, appended } = fakeEnv(host); win.location.protocol = proto;
    st.setItem(KEYS.notice, '1');
    const A = createAnalytics({ win, doc, storage: st, cfg });
    assert.equal(A.track('game_start'), 'off');
    assert.equal(appended.length, 0);
  }
});

test('track never throws; unknown names rejected; login_success / cloud_save hooks exist but are not called', () => {
  const st = memStorage(); const { doc, win } = fakeEnv(); st.setItem(KEYS.notice, '1');
  const A = createAnalytics({ win, doc, storage: st, cfg: CFG });
  win.umami = { track: () => { throw new Error('boom'); } };
  assert.doesNotThrow(() => A.track('game_start'));
  assert.equal(A.track('user_email'), 'invalid');
  const src = ['src/main.js', 'src/ui/share.js', 'src/ui/ui.js', 'src/controller.js'].map(read).join('\n');
  assert.ok(!/trackLoginSuccess\(|trackCloudSave\(|track\('login_success'\)|track\('cloud_save'\)/.test(src), 'v2.2 events not fired on this branch');
  const names = [...new Set([...src.matchAll(/(?<![.\w])track\('([a-z_]+)'\)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(names, ['game_start', 'reset_or_prestige', 'share_click']);
});

test('not pasted into index.html; no hardcoded Umami id/URL in src; SW never caches cross-origin', () => {
  const html = read('index.html');
  assert.ok(!/analiz\.teserix\.com|umami/i.test(html));
  const src = read('src/analytics.js') + read('src/main.js');
  assert.ok(!src.includes('04257fdf-e069-4ecb-9b6a-196aa1e83242') && !src.includes('analiz.teserix.com/script.js\''), 'config from env only');
  assert.ok(read('src/analytics.js').includes('VITE_UMAMI_SRC') && read('src/analytics.js').includes('VITE_UMAMI_WEBSITE_ID'));
  assert.ok(read('sw.template.js').includes('if (url.origin !== location.origin) return;'));
});
