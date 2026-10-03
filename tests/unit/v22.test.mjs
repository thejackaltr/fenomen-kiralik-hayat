// v2.2: optional e-mail login + cloud save (pure rules, error mapping, API client, sync flows with fakes)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../../src/logic/game.js';
import { serialize, deserialize, SAVE_KEY } from '../../src/logic/save.js';
import { progress, recommend, isFresh, progressSig, cloudWasReset, loginDecision, pullDecision, sendErrorKey, verifyErrorKey, validEmail, validCode, splitMeta, saveSum, sameSave, createAuthGate, isNetBlock, retryAfterMs } from '../../src/logic/cloud.js';
import { createCloudApi, SESSION_KEY } from '../../src/cloud/api.js';
import { createSync, KNOWN_KEY } from '../../src/cloud/sync.js';
import { checkAccountLegal, openAccountItems } from '../../tools/legal-guard.mjs';
import { CLOUD, NEW_ORIGIN, OLD_ORIGIN, BASE_URL } from '../../src/config.js';
import { loginAvailable } from '../../src/ui/account.js';
import { fmtStamp } from '../../src/logic/format.js';
import { registerLocales, setLocale, t } from '../../src/logic/i18n.js';
import tr from '../../src/locales/tr.json' with { type: 'json' };

registerLocales({ tr }); setLocale('tr');
class Mem { constructor(o = {}) { this.m = new Map(Object.entries(o)); } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } removeItem(k) { this.m.delete(k); } }
const game = (o = {}) => { const s = G.newGame(1000, 7); if (o.created !== false) { G.createCharacter(s, { body: 'f', skin: 1, hair: 0, channel: o.channel || 'K' }); G.choosePath(s, 'vlog'); } if (o.videos) s.stats.videos = o.videos; if (o.sales) s.meta.sales = o.sales; if (o.fame) { s.meta.fame = o.fame; s.meta.fameEarned = o.fame; } if (o.followers) s.followers = o.followers; if (o.resetAt) s.resetAt = o.resetAt; return JSON.parse(serialize(s)); };

test('texts: Yazı r11 keys in tr.json (account, auth, sync, reset, email), placeholders kept (legal), sender approved', () => {
  for (const k of ['account', 'auth', 'sync', 'reset', 'email']) assert.ok(tr[k] && typeof tr[k] === 'object', k);
  for (const k of ['auth.login.privacySummary', 'auth.login.quotaFull', 'auth.login.sendError', 'auth.code.resend', 'auth.code.resendIn', 'sync.conflict.metaLast', 'sync.conflict.keepTitleReset', 'sync.conflict.keepBodyReset', 'reset.otherDevice', 'account.delete.button', 'auth.moveDomain.text']) assert.notEqual(t(k), k, k);
  const all = JSON.stringify(tr);
  assert.equal(tr.email.from, '"Fenomen: Kiralık Hayat" <fenomen@teserix.com>');   // approved sender, placeholder gone
  assert.ok(!all.includes('[GÖNDERİCİ]'));
  for (const ph of ['[TEKNİK KAYIT SAKLAMA SÜRESİ — avukat belirleyecek]', '[YURT DIŞI AKTARIM DAYANAĞI — Aryen/avukat belirleyecek]']) assert.ok(all.includes(ph), ph);
  // unused keys removed: wrong and expired codes get the same server answer (wrongCode); the link uses BASE_URL
  for (const k of ['auth.code.wrongOnly', 'auth.code.expired', 'auth.moveDomain.url']) assert.equal(t(k), k, k + ' removed');
  assert.equal(new URL(BASE_URL).origin, NEW_ORIGIN);   // "Yeni adrese git" = BASE_URL (src/config.js, the one place for the address)
  assert.equal(t('sync.conflict.meta', { f: 1, v: 2, n: 3, k: 4 }), '1 takipçi · 2 ¤ · 3 Şöhret · 4 satış');
  assert.equal(t('reset.backupNote', { n: CLOUD.backupDays }), 'Buluttaki eski kaydın 30 gün yedek olarak saklanır, sonra silinir.');
  assert.ok(tr.reset.backupNote.includes(CLOUD.backupDays + ' gün') && tr.account.privacy.details[7].includes(CLOUD.backupDays + ' gün'));   // r9 writes 30 out: must match the server (fenomen_cfg_backup_retention)
  for (const k of ['account.signedOutByServer', 'account.delete.signedOut']) assert.notEqual(t(k), k, k);
  // r10: 11 items; [9] = deletion list (no e-mail), [10] = data controller (was [9]); #4/#5 placeholders stay
  // r11: [9] matches the code (feaec45): a reference showing how the deletion was made; in-app = the session id
  const D = tr.account.privacy.details;
  assert.equal(D.length, 11);
  assert.ok(D[9].startsWith('Hesabın silindiğinde ayrı bir listede yalnızca hesap kimliğini') && D[9].includes('silmeyi yaptığın oturumun kimliğidir') && D[9].includes('E-posta adresin bu listede yer almaz') && !D[9].includes('referans numarası'));
  assert.ok(D[10].startsWith('Bu bilgilerin veri sorumlusu') && D.slice(0, 10).every((x) => !x.includes('veri sorumlusu')));
  assert.ok(D[8].startsWith('Hesabını istediğin zaman') && D[3].includes('[TEKNİK KAYIT SAKLAMA SÜRESİ') && D[4].includes('[YURT DIŞI AKTARIM DAYANAĞI'));
  // no code validity in the UI (10 min is a server setting)
  for (const k of ['auth', 'account', 'sync']) assert.ok(!/\d+ dakika/.test(JSON.stringify(tr[k])), k + ' gives a code validity');
  assert.ok(tr.auth.login.privacySummary.length <= 90);
});
test('progress order: sales, then total Şöhret, then followers; equal -> no recommendation', () => {
  assert.equal(recommend(game({ sales: 2 }), game({ sales: 1, fame: 999, followers: 1e6 })), 'cloud');
  assert.equal(recommend(game({ fame: 10 }), game({ fame: 11 })), 'device');
  assert.equal(recommend(game({ followers: 5 }), game({ followers: 4 })), 'cloud');
  assert.equal(recommend(game({ followers: 5 }), game({ followers: 5 })), null);
  const a = game({ fame: 3 }); a.meta.fame = 0; a.meta.fameEarned = 50;          // spent Şöhret still counts as earned
  assert.deepEqual(progress(a).slice(0, 2), [0, 50]);
});
test('first-video rule: fresh = empty or no video published yet (and nothing permanent)', () => {
  assert.ok(isFresh(null)); assert.ok(isFresh(game({ created: false }))); assert.ok(isFresh(game()));
  assert.ok(!isFresh(game({ videos: 1 }))); assert.ok(!isFresh(game({ sales: 1 }))); assert.ok(!isFresh(game({ fame: 1 })));
});
test('login decision: rule 1 upload, rule 2 load cloud (no backup), identical adopt, else conflict', () => {
  const row = { revision: 4, data: game({ videos: 3, channel: 'Bulut' }) };
  assert.equal(loginDecision(game({ videos: 2 }), null), 'upload');
  assert.equal(loginDecision(game(), row), 'loadCloud');
  assert.equal(loginDecision(null, row), 'loadCloud');
  assert.equal(loginDecision(JSON.parse(JSON.stringify(row.data)), row), 'adopt');
  const same = JSON.parse(JSON.stringify(row.data)); same.lastSeen = 99999999; assert.equal(loginDecision(same, row), 'adopt');   // lastSeen alone is no difference
  assert.equal(loginDecision(game({ videos: 1 }), row), 'conflict');
});
test('pull decision: push / load / reset (+keep once) / conflict', () => {
  const mine = game({ videos: 2 }), known = { revision: 3, sig: progressSig(mine) };
  assert.equal(pullDecision(mine, null, known).action, 'upload');
  assert.equal(pullDecision(mine, { revision: 3, data: mine }, known).action, 'push');
  const idle = JSON.parse(JSON.stringify(mine)); idle.money += 500; idle.followers += 40; idle.lastSeen += 60000;     // passive only
  assert.equal(pullDecision(idle, { revision: 5, data: game({ videos: 4 }) }, known).action, 'loadCloud');
  const played = game({ videos: 3 });
  assert.equal(pullDecision(played, { revision: 5, data: game({ videos: 4 }) }, known).action, 'conflict');
  const resetRow = { revision: 4, data: game({ created: false, resetAt: 5000 }) };
  assert.deepEqual(pullDecision(idle, resetRow, known), { action: 'reset', keep: false });
  assert.deepEqual(pullDecision(played, resetRow, known), { action: 'reset', keep: true });
  assert.ok(cloudWasReset({ resetAt: 2 }, { resetAt: 1 }) && !cloudWasReset({ resetAt: 1 }, { resetAt: 1 }) && !cloudWasReset({}, {}));
});
test('resetAt survives save/load and a channel sale', () => {
  const s = G.newGame(1000, 1); s.resetAt = 123456; const back = deserialize(serialize(s), 2000);
  assert.equal(back.resetAt, 123456);
  assert.equal(deserialize(serialize(G.newGame(1000, 1)), 2000).resetAt, undefined);
});
test('"Kod gönder" errors: rateLimit / quotaFull / sendFail (invalid address only) / sendError / offline / unreachable', () => {
  const r = (status, body) => sendErrorKey({ status, body });
  assert.equal(r(429, { error_code: 'over_email_send_rate_limit', msg: 'For security purposes, you can only request this after 30 seconds.' }), 'auth.login.rateLimit');
  assert.equal(r(429, { error_code: 'over_request_rate_limit' }), 'auth.login.rateLimit');
  assert.equal(r(400, { error_code: 'over_email_send_rate_limit' }), 'auth.login.rateLimit');
  assert.equal(r(500, { code: 500, error_code: 'unexpected_failure', msg: 'Error sending magic link email' }), 'auth.login.quotaFull');
  assert.equal(r(500, { msg: 'Error sending confirmation email' }), 'auth.login.quotaFull');
  assert.equal(r(400, { error_code: 'email_address_invalid', msg: 'Email address "x@y.zz" is invalid' }), 'auth.login.sendFail');
  assert.equal(r(400, { error_code: 'validation_failed', msg: 'Unable to validate email address: invalid format' }), 'auth.login.sendFail');
  assert.equal(r(400, { error_code: 'validation_failed', msg: 'Unsupported otp type' }), 'auth.login.sendError');
  assert.equal(r(422, { error_code: 'otp_disabled', msg: 'Signups not allowed for otp' }), 'auth.login.sendError');
  assert.equal(r(500, { msg: 'Database error saving new user' }), 'auth.login.sendError');
  assert.equal(r(503, 'Service Unavailable'), 'auth.code.unreachable');
  assert.equal(sendErrorKey({ network: 'offline' }), 'auth.code.offline');
  assert.equal(sendErrorKey({ network: 'unreachable' }), 'auth.login.netOrRate');   // network error while online (Cloudflare block or a real fault)
  assert.equal(sendErrorKey({ network: 'unreachable', timeout: true }), 'auth.code.unreachable');   // our own timeout: no answer at all
  for (const k of ['auth.login.rateLimit', 'auth.login.quotaFull', 'auth.login.sendFail', 'auth.login.sendError', 'auth.code.offline', 'auth.code.unreachable']) assert.notEqual(t(k), k);
});
test('code errors: wrong/expired (same answer from the server) -> wrongCode; 429 -> rateLimit; formats', () => {
  assert.equal(verifyErrorKey({ status: 403, body: { error_code: 'otp_expired', msg: 'Token has expired or is invalid' } }), 'auth.code.wrongCode');
  assert.equal(verifyErrorKey({ status: 429, body: {} }), 'auth.code.rateLimit');
  assert.equal(verifyErrorKey({ status: 502 }), 'auth.code.unreachable');
  assert.equal(verifyErrorKey({ network: 'offline' }), 'auth.code.offline');
  assert.ok(validEmail('a@b.co') && !validEmail('a@b') && !validEmail('a b@c.de') && !validEmail(''));
  assert.ok(validCode('012345') && validCode(' 123456 ') && !validCode('12345') && !validCode('1234567') && !validCode('12a456'));
});
test('meta line splits right after "¤"; short date/time for {d}', () => {
  assert.deepEqual(splitMeta('12,3 B takipçi · 4,5 B ¤ · 120 Şöhret · 3 satış'), ['12,3 B takipçi · 4,5 B ¤ ·', '120 Şöhret · 3 satış']);
  assert.deepEqual(splitMeta('no mark'), ['no mark', '']);
  assert.match(fmtStamp(Date.UTC(2026, 8, 28, 16, 40)), /^28 Eyl \d\d:40$/);
  assert.equal(fmtStamp(null), tr.sync.conflict.dateUnknown);
});
test('login only on the login address with the cloud configured, never on the old address', () => {
  const cfg = { url: 'https://api.test', key: 'k', loginOrigin: NEW_ORIGIN };
  assert.ok(loginAvailable({ origin: NEW_ORIGIN }, cfg, 'none'));
  assert.ok(!loginAvailable({ origin: OLD_ORIGIN }, Object.assign({}, cfg, { loginOrigin: OLD_ORIGIN }), 'none'));
  assert.ok(!loginAvailable({ origin: NEW_ORIGIN }, Object.assign({}, cfg, { url: null }), 'none'));
  assert.ok(!loginAvailable({ origin: 'http://localhost:4180' }, cfg, 'none'));
  assert.ok(!loginAvailable({ origin: NEW_ORIGIN }, cfg, 'redirect'));
  assert.equal(CLOUD.url, null, 'no cloud env in the default build');
});
test('legal guard: a login build fails while account.privacy.details has a [placeholder]', () => {
  assert.deepEqual(openAccountItems(tr), [3, 4]);
  assert.ok(checkAccountLegal(tr, {}).ok);                                          // no cloud env (Pages, default)
  assert.throws(() => checkAccountLegal(tr, { VITE_SUPABASE_URL: 'https://x', VITE_SUPABASE_ANON_KEY: 'k' }), /account\.privacy\.details: madde #4, #5/);
  assert.ok(checkAccountLegal(tr, { VITE_SUPABASE_URL: 'https://x', VITE_SUPABASE_ANON_KEY: 'k', ALLOW_EMPTY_LEGAL: '1' }).skipped);
  const done = JSON.parse(JSON.stringify(tr)); done.account.privacy.details = done.account.privacy.details.map((p) => p.replace(/\[[^\]]*\]/g, 'X'));
  assert.ok(checkAccountLegal(done, { VITE_SUPABASE_URL: 'https://x', VITE_SUPABASE_ANON_KEY: 'k' }).ok);
});

// ---------- Cloudflare rate limit on /auth/v1/otp + /verify (10 req / 10 s per IP, then 10 s block; its 429 has no CORS header)
test('429 / network error messages: the status decides, never the body (HTML / plain text / empty / unreadable)', () => {
  const html = '<!DOCTYPE html><html><head><title>Access denied | fenomen-api.teserix.com used Cloudflare to restrict access</title></head><body>Error 1015 You are being rate limited</body></html>';
  for (const body of [html, 'error code: 1015', '', null, { message: 'x' }, { error_code: 'otp_expired' }]) {
    assert.equal(sendErrorKey({ status: 429, body }), 'auth.login.rateLimit', 'send 429 ' + JSON.stringify(body));
    assert.equal(verifyErrorKey({ status: 429, body }), 'auth.code.rateLimit', 'verify 429 ' + JSON.stringify(body));
  }
  assert.equal(sendErrorKey({ status: 503, body: html }), 'auth.code.unreachable');
  assert.equal(sendErrorKey({ status: 400, body: html }), 'auth.login.sendError');   // an HTML body is not an e-mail error
  // TypeError + navigator.onLine true -> netOrRate (+ 10 s lock); onLine false -> the offline text; our own timeout -> unreachable
  assert.equal(sendErrorKey({ network: 'unreachable' }), 'auth.login.netOrRate');
  assert.equal(verifyErrorKey({ network: 'unreachable' }), 'auth.login.netOrRate');
  assert.equal(sendErrorKey({ network: 'offline' }), 'auth.code.offline');
  assert.equal(verifyErrorKey({ network: 'offline' }), 'auth.code.offline');
  assert.equal(verifyErrorKey({ network: 'unreachable', timeout: true }), 'auth.code.unreachable');
  assert.ok(isNetBlock({ network: 'unreachable' }) && !isNetBlock({ network: 'offline' }) && !isNetBlock({ network: 'unreachable', timeout: true }) && !isNetBlock({ status: 429 }) && !isNetBlock(null));
  // Yazı netOrRate r1 (a): fixed text (the countdown is on the button); one key for both screens; labels in the auth.code.resendIn format
  assert.equal(t('auth.login.netOrRate'), 'Bağlantı kurulamadı ya da kısa sürede çok fazla deneme oldu. 10 saniye bekleyip tekrar dene.');
  assert.equal(t('auth.code.netOrRate'), 'auth.code.netOrRate', 'no separate code-screen key');
  assert.ok(!/\[[^\]]*\]/.test(JSON.stringify(tr.auth)), 'no placeholder left in auth.*');
  assert.equal(t('auth.code.resendIn', { s: 4 }), 'Kodu tekrar gönder (4 sn)');
  assert.equal(t('auth.login.sendIn', { s: 4 }), 'Kod gönder (4 sn)');
  assert.equal(t('auth.code.verifyIn', { s: 10 }), 'Giriş yap (10 sn)');
});
test('api: 429 with a non-JSON body keeps the status; unreadable body too; a TypeError is one network error, our timeout is marked', async () => {
  const one = (resp) => { const calls = []; return { calls, fetchFn: async (url, init) => { calls.push(url); return typeof resp === 'function' ? resp(init) : resp; } }; };
  const html = '<html><body>Error 1015 You are being rate limited</body></html>';
  let f = one({ ok: false, status: 429, text: async () => html });
  let r = await createCloudApi({ cfg, storage: new Mem(), fetchFn: f.fetchFn, online: () => true }).sendCode('a@b.co');
  assert.deepEqual(r, { ok: false, status: 429, body: html }); assert.equal(sendErrorKey(r), 'auth.login.rateLimit'); assert.equal(f.calls.length, 1);
  f = one({ ok: false, status: 429, text: async () => { throw new TypeError('body stream'); } });
  r = await createCloudApi({ cfg, storage: new Mem(), fetchFn: f.fetchFn, online: () => true }).verify('a@b.co', '123456');
  assert.equal(r.status, 429); assert.equal(r.ok, false); assert.equal(verifyErrorKey(r), 'auth.code.rateLimit');
  f = one(() => Promise.reject(new TypeError('Failed to fetch')));
  r = await createCloudApi({ cfg, storage: new Mem(), fetchFn: f.fetchFn, online: () => true }).sendCode('a@b.co');
  assert.deepEqual(r, { ok: false, network: 'unreachable' }); assert.equal(f.calls.length, 1, 'no retry inside the client');
  f = one(() => Promise.reject(new TypeError('Failed to fetch')));
  r = await createCloudApi({ cfg, storage: new Mem(), fetchFn: f.fetchFn, online: () => false }).verify('a@b.co', '123456');
  assert.deepEqual(r, { ok: false, network: 'offline', sent: false });   // navigator.onLine false: nothing left the device
  f = one((init) => new Promise((res, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))));
  r = await createCloudApi({ cfg: Object.assign({}, cfg, { timeoutMs: 20 }), storage: new Mem(), fetchFn: f.fetchFn, online: () => true }).sendCode('a@b.co');
  assert.deepEqual(r, { ok: false, network: 'unreachable', timeout: true }); assert.equal(sendErrorKey(r), 'auth.code.unreachable');
});
test('auth brake: one request per press (double press = one), 5 s between code requests that went out, 10 s lock after a network error while online or our timeout, no hidden retry', async () => {
  assert.equal(CLOUD.sendGapMs, 5000); assert.equal(CLOUD.netLockMs, 10000); assert.equal(CLOUD.resendWaitSec, 60);
  let clock = 1000000; const now = () => clock;
  const g = createAuthGate({ now, sendGapMs: CLOUD.sendGapMs, netLockMs: CLOUD.netLockMs });
  let calls = 0, answer = { ok: true }, release;
  const req = () => { calls++; return new Promise((res) => { release = () => res(answer); }); };
  // double press while the first is in flight: the second sends nothing
  const p1 = g.run('send', req), p2 = g.run('send', req);
  assert.equal(await p2, null); assert.ok(g.busy('send')); assert.equal(calls, 1);
  release(); assert.deepEqual(await p1, { ok: true }); assert.ok(!g.busy('send'));
  // at least 5 s between two code requests (from the start of the previous one), on any screen
  assert.equal(g.wait('send'), 5000);
  clock += 4999; assert.equal(await g.run('send', req), null); assert.equal(calls, 1);
  clock += 1; const p3 = g.run('send', req); assert.equal(calls, 2);
  // network error while online -> locked 10 s (longer than the gap); nothing is retried meanwhile
  answer = { ok: false, network: 'unreachable' }; release(); await p3;
  assert.equal(g.wait('send'), 10000);
  await new Promise((r) => setTimeout(r, 30)); assert.equal(calls, 2, 'no hidden retry');
  clock += 9999; assert.equal(await g.run('send', req), null); assert.equal(calls, 2);
  clock += 1; const p4 = g.run('send', req); assert.equal(calls, 3);
  // our own timeout: 10 s lock too (from the answer); offline after the request left (catch): only the 5 s gap
  answer = { ok: false, network: 'unreachable', timeout: true }; release(); await p4;
  assert.equal(g.wait('send'), 10000);
  clock += 10000; const p5 = g.run('send', req); assert.equal(calls, 4);
  answer = { ok: false, network: 'offline' }; release(); await p5;
  assert.equal(g.wait('send'), 5000);
  // an attempt that never left the device (navigator.onLine false, sent: false) starts no gap: a real request may go at once
  clock += 5000;
  assert.deepEqual(await g.run('send', () => ({ ok: false, network: 'offline', sent: false })), { ok: false, network: 'offline', sent: false });
  assert.equal(g.wait('send'), 0);
  const p6 = g.run('send', req); assert.equal(calls, 5);
  answer = { ok: true }; release(); await p6;
  // verify: no gap between attempts (a wrong code may be corrected at once), 10 s after a network error
  const V = createAuthGate({ now, sendGapMs: 5000, netLockMs: 10000 }); let vc = 0;
  const vr = (a) => () => { vc++; return Promise.resolve(a); };
  await V.run('verify', vr({ ok: false, status: 403 })); assert.equal(V.wait('verify'), 0);
  await V.run('verify', vr({ ok: false, network: 'unreachable' })); assert.equal(V.wait('verify'), 10000); assert.equal(vc, 2);
  assert.equal(await V.run('verify', vr({ ok: true })), null); assert.equal(vc, 2);
  assert.equal(V.wait('send'), 0, 'verify does not brake code requests');
  // a request that throws (never expected) frees the button without a lock
  await assert.rejects(V.run('send', () => { throw new Error('boom'); })); assert.ok(!V.busy('send')); assert.equal(V.wait('send'), 0);
});
test('real HTTP 429: button locked for Retry-After (seconds / HTTP date, kept within 10-120 s) or 30 s (missing, unreadable, invalid, negative)', async () => {
  assert.equal(CLOUD.rateLockMs, 30000); assert.equal(CLOUD.rateLockMinMs, 10000); assert.equal(CLOUD.rateLockMaxMs, 120000);
  const t0 = Date.UTC(2026, 9, 3, 14, 0, 0);
  const R = (v) => retryAfterMs(v, t0);
  assert.equal(R(undefined), 30000); assert.equal(R(null), 30000);              // no header / not exposed by CORS
  assert.equal(R('45'), 45000); assert.equal(R(' 12 '), 12000); assert.equal(R('10'), 10000);
  assert.equal(R('0'), 10000); assert.equal(R('3'), 10000); assert.equal(R(' 7 '), 10000);   // floor: never under 10 s
  assert.equal(R(new Date(t0 + 4000).toUTCString()), 10000);                      // HTTP date 4 s ahead -> 10 s
  assert.equal(R('600'), 120000);                                                 // capped
  assert.equal(R(new Date(t0 + 60000).toUTCString()), 60000);                     // HTTP date
  assert.equal(R(new Date(t0 + 3600000).toUTCString()), 120000);                  // HTTP date, capped
  for (const bad of ['-5', '1.5', 'abc', '', '  ', '10s', new Date(t0 - 1000).toUTCString(), 'Wed, 32 Foo 2026 99:99:99 GMT']) assert.equal(R(bad), 30000, JSON.stringify(bad));
  // through the gate, with a fake clock; the lock counts from the answer; nothing is sent while locked
  let clock = t0; const now = () => clock;
  for (const [ra, ms] of [[undefined, 30000], ['0', 10000], ['3', 10000], ['45', 45000], [new Date(t0 + 60000).toUTCString(), 60000], ['600', 120000], ['abc', 30000], ['-5', 30000]]) {
    clock = t0;
    const g = createAuthGate({ now, sendGapMs: CLOUD.sendGapMs, netLockMs: CLOUD.netLockMs, rateLockMs: CLOUD.rateLockMs, rateLockMinMs: CLOUD.rateLockMinMs, rateLockMaxMs: CLOUD.rateLockMaxMs });
    let n = 0; const res = Object.assign({ ok: false, status: 429, body: '<html>Error 1015</html>' }, ra === undefined ? {} : { retryAfter: ra });
    for (const kind of ['send', 'verify']) {
      clock = t0;
      await g.run(kind, () => { n++; return res; });
      assert.equal(g.wait(kind), ms, kind + ' ' + ra);
      clock = t0 + ms - 1; assert.equal(await g.run(kind, () => { n++; return { ok: true }; }), null);
      clock = t0 + ms; assert.deepEqual(await g.run(kind, () => { n++; return { ok: true }; }), { ok: true });
    }
    assert.equal(n, 4, 'one request per accepted press, none while locked');
  }
  // the client reads the header only when the browser lets it (exposed): otherwise it is absent -> 30 s
  const hdr = (h) => ({ ok: false, status: 429, headers: { get: (k) => (k.toLowerCase() === 'retry-after' ? h : null) }, text: async () => 'error code: 1015' });
  let api = createCloudApi({ cfg, storage: new Mem(), fetchFn: async () => hdr('45'), online: () => true });
  assert.deepEqual(await api.sendCode('a@b.co'), { ok: false, status: 429, body: 'error code: 1015', retryAfter: '45' });
  api = createCloudApi({ cfg, storage: new Mem(), fetchFn: async () => hdr(null), online: () => true });
  const r = await api.verify('a@b.co', '123456'); assert.equal(r.retryAfter, undefined); assert.equal(verifyErrorKey(r), 'auth.code.rateLimit');
});
// ---------- API client against a scripted fetch
function scripted(answers) {
  const calls = [];
  const fetchFn = async (url, init) => { calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null }); const a = answers.shift(); if (!a) throw new Error('unexpected ' + url); if (a === 'net') throw new TypeError('Failed to fetch'); return { ok: a[0] >= 200 && a[0] < 300, status: a[0], text: async () => (a[1] === undefined ? '' : JSON.stringify(a[1])) }; };
  return { calls, fetchFn };
}
const cfg = { url: 'https://api.test/', key: 'anon', table: 'fenomen_saves', timeoutMs: 1000 };
const sess = (exp = 9999999999) => JSON.stringify({ access_token: 'A1', refresh_token: 'R1', expires_at: exp, user: { id: 'u1', email: 'a@b.co' } });
test('api: code request has no Authorization; verify stores the session', async () => {
  const st = new Mem(), f = scripted([[200, {}], [200, { access_token: 'A', refresh_token: 'R', expires_in: 3600, user: { id: 'u', email: 'a@b.co' } }]]);
  const api = createCloudApi({ cfg, storage: st, fetchFn: f.fetchFn, online: () => true });
  assert.ok((await api.sendCode(' a@b.co ')).ok);
  assert.equal(f.calls[0].url, 'https://api.test/auth/v1/otp'); assert.deepEqual(f.calls[0].body, { email: 'a@b.co', create_user: true });
  assert.equal(f.calls[0].init.headers.Authorization, undefined); assert.equal(f.calls[0].init.headers.apikey, 'anon'); assert.equal(f.calls[0].init.credentials, 'omit');
  const v = await api.verify('a@b.co', '123456');
  assert.ok(v.ok && api.signedIn() && api.email() === 'a@b.co'); assert.deepEqual(f.calls[1].body, { type: 'email', email: 'a@b.co', token: '123456' });
});
test('api: offline / unreachable never throw', async () => {
  const api = createCloudApi({ cfg, storage: new Mem(), fetchFn: scripted(['net']).fetchFn, online: () => true });
  assert.deepEqual(await api.sendCode('a@b.co'), { ok: false, network: 'unreachable' });
  const off = createCloudApi({ cfg, storage: new Mem(), fetchFn: () => { throw new Error('no'); }, online: () => false });
  assert.deepEqual(await off.sendCode('a@b.co'), { ok: false, network: 'offline', sent: false });
});
test('api: upsert per CONTRACT §2 -> stale on 409 PT409 / 23505; 23503 (account gone) signs out; 401 refreshes once', async () => {
  const st = new Mem({ [SESSION_KEY]: sess() });
  const f = scripted([[201, [{ data: { v: 3 }, revision: 5 }]], [409, { code: 'PT409', message: 'stale_revision' }], [409, { code: '23505' }], [409, { code: '23503' }]]);
  const api = createCloudApi({ cfg, storage: st, fetchFn: f.fetchFn, online: () => true });
  const w = await api.update({ v: 3 }, 4, 'mobil'); assert.ok(w.ok && w.row.revision === 5);
  const c0 = f.calls[0];
  assert.ok(c0.url === 'https://api.test/rest/v1/fenomen_saves?on_conflict=user_id&select=data,save_version,revision,device,updated_at' && c0.init.method === 'POST' && c0.init.headers.Prefer === 'resolution=merge-duplicates,return=representation' && c0.init.headers.Authorization === 'Bearer A1');
  assert.deepEqual(c0.body, { user_id: 'u1', data: { v: 3 }, save_version: 3, revision: 5, device: 'mobil' });
  assert.equal((await api.update({ v: 3 }, 4, 'mobil')).stale, true);
  assert.equal((await api.insert({ v: 3 }, 'mobil')).stale, true); assert.equal(f.calls[2].body.revision, 1);
  const gone = await api.update({ v: 3 }, 4, 'mobil'); assert.ok(gone.signedOut && !api.signedIn());
  const st2 = new Mem({ [SESSION_KEY]: sess() });
  const f2 = scripted([[401, { message: 'JWT expired' }], [200, { access_token: 'A2', refresh_token: 'R2', expires_in: 3600, user: { id: 'u1', email: 'a@b.co' } }], [200, [{ data: { v: 3 }, revision: 2 }]]]);
  const api2 = createCloudApi({ cfg, storage: st2, fetchFn: f2.fetchFn, online: () => true });
  const p = await api2.pull(); assert.ok(p.ok && p.row.revision === 2); assert.equal(f2.calls[2].init.headers.Authorization, 'Bearer A2');
  const st3 = new Mem({ [SESSION_KEY]: sess(1) });                                    // expired: refresh first; refused -> signed out
  const api3 = createCloudApi({ cfg, storage: st3, fetchFn: scripted([[400, { error_code: 'refresh_token_not_found' }]]).fetchFn, online: () => true });
  assert.ok((await api3.pull()).signedOut && !api3.signedIn());
});
test('api: reset RPC sends the expected revision; delete RPC has no parameters and signs out', async () => {
  const st = new Mem({ [SESSION_KEY]: sess() });
  const f = scripted([[200, { revision: 7, backup_id: 'b', updated_at: 'x' }], [200, { deleted: true, saves: 1, backups: 1 }]]);
  const api = createCloudApi({ cfg, storage: st, fetchFn: f.fetchFn, online: () => true });
  assert.deepEqual(await api.reset({ v: 3 }, 6, 'masaustu'), { ok: true, revision: 7 });
  assert.ok(f.calls[0].url.endsWith('/rest/v1/rpc/fenomen_reset_save')); assert.deepEqual(f.calls[0].body, { p_data: { v: 3 }, p_save_version: 3, p_expected_revision: 6, p_device: 'masaustu' });
  assert.ok((await api.deleteAccount()).ok); assert.ok(f.calls[1].url.endsWith('/rest/v1/rpc/fenomen_delete_my_account')); assert.deepEqual(f.calls[1].body, {});
  assert.ok(!api.signedIn());
});

// ---------- sync flows with a fake api + controller
function rig({ local, row = null, rev = 0, win = null, cfg = CLOUD }) {
  const storage = new Mem({ [SAVE_KEY]: JSON.stringify(local) });
  let cloud = row ? { revision: row.revision, data: row.data } : null; const log = []; let hold = null;
  const api = {
    uid: () => 'u1', signedIn: () => true, email: () => 'a@b.co',
    pull: async () => (log.push('pull'), { ok: true, row: cloud && { ...cloud } }),
    insert: async (data) => (log.push('insert'), cloud ? { ok: false, stale: true } : (cloud = { revision: 1, data }, { ok: true, row: { ...cloud } })),
    update: async (data, r, dev, opts = {}) => (log.push('update@' + r + (opts.keepalive ? ':keepalive' : '')), hold && await hold, !cloud || cloud.revision !== r ? { ok: false, stale: true } : (cloud = { revision: r + 1, data }, { ok: true, row: { ...cloud } })),
    reset: async (data, exp) => (log.push('reset@' + exp), cloud && cloud.revision !== exp ? { ok: false, stale: true } : (cloud = { revision: (cloud ? cloud.revision : 0) + 1, data }, { ok: true, revision: cloud.revision })),
    deleteAccount: async () => (log.push('delete'), { ok: true }), signOut: async () => (log.push('signOut'), true)
  };
  const ctrl = { save: () => {}, reload: () => log.push('reload'), reset: (next) => { storage.setItem(SAVE_KEY, serialize(next)); log.push('ctrl.reset'); } };
  const seen = { toasts: [], conflicts: [], keeps: [] }; let pick = 'device';
  const hooks = { toast: (k) => seen.toasts.push(k), conflict: async (o) => (seen.conflicts.push(o), pick), keep: async (o) => { seen.keeps.push(o.kind); } };
  const sync = createSync({ api, ctrl, storage, device: 'mobil', hooks, win, cfg });
  if (rev) storage.setItem(KNOWN_KEY, JSON.stringify({ uid: 'u1', revision: rev, sig: progressSig(local), sum: saveSum(local) }));
  return { sync, api, storage, log, seen, setHold: (p) => { hold = p; }, cloud: () => cloud, setPick: (p) => { pick = p; }, setCloud: (c) => { cloud = c; }, local: () => JSON.parse(storage.getItem(SAVE_KEY)) };
}
test('sync: rule 1 upload, rule 2 load without backup, rule 3 conflict -> keep once -> write revision+1', async () => {
  let R = rig({ local: game({ videos: 2 }) });
  assert.ok(await R.sync.afterLogin()); assert.deepEqual(R.seen.toasts, ['sync.uploaded']); assert.equal(R.cloud().revision, 1);
  R = rig({ local: game(), row: { revision: 3, data: game({ videos: 5, channel: 'Bulut' }) } });
  await R.sync.afterLogin(); assert.equal(R.local().char.channel, 'Bulut'); assert.deepEqual(R.seen.toasts, ['sync.cloudLoaded']); assert.equal(R.storage.getItem('fenomen_save_backup'), null); assert.equal(R.seen.keeps.length, 0);
  R = rig({ local: game({ videos: 1, channel: 'Burada' }), row: { revision: 3, data: game({ videos: 5, sales: 1, channel: 'Bulut' }) } });
  await R.sync.afterLogin();
  assert.equal(R.seen.conflicts.length, 1); assert.equal(R.seen.conflicts[0].kind, 'login'); assert.equal(R.seen.conflicts[0].recommended, 'cloud');
  assert.deepEqual(R.seen.keeps, ['conflict']); assert.equal(R.cloud().revision, 4); assert.equal(R.cloud().data.char.channel, 'Burada');
});
test('sync: push only on change; refused write -> newer cloud loads (nothing new here) or choice (bodyNewer)', async () => {
  const mine = game({ videos: 2 });
  let R = rig({ local: mine, row: { revision: 2, data: mine }, rev: 2 });
  assert.ok(await R.sync.push()); assert.deepEqual(R.log, []);                          // unchanged: no request at all
  const more = JSON.parse(JSON.stringify(mine)); more.money += 10; R.storage.setItem(SAVE_KEY, JSON.stringify(more));
  await R.sync.push(); assert.deepEqual(R.log, ['update@2']); assert.equal(R.cloud().revision, 3);
  R = rig({ local: mine, row: { revision: 5, data: game({ videos: 9, channel: 'Öteki' }) }, rev: 2 });
  const idle = JSON.parse(JSON.stringify(mine)); idle.money += 99; R.storage.setItem(SAVE_KEY, JSON.stringify(idle));
  await R.sync.push(); assert.equal(R.local().char.channel, 'Öteki'); assert.equal(R.seen.conflicts.length, 0); assert.deepEqual(R.seen.toasts, ['sync.cloudLoaded']);
  R = rig({ local: mine, row: { revision: 5, data: game({ videos: 9, channel: 'Öteki' }) }, rev: 2 });
  R.storage.setItem(SAVE_KEY, JSON.stringify(game({ videos: 3 }))); R.setPick('cloud');
  await R.sync.push(); assert.equal(R.seen.conflicts[0].kind, 'newer'); assert.equal(R.local().char.channel, 'Öteki'); assert.equal(R.cloud().revision, 5);
});
test('sync: reset on another device never overwritten; keep window only with unsynced progress; signed-in reset uses the RPC', async () => {
  const mine = game({ videos: 2 });
  const resetRow = { revision: 4, data: game({ created: false, resetAt: 5000 }) };
  let R = rig({ local: mine, row: resetRow, rev: 3 });
  R.storage.setItem(SAVE_KEY, JSON.stringify(game({ videos: 3 })));
  await R.sync.push(); assert.deepEqual(R.seen.keeps, ['reset']); assert.deepEqual(R.seen.toasts, ['reset.otherDevice']); assert.equal(R.seen.conflicts.length, 0);
  assert.equal(R.cloud().revision, 4); assert.equal(R.local().created, false); assert.ok(!R.log.slice(R.log.indexOf('pull')).some((x) => x.startsWith('update')));   // the refused write is the only one
  R = rig({ local: mine, row: resetRow, rev: 3 });
  const ticked = JSON.parse(JSON.stringify(mine)); ticked.money += 5; R.storage.setItem(SAVE_KEY, JSON.stringify(ticked));   // idle income only
  await R.sync.push(); assert.deepEqual(R.seen.keeps, []); assert.deepEqual(R.seen.toasts, ['reset.otherDevice']);
  R = rig({ local: mine, row: { revision: 3, data: mine }, rev: 3 });
  assert.ok(await R.sync.resetSignedIn()); assert.deepEqual(R.log, ['reset@3', 'ctrl.reset']); assert.ok(R.cloud().data.resetAt > 0 && R.cloud().data.created === false);
  R = rig({ local: mine, row: { revision: 9, data: mine }, rev: 3 });
  assert.equal(await R.sync.resetSignedIn(), 'stale'); assert.ok(!R.log.includes('ctrl.reset'));   // refused (409): nothing reset here
  // CONTRACT §3: 409 on reset -> pull again -> choice screen when both sides moved on
  R = rig({ local: mine, row: { revision: 9, data: game({ videos: 6, sales: 1, channel: 'Öteki' }) }, rev: 3 });
  R.storage.setItem(SAVE_KEY, JSON.stringify(game({ videos: 4, channel: 'Burada' })));
  assert.equal(await R.sync.resetSignedIn(), 'stale'); await R.sync.reconcile();
  assert.equal(R.seen.conflicts.length, 1); assert.ok(!R.log.includes('ctrl.reset')); assert.deepEqual(R.log.slice(0, 2), ['reset@3', 'pull']);
});
test('sync: sign out and delete keep the device save', async () => {
  const mine = game({ videos: 2 });
  const R = rig({ local: mine, row: { revision: 1, data: mine }, rev: 1 }); const before = R.storage.getItem(SAVE_KEY);
  await R.sync.signOut(); assert.equal(R.storage.getItem(SAVE_KEY), before); assert.equal(R.storage.getItem(KNOWN_KEY), null);
  const D = rig({ local: mine, row: { revision: 1, data: mine }, rev: 1 }); const b2 = D.storage.getItem(SAVE_KEY);
  assert.ok(await D.sync.deleteAccount()); assert.equal(D.storage.getItem(SAVE_KEY), b2); assert.equal(D.storage.getItem(KNOWN_KEY), null);
  assert.ok(sameSave(mine, JSON.parse(b2)));
});

// ---------- write right away: page hidden / closed (flush), video published (soon, coalesced); 60 s kept
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function fakeWin() {
  const ev = {};
  return { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (id) => clearTimeout(id), addEventListener: (e, f) => { (ev[e] = ev[e] || []).push(f); }, fire: (e) => { for (const f of ev[e] || []) f(); } };
}
const play = (R, n) => { const s = R.local(); s.stats.videos += n; s.money += 10 * n; R.storage.setItem(SAVE_KEY, JSON.stringify(s)); };
test('instant push: soon() after a published video coalesces a burst into one write; at most one per pushGapMs', async () => {
  const mine = game({ videos: 2 }), cfg = { ...CLOUD, pushDelayMs: 30, pushGapMs: 150 };
  const R = rig({ local: mine, row: { revision: 1, data: mine }, rev: 1, win: fakeWin(), cfg });
  play(R, 1);
  for (let i = 0; i < 5; i++) { R.sync.soon(); play(R, 1); }        // 5 publishes back to back
  assert.deepEqual(R.log, []);                                       // debounced: nothing yet
  await sleep(80);
  assert.deepEqual(R.log, ['update@1']); assert.equal(R.cloud().data.stats.videos, R.local().stats.videos);
  const t0 = Date.now(); play(R, 1); R.sync.soon();
  await sleep(60); assert.deepEqual(R.log, ['update@1']);           // the gap after the last write holds it back
  await sleep(150); assert.deepEqual(R.log, ['update@1', 'update@2']); assert.ok(Date.now() - t0 >= 60);
  R.sync.soon(); await sleep(220); assert.deepEqual(R.log, ['update@1', 'update@2']);   // nothing new -> no request
});
test('instant push: a write that goes out while soon() is pending moves it to pushGapMs after THAT write', async () => {
  const mine = game({ videos: 2 }), cfg = { ...CLOUD, pushDelayMs: 30, pushGapMs: 150 };
  const R = rig({ local: mine, row: { revision: 1, data: mine }, rev: 1, win: fakeWin(), cfg });
  await sleep(160);                                          // out of any earlier gap
  play(R, 1); R.sync.soon();                                 // due in 30 ms
  play(R, 1); await R.sync.push(); const t0 = Date.now();    // e.g. the 60 s write goes out first
  assert.deepEqual(R.log, ['update@1']);
  play(R, 1); await sleep(80);
  assert.deepEqual(R.log, ['update@1']);                     // was: a second write ~30 ms after the first
  await sleep(140);
  assert.deepEqual(R.log, ['update@1', 'update@2']); assert.ok(Date.now() - t0 >= 150);
});
test('instant push: flush() (hidden / pagehide) writes now with keepalive, cancels a scheduled one; back-to-back = one request', async () => {
  const mine = game({ videos: 2 }), cfg = { ...CLOUD, pushDelayMs: 40, pushGapMs: 40 }, win = fakeWin();
  const R = rig({ local: mine, row: { revision: 1, data: mine }, rev: 1, win, cfg });
  play(R, 1); R.sync.soon();
  await R.sync.flush(); assert.deepEqual(R.log, ['update@1:keepalive']);
  win.fire('pagehide'); await sleep(80); assert.deepEqual(R.log, ['update@1:keepalive']);   // hidden + pagehide, the soon() was cancelled
  // a flush during a running write waits for it, then writes once more only if something changed
  play(R, 1); let open; R.setHold(new Promise((r) => { open = r; }));
  const first = R.sync.push(); await sleep(5);
  play(R, 1); assert.equal(await R.sync.flush(), false); assert.equal(R.sync.busy(), true);
  R.setHold(null); open(); await first; await sleep(10);
  assert.deepEqual(R.log, ['update@1:keepalive', 'update@2', 'update@3:keepalive']); assert.equal(R.cloud().data.stats.videos, R.local().stats.videos);
  win.fire('pagehide'); await sleep(10); assert.equal(R.log.length, 3);
});
test('instant push: signed out = nothing scheduled; the 60 s interval stays', async () => {
  const mine = game({ videos: 2 }), R = rig({ local: mine, row: { revision: 1, data: mine }, rev: 1, win: fakeWin(), cfg: { ...CLOUD, pushDelayMs: 10 } });
  R.api.signedIn = () => false; play(R, 1);
  assert.equal(R.sync.soon(), false); assert.equal(await R.sync.flush(), false); await sleep(30); assert.deepEqual(R.log, []);
  assert.equal(CLOUD.syncEverySec, 60); assert.equal(CLOUD.pushDelayMs, 2000); assert.equal(CLOUD.pushGapMs, 15000);
  const real = globalThis.setInterval, seenIv = []; globalThis.setInterval = (f, ms) => (seenIv.push(ms), 0);
  try { const S = rig({ local: mine, row: { revision: 1, data: mine }, rev: 1, win: fakeWin() }); S.sync.start(); } finally { globalThis.setInterval = real; }
  assert.deepEqual(seenIv, [60000]);
});

// ---------- explicit: a write with an old revision gets 409 and shows the choice screen, never overwrites silently
// (real api.js + sync.js; the server below applies CONTRACT §2: revision must be server + 1, else 409 PT409)
function miniServer() {
  let row = null; const calls = [];
  const res = (status, b) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(b) });
  const fetchFn = async (url, init = {}) => {
    const u = new URL(url), body = init.body ? JSON.parse(init.body) : null, method = init.method || 'GET';
    let out;
    if (u.pathname === '/rest/v1/fenomen_saves' && method === 'GET') out = res(200, row ? [row] : []);
    else if (u.pathname === '/rest/v1/fenomen_saves' && method === 'POST') {
      if (body.revision !== (row ? row.revision : 0) + 1) out = res(409, { code: 'PT409', message: 'stale_revision' });
      else { row = { data: body.data, save_version: body.save_version, revision: body.revision, device: body.device, updated_at: new Date().toISOString() }; out = res(201, [row]); }
    } else out = res(404, {});
    calls.push({ method, path: u.pathname, revision: body && body.revision, status: out.status });
    return out;
  };
  return { fetchFn, calls, row: () => row };
}
function device(server, local, name) {
  const storage = new Mem({ [SAVE_KEY]: JSON.stringify(local), [SESSION_KEY]: JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1', email: 'a@b.co' } }) });
  const api = createCloudApi({ cfg: { url: 'https://cloud.test', key: 'k', table: 'fenomen_saves', timeoutMs: 1000 }, storage, fetchFn: server.fetchFn, online: () => true });
  const seen = { conflicts: [], rowDuringChoice: null, keeps: [] };
  const hooks = { toast: () => {}, conflict: async (o) => { seen.conflicts.push(o); seen.rowDuringChoice = JSON.stringify(server.row()); return 'cloud'; }, keep: async (o) => { seen.keeps.push(o.kind); } };
  const ctrl = { save: () => {}, reload: () => {}, reset: () => {} };
  const sync = createSync({ api, ctrl, storage, device: name, hooks, win: null });
  const play = (o) => { const s = JSON.parse(storage.getItem(SAVE_KEY)); Object.assign(s.stats, o.stats || {}); if (o.sales) s.meta.sales = o.sales; storage.setItem(SAVE_KEY, JSON.stringify(s)); };
  return { sync, storage, seen, play, local: () => JSON.parse(storage.getItem(SAVE_KEY)) };
}
test('409 explicit: the device with the old revision is refused (PT409) and gets the choice screen; the cloud is not overwritten', async () => {
  const srv = miniServer();
  const A = device(srv, game({ videos: 3, channel: 'A Kanal' }), 'masaustu');
  assert.ok(await A.sync.afterLogin()); assert.equal(srv.row().revision, 1);
  const B = device(srv, game({ channel: 'B yeni' }), 'mobil');          // new device, no video yet -> cloud loaded (rule 2)
  assert.ok(await B.sync.afterLogin()); assert.equal(B.local().char.channel, 'A Kanal'); assert.equal(B.seen.conflicts.length, 0);
  A.play({ stats: { videos: 5 } }); assert.ok(await A.sync.push()); assert.equal(srv.row().revision, 2);
  const cloudA = JSON.stringify(srv.row());
  B.play({ stats: { videos: 4 }, sales: 2 });                               // B played too, still knows revision 1
  await B.sync.push();
  const posts = srv.calls.filter((c) => c.method === 'POST');
  const bPost = posts[posts.length - 1];
  assert.deepEqual([bPost.revision, bPost.status], [2, 409]);              // old revision + 1 = 2, server already at 2 -> 409
  assert.equal(B.seen.conflicts.length, 1); assert.equal(B.seen.conflicts[0].kind, 'newer');
  assert.equal(B.seen.rowDuringChoice, cloudA);                            // nothing written while the choice was open
  assert.equal(posts.length, 3);                                           // A rev1, A rev2, B refused: no second (silent) write
  assert.equal(JSON.stringify(srv.row()), cloudA); assert.equal(B.local().stats.videos, 5);   // "Buluttakini seç": A's save here
  assert.deepEqual(B.seen.keeps, ['conflict']);                            // B's own save offered once as a code
});

// ---------- the server ends the session: one notice (account.signedOutByServer); delete with the session gone
test('signed out by the server: toast account.signedOutByServer once, known state cleared, device save kept', async () => {
  const mine = game({ videos: 2 }), R = rig({ local: mine, row: { revision: 1, data: mine }, rev: 1 }); const before = R.storage.getItem(SAVE_KEY);
  R.api.pull = async () => ({ ok: false, status: 401, signedOut: true });
  assert.equal(await R.sync.reconcile(), false);
  assert.deepEqual(R.seen.toasts, ['account.signedOutByServer']); assert.equal(R.storage.getItem(KNOWN_KEY), null); assert.equal(R.storage.getItem(SAVE_KEY), before);
  assert.equal(R.sync.status().kind, 'idle');
  const P = rig({ local: mine, row: { revision: 1, data: mine }, rev: 1 }); play(P, 1);
  P.api.update = async () => ({ ok: false, status: 401, signedOut: true });
  assert.equal(await P.sync.push(), false); assert.deepEqual(P.seen.toasts, ['account.signedOutByServer']);
  // a network failure is not a sign-out
  const N = rig({ local: mine, row: { revision: 1, data: mine }, rev: 1 }); play(N, 1);
  N.api.update = async () => ({ ok: false, network: 'unreachable' });
  await N.sync.push(); assert.deepEqual(N.seen.toasts, ['sync.unreachable']); assert.notEqual(N.storage.getItem(KNOWN_KEY), null);
});
test('delete account with the session gone -> "signedOut" (no retry), no extra toast; other failures -> false (retry)', async () => {
  const mine = game({ videos: 2 });
  const R = rig({ local: mine, row: { revision: 1, data: mine }, rev: 1 }); const before = R.storage.getItem(SAVE_KEY);
  R.api.deleteAccount = async () => ({ ok: false, status: 401, signedOut: true });
  assert.equal(await R.sync.deleteAccount(), 'signedOut'); assert.deepEqual(R.seen.toasts, []); assert.equal(R.storage.getItem(KNOWN_KEY), null); assert.equal(R.storage.getItem(SAVE_KEY), before);
  const F = rig({ local: mine, row: { revision: 1, data: mine }, rev: 1 });
  F.api.deleteAccount = async () => ({ ok: false, network: 'unreachable' });
  assert.equal(await F.sync.deleteAccount(), false); assert.notEqual(F.storage.getItem(KNOWN_KEY), null);
});
test('api: delete with an expired session whose refresh is refused -> signedOut', async () => {
  const st = new Mem({ [SESSION_KEY]: JSON.stringify({ access_token: 'old', refresh_token: 'rt', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1', email: 'a@b.co' } }) });
  const seenPaths = [];
  const fetchFn = async (url) => { const p = new URL(url).pathname; seenPaths.push(p); return p === '/auth/v1/token' ? { ok: false, status: 400, text: async () => '{"error_code":"refresh_token_not_found"}' } : { ok: false, status: 401, text: async () => '{"code":"PGRST301"}' }; };
  const api = createCloudApi({ cfg: { url: 'https://cloud.test', key: 'k', table: 'fenomen_saves', timeoutMs: 1000 }, storage: st, fetchFn, online: () => true });
  const r = await api.deleteAccount();
  assert.equal(r.ok, false); assert.equal(r.signedOut, true); assert.equal(st.getItem(SESSION_KEY), null);
  assert.deepEqual(seenPaths, ['/rest/v1/rpc/fenomen_delete_my_account', '/auth/v1/token']);   // tried once, refresh refused, no second RPC
});
